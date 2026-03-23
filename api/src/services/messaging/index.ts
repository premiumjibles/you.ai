export type { MessagingProvider, ParsedMessage } from "./provider.js";

import type { MessagingProvider } from "./provider.js";
import { TelegramProvider } from "./telegram.js";
import { WhatsAppProvider } from "./whatsapp.js";

export function createMessagingProvider(): MessagingProvider {
  const name = process.env.MESSAGING_PROVIDER || "telegram";

  switch (name) {
    case "telegram":
      return new TelegramProvider();
    case "whatsapp":
      return new WhatsAppProvider();
    default:
      throw new Error(`Unknown messaging provider: ${name}. Use 'telegram' or 'whatsapp'.`);
  }
}
