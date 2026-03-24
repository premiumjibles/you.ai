import { Bot } from "grammy";
import type { MessagingProvider, ParsedMessage } from "./provider.js";

export class TelegramProvider implements MessagingProvider {
  name = "telegram";

  private bot: Bot | null = null;
  private allowedIds = new Set<string>();
  private primaryOwnerId = "";

  async init(): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN || "";
    const ownerIdRaw = process.env.TELEGRAM_OWNER_ID || "";

    const missing = [];
    if (!token) missing.push("TELEGRAM_BOT_TOKEN");
    if (!ownerIdRaw) missing.push("TELEGRAM_OWNER_ID");
    if (missing.length > 0) {
      throw new Error(`Telegram provider missing env vars: ${missing.join(", ")}`);
    }

    const ids = ownerIdRaw.split(",").map((id) => id.trim()).filter(Boolean);
    this.allowedIds = new Set(ids);
    this.primaryOwnerId = ids[0] || "";

    this.bot = new Bot(token);
  }

  async send(to: string, text: string): Promise<void> {
    if (!this.bot) throw new Error("Telegram provider not initialized");
    await this.bot.api.sendMessage(Number(to), text);
  }

  private getAllowedIds(): Set<string> {
    if (this.allowedIds.size > 0) return this.allowedIds;
    const raw = process.env.TELEGRAM_OWNER_ID || "";
    if (!raw) return this.allowedIds;
    const ids = raw.split(",").map((id) => id.trim()).filter(Boolean);
    this.allowedIds = new Set(ids);
    this.primaryOwnerId = ids[0] || "";
    return this.allowedIds;
  }

  parseIncoming(payload: any): ParsedMessage | null {
    try {
      const msg = payload?.message;
      if (!msg?.text || !msg?.from) return null;

      const senderId = String(msg.from.id);
      const allowed = this.getAllowedIds();
      if (allowed.size > 0 && !allowed.has(senderId)) return null;

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
    if (this.primaryOwnerId) return this.primaryOwnerId;
    const raw = process.env.TELEGRAM_OWNER_ID || "";
    return raw.split(",")[0]?.trim() || "";
  }

  getBot(): Bot | null {
    return this.bot;
  }
}
