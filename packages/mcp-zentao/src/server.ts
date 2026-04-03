#!/usr/bin/env node
/**
 * UClaw ZenTao MCP Server
 *
 * 标准的 Model Context Protocol 服务端实现。
 * 将 ZenTao 缺陷管理能力以 MCP 协议暴露给 Gateway MCPClientManager。
 *
 * 通信方式：Stdio（由 Gateway 以子进程方式启动）
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ZentaoTool } from '@uclaw/tools-zentao';

// 从环境变量读取配置（由 Gateway 启动子进程时注入）
const zentao = new ZentaoTool({
  baseUrl: process.env['ZENTAO_BASE_URL'] ?? '',
  token: process.env['ZENTAO_API_TOKEN'] ?? '',
  isMock: !process.env['ZENTAO_BASE_URL'],
});

// ──────────────────────────────────────────────
// 创建 MCP Server 实例
// ──────────────────────────────────────────────
const server = new McpServer({
  name: 'uclaw-zentao',
  version: '1.0.0',
});

// ──────────────────────────────────────────────
// 工具注册：getBugInfo
// ──────────────────────────────────────────────
server.tool(
  'getBugInfo',
  '获取禅道指定缺陷的详细信息（标题、状态、指派人、严重程度）',
  {
    bugId: z.string().describe('缺陷 ID，例如 BUG-2048 或纯数字 2048'),
  },
  async ({ bugId }: { bugId: string }) => {
    const bug = await zentao.getBugInfo(bugId);
    if (!bug) {
      return {
        content: [{ type: 'text' as const, text: `未找到 ID 为 ${bugId} 的缺陷` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(bug, null, 2) }],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：searchBugs
// ──────────────────────────────────────────────
server.tool(
  'searchBugs',
  '根据关键词在禅道中搜索缺陷列表',
  {
    query: z.string().describe('搜索关键词，如功能模块名、错误信息片段'),
  },
  async ({ query }: { query: string }) => {
    const bugs = await zentao.searchBugs(query);
    return {
      content: [
        {
          type: 'text' as const,
          text:
            bugs.length > 0
              ? JSON.stringify(bugs, null, 2)
              : `未找到与 "${query}" 相关的缺陷`,
        },
      ],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：resolveBug
// ──────────────────────────────────────────────
server.tool(
  'resolveBug',
  '将禅道中指定缺陷标记为"已解决"（Resolved）状态',
  {
    bugId: z.string().describe('缺陷 ID，例如 BUG-5 或纯数字 5'),
    resolution: z
      .enum(['fixed', 'wontfix', 'bydesign', 'duplicate', 'external'])
      .optional()
      .default('fixed')
      .describe('解决方案类型，默认为 fixed（已修复）'),
  },
  async ({ bugId, resolution }: { bugId: string; resolution?: string }) => {
    const res = (resolution ?? 'fixed') as 'fixed' | 'wontfix' | 'bydesign' | 'duplicate' | 'external';
    const success = await zentao.resolveBug(bugId, res);
    return {
      content: [
        {
          type: 'text' as const,
          text: success
            ? `✅ 缺陷 ${bugId} 已成功标记为已解决（${res}）`
            : `❌ 解决缺陷 ${bugId} 失败，请检查权限或缺陷状态`,
        },
      ],
      isError: !success,
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：getBugStats
// ──────────────────────────────────────────────
server.tool(
  'getBugStats',
  '获取禅道产品的缺陷统计数据（总数、活跃、已解决）',
  {
    productId: z
      .number()
      .optional()
      .default(4)
      .describe('禅道产品 ID，默认为 4（UClaw 产品）'),
  },
  async ({ productId }: { productId?: number }) => {
    const pid = productId ?? 4;
    const stats = await zentao.getBugStats(pid);
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              productId: pid,
              ...stats,
              summary: `共 ${stats.total} 个缺陷，活跃 ${stats.active} 个，已解决 ${stats.resolved} 个`,
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：createProductStory
// ──────────────────────────────────────────────
server.tool(
  'createProductStory',
  '在禅道指定产品下创建一个新需求（Story）',
  {
    productId: z.number().describe('产品的 ID。如果不知道可以默认传入 4。'),
    title: z.string().describe('需求的标题，应简明扼要。'),
    spec: z.string().describe('需求的详述，支持 Markdown 格式。'),
    pri: z.number().optional().describe('优先级 (1=高, 2=中, 3=低, 4=最低)'),
    estimate: z.number().optional().describe('预估工时'),
  },
  async ({ productId, title, spec, pri, estimate }: { productId: number; title: string; spec: string; pri?: number; estimate?: number }) => {
    const res = await zentao.createStory(productId, { title, spec, pri, estimate });
    if (!res.success) {
      return {
        content: [{ type: 'text' as const, text: `❌ 创建需求失败：${JSON.stringify(res.error)}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: `✅ 需求创建成功！\n\n${JSON.stringify(res.data, null, 2)}` }],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：getStoryInfo
// ──────────────────────────────────────────────
server.tool(
  'getStoryInfo',
  '获取禅道指定需求的详细信息',
  {
    storyId: z.string().describe('需求 ID，例如 STORY-101 或纯数字 101'),
  },
  async ({ storyId }: { storyId: string }) => {
    const story = await zentao.getStoryInfo(storyId);
    if (!story) {
      return {
        content: [{ type: 'text' as const, text: `未找到 ID 为 ${storyId} 的需求` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(story, null, 2) }],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：searchProductStories
// ──────────────────────────────────────────────
server.tool(
  'searchProductStories',
  '根据关键词在禅道中搜索需求列表',
  {
    query: z.string().describe('搜索关键词，如需求标题片段'),
  },
  async ({ query }: { query: string }) => {
    const stories = await zentao.searchStories(query);
    return {
      content: [
        {
          type: 'text' as const,
          text:
            stories.length > 0
              ? JSON.stringify(stories, null, 2)
              : `未找到与 "${query}" 相关的需求`,
        },
      ],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：listProducts
// ──────────────────────────────────────────────
server.tool(
  'listProducts',
  '列出禅道中所有的产品列表',
  {},
  async () => {
    const products = await zentao.listProducts();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(products, null, 2) }],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：createProduct
// ──────────────────────────────────────────────
server.tool(
  'createProduct',
  '在禅道中创建一个新产品',
  {
    name: z.string().describe('产品名称'),
    code: z.string().describe('产品代号（英文标识）'),
    type: z.enum(['normal', 'multibranch', 'branch']).optional().default('normal').describe('产品类型'),
    desc: z.string().optional().describe('产品描述'),
  },
  async (data: { name: string; code: string; type?: string; desc?: string }) => {
    const res = await zentao.createProduct(data);
    if (!res.success) {
      return {
        content: [{ type: 'text' as const, text: `❌ 创建产品失败：${JSON.stringify(res.error)}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: `✅ 产品创建成功！\n\n${JSON.stringify(res.data, null, 2)}` }],
    };
  },
);

// ──────────────────────────────────────────────
// 工具注册：createProject
// ──────────────────────────────────────────────
server.tool(
  'createProject',
  '在禅道中创建一个新项目或执行周期',
  {
    name: z.string().describe('项目名称'),
    code: z.string().describe('项目代号（英文标识）'),
    begin: z.string().describe('开始日期 (YYYY-MM-DD)'),
    end: z.string().describe('结束日期 (YYYY-MM-DD)'),
    desc: z.string().optional().describe('项目描述'),
    productIds: z.array(z.number()).optional().describe('关联的产品 ID 列表'),
  },
  async (data: { name: string; code: string; begin: string; end: string; desc?: string; productIds?: number[] }) => {
    const res = await zentao.createProject(data);
    if (!res.success) {
      return {
        content: [{ type: 'text' as const, text: `❌ 创建项目失败：${JSON.stringify(res.error)}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: 'text' as const, text: `✅ 项目创建成功！\n\n${JSON.stringify(res.data, null, 2)}` }],
    };
  },
);

// ──────────────────────────────────────────────
// 启动服务（Stdio Transport）
// ──────────────────────────────────────────────
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write('[mcp-zentao] ZenTao MCP Server started via stdio\n');
}

main().catch((err: Error) => {
  process.stderr.write(`[mcp-zentao] Fatal error: ${err.message}\n`);
  process.exit(1);
});
