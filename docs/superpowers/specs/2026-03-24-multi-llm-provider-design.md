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

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

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

`ContentBlock` is a discriminated union, not a bag of optional fields. This preserves the narrowing behavior the codebase already uses (e.g. `block.type === "text"` guarantees `block.text` exists).

`stopReason` maps from provider-specific values: Anthropic's `end_turn` → `"end"`, `tool_use` → `"tool_use"`. OpenAI's `stop` → `"end"`, `tool_calls` → `"tool_use"`. All other stop reasons (`length`, `content_filter`, etc.) map to `"end"`.

### Provider interface (`provider.ts`)

```typescript
interface LLMProvider {
  name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
  chatWithTools(params: ChatWithToolsParams): Promise<ChatResponse>;
  embed(text: string): Promise<number[] | null>;
}
```

`embed()` reads `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` internally within each provider implementation — callers don't pass these.

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

Note: Venice proxies models from multiple providers. These are the model identifiers as recognized by Venice's API. `claude-sonnet-4-6` is served by Venice as a proxied Anthropic model.

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

**Usage pattern:** Callers should capture the provider once per request flow and reuse it, rather than calling `getProvider()` inside loops. For example, `agent.ts`'s tool-use loop should call `getProvider()` once before the loop, not on each iteration. This avoids unnecessary SDK client instantiation.

### AnthropicProvider (`anthropic.ts`)

Wraps `@anthropic-ai/sdk` (existing dependency). Translates between common types and Anthropic SDK types:

- `chat()` — maps `ChatMessage[]` to `Anthropic.MessageParam[]`, passes `system` as a top-level param to `messages.create()`, maps response to `ChatResponse`
- `chatWithTools()` — same plus maps `ToolDefinition[]` to `Anthropic.Tool[]` (`parameters` → `input_schema`), and maps response tool_use blocks back (`input_schema` → `parameters`)
- `embed()` — uses OpenAI SDK internally (Anthropic has no embeddings API), reads `OPENAI_API_KEY`, `EMBEDDING_MODEL`, and `EMBEDDING_DIMENSIONS` from env. Returns `null` if `OPENAI_API_KEY` is not set.

### VeniceProvider (`venice.ts`)

Uses the `openai` SDK (existing dependency) pointed at Venice's base URL (hardcoded: `https://api.venice.ai/api/v1`) with `VENICE_API_KEY`:

- `chat()` — `chat.completions.create()`, prepends `system` as a `{ role: "system" }` message in the messages array, maps response to `ChatResponse`
- `chatWithTools()` — OpenAI-style function calling, maps `ToolDefinition[]` to OpenAI `tools` format (`parameters` → `function.parameters`), maps tool call responses back to `ContentBlock[]`
- `embed()` — `embeddings.create()` via Venice's API, reads `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` from env

#### Tool result format translation

This is the most significant translation difference between providers. In the tool-use loop:

- **Our common format:** tool results are `ChatMessage` with `role: "user"` and `content: ContentBlock[]` containing `{ type: "tool_result", tool_use_id, content }` blocks. This matches Anthropic's native format.
- **OpenAI format:** tool results are separate messages with `role: "tool"`, `tool_call_id`, and `content` fields.

**AnthropicProvider** passes tool result messages through directly (native format match).

**VeniceProvider** must translate:
- **Outbound:** when it encounters a `ChatMessage` with `role: "user"` containing `tool_result` blocks, it splits each into a separate `{ role: "tool", tool_call_id, content }` message.
- **Inbound:** when the OpenAI response contains `tool_calls`, it maps each to a `{ type: "tool_use", id, name, input }` content block.

Similarly, assistant messages containing tool_use blocks must be translated:
- **Outbound:** `ChatMessage` with `role: "assistant"` and `ContentBlock[]` containing `tool_use` blocks → OpenAI assistant message with `tool_calls` array.
- **Inbound:** OpenAI assistant message with `tool_calls` → `ChatResponse` with `tool_use` content blocks.

## Changes to existing files

### `services/claude.ts`

- Remove `import Anthropic` and `const anthropic = new Anthropic()`
- Import `getProvider` from `./llm/index.js`
- Each function calls `getProvider()` at invocation time
- All 5 API calls use `model: "fast"`
- Response access: discriminated union narrowing (`block.type === "text"` gives guaranteed `block.text`)
- Prompt builder functions (`buildBriefingPrompt`, `buildOutreachPrompt`, `buildMemoPrompt`) are pure — no changes

### `services/agent.ts`

- Remove `import Anthropic` and `const anthropic = new Anthropic()`
- Import `getProvider` and common types from `./llm/`
- `Anthropic.Tool[]` becomes `ToolDefinition[]` — rename `input_schema` to `parameters`
- `Anthropic.MessageParam[]` becomes `ChatMessage[]`
- Tool result construction: `Anthropic.ToolResultBlockParam[]` becomes `ContentBlock[]` with `type: "tool_result"` — specifically `{ type: "tool_result", tool_use_id: block.id, content: result }`
- Call `getProvider()` once before the tool-use loop, reuse for all iterations
- Tool-use loop logic stays the same, just uses common types
- Both calls use `model: "quality"`

### `services/scheduler.ts`

- Remove the dynamic `import("@anthropic-ai/sdk")` in the custom sub-agent case
- Import `getProvider` from `./llm/index.js`
- Replace with `getProvider().chat()` using `model: "fast"`

### `services/embeddings.ts`

- Remove `import OpenAI` and `getOpenAIClient()` helper
- Import `getProvider` from `./llm/index.js`
- `generateEmbedding()` calls `getProvider().embed(text)` — model/dimensions handled by provider
- `updateContactEmbedding()`: replace the `if (!process.env.OPENAI_API_KEY) return;` guard with a null check on the `embed()` return value (providers return `null` when embeddings are unavailable)
- `batchUpdateEmbeddings()`: no changes needed (calls `updateContactEmbedding` which handles the null case)

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
- Type mapping unit tests for each provider (Anthropic SDK types ↔ common types, OpenAI SDK types ↔ common types)
- Existing tests (`claude.test.ts`, `agent.test.ts`) test prompt builders and exports — unchanged
- The LLM module must be created before or alongside the service file changes to avoid import failures in existing tests

## Out of scope

- Runtime provider switching via API endpoint (env var change is sufficient)
- Per-route provider selection
- Response caching or cost tracking
- Fallback/retry across providers
- Streaming support
