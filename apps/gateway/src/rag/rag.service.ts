import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { embed, embedMany, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { PIIService } from './pii.service';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

@Injectable()
export class RAGService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly piiService: PIIService,
  ) {}

  private getEmbeddingModel() {
    const baseURL = this.configService.get<string>('RAG_EMBEDDING_API_BASE') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const apiKey = this.configService.get<string>('RAG_EMBEDDING_API_KEY') || this.configService.get<string>('DASHSCOPE_API_KEY');
    const model = this.configService.get<string>('RAG_EMBEDDING_MODEL') || 'text-embedding-v3';

    return createOpenAI({
      baseURL,
      apiKey,
    }).embedding(model);
  }

  private getChatModel() {
    const baseURL = this.configService.get<string>('DASHSCOPE_BASE_URL');
    const apiKey = this.configService.get<string>('DASHSCOPE_API_KEY');
    return createOpenAI({
      baseURL,
      apiKey,
    }).chat('qwen-plus'); 
  }

  /**
   * Create initial document record with processing status
   */
  async createDocumentRecord(data: { title: string; sourceUrl: string; projectId?: string; userId?: string }) {
    return this.prisma.document.create({
      data: {
        ...data,
        status: 'processing',
      }
    });
  }

  /**
   * Main entry point for background indexing
   */
  async startAsyncIndexing(documentId: string, filePath: string) {
    console.log(`[RAG Worker] Starting background task for document ${documentId}`);
    
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
      }
      const rawContent = await fs.promises.readFile(filePath, 'utf-8');
      await this.indexDocumentInternal(documentId, rawContent);
      console.log(`[RAG Worker] Successfully finished background task for ${documentId}`);
    } catch (err) {
      console.error(`[RAG Worker] Critical failure in background task for ${documentId}:`, err);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' }
      }).catch(dbErr => console.error('[RAG Worker] Double failure: could not update status', dbErr));
    }
  }

  /**
   * Internal indexing logic using Prisma ORM
   */
  private async indexDocumentInternal(documentId: string, rawContent: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('Document record not found');

    const title = doc.title;
    const embeddingKey = this.configService.get<string>('RAG_EMBEDDING_API_KEY') || this.configService.get<string>('DASHSCOPE_API_KEY');
    if (!embeddingKey) throw new Error('API Key is missing.');

    const content = this.piiService.mask(rawContent);
    const chunkSize = 800;
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    const contextualChunks: string[] = [];
    const llmBatchSize = 5; 
    for (let i = 0; i < chunks.length; i += llmBatchSize) {
      const batch = chunks.slice(i, i + llmBatchSize);
      const batchResults = await Promise.all(batch.map(async (chunk) => {
        try {
          const { text: contextDescription } = await generateText({
            model: this.getChatModel(),
            system: `你是一个文档解析助手。请用 100 字以内的中文，为提供的文档片段写一个简短的“背景描述”。`,
            prompt: `整篇文档标题: ${title}\n\n当前分块内容:\n${chunk}\n\n请为这个分块提供背景描述：`,
          });
          return `[背景: ${contextDescription.trim()}]\n\n[原文: ${chunk}]`;
        } catch (err) {
          return chunk; 
        }
      }));
      contextualChunks.push(...batchResults);
    }

    const embeddingBatchSize = 10;
    const allEmbeddings: any[] = [];
    for (let i = 0; i < contextualChunks.length; i += embeddingBatchSize) {
      const batch = contextualChunks.slice(i, i + embeddingBatchSize);
      const { embeddings } = await embedMany({
        model: this.getEmbeddingModel(),
        values: batch,
      });
      allEmbeddings.push(...embeddings);
    }

    // Because 'embedding' is Unsupported("vector(1536)") in Prisma, it cannot be written using createMany.
    // We must use raw SQL to insert the native pgvector data.
    for (let i = 0; i < contextualChunks.length; i++) {
      const content = contextualChunks[i];
      const embeddingArray = allEmbeddings[i];
      const vectorStr = `[${embeddingArray.join(',')}]`;
      
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO document_chunks (id, "documentId", content, index, embedding) VALUES ($1, $2, $3, $4, $5::vector)`,
        randomUUID(), documentId, content, i, vectorStr
      );
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'indexed' }
    });
  }

  async indexDocument(title: string, rawContent: string, projectId?: string, userId?: string) {
    const doc = await this.prisma.document.create({
      data: { title, userId, projectId, status: 'processing' }
    });
    await this.indexDocumentInternal(doc.id, rawContent);
    return doc.id;
  }

  async searchSimilarity(query: string, limit: number = 5) {
    const { embedding } = await embed({
      model: this.getEmbeddingModel(),
      value: query,
    });
    const vectorStr = `[${embedding.join(',')}]`;

    const results: any[] = await this.prisma.$queryRawUnsafe(`
      WITH vector_search AS (
        SELECT id, (embedding <=> $1::vector) as distance,
        ROW_NUMBER() OVER (ORDER BY embedding <=> $1::vector) as rank
        FROM document_chunks
        WHERE embedding IS NOT NULL
        ORDER BY (embedding <=> $1::vector) ASC LIMIT 50
      ),
      text_search AS (
        SELECT id, ts_rank_cd(tsv, websearch_to_tsquery('simple', $2)) as score,
        ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, websearch_to_tsquery('simple', $2)) DESC) as rank
        FROM document_chunks
        WHERE tsv @@ websearch_to_tsquery('simple', $2)
        ORDER BY score DESC LIMIT 50
      )
      SELECT dc.id, dc."documentId", dc.content, d.title,
      COALESCE(1.0 / (60 + vs.rank), 0.0) + COALESCE(1.0 / (60 + ts.rank), 0.0) as rrf_score
      FROM document_chunks dc
      JOIN documents d ON dc."documentId" = d.id
      LEFT JOIN vector_search vs ON dc.id = vs.id
      LEFT JOIN text_search ts ON dc.id = ts.id
      WHERE vs.id IS NOT NULL OR ts.id IS NOT NULL
      ORDER BY rrf_score DESC LIMIT $3
    `, vectorStr, query, limit);

    return results;
  }

  async getDocuments(projectId?: string, userId?: string) {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (userId) where.userId = userId;

    return this.prisma.document.findMany({
      where,
      include: { _count: { select: { chunks: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteDocument(id: string) {
    return this.prisma.document.delete({ where: { id } });
  }

  async getStats() {
    const [docCount, chunkCount, orphanedCount, projects] = await Promise.all([
      this.prisma.document.count(),
      this.prisma.documentChunk.count(),
      this.prisma.document.count({ where: { projectId: null } }),
      this.prisma.knowledgeProject.findMany({ select: { category: true } }),
    ]);
    const categories = Array.from(new Set(projects.map(p => p.category).filter(Boolean)));
    const estimatedSizeMb = (chunkCount * 2) / 1024; 

    return {
      activeSources: docCount,
      totalChunks: chunkCount,
      orphanedCount,
      categories: categories.slice(0, 5),
      dataIndexedMb: estimatedSizeMb.toFixed(2),
    };
  }
}
