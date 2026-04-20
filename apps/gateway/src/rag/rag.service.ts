import { Injectable, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { embed, embedMany, generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { PIIService } from './pii.service';

@Injectable()
export class RAGService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly configService: ConfigService,
    private readonly piiService: PIIService,
  ) {}

  private getEmbeddingModel() {
    const baseURL = this.configService.get<string>('RAG_EMBEDDING_API_BASE') || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    const apiKey = this.configService.get<string>('RAG_EMBEDDING_API_KEY');
    const model = this.configService.get<string>('RAG_EMBEDDING_MODEL') || 'text-embedding-v3';

    return createOpenAI({
      baseURL,
      apiKey,
    }).embedding(model);
  }

  private getChatModel() {
    const baseURL = this.configService.get<string>('DASHSCOPE_API_BASE');
    const apiKey = this.configService.get<string>('DASHSCOPE_API_KEY');
    return createOpenAI({
      baseURL,
      apiKey,
    }).chat('qwen-plus'); // 使用更强的模型来生成上下文背景
  }

  /**
   * Index a text document into chunks and store vectors
   */
  async indexDocument(title: string, rawContent: string, projectId?: string, userId?: string) {
    // 0. PII Masking (Security First)
    const content = this.piiService.mask(rawContent);

    // 1. Simple chunking (800 chars for slightly larger context)
    const chunkSize = 800;
    const chunks: string[] = [];
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push(content.slice(i, i + chunkSize));
    }

    // 2. Generate Contextual Chunks (Claude's approach)
    // 为每个分块生成其在整篇文档中的背景描述
    const contextualChunks: string[] = [];
    console.log(`[RAG] Generating context for ${chunks.length} chunks...`);

    for (let i = 0; i < chunks.length; i++) {
      try {
        const { text: contextDescription } = await generateText({
          model: this.getChatModel(),
          system: `你是一个文档解析助手。请用 100 字以内的中文，为提供的文档片段写一个简短的“背景描述”。
描述应包含：这份文档的主题是什么、当前分块正在讨论哪个具体细节。
请直接输出描述，不要有任何前缀。`,
          prompt: `整篇文档标题: ${title}\n\n当前分块内容:\n${chunks[i]}\n\n请为这个分块提供背景描述：`,
        });

        // 将背景与原文拼接，形成增强后的切片
        const augmentedContent = `[背景: ${contextDescription.trim()}]\n\n[原文: ${chunks[i]}]`;
        contextualChunks.push(augmentedContent);
      } catch (err) {
        console.error(`[RAG] Failed to generate context for chunk ${i}:`, err);
        contextualChunks.push(chunks[i]); // 回退到原始分块
      }
    }

    // 3. Generate embeddings in batches (DashScope limit is 10 per request)
    const batchSize = 10;
    const allEmbeddings: any[] = [];
    
    for (let i = 0; i < contextualChunks.length; i += batchSize) {
      const batch = contextualChunks.slice(i, i + batchSize);
      const { embeddings } = await embedMany({
        model: this.getEmbeddingModel(),
        values: batch,
      });
      allEmbeddings.push(...embeddings);
    }

    // 4. Store in DB
    const doc = await this.prisma.document.create({
      data: {
        title,
        userId,
        projectId,
        status: 'indexed',
      }
    });

    for (let i = 0; i < contextualChunks.length; i++) {
      await this.prisma.documentChunk.create({
        data: {
          documentId: doc.id,
          content: contextualChunks[i], // 存储增强后的内容
          index: i,
          embedding: allEmbeddings[i], 
        }
      });
    }

    return doc.id;
  }

  /**
   * Hybrid search using Reciprocal Rank Fusion (RRF)
   * Combines pgvector similarity and PostgreSQL Full-Text Search
   */
  async searchSimilarity(query: string, limit: number = 5) {
    // 1. Embed query for vector search
    const { embedding } = await embed({
      model: this.getEmbeddingModel(),
      value: query,
    });
    const vectorStr = `[${embedding.join(',')}]`;

    // 2. Perform Hybrid Search via Raw SQL
    // RRF Score = 1 / (k + rank_vector) + 1 / (k + rank_text)
    // k is a constant, typically 60
    const results: any[] = await this.prisma.$queryRawUnsafe(`
      WITH vector_search AS (
        SELECT 
          id, 
          (embedding::text::vector <=> $1::vector) as distance,
          ROW_NUMBER() OVER (ORDER BY embedding::text::vector <=> $1::vector) as rank
        FROM document_chunks
        ORDER BY distance ASC
        LIMIT 50
      ),
      text_search AS (
        SELECT 
          id, 
          ts_rank_cd(tsv, websearch_to_tsquery('simple', $2)) as score,
          ROW_NUMBER() OVER (ORDER BY ts_rank_cd(tsv, websearch_to_tsquery('simple', $2)) DESC) as rank
        FROM document_chunks
        WHERE tsv @@ websearch_to_tsquery('simple', $2)
        ORDER BY score DESC
        LIMIT 50
      )
      SELECT 
        dc.id, 
        dc."documentId", 
        dc.content, 
        d.title,
        COALESCE(1.0 / (60 + vs.rank), 0.0) + COALESCE(1.0 / (60 + ts.rank), 0.0) as rrf_score,
        COALESCE(vs.distance, 1.0) as vector_distance
      FROM document_chunks dc
      JOIN documents d ON dc."documentId" = d.id
      LEFT JOIN vector_search vs ON dc.id = vs.id
      LEFT JOIN text_search ts ON dc.id = ts.id
      WHERE vs.id IS NOT NULL OR ts.id IS NOT NULL
      ORDER BY rrf_score DESC
      LIMIT $3
    `, vectorStr, query, limit);

    return results;
  }

  /**
   * List all documents
   */
  async getDocuments(projectId?: string, userId?: string) {
    const where: any = {};
    if (projectId) where.projectId = projectId;
    if (userId) where.userId = userId;

    return this.prisma.document.findMany({
      where,
      include: {
        _count: {
          select: { chunks: true }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Delete a document and its chunks
   */
  async deleteDocument(id: string) {
    return this.prisma.document.delete({
      where: { id },
    });
  }

  /**
   * Get RAG statistics and insights
   */
  async getStats() {
    const [docCount, chunkCount, orphanedCount, projects] = await Promise.all([
      this.prisma.document.count(),
      this.prisma.documentChunk.count(),
      this.prisma.document.count({ where: { projectId: null } }),
      this.prisma.knowledgeProject.findMany({ select: { category: true } }),
    ]);

    // Extract unique categories for Suggested Chips
    const categories = Array.from(new Set(projects.map(p => p.category).filter(Boolean)));

    // Simple size estimation: each chunk is ~500 chars + embedding overhead
    const estimatedSizeMb = (chunkCount * 2) / 1024; 

    return {
      activeSources: docCount,
      totalChunks: chunkCount,
      orphanedCount,
      categories: categories.slice(0, 5), // Return top 5 categories
      dataIndexedMb: estimatedSizeMb.toFixed(2),
    };
  }
}
