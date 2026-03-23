import { describe, it, expect } from "vitest";
import { TelegramProvider } from "../telegram.js";

describe("TelegramProvider", () => {
  it("has name 'telegram'", () => {
    const provider = new TelegramProvider();
    expect(provider.name).toBe("telegram");
  });

  it("parseIncoming extracts text from Telegram update", () => {
    const provider = new TelegramProvider();
    const update = {
      message: {
        chat: { id: 12345 },
        from: { id: 12345, first_name: "Sean" },
        text: "hello there",
      },
    };
    const result = provider.parseIncoming(update);
    expect(result).toEqual({
      senderId: "12345",
      senderName: "Sean",
      text: "hello there",
    });
  });

  it("parseIncoming returns null for non-text messages", () => {
    const provider = new TelegramProvider();
    expect(provider.parseIncoming({ message: { chat: { id: 1 }, photo: [] } })).toBeNull();
  });

  it("parseIncoming returns null for non-owner messages when owner is set", () => {
    const prev = process.env.TELEGRAM_OWNER_ID;
    process.env.TELEGRAM_OWNER_ID = "99999";
    const provider = new TelegramProvider();
    const update = {
      message: {
        chat: { id: 12345 },
        from: { id: 12345, first_name: "Stranger" },
        text: "hey",
      },
    };
    expect(provider.parseIncoming(update)).toBeNull();
    process.env.TELEGRAM_OWNER_ID = prev;
  });

  it("parseIncoming returns null for malformed payload", () => {
    const provider = new TelegramProvider();
    expect(provider.parseIncoming(null)).toBeNull();
    expect(provider.parseIncoming({})).toBeNull();
  });

  it("getOwnerAddress returns TELEGRAM_OWNER_ID from env", () => {
    const prev = process.env.TELEGRAM_OWNER_ID;
    process.env.TELEGRAM_OWNER_ID = "12345";
    const provider = new TelegramProvider();
    expect(provider.getOwnerAddress()).toBe("12345");
    process.env.TELEGRAM_OWNER_ID = prev;
  });

  it("init throws if TELEGRAM_BOT_TOKEN is missing", async () => {
    const prevToken = process.env.TELEGRAM_BOT_TOKEN;
    const prevOwner = process.env.TELEGRAM_OWNER_ID;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_ID;

    const provider = new TelegramProvider();
    await expect(provider.init()).rejects.toThrow(/TELEGRAM_BOT_TOKEN/);

    process.env.TELEGRAM_BOT_TOKEN = prevToken;
    process.env.TELEGRAM_OWNER_ID = prevOwner;
  });
});
