import type { MessagingProvider, ParsedMessage } from "./provider.js";

export class ConsoleProvider implements MessagingProvider {
  name = "console";

  async init(): Promise<void> {
    console.log("[console-provider] ready — messages will be logged to stdout");
  }

  async send(to: string, text: string): Promise<void> {
    console.log(`[console-provider] → ${to}:\n${text}\n`);
  }

  parseIncoming(payload: any): ParsedMessage | null {
    const text = payload?.text || payload?.message?.text;
    if (!text) return null;

    return {
      senderId: payload?.senderId || "local-user",
      senderName: payload?.senderName || "Local",
      text,
    };
  }

  getOwnerAddress(): string {
    return "local-user";
  }
}
