import { Injectable } from '@nestjs/common';
import { tool } from 'ai';
import type { SkillContext } from '@ocean/core';
import { z } from 'zod';
import { RpcGateway } from '../chat/rpc.gateway';
import { MCPClientManager } from '../mcp/mcp-client.manager';
import { RAGService } from '../rag/rag.service';
import { SkillLoader } from '../skill/skill.loader';
import { InteractiveManager } from '../skill/interactive.manager';
import { TracingService } from '../tracing/tracing.service';
import { ZentaoService } from '../zentao/zentao.service';
import { PolicyEvaluator } from './policy.evaluator';

/**
 * ToolRuntime —— 工具装配与执行入口（Agent Runtime 第 4/6 模块）。
 * 从原 SkillOrchestrator 的 buildTools 拆分：负责组装
 * 原子工具（禅道/本地文件/Git/Shell/Plan/RAG/Skill 激活）+ 意图澄清工具
 * + MCP 工具，并按 PolicyEvaluator 的判定对高危工具做审批拦截包装。
 * 只负责「工具集装配」，不包含模型执行。
 */
@Injectable()
export class ToolRuntime {
  constructor(
    private readonly zentaoService: ZentaoService,
    private readonly rpcGateway: RpcGateway,
    private readonly ragService: RAGService,
    private readonly tracingService: TracingService,
    private readonly skillLoader: SkillLoader,
    private readonly interactiveManager: InteractiveManager,
    private readonly mcpManager: MCPClientManager,
    private readonly policyEvaluator: PolicyEvaluator,
  ) {}

