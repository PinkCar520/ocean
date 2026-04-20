import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RAGService } from './rag.service';
import { RAGController } from './rag.controller';
import { PIIService } from './pii.service';
import { KnowledgeProjectController } from './knowledge-project.controller';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [RAGController, KnowledgeProjectController],
  providers: [RAGService, PIIService],
  exports: [RAGService, PIIService],
})
export class RAGModule {}
