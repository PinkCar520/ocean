import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ZentaoService } from './zentao.service';
import { RpcGateway } from './rpc.gateway';

@Module({
  imports: [ConfigModule],
  controllers: [ChatController],
  providers: [ChatService, ZentaoService, RpcGateway],
})
export class ChatModule {}