  async buildTools(
    ctx: SkillContext,
    sessionId?: string,
  ): Promise<Record<string, any>> {
    const currentUserId = ctx.userId;

    const atomicTools: Record<string, any> = {
      getBugInfo: tool({
        description: '获取指定 Bug ID 的详细信息，结果将以卡片形式展示',
        inputSchema: z.object({
          bugId: z.string().describe('缺陷的 ID，如 BUG-2048'),
        }),
        execute: async ({ bugId }) => {
          const bug = await this.zentaoService.getBugInfo(bugId);
          if (!bug) {
            return { found: false, message: `未找到 BUG-${bugId}` };
          }
          return {
            found: true,
            bugId: bug.id,
            ui: {
              uiType: 'bug_card',
              props: {
                id: bug.id,
                title: bug.title,
                status: bug.status,
                assignee: bug.assignee,
                severity: bug.severity,
                description: bug.description,
                createdAt: bug.createdAt,
              },
            },
          };
        },
      }),

      searchBugs: tool({
        description: '根据关键词在禅道中搜索缺陷',
        inputSchema: z.object({
          query: z.string().describe('搜索关键词'),
        }),
        execute: async ({ query }) => {
          return await this.zentaoService.searchBugs(query);
        },
      }),

      resolveBug: tool({
        description: '在禅道中将指定的 Bug 标记为已解决（Resolved）',
        inputSchema: z.object({
          bugId: z.string().describe('缺陷的 ID，如 BUG-5'),
        }),
        execute: async ({ bugId }) => {
          const success = await this.zentaoService.resolveBug(bugId);
          return { status: success ? 'Success' : 'Error', bugId };
        },
      }),

      local_file_read: tool({
        description: '读取开发者本地工作站的文件内容',
        inputSchema: z.object({
          path: z.string().describe('文件相对路径'),
        }),
        execute: async ({ path }) => {
          const result = await this.rpcGateway.sendToCli(
            currentUserId,
            'read_file',
            { path },
          );
          return {
            status: 'Success',
            path,
            content: result,
            ui: {
              uiType: 'code_block',
              props: {
                command: `read_file ${path}`,
                output: result,
                status: 'success',
                language: path.split('.').pop() || 'text',
              },
            },
            activeContext: {
              type: 'file',
              name: path.split('/').pop() || path,
              path: path,
              status: 'DONE',
              progress: 100,
            },
          };
        },
      }),

      rag_search: tool({
        description:
          '在 Ocean 知识库（RAG）中搜索相关文档。适用于回答银行业务规则、系统使用说明、代码库规范等问题。',
        inputSchema: z.object({
          query: z.string().describe('搜索关键词或语义查询'),
          limit: z.number().optional().default(5).describe('返回结果条数'),
        }),
        execute: async ({ query, limit }) => {
          return await this.tracingService.traceCall(
            'RAG Search',
            { query, limit },
            async (span) => {
              const results = await this.ragService.searchSimilarity(
                query,
                limit,
              );
              span.setAttribute('results_count', results.length);
              return {
                status: 'Success',
                results: results.map((r) => ({
                  title: r.title,
                  content: r.content,
                  score: r.distance,
                })),
              };
            },
          );
        },
      }),

      local_file_edit: tool({
        description: '通过精准匹配旧代码块并替换为新代码块来修改本地文件。',
        inputSchema: z.object({
          path: z.string().describe('文件相对路径'),
          oldString: z
            .string()
            .describe('要被替换的原始代码块（必须完全匹配）'),
          newString: z.string().describe('替换后的新代码块'),
        }),
        execute: async ({ path, oldString, newString }) => {
          const result = await this.rpcGateway.sendToCli(
            currentUserId,
            'local_file_edit',
            { path, oldString, newString, sessionId },
          );
          return {
            status: 'Success',
            path,
            ui: {
              uiType: 'diff_viewer',
              props: {
                fileName: path,
                diff: [
                  { type: 'deletion', content: oldString },
                  { type: 'addition', content: newString },
                ],
              },
            },
            activeContext: {
              type: 'file',
              name: path.split('/').pop() || path,
              path: path,
              status: 'SAVED',
              progress: 100,
            },
          };
        },
      }),

      local_git: tool({
        description:
          '操作本地 Git 仓库（status, add, commit, push, log, diff, branch）。',
        inputSchema: z.object({
          action: z
            .enum(['status', 'add', 'commit', 'push', 'log', 'diff', 'branch'])
            .describe('Git 动作'),
          args: z
            .string()
            .optional()
            .describe('动作参数，如 "." 或 \'-m "message"\' '),
        }) as any,
        execute: async ({ action, args }) => {
          const result = await this.rpcGateway.sendToCli(
            currentUserId,
            'local_git',
            { action, args, sessionId },
          );

          const response: any = {
            status: 'Success',
            ...result,
            ui: {
              uiType: 'code_block',
              props: {
                command: `git ${action} ${args || ''}`.trim(),
                output:
                  result.raw ||
                  (typeof result === 'string'
                    ? result
                    : JSON.stringify(result, null, 2)),
                status: 'success',
              },
            },
          };

          if (action === 'status' && result.branch) {
            response.activeContext = {
              workspace: {
                name: result.gitDir?.split('/').pop() || 'Ocean',
                branch: result.branch,
                isClean: result.isClean,
                path: result.cwd || '',
              },
            };
          }

          return response;
        },
      }),

      local_bash: tool({
        description:
          '在开发者本地工作站执行 Shell 指令（编译、测试、安装依赖等）。',
        inputSchema: z.object({
          command: z.string().describe('要执行的完整 Shell 指令'),
        }),
        execute: async ({ command }) => {
          const result = await this.rpcGateway.sendToCli(
            currentUserId,
            'bash',
            { command, sessionId },
          );
          return {
            status: 'Success',
            output: result,
            ui: {
              uiType: 'code_block',
              props: { command, output: result, status: 'success' },
            },
          };
        },
      }),

      local_plan: tool({
        description: '管理复杂任务的执行计划（编排工作流）。',
        inputSchema: z.object({
          action: z.enum(['start', 'update', 'list', 'exit']).describe('操作'),
          subjects: z.array(z.string()).optional().describe('步骤列表'),
          id: z.string().optional().describe('任务 ID'),
          status: z
            .enum(['todo', 'doing', 'done', 'failed'])
            .optional()
            .describe('状态'),
        }),
        execute: async (params: any) => {
          const result = await this.rpcGateway.sendToCli(
            currentUserId,
            'local_plan',
            { ...params, sessionId },
          );
          return {
            status: 'Success',
            ...result,
            ui: { uiType: 'task_plan', props: result },
          };
        },
      }),

      activate_skill: tool({
        description: '加载特定 Skill 的完整执行指令。',
        inputSchema: z.object({
          skill_name: z.string().describe('Skill 名称'),
        }),
        execute: async ({ skill_name }) => {
          const content = await this.skillLoader.activate(skill_name);
          if (!content) return { error: `Skill "${skill_name}" not found.` };
          return {
            message: `Skill "${skill_name}" activated.`,
            skill_content: content,
          };
        },
      }),
    };

    // 意图澄清工具 + 高危工具审批拦截（PolicyEvaluator 决策）
    const finalTools: Record<string, any> = {
      ...atomicTools,
      ...this.interactiveManager.getClarifyTool(),
    };

    const mcpTools = await this.mcpManager.getAITools();
    if (sessionId) {
      // 高危判定统一走 PolicyEvaluator：MCP 工具全部拦截（保守），本地高危工具按策略
      for (const [name, toolDef] of Object.entries(mcpTools)) {
        if (this.policyEvaluator.shouldWrap(name, true)) {
          finalTools[name] = this.policyEvaluator.wrap(
            name,
            toolDef,
            sessionId,
            currentUserId,
          );
        }
      }
      for (const name of Object.keys(atomicTools)) {
        if (this.policyEvaluator.shouldWrap(name, false)) {
          finalTools[name] = this.policyEvaluator.wrap(
            name,
            atomicTools[name],
            sessionId,
            currentUserId,
          );
        }
      }
    } else {
      Object.assign(finalTools, mcpTools);
    }

    return finalTools;
  }
}
