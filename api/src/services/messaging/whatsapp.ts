import type { MessagingProvider, ParsedMessage } from "./provider.js";

export class WhatsAppProvider implements MessagingProvider {
  name = "whatsapp";

  private baseUrl = "";
  private instance = "";
  private apiKey = "";
  private ownerJid = "";

  async init(): Promise<void> {
    this.ownerJid = process.env.WHATSAPP_OWNER_JID || "";
    this.baseUrl = process.env.EVOLUTION_API_URL || "";
    this.instance = process.env.EVOLUTION_INSTANCE || "youai";
    this.apiKey = process.env.EVOLUTION_API_KEY || "";

    const missing = [];
    if (!this.ownerJid) missing.push("WHATSAPP_OWNER_JID");
    if (!this.baseUrl) missing.push("EVOLUTION_API_URL");
    if (!this.apiKey) missing.push("EVOLUTION_API_KEY");
    if (missing.length > 0) {
      throw new Error(`WhatsApp provider missing env vars: ${missing.join(", ")}`);
    }
  }

  async send(to: string, text: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/message/sendText/${this.instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: this.apiKey },
      body: JSON.stringify({ number: to, text }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error(`Failed to send WhatsApp message: ${response.status} ${err}`);
      throw new Error(`Failed to send WhatsApp message: ${response.status}`);
    }
  }

  parseIncoming(payload: any): ParsedMessage | null {
    try {
      const data = payload.data;
      if (!data?.key?.remoteJid || !data?.message) return null;

      const senderId = data.key.remoteJid;
      const ownerJid = this.ownerJid || process.env.WHATSAPP_OWNER_JID || "";
      if (ownerJid && senderId !== ownerJid) return null;

      const msg = data.message;
      const text = msg.conversation
        || msg.extendedTextMessage?.text
        || msg.imageMessage?.caption
        || msg.videoMessage?.caption
        || null;

      if (!text) return null;

      return {
        senderId,
        senderName: data.pushName || "Unknown",
        text,
      };
    } catch {
      return null;
    }
  }

  getOwnerAddress(): string {
    return this.ownerJid || process.env.WHATSAPP_OWNER_JID || "";
  }
}
