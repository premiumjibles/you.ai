import { describe, test, expect, vi, beforeEach } from "vitest";
import type { MessagingProvider } from "../../services/messaging/index.js";
import { chatRouter } from "../chat.js";

// Stub handleChatMessage
vi.mock("../../services/agent.js", () => ({
  handleChatMessage: vi.fn().mockResolvedValue("agent reply"),
}));

function makeStubProvider(parsed: ReturnType<MessagingProvider["parseIncoming"]> = null): MessagingProvider {
  return {
    name: "test",
    init: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue(undefined),
    parseIncoming: vi.fn().mockReturnValue(parsed),
    getOwnerAddress: vi.fn().mockReturnValue("owner123"),
  };
}

function fakeReqRes(body: any = {}) {
  const req = { body, params: {}, query: {} } as any;
  const res = { json: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() } as any;
  return { req, res };
}

describe("chatRouter webhook", () => {
  const fakeDb = { query: vi.fn().mockResolvedValue({ rows: [] }) } as any;

  test("chatRouter accepts db and provider arguments", () => {
    const provider = makeStubProvider(null);
    const router = chatRouter(fakeDb, provider);
    expect(router).toBeDefined();
  });

  test("webhook calls provider.parseIncoming with request body", () => {
    const provider = makeStubProvider(null);
    const router = chatRouter(fakeDb, provider);

    // Find the POST /webhook handler
    const webhookLayer = router.stack.find(
      (l: any) => l.route?.path === "/webhook" && l.route?.methods?.post
    );
    expect(webhookLayer).toBeDefined();

    const handler = webhookLayer!.route!.stack[0].handle;
    const { req, res } = fakeReqRes({ foo: "bar" });
    handler(req, res);

    expect(provider.parseIncoming).toHaveBeenCalledWith({ foo: "bar" });
  });

  test("webhook calls provider.send with senderId when message is parsed", async () => {
    const { handleChatMessage } = await import("../../services/agent.js");
    (handleChatMessage as any).mockResolvedValue("hello back");

    const provider = makeStubProvider({ senderId: "user1", senderName: "User", text: "hi" });
    const router = chatRouter(fakeDb, provider);

    const webhookLayer = router.stack.find(
      (l: any) => l.route?.path === "/webhook" && l.route?.methods?.post
    );
    const handler = webhookLayer!.route!.stack[0].handle;
    const { req, res } = fakeReqRes({ some: "payload" });
    handler(req, res);

    await new Promise((r) => setTimeout(r, 50));

    expect(handleChatMessage).toHaveBeenCalledWith(fakeDb, "user1", "hi");
    expect(provider.send).toHaveBeenCalledWith("user1", "hello back");
  });

  test("webhook does not check WHATSAPP_OWNER_JID directly", async () => {
    const { handleChatMessage } = await import("../../services/agent.js");
    (handleChatMessage as any).mockResolvedValue("reply");

    const provider = makeStubProvider({ senderId: "someone", senderName: "S", text: "test" });
    const router = chatRouter(fakeDb, provider);

    const webhookLayer = router.stack.find(
      (l: any) => l.route?.path === "/webhook" && l.route?.methods?.post
    );
    const handler = webhookLayer!.route!.stack[0].handle;

    process.env.WHATSAPP_OWNER_JID = "different_owner";
    const { req, res } = fakeReqRes({});
    handler(req, res);
    await new Promise((r) => setTimeout(r, 50));

    // Should still process - route no longer checks WHATSAPP_OWNER_JID
    expect(provider.send).toHaveBeenCalled();
    delete process.env.WHATSAPP_OWNER_JID;
  });
});
