import type pg from "pg";
import type { MessagingProvider, ParsedMessage } from "./provider.js";
import { handleChatMessage } from "../agent.js";

export async function processIncomingMessage(
  db: pg.Pool,
  provider: MessagingProvider,
  msg: ParsedMessage
): Promise<void> {
  try {
    const response = await handleChatMessage(db, msg.senderId, msg.text);
    await provider.send(msg.senderId, response);
  } catch (err) {
    console.error("Chat agent error:", err);
    await provider.send(msg.senderId, "Sorry, something went wrong. Try again.").catch(console.error);
  }
}
