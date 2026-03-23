export interface ParsedMessage {
  senderId: string;
  senderName: string;
  text: string;
}

export interface MessagingProvider {
  name: string;
  init(): Promise<void>;
  send(to: string, text: string): Promise<void>;
  parseIncoming(payload: any): ParsedMessage | null;
  getOwnerAddress(): string;
}
