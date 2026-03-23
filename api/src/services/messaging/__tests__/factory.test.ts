import { describe, it, expect } from "vitest";
import { createMessagingProvider } from "../index.js";

describe("createMessagingProvider", () => {
  it("returns TelegramProvider when MESSAGING_PROVIDER is 'telegram'", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    process.env.MESSAGING_PROVIDER = "telegram";
    const provider = createMessagingProvider();
    expect(provider.name).toBe("telegram");
    process.env.MESSAGING_PROVIDER = prev;
  });

  it("returns WhatsAppProvider when MESSAGING_PROVIDER is 'whatsapp'", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    process.env.MESSAGING_PROVIDER = "whatsapp";
    const provider = createMessagingProvider();
    expect(provider.name).toBe("whatsapp");
    process.env.MESSAGING_PROVIDER = prev;
  });

  it("defaults to TelegramProvider when MESSAGING_PROVIDER is unset", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    delete process.env.MESSAGING_PROVIDER;
    const provider = createMessagingProvider();
    expect(provider.name).toBe("telegram");
    process.env.MESSAGING_PROVIDER = prev;
  });

  it("throws for unknown provider", () => {
    const prev = process.env.MESSAGING_PROVIDER;
    process.env.MESSAGING_PROVIDER = "signal";
    expect(() => createMessagingProvider()).toThrow(/Unknown messaging provider: signal/);
    process.env.MESSAGING_PROVIDER = prev;
  });
});
