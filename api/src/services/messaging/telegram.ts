import { Bot } from "grammy";
import type { MessagingProvider, ParsedMessage } from "./provider.js";

export class TelegramProvider implements MessagingProvider {
  name = "telegram";

  private bot: Bot | null = null;
  private ownerId = "";

  async init(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    this.ownerId = process.env.TELEGRAM_OWNER_ID || "";

    const missing = [];
    if (!token) missing.push("TELEGRAM_BOT_TOKEN");
    if (!this.ownerId) missing.push("TELEGRAM_OWNER_ID");
    if (missing.length > 0) {
      throw new Error(`Telegram provider missing env vars: ${missing.join(", ")}`);
    }

    this.bot = new Bot(token);
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.bot) throw new Error("Telegram provider not initialized");
    await this.bot.api.sendMessage(Number(to), text);
  }

  parseIncoming(payload: any): ParsedMessage | null {
    try {
      const msg = payload?.message;
      if (!msg?.text || !msg?.from) return null;

      const senderId = String(msg.from.id);
      const ownerId = this.ownerId || process.env.TELEGRAM_OWNER_ID || "";
      if (ownerId && senderId !== ownerId) return null;

      return {
        senderId,
        senderName: msg.from.first_name || "Unknown",
        text: msg.text,
      };
    } catch {
      return null;
    }
  }

  getOwnerAddress(): string {
    return this.ownerId || process.env.TELEGRAM_OWNER_ID || "";
  }

  getBot(): Bot | null {
    return this.bot;
  }
}
