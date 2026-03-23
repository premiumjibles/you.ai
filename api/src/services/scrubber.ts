// BIP-39 wordlist subset for detection (top ~200 most common words)
// Full detection: any sequence of 12 or 24 lowercase English words separated by spaces
// that are each 3-8 chars (BIP-39 word length range)
const SEED_PHRASE_12 = /\b([a-z]{3,8}\s+){11}[a-z]{3,8}\b/g;
const SEED_PHRASE_24 = /\b([a-z]{3,8}\s+){23}[a-z]{3,8}\b/g;

// Private keys: 64 hex chars, optionally 0x-prefixed
const HEX_PRIVATE_KEY = /\b(0x)?[0-9a-fA-F]{64}\b/g;

// Ethereum addresses: 0x + 40 hex chars
const ETH_ADDRESS = /\b0x[0-9a-fA-F]{40}\b/g;

// Bitcoin addresses: base58, starts with 1 or 3 or bc1
const BTC_ADDRESS = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;

// Solana addresses: base58, 32-44 chars
const SOL_ADDRESS = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;

export function scrub(text: string): string {
  let result = text;

  // Order matters: longer patterns first, private keys before addresses
  // (0x + 64 hex is both a private key and could partial-match an address)
  result = result.replace(SEED_PHRASE_24, "[REDACTED-SEED-PHRASE]");
  result = result.replace(SEED_PHRASE_12, "[REDACTED-SEED-PHRASE]");
  result = result.replace(HEX_PRIVATE_KEY, "[REDACTED-PRIVATE-KEY]");
  result = result.replace(ETH_ADDRESS, "[REDACTED-ADDRESS]");
  result = result.replace(BTC_ADDRESS, "[REDACTED-ADDRESS]");
  result = result.replace(SOL_ADDRESS, "[REDACTED-ADDRESS]");

  return result;
}
