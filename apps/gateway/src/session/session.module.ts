import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { ConversationShareController } from './conversation-share.controller';
import { ConversationShareService } from './conversation-share.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SessionController, ConversationShareController],
  providers: [SessionService, ConversationShareService],
  exports: [SessionService],
})
export class SessionModule {}
