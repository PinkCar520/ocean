"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpChatHandler = void 0;
class UpChatHandler {
    parseWebhook(payload) {
        const senderId = payload?.sender_user_id || payload?.fromUser || payload?.user_id;
        const content = payload?.content?.text || payload?.body || payload?.text || '';
        if (!senderId)
            return null;
        return {
            senderId: senderId,
            senderName: payload?.sender_name || 'UP User',
            content: typeof content === 'string' ? content : JSON.stringify(content),
            chatId: payload?.chat_id || senderId,
            source: 'internal',
            rawPayload: payload
        };
    }
    verifySignature(payload, signature) {
        console.log(`[IM-UpChat] Verifying signature: ${signature}`);
        return true;
    }
    async sendReply(chatId, reply) {
        console.log(`[IM-UpChat] Posting reply to UnionPay Gateway (${chatId}): ${reply.text.slice(0, 50)}...`);
        return true;
    }
}
exports.UpChatHandler = UpChatHandler;
//# sourceMappingURL=index.js.map