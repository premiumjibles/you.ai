export interface IncomingMessage {
  remoteJid: string;
  message: string;
  pushName: string;
}

export function parseIncomingMessage(body: any): IncomingMessage | null {
  try {
    const data = body.data;
    if (!data?.key?.remoteJid || !data?.message) return null;

    const msg = data.message;
    const text = msg.conversation
      || msg.extendedTextMessage?.text
      || msg.imageMessage?.caption
      || msg.videoMessage?.caption
      || null;

    if (!text) return null;

    return {
      remoteJid: data.key.remoteJid,
      message: text,
      pushName: data.pushName || "Unknown",
    };
  } catch {
    return null;
  }
}

export async function sendWhatsApp(jid: string, text: string): Promise<void> {
  const baseUrl = process.env.EVOLUTION_API_URL || "http://evolution-api:8080";
  const instance = process.env.EVOLUTION_INSTANCE || "dorjee";
  const apiKey = process.env.EVOLUTION_API_KEY || "";

  const response = await fetch(`${baseUrl}/message/sendText/${instance}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: jid,
      text,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    console.error(`Failed to send WhatsApp message: ${response.status} ${err}`);
  }
}
