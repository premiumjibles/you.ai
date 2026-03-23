import { describe, it, expect } from "vitest";
import { scrub } from "../scrubber";

describe("scrubber", () => {
  it("redacts 12-word BIP-39 seed phrases", () => {
    const input = "My seed is abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(scrub(input)).toContain("[REDACTED-SEED-PHRASE]");
    expect(scrub(input)).not.toContain("abandon");
  });

  it("redacts 24-word BIP-39 seed phrases", () => {
    const input = "zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong";
    expect(scrub(input)).toContain("[REDACTED-SEED-PHRASE]");
  });

  it("redacts hex private keys (64 chars)", () => {
    const input = "key: 4c0883a69102937d6231471b5dbb6204fe512961708279f1d7b18a3e0f7b1234";
    expect(scrub(input)).toContain("[REDACTED-PRIVATE-KEY]");
    expect(scrub(input)).not.toContain("4c0883a6");
  });

  it("redacts 0x-prefixed private keys", () => {
    const input = "0x4c0883a69102937d6231471b5dbb6204fe512961708279f1d7b18a3e0f7b1234";
    expect(scrub(input)).toContain("[REDACTED-PRIVATE-KEY]");
  });

  it("redacts Ethereum addresses", () => {
    const input = "Send to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68";
    expect(scrub(input)).toContain("[REDACTED-ADDRESS]");
  });

  it("redacts Bitcoin addresses", () => {
    const input = "BTC: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
    expect(scrub(input)).toContain("[REDACTED-ADDRESS]");
  });

  it("redacts Solana addresses", () => {
    const input = "SOL: 7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV";
    expect(scrub(input)).toContain("[REDACTED-ADDRESS]");
  });

  it("leaves normal text untouched", () => {
    const input = "Meeting with Janet about real estate in Melbourne";
    expect(scrub(input)).toBe(input);
  });

  it("handles multiple redactions in one string", () => {
    const input = "Key: 0x4c0883a69102937d6231471b5dbb6204fe512961708279f1d7b18a3e0f7b1234 addr: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD68";
    const result = scrub(input);
    expect(result).toContain("[REDACTED-PRIVATE-KEY]");
    expect(result).toContain("[REDACTED-ADDRESS]");
  });
});
