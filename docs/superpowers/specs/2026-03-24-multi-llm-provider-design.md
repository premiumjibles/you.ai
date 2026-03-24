# Multi-LLM Provider Abstraction

## Problem

All LLM calls are hard-coded to the Anthropic SDK across 3 service files (`claude.ts`, `agent.ts`, `scheduler.ts`). Embeddings are hard-coded to OpenAI in `embeddings.ts`. There is no way to switch providers without modifying source code.

## Goal

Allow the entire system to switch between LLM providers (starting with Anthropic and Venice) via a single environment variable (`LLM_PROVIDER`), with no restart required. Follow the existing messaging provider pattern (`services/messaging/`).

## Requirements

- Environment variable `LLM_PROVIDER` selects the active provider (`anthropic` or `venice`)
- Provider is resolved at call time, not module initialization — changing the env var takes effect on the next request
- Venice uses an OpenAI-compatible API with tool use support
- Two model tiers: `fast` and `quality`, mapped per provider
- Embeddings are included in the provider interface
- No fallback/retry across providers — failure behavior matches today's

## Architecture

### New files

```
api/src/services/llm/
  types.ts       — Common types (ChatMessage, ContentBlock, ToolDefinition, etc.)
  provider.ts    — LLMProvider interface
  index.ts       — Factory: getProvider() reads LLM_PROVIDER env var per call
  models.ts      — Model tier config per provider
  anthropic.ts   — AnthropicProvider (wraps @anthropic-ai/sdk)
  venice.ts      — VeniceProvider (wraps openai SDK pointed at Venice API)
  __tests__/
    provider.test.ts
```

### Common types (`types.ts`)

```typescript
type ModelTier = "fast" | "quality";

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;           // tool_use id
  name?: string;         // tool name
  input?: any;           // tool input
  tool_use_id?: string;  // for tool_result
  content?: string;      // tool_result content
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;  // JSON Schema
}

interface ChatParams {
  model: ModelTier;
  maxTokens: number;
  messages: ChatMessage[];
  system?: string;
}

interface ChatWithToolsParams extends ChatParams {
  tools: ToolDefinition[];
}

interface ChatResponse {
  content: ContentBlock[];
  stopReason: "end" | "tool_use";
}
```

### Provider interface (`provider.ts`)

```typescript
interface LLMProvider {
  name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  chatWithTools(params: ChatWithToolsParams): Promise<ChatResponse>;
  embed(text: string, model?: string, dimensions?: number): Promise<number[] | null>;
}
```

### Model configuration (`models.ts`)

```typescript
const MODEL_CONFIG = {
  anthropic: {
    fast: "claude-haiku-4-5-20251001",
    quality: "claude-sonnet-4-6",
  },
  venice: {
    fast: "grok-4-20-beta",
    quality: "claude-sonnet-4-6",
  },
};
```

### Factory (`index.ts`)

```typescript
function getProvider(): LLMProvider {
  const name = process.env.LLM_PROVIDER || "anthropic";
  switch (name) {
    case "anthropic":
      return new AnthropicProvider();
    case "venice":
      return new VeniceProvider();
    default:
      throw new Error(`Unknown LLM provider: ${name}. Use 'anthropic' or 'venice'.`);
  }
}
```

Called per-request, not cached at module level. No restart required to switch providers.

### AnthropicProvider (`anthropic.ts`)

Wraps `@anthropic-ai/sdk` (existing dependency). Translates between common types and Anthropic SDK types:

- `chat()` — maps `ChatMessage[]` to `Anthropic.MessageParam[]`, calls `messages.create()`, maps response to `ChatResponse`
- `chatWithTools()` — same plus maps `ToolDefinition[]` to `Anthropic.Tool[]` (`parameters` becomes `input_schema`)
- `embed()` — uses OpenAI SDK internally (Anthropic has no embeddings API), reads `OPENAI_API_KEY`. Returns `null` if key is not set.

### VeniceProvider (`venice.ts`)

Uses the `openai` SDK (existing dependency) pointed at Venice's base URL (hardcoded) with `VENICE_API_KEY`:

- `chat()` — `chat.completions.create()`, maps response to `ChatResponse`
- `chatWithTools()` — OpenAI-style function calling, maps tool calls back to `ContentBlock[]`
- `embed()` — `embeddings.create()` via Venice's API

## Changes to existing files

### `services/claude.ts`

- Remove `import Anthropic` and `const anthropic = new Anthropic()`
- Import `getProvider` from `./llm/index.js`
- Each function calls `getProvider()` at invocation time
- All 5 API calls use `model: "fast"`
- Response access changes from `response.content[0].type === "text" ? response.content[0].text : ""` to `response.content[0]?.text || ""`
- Prompt builder functions (`buildBriefingPrompt`, `buildOutreachPrompt`, `buildMemoPrompt`) are pure — no changes

### `services/agent.ts`

- Remove `import Anthropic` and `const anthropic = new Anthropic()`
- Import `getProvider` and common types from `./llm/`
- `Anthropic.Tool[]` becomes `ToolDefinition[]` — rename `input_schema` to `parameters`
- `Anthropic.MessageParam[]` becomes `ChatMessage[]`
- `Anthropic.ToolResultBlockParam[]` becomes `ContentBlock[]` with `type: "tool_result"`
- Tool-use loop logic stays the same, just uses common types
- Both calls use `model: "quality"`

### `services/scheduler.ts`

- Remove the dynamic `import("@anthropic-ai/sdk")` in the custom sub-agent case
- Import `getProvider` from `./llm/index.js`
- Replace with `getProvider().chat()` using `model: "fast"`

### `services/embeddings.ts`

- Remove `import OpenAI` and `getOpenAIClient()` helper
- Import `getProvider` from `./llm/index.js`
- `generateEmbedding()` calls `getProvider().embed()`
- `OPENAI_API_KEY` check moves inside `AnthropicProvider.embed()`

### `.env.example`

Add:
```
LLM_PROVIDER=anthropic
VENICE_API_KEY=
```

### `docker-compose.yml`

Pass `LLM_PROVIDER` and `VENICE_API_KEY` to the API container.

## Error handling

Provider SDK errors are thrown as standard `Error` objects. No retry logic, no cross-provider fallback. Matches current behavior.

## Testing

- `services/llm/__tests__/provider.test.ts` — factory returns correct provider per env var
- Type mapping unit tests for each provider (Anthropic SDK types to/from common types, OpenAI SDK types to/from common types)
- Existing tests (`claude.test.ts`, `agent.test.ts`) test prompt builders and exports — unchanged

## Out of scope

- Runtime provider switching via API endpoint (env var change is sufficient)
- Per-route provider selection
- Response caching or cost tracking
- Fallback/retry across providers
- Streaming support
