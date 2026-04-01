import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ZentaoService } from './zentao.service';

@Module({
  imports: [ConfigModule],
  controllers: [ChatController],
  providers: [ChatService, ZentaoService],
})
export class ChatModule {}
