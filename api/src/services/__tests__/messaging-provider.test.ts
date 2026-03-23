import { describe, test, expect } from 'vitest';
import type { ParsedMessage, MessagingProvider } from '../messaging/provider.js';

describe('MessagingProvider interface', () => {
  test('ParsedMessage has required fields', () => {
    const msg: ParsedMessage = {
      senderId: '123',
      senderName: 'Alice',
      text: 'hello',
    };
    expect(msg.senderId).toBe('123');
    expect(msg.senderName).toBe('Alice');
    expect(msg.text).toBe('hello');
  });

  test('MessagingProvider can be implemented with required members', () => {
    const provider: MessagingProvider = {
      name: 'test',
      init: async () => {},
      send: async (_to: string, _text: string) => {},
      parseIncoming: (_payload: any) => null,
      getOwnerAddress: () => '555',
    };
    expect(provider.name).toBe('test');
    expect(provider.getOwnerAddress()).toBe('555');
  });

  test('parseIncoming can return ParsedMessage or null', () => {
    const provider: MessagingProvider = {
      name: 'test',
      init: async () => {},
      send: async () => {},
      parseIncoming: (payload: any) => {
        if (!payload) return null;
        return { senderId: '1', senderName: 'Bob', text: 'hi' };
      },
      getOwnerAddress: () => '555',
    };
    expect(provider.parseIncoming(null)).toBeNull();
    expect(provider.parseIncoming({ data: true })).toEqual({
      senderId: '1',
      senderName: 'Bob',
      text: 'hi',
    });
  });
});
