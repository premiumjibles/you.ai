import { describe, it, expect } from "vitest";
import { parseIncomingMessage } from "../messaging.js";

describe("parseIncomingMessage", () => {
  it("extracts message from Evolution API webhook payload", () => {
    const body = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { conversation: "who is janet fring" },
        pushName: "Sean",
      },
    };
    const result = parseIncomingMessage(body);
    expect(result).not.toBeNull();
    expect(result!.remoteJid).toBe("5511999999999@s.whatsapp.net");
    expect(result!.message).toBe("who is janet fring");
    expect(result!.pushName).toBe("Sean");
  });

  it("extracts text from extendedTextMessage", () => {
    const body = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { extendedTextMessage: { text: "search for bob" } },
        pushName: "Sean",
      },
    };
    const result = parseIncomingMessage(body);
    expect(result!.message).toBe("search for bob");
  });

  it("returns null for status updates (no message)", () => {
    const body = { data: { key: { remoteJid: "5511999999999@s.whatsapp.net" } } };
    expect(parseIncomingMessage(body)).toBeNull();
  });

  it("returns null for image without caption", () => {
    const body = {
      data: {
        key: { remoteJid: "5511999999999@s.whatsapp.net" },
        message: { imageMessage: {} },
        pushName: "Sean",
      },
    };
    expect(parseIncomingMessage(body)).toBeNull();
  });

  it("returns null for malformed body", () => {
    expect(parseIncomingMessage(null)).toBeNull();
    expect(parseIncomingMessage({})).toBeNull();
    expect(parseIncomingMessage({ data: null })).toBeNull();
  });
});
