import { z } from 'zod';
import { ArtifactStore } from '../artifact/artifact.store';
import { EgressPolicy } from '../sandbox/egress-policy';
import { TerminalToolError, Tool } from './tool.types';

/** echo：无外部副作用，返回传入文本（普通验证/模型回显用）。 */
const echoTool: Tool = {
  name: 'echo',
  description: 'Returns the input text unchanged.',
  inputSchema: z.object({ text: z.string().describe('text to echo back') }),
  async execute(input: Record<string, unknown>) {
    return { text: typeof input.text === 'string' ? input.text : '' };
  },
};

/**
 * counter.increment：有外部副作用的工具（演示幂等语义）。
 * 每次 execute 使指定 key 的计数 +1 —— 外部副作用本身不幂等；
 * ToolExecutor 通过 idempotencyKey 保证同一投递只 execute 一次，
 * 重复投递直接命中缓存步骤，计数不会二次增加。
 */
const counterState = new Map<string, number>();
const counterTool: Tool = {
  name: 'counter.increment',
  description:
    'Increments a named counter (external side effect). Callers MUST pass idempotencyKey to avoid double increments on redelivery.',
  inputSchema: z.object({
    key: z.string().optional().describe('counter key (default: "default")'),
  }),
  async execute(input: Record<string, unknown>) {
    const key = typeof input.key === 'string' ? input.key : 'default';
    const next = (counterState.get(key) ?? 0) + 1;
    counterState.set(key, next);
    return { key, count: next };
  },
};

/**
 * notify.send：需要审批的外部写工具（Phase 4 第 5 项演示）。
 * requiresApproval=true → ToolExecutor 执行前先创建审批，
 * Run 进入 waiting_for_approval；审批通过后从检查点续跑执行。
 */
const notifySendTool: Tool = {
  name: 'notify.send',
  description:
    'Sends a notification to a recipient (external side effect). Requires user approval before execution.',
  requiresApproval: true,
  inputSchema: z.object({
    to: z.string().describe('recipient'),
    message: z.string().describe('notification body'),
  }),
  async execute(input: Record<string, unknown>) {
    return {
      sent: true,
      to: typeof input.to === 'string' ? input.to : '',
      message: typeof input.message === 'string' ? input.message : '',
    };
  },
};

/**
 * web.get：受 egress allowlist 约束的 HTTP GET 工具（Phase 4 第 7 项演示）。
 * 未白名单域（或非 http/https URL）直接抛 TerminalToolError（egress_denied），
 * ToolExecutor 将其分类为终态业务失败 → run failed + run_step.error 持久化（可审计）。
 */
function createWebGetTool(egress: EgressPolicy): Tool {
  return {
    name: 'web.get',
    description:
      'Fetches a URL over HTTP(S) subject to the egress allowlist (default deny: unlisted hosts are rejected and audited).',
    inputSchema: z.object({
      url: z.string().describe('http(s) URL to fetch'),
    }),
    async execute(input: Record<string, unknown>) {
      const url = typeof input.url === 'string' ? input.url : '';
      const verdict = egress.checkUrl(url);
      if (!verdict.allowed) {
        throw new TerminalToolError(
          `egress_denied: ${verdict.host || '(invalid url)'} not in allowlist (reason: ${verdict.reason})`,
        );
      }
      const response = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });
      const body = await response.text();
      return { status: response.status, url, body: body.slice(0, 4000) };
    },
  };
}

/**
 * artifact.save / artifact.load：产物存储分离工具（Phase 4 第 8 项，借鉴 K6）。
 * save 把大内容写入 ArtifactStore（本地对象存储），数据库只落 RunArtifact 引用
 * （sizeBytes + storageKey），产物全文绝不进 PG（run_step.output 只含引用）。
 */
function createArtifactTools(store: ArtifactStore): Tool[] {
  return [
    {
      name: 'artifact.save',
      description:
        'Stores a large artifact to the artifact store (object storage). Returns a reference; the payload itself is NOT persisted in the database.',
      inputSchema: z.object({
        name: z.string().optional().describe('artifact name (default: unnamed)'),
        content: z.union([z.string(), z.record(z.string(), z.unknown())]).describe('artifact content'),
      }),
      async execute(input: Record<string, unknown>, ctx) {
        if (!ctx) throw new TerminalToolError('artifact.save requires run context');
        const name = typeof input.name === 'string' ? input.name : 'unnamed';
        const content =
          typeof input.content === 'string'
            ? input.content
            : JSON.stringify(input.content ?? {});
        const record = await store.save(ctx.runId, name, content);
        return {
          artifactId: record.id,
          name: record.name,
          sizeBytes: record.sizeBytes,
          url: `/api/runs/${ctx.runId}/artifacts/${record.id}`,
        };
      },
    },
    {
      name: 'artifact.load',
      description:
        'Loads artifact content by artifactId (must belong to the same run).',
      inputSchema: z.object({
        artifactId: z.string().describe('artifact id returned by artifact.save'),
      }),
      async execute(input: Record<string, unknown>, ctx) {
        if (!ctx) throw new TerminalToolError('artifact.load requires run context');
        const artifactId =
          typeof input.artifactId === 'string' ? input.artifactId : '';
        if (!artifactId) throw new TerminalToolError('artifact.load requires artifactId');
        try {
          const content = await store.load(ctx.runId, artifactId);
          return { artifactId, content };
        } catch (err) {
          // 不存在/跨 run：终态业务错误（不重试），run failed + step.error 可审计
          throw new TerminalToolError(
            `artifact.load failed: ${(err as Error).message}`,
          );
        }
      },
    },
  ];
}

/** 内置工具集工厂（egress policy / artifact store 由 ToolModule 注入，按 name 注册进 ToolRegistry）。 */
export function createBuiltinTools(egress: EgressPolicy, artifactStore?: ArtifactStore): Tool[] {
  const tools: Tool[] = [echoTool, counterTool, notifySendTool, createWebGetTool(egress)];
  if (artifactStore) tools.push(...createArtifactTools(artifactStore));
  return tools;
}
