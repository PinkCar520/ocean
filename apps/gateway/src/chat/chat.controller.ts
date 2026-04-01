import { Controller, Post, Body, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';

@Controller('api/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  async handleChatStream(
    @Body() body: any,
    @Req() req: any,
    @Res() res: Response,
  ) {
    const requestId = Math.random().toString(36).substring(7);
    const messages = body.messages || (body.text ? [{ role: 'user', content: body.text }] : []);
    
    console.log(`[Gateway] [${requestId}] Received prompt from Employee ID: ${req.user?.empId}`);
    console.log(`[Gateway] [${requestId}] Body: ${JSON.stringify(body).slice(0, 100)}...`);
    console.log(`[Gateway] [${requestId}] Extracted messages count: ${messages.length}`);
    
    // 给 req 注入 requestId 方便 Service 追踪
    (req as any).id = requestId;
    await this.chatService.generateChatStream(messages, res, req);
  }
}
