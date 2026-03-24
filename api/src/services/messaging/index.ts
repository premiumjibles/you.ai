export type { MessagingProvider, ParsedMessage } from "./provider.js";

import type { MessagingProvider } from "./provider.js";
import { TelegramProvider } from "./telegram.js";
import { WhatsAppProvider } from "./whatsapp.js";
import { ConsoleProvider } from "./console.js";

export function createMessagingProvider(): MessagingProvider {
  const name = process.env.MESSAGING_PROVIDER || "telegram";

  switch (name) {
    case "telegram":
      return new TelegramProvider();
    case "whatsapp":
      return new WhatsAppProvider();
    case "console":
      return new ConsoleProvider();
    default:
      throw new Error(`Unknown messaging provider: ${name}. Use 'telegram', 'whatsapp', or 'console'.`);
  }
}
