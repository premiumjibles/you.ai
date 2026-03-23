import { describe, it, expect } from "vitest";
import { WhatsAppProvider } from "../whatsapp.js";

describe("WhatsAppProvider", () => {
  it("has name 'whatsapp'", () => {
    const provider = new WhatsAppProvider();
    expect(provider.name).toBe("whatsapp");
  });

  it("parseIncoming extracts message from Evolution API webhook payload", () => {
    const provider = new WhatsAppProvider();
    const body = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { conversation: "hello" },
        pushName: "Sean",
      },
    };
    const result = provider.parseIncoming(body);
    expect(result).toEqual({
      senderId: "5511999999999@s.whatsapp.net",
      senderName: "Sean",
      text: "hello",
    });
  });

  it("parseIncoming extracts text from extendedTextMessage", () => {
    const provider = new WhatsAppProvider();
    const body = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { extendedTextMessage: { text: "search for bob" } },
        pushName: "Sean",
      },
    };
    const result = provider.parseIncoming(body);
    expect(result!.text).toBe("search for bob");
  });

  it("parseIncoming returns null for status updates", () => {
    const provider = new WhatsAppProvider();
    expect(provider.parseIncoming({ data: { key: { remoteJid: "x" } } })).toBeNull();
  });

  it("parseIncoming returns null for malformed body", () => {
    const provider = new WhatsAppProvider();
    expect(provider.parseIncoming(null)).toBeNull();
    expect(provider.parseIncoming({})).toBeNull();
  });

  it("getOwnerAddress returns WHATSAPP_OWNER_JID from env", () => {
    const prev = process.env.WHATSAPP_OWNER_JID;
    process.env.WHATSAPP_OWNER_JID = "551100000@s.whatsapp.net";
    const provider = new WhatsAppProvider();
    expect(provider.getOwnerAddress()).toBe("551100000@s.whatsapp.net");
    process.env.WHATSAPP_OWNER_JID = prev;
  });

  it("init throws if required env vars are missing", async () => {
    const prev = {
      url: process.env.EVOLUTION_API_URL,
      key: process.env.EVOLUTION_API_KEY,
      jid: process.env.WHATSAPP_OWNER_JID,
    };
    delete process.env.EVOLUTION_API_URL;
    delete process.env.EVOLUTION_API_KEY;
    delete process.env.WHATSAPP_OWNER_JID;

    const provider = new WhatsAppProvider();
    await expect(provider.init()).rejects.toThrow(/WHATSAPP_OWNER_JID/);

    process.env.EVOLUTION_API_URL = prev.url;
    process.env.EVOLUTION_API_KEY = prev.key;
    process.env.WHATSAPP_OWNER_JID = prev.jid;
  });
});
