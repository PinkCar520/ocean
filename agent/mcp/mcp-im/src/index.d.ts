export interface IMIncomingMessage {
    senderId: string;
    senderName: string;
    content: string;
    chatId: string;
    source: 'wework' | 'dingtalk' | 'internal';
    rawPayload?: any;
}
export interface IMReply {
    text: string;
    markdown?: string;
    card?: any;
}
export interface IMChannelHandler {
    parseWebhook(payload: any): IMIncomingMessage | null;
    sendReply(chatId: string, reply: IMReply): Promise<boolean>;
}
export declare class UpChatHandler implements IMChannelHandler {
    parseWebhook(payload: any): IMIncomingMessage | null;
    verifySignature(payload: any, signature: string): boolean;
    sendReply(chatId: string, reply: IMReply): Promise<boolean>;
}
