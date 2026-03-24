import { Bot } from "grammy";
import type { MessagingProvider, ParsedMessage } from "./provider.js";

export class TelegramProvider implements MessagingProvider {
  name = "telegram";

  private bot: Bot | null = null;
  private allowedIds: Set<string>;
  private primaryOwnerId: string;

  constructor() {
    const raw = process.env.TELEGRAM_OWNER_ID || "";
    const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
    this.allowedIds = new Set(ids);
    this.primaryOwnerId = ids[0] || "";
  }

  async init(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN || "";

    const missing = [];
    if (!token) missing.push("TELEGRAM_BOT_TOKEN");
    if (this.allowedIds.size === 0) missing.push("TELEGRAM_OWNER_ID");
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
      if (this.allowedIds.size > 0 && !this.allowedIds.has(senderId)) return null;

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
    return this.primaryOwnerId;
  }

  getBot(): Bot | null {
    return this.bot;
  }
}
