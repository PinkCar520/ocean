import { Controller, Get, Delete, Param, Req, Query } from '@nestjs/common';
import { RAGService } from './rag.service';

@Controller('api/rag')
export class RAGController {
  constructor(private readonly ragService: RAGService) {}

  @Get('documents')
  async getDocuments(@Req() req: any, @Query('projectId') projectId?: string) {
    const userId = req.user?.workId;
    const docs = await this.ragService.getDocuments(projectId, userId);
    return { success: true, data: docs };
  }

  @Get('stats')
  async getStats() {
    const stats = await this.ragService.getStats();
    return { success: true, data: stats };
  }

  @Delete('documents/:id')
  async deleteDocument(@Param('id') id: string) {
    await this.ragService.deleteDocument(id);
    return { success: true };
  }
}
