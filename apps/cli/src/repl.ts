import type { PermissionMode } from '@ocean/core/permission-policy';
import { LifecycleHooks } from './utils/lifecycle-hooks.js';
/**
 * Ocean REPL - Entry point for interactive mode
 * Uses Ink UI for rich terminal experience
 */
import type { ModelMessage } from 'ai';
import type { CliConfig, LoadedSkill, ToolContext } from './types.js';
import { createModelRouter } from './llm/model-router.js';
import {
  buildSystemPrompt,
  runChatLoop,
  runChatLoopViaGateway,
  type OceanPromptEvent,
} from './llm/chat.js';
import { resolveApiKey } from './utils/auth.js';
import { gatewayPrintSession } from './llm/gateway-session.js';
import { toAgentToolSet } from './tools/index.js';
import { createGatewayApprovalHandler } from './approval/gateway-approval.js';
import { discoverSkills } from './skills/loader.js';
import { McpClientManager } from './mcp/client.js';
import { SessionStore, type StoredSession } from './utils/session-store.js';
import { formatTaskPlan } from './utils/task-manager.js';
import { PermissionPolicy, defaultSessionPermissionGrants } from './utils/permission-policy.js';
import { runInkApp } from './ui/app.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import chalk from 'chalk';
import readline from 'node:readline';
import { z } from 'zod';
import ora from 'ora';

interface ReplOptions {
  userId: string;
  workspace: string;
  singleQuery?: string;
  print?: 'text' | 'json' | 'stream-json';
  resume?: string;
  continueSession?: boolean;
  persistSession?: boolean;
  permissionMode?: PermissionMode;
  commandPermissionSettings?: ToolContext['commandPermissionSettings'];
  permissionSources?: ToolContext['permissionSources'];
  toolNames?: ReadonlySet<string>;
  modelId?: string;
  /** 通过 Gateway Run API 执行（第 3 条：CLI 接入统一 Run API） */
  gateway?: boolean;
  remoteWorkspaceId?: string;
}

/**
 * Run the interactive REPL
 * - Single query mode: legacy text-based approach
 * - Interactive mode: Ink UI if TTY, otherwise readline fallback
 */
export async function runRepl(options: ReplOptions) {
  // Single query mode - use simple text approach
  if (options.singleQuery) {
    if (!options.print) {
      await runSingleQuery(options, (text) => process.stdout.write(text));
      process.exit(0);
    }
    await printSingleQuery(options, options.print);
    return;
  }

  // 交互模式暂不支持 --gateway（Ink UI 绑定本地 runChatLoop），明确提示回退本地
  if (options.gateway) {
    console.log(
      chalk.yellow('[Ocean] 交互模式暂不支持 --gateway，继续使用本地模型直连。'),
    );
    console.log(
      chalk.gray('（单轮查询 ocean "问题" --gateway 走统一 Run API）'),
    );
  }

  // Check if stdin is a TTY (interactive terminal)
  // Ink requires raw mode which only works with TTY
  if (process.stdin.isTTY) {
    // Use Ink UI for interactive terminal
    await runInkApp({
      userId: options.userId,
      workspace: options.workspace,
    });
  } else {
    // Fallback to readline for piped/non-TTY input
    await runReadlineRepl(options);
  }
}

async function printSingleQuery(options: ReplOptions, format: NonNullable<ReplOptions['print']>, requestId?: string) {
  const writeEvent = (event: object) => process.stdout.write(`${JSON.stringify({ ...event, ...(requestId && { requestId }) })}\n`);
  let answer = '';
  let activeSessionId: string | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('Execution interrupted.'));
  process.once('SIGINT', abort);
  try {
    const sessionId = await runSingleQuery(options, (text) => {
      if (format === 'text') process.stdout.write(text);
      else if (format === 'stream-json') writeEvent({ type: 'text_delta', delta: text });
      else answer += text;
    }, controller.signal, (event) => {
      if (event.type === 'session') activeSessionId = event.sessionId;
      if (format === 'stream-json') writeEvent(event);
    });
    controller.signal.throwIfAborted();
    if (format === 'text') process.stdout.write('\n');
    else {
      const result = { type: 'result', status: 'succeeded', sessionId };
      writeEvent(format === 'json' ? { ...result, text: answer } : result);
    }
    return sessionId;
  } catch (error) {
    if (format !== 'text') {
      writeEvent({ type: 'result', status: 'failed', sessionId: activeSessionId, error: error instanceof Error ? error.message : String(error) });
    }
    throw error;
  } finally {
    process.removeListener('SIGINT', abort);
  }
}

const printInputSchema = z.object({
  type: z.literal('user'),
  text: z.string().trim().min(1).max(512 * 1024),
  id: z.string().min(1).max(200).optional(),
}).strict();

export async function runPrintStream(options: ReplOptions, replay: boolean) {
  if (options.persistSession === false) {
    throw new Error('Structured multi-turn input requires session persistence.');
  }
  let sessionId = options.resume;
  let continueSession = options.continueSession;
  const submit = async (text: string, id?: string) => {
    if (replay) process.stdout.write(`${JSON.stringify({ type: 'user', text, requestId: id })}\n`);
    sessionId = await printSingleQuery({
      ...options,
      singleQuery: text,
      print: 'stream-json',
      resume: sessionId,
      continueSession,
    }, 'stream-json', id);
    continueSession = false;
  };
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    if (options.singleQuery?.trim()) await submit(options.singleQuery);
    for await (const line of input) {
      if (!line.trim()) continue;
      if (Buffer.byteLength(line) > 1024 * 1024) throw new Error('Structured input message is too large.');
      const message = printInputSchema.parse(JSON.parse(line));
      await submit(message.text, message.id);
    }
  } finally {
    input.close();
  }
}

/**
 * Run a single query without Ink UI (for scripting/CI)
 */
async function runSingleQuery(
  options: ReplOptions,
  onText: (text: string) => void,
  signal?: AbortSignal,
  onEvent?: (event: OceanPromptEvent) => void,
) {
  const query = options.singleQuery;
  if (!query) return;

  // 第 3 条：--gateway 时走统一 Run API（Gateway worker 执行，工具/审批/审计入 Run）
  if (options.gateway) {
    const gatewayUrl =
      process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000';
    const apiKey = await resolveApiKey();
    if (!apiKey) {
      if (options.print) throw new Error('--gateway requires authentication. Run ocean login first.');
      console.log(chalk.yellow('[Ocean] --gateway 需要 API Key，请先运行 ocean login'));
      return;
    }
    if (!options.print) {
      console.log(chalk.cyan(`[Ocean] Query: ${query}`));
      console.log(chalk.cyan(`[Ocean] User: ${options.userId}`));
      console.log(chalk.cyan(`[Ocean] Gateway: ${gatewayUrl} (Run API)\n`));
    }
    try {
      const sessionId = options.print && options.persistSession !== false
        ? options.resume ?? await gatewayPrintSession({
          gatewayUrl, apiKey, continueSession: options.continueSession, workspaceId: options.remoteWorkspaceId, signal,
        })
        : undefined;
      if (sessionId) onEvent?.({ type: 'session', sessionId });
      await runChatLoopViaGateway({
        gatewayUrl,
        apiKey,
        input: query,
        sessionId,
        modelId: options.modelId,
        nonInteractive: Boolean(options.print),
        onText,
        onEvent,
        signal,
      });
      if (!options.print) process.stdout.write('\n');
      return sessionId;
    } catch (err: any) {
      if (options.print) throw err;
      console.log(chalk.red(`[Ocean] Gateway error: ${err.message}`));
    }
    return;
  }

  if (!options.print) {
    console.log(chalk.cyan(`[Ocean] Query: ${query}`));
    console.log(chalk.cyan(`[Ocean] User: ${options.userId}`));
    console.log(chalk.cyan(`[Ocean] Workspace: ${options.workspace}\n`));
  }

  // Load config
  const cliConfig: CliConfig = {
    defaultAiProvider: process.env.DEFAULT_AI_PROVIDER,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
    deepseekModel: process.env.DEEPSEEK_MODEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    dashscopeApiKey: process.env.DASHSCOPE_API_KEY,
    dashscopeBaseUrl: process.env.DASHSCOPE_BASE_URL,
    dashscopeModel: process.env.DASHSCOPE_MODEL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiModel: process.env.OPENAI_MODEL,
    localApiKey: process.env.LOCAL_API_KEY,
    localBaseUrl: process.env.LOCAL_BASE_URL,
    localModel: process.env.LOCAL_MODEL,
    userId: options.userId,
    workspacePath: options.workspace,
  };

  const modelRouter = createModelRouter(cliConfig);

  // Load skills
  const skills: LoadedSkill[] = discoverSkills(options.workspace);

  const sessionStore = options.print && options.persistSession !== false ? new SessionStore() : undefined;
  let session = sessionStore && (
    options.continueSession
      ? await sessionStore.latestOrCreate(options.workspace)
      : options.resume
        ? await sessionStore.load(options.resume, options.workspace)
        : await sessionStore.create(options.workspace)
  );
  const sessionId = session?.id;
  if (sessionId) onEvent?.({ type: 'session', sessionId });
  const messages: ModelMessage[] = [...(session?.messages ?? []), { role: 'user', content: query }];

  // MCP tools
  const mcpManager = new McpClientManager(cliConfig);
  try {
    await mcpManager.loadConfig();
    await mcpManager.connectAll();
  } catch (error) {
    console.warn(`[MCP] MCP setup failed: ${(error as Error).message}`);
  }

  // Build tools
  const toolContext: ToolContext = {
    cwd: options.workspace,
    userId: options.userId,
    sessionId: sessionId ?? Math.random().toString(36).substring(2, 15),
    permissionMode: options.permissionMode,
    commandPermissionSettings: options.commandPermissionSettings,
    permissionSources: options.permissionSources,
  };
  const availableTools = await toAgentToolSet(toolContext, mcpManager, skills, sessionStore);
  const tools = options.toolNames
    ? Object.fromEntries(Object.entries(availableTools).filter(([name]) => options.toolNames!.has(name)))
    : availableTools;

  const systemPrompt = buildSystemPrompt(options.userId, skills, options.workspace);

  // 审批门：CLI 负责执行，审批弹在对话窗口（Web 审批面板）——有 API Key 时启用
  const apiKey = options.print ? null : await resolveApiKey();
  const gatewayApproval = apiKey
    ? createGatewayApprovalHandler({
        gatewayUrl: process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000',
        apiKey,
        sessionId: toolContext.sessionId,
        workspacePath: toolContext.cwd,
      })
    : undefined;

  const spinner = options.print ? undefined : ora(chalk.cyan('Thinking...')).start();

  try {
    const model = modelRouter.getModel(options.modelId);
    const hooks = LifecycleHooks.load(options.workspace);
    const approvalHandler: Parameters<typeof runChatLoop>[1]['approvalHandler'] = options.print
      ? async (toolName, input, context) => {
        const result = await hooks.run('PermissionRequest', {
          tool_name: toolName,
          tool_input: input,
          tool_use_id: context?.toolCallId,
        }, context?.signal);
        return result.permission === 'allow' ? 'approved' : 'rejected';
      }
      : gatewayApproval;
    let streamedText = '';
    if (sessionStore && sessionId) session = await sessionStore.save(sessionId, options.workspace, messages);

    const result = await runChatLoop(messages, {
      ...(options.toolNames && !options.toolNames.has('delegate_task') ? {} : {
        delegation: {
          workspace: options.workspace,
          permissions: {
            mode: options.permissionMode,
            settings: options.commandPermissionSettings,
            sources: options.permissionSources,
          },
        },
      }),
      hooks,
      model,
      systemPrompt,
      tools,
      approvalHandler,
      signal,
      ...(sessionStore && sessionId && {
        journal: { store: sessionStore, sessionId, workspace: options.workspace },
        compaction: {
          previous: session?.compaction,
          usage: session?.usage,
          persist: async (snapshot) => {
            session = await sessionStore.saveCompaction(sessionId, options.workspace, snapshot);
          },
        },
      }),
      onToolCall: onEvent && ((name, input) => onEvent({ type: 'tool_call', name, input })),
      onToolResult: onEvent && ((name, result) => onEvent({ type: 'tool_result', name, result })),
      onText: (text: string) => {
        if (streamedText.length === 0) spinner?.stop();
        onText(text);
        streamedText += text;
      },
    });

    if (sessionStore && sessionId) {
      await sessionStore.save(sessionId, options.workspace, [...messages, ...result.responseMessages]);
      if (result.usage) await sessionStore.saveUsage(sessionId, options.workspace, result.usage);
    }
    if (!options.print && streamedText.length > 0) process.stdout.write('\n');
    return sessionId;
  } catch (err: any) {
    if (options.print) throw err;
    console.error(chalk.red(`\n✗ Error: ${err.message}`));
    if (process.env.DEBUG) console.error(err.stack);
  } finally {
    spinner?.stop();
    await mcpManager.disconnectAll();
  }
}

/**
 * Readline-based REPL (fallback for non-TTY environments)
 */
async function runReadlineRepl(options: ReplOptions) {
  // Load config
  const cliConfig: CliConfig = {
    defaultAiProvider: process.env.DEFAULT_AI_PROVIDER,
    deepseekApiKey: process.env.DEEPSEEK_API_KEY,
    deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL,
    deepseekModel: process.env.DEEPSEEK_MODEL,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL,
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL,
    dashscopeApiKey: process.env.DASHSCOPE_API_KEY,
    dashscopeBaseUrl: process.env.DASHSCOPE_BASE_URL,
    dashscopeModel: process.env.DASHSCOPE_MODEL,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiModel: process.env.OPENAI_MODEL,
    localApiKey: process.env.LOCAL_API_KEY,
    localBaseUrl: process.env.LOCAL_BASE_URL,
    localModel: process.env.LOCAL_MODEL,
    userId: options.userId,
    workspacePath: options.workspace,
  };

  console.log(chalk.gray(`[Config] Default Provider: ${cliConfig.defaultAiProvider || '(none)'}`));

  const modelRouter = createModelRouter(cliConfig);
  const models = modelRouter.listModels();
  console.log(chalk.gray(`[LLM] Available models: ${models.map((m: any) => m.id).join(', ')}`));

  // Load skills
  const skills: LoadedSkill[] = discoverSkills(options.workspace);

  // MCP
  const mcpManager = new McpClientManager(cliConfig);
  let mcpTools: Array<{ name: string; description: string }> = [];
  try {
    await mcpManager.loadConfig();
    await mcpManager.connectAll();
    mcpTools = await mcpManager.getAllTools();
  } catch { /* skip */ }

  const sessionStore = new SessionStore();
  const activeSession: { session: StoredSession } = {
    session: await sessionStore.latestOrCreate(options.workspace),
  };
  console.log(chalk.gray(`[Session] ${activeSession.session.id} · ${activeSession.session.title}`));

  // Build tools
  const toolContext: ToolContext = {
    cwd: options.workspace,
    userId: options.userId,
    sessionId: activeSession.session.id,
    getSessionId: () => activeSession.session.id,
  };
  const tools: Record<string, any> = await toAgentToolSet(toolContext, mcpManager, skills, sessionStore);

  const systemPrompt = buildSystemPrompt(options.userId, skills, options.workspace);
  const messages: ModelMessage[] = [...activeSession.session.messages];

  // 审批门：CLI 负责执行，审批弹在对话窗口（Web 审批面板）——有 API Key 时启用
  const apiKey = await resolveApiKey();
  const approvalHandler = apiKey
    ? createGatewayApprovalHandler({
        gatewayUrl: process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000',
        apiKey,
        sessionId: () => activeSession.session.id,
      })
    : undefined;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log(chalk.gray('\nType your query or use /help for commands\n'));

  let isClosing = false;

  rl.on('close', () => {
    isClosing = true;
    process.exit(0);
  });

  function prompt() {
    if (isClosing) return;
    rl.question(chalk.bold.green('\nocean> '), async (input) => {
      if (isClosing) return;
      const trimmed = input.trim();
      if (!trimmed) { prompt(); return; }

      if (trimmed.startsWith('/') && !skills.some((skill) => skill.manifest.name === trimmed.slice(1).split(/\s+/)[0])) {
        await handleCommand(trimmed, rl, modelRouter, mcpTools, skills, messages, {
          store: sessionStore,
          activeSession,
          workspace: options.workspace,
        });
        prompt();
        return;
      }

      messages.push({ role: 'user', content: trimmed });
      await sessionStore.save(activeSession.session.id, options.workspace, messages);
      const spinner = ora(chalk.cyan('Thinking...')).start();

      try {
        const model = modelRouter.getModel();
        let streamedText = '';
        const result = await runChatLoop(messages, {
      delegation: { workspace: options.workspace },
      hooks: LifecycleHooks.load(options.workspace),
          model, systemPrompt, tools, approvalHandler,
        compaction: {
          previous: activeSession.session.compaction,
          usage: activeSession.session.usage,
          persist: async (snapshot) => {
            activeSession.session = await sessionStore.saveCompaction(activeSession.session.id, options.workspace, snapshot);
          },
        },

          onText: (text: string) => {
            if (!streamedText) spinner.stop();
            process.stdout.write(text);
            streamedText += text;
          },
        });
        if (streamedText) process.stdout.write('\n');
        messages.push(...result.responseMessages);
        activeSession.session = await sessionStore.save(
          activeSession.session.id,
          options.workspace,
          messages,
        );
        if (result.usage) {
          activeSession.session = await sessionStore.saveUsage(activeSession.session.id, options.workspace, result.usage);
        }
      } catch (err: any) {
        spinner.stop();
        console.error(chalk.red(`\n✗ Error: ${err.message}`));
      }

      prompt();
    });
  }

  prompt();
}

async function handleCommand(
  cmd: string,
  rl: readline.Interface,
  modelRouter: ReturnType<typeof createModelRouter>,
  mcpTools: Array<{ name: string; description: string }>,
  skills: LoadedSkill[],
  messages: ModelMessage[],
  sessions: {
    store: SessionStore;
    activeSession: { session: StoredSession };
    workspace: string;
  },
): Promise<void> {
  const parts = cmd.slice(1).split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case 'help':
      console.log(chalk.bold('\n▤ Available Commands:'));
      console.log(chalk.cyan('  /help              ') + chalk.white('- Show this help'));
      console.log(chalk.cyan('  /clear             ') + chalk.white('- Clear conversation history'));
      console.log(chalk.cyan('  /new               ') + chalk.white('- Start a new persistent session'));
      console.log(chalk.cyan('  /sessions          ') + chalk.white('- List saved sessions'));
      console.log(chalk.cyan('  /resume <id>       ') + chalk.white('- Resume a saved session'));
      console.log(chalk.cyan('  /tasks             ') + chalk.white('- Show the current plan and task status'));
      console.log(chalk.cyan('  /permissions [mode|allow <tool> [json]|reset]') + chalk.white('- Show/set mode or manage session grants'));
      console.log(chalk.cyan('  /model [name]      ') + chalk.white('- Switch model'));
      console.log(chalk.cyan('  /skills            ') + chalk.white('- List available skills'));
      console.log(chalk.cyan('  /tools             ') + chalk.white('- List available tools'));
      console.log(chalk.cyan('  /mcp               ') + chalk.white('- List MCP tools'));
      console.log(chalk.cyan('  /exit, /quit       ') + chalk.white('- Exit REPL'));
      break;
    case 'clear':
      messages.length = 0;
      sessions.activeSession.session = await sessions.store.save(
        sessions.activeSession.session.id,
        sessions.workspace,
        messages,
      );
      console.log(chalk.gray('Conversation cleared'));
      break;
    case 'new':
      sessions.activeSession.session = await sessions.store.create(sessions.workspace);
      messages.length = 0;
      console.log(chalk.gray(`[Session] Started ${sessions.activeSession.session.id}`));
      break;
    case 'sessions': {
      const saved = await sessions.store.list(sessions.workspace);
      if (saved.length === 0) console.log(chalk.gray('No saved sessions'));
      else {
        console.log(chalk.bold('\n▤ Saved sessions:'));
        for (const session of saved.slice(0, 20)) {
          console.log(`  ${chalk.green(session.id)}  ${session.title}`);
        }
      }
      break;
    }
    case 'resume': {
      if (!args) {
        console.log(chalk.yellow('Usage: /resume <session-id>'));
        break;
      }
      sessions.activeSession.session = await sessions.store.load(args, sessions.workspace);
      messages.splice(0, messages.length, ...sessions.activeSession.session.messages);
      console.log(chalk.gray(`[Session] Resumed ${sessions.activeSession.session.id} · ${sessions.activeSession.session.title}`));
      break;
    }
    case 'model': {
      const models = modelRouter.listModels();
      if (args) console.log(chalk.gray(`Selected model: ${args}`));
      else {
        console.log(chalk.bold('\n▸ Available Models:'));
        for (const m of models) console.log(`  ${m.id} (${m.provider})`);
      }
      break;
    }
    case 'tasks': {
      const session = await sessions.store.load(sessions.activeSession.session.id, sessions.workspace);
      console.log(chalk.bold('\n▤ Current plan:'));
      console.log(formatTaskPlan(session.plan));
      break;
    }
    case 'permissions':
    case 'mode': {
      const policy = new PermissionPolicy(sessions.workspace, undefined, {
        grants: defaultSessionPermissionGrants,
        sessionId: sessions.activeSession.session.id,
      });
      const modes = ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'] as const;
      const allow = args.match(/^allow\s+(\S+)(?:\s+([\s\S]+))?$/);
      if (allow) {
        try {
          const parsed = allow[2] ? JSON.parse(allow[2]) : {};
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Arguments must be a JSON object');
          policy.grantSession(allow[1], parsed);
          console.log(chalk.green(`Session grant added for ${allow[1]} with the exact arguments.`));
        } catch (error) {
          console.log(chalk.red(`Could not add session grant: ${(error as Error).message}`));
        }
      } else if (args === 'reset' || args === 'clear') {
        console.log(chalk.green(`Cleared ${policy.clearSessionGrants()} session grant(s).`));
      } else if (!args) {
        console.log(chalk.bold('\n▤ Permission mode: ') + chalk.cyan(policy.getMode()));
        console.log(chalk.gray(`Available: ${modes.join(', ')}`));
      } else if (!modes.includes(args as typeof modes[number])) {
        console.log(chalk.yellow(`Unknown mode: ${args}. Available: ${modes.join(', ')}`));
      } else {
        try {
          await policy.setWorkspaceMode(args as typeof modes[number]);
          console.log(chalk.green(`Permission mode set to ${args}`));
        } catch (error) {
          console.log(chalk.red(`Could not change permission mode: ${(error as Error).message}`));
        }
      }
      break;
    }
    case 'skills':
      if (skills.length === 0) console.log(chalk.yellow('No skills loaded'));
      else {
        console.log(chalk.bold('\n◎ Available Skills:'));
        for (const s of skills) console.log(`  ${chalk.green(s.manifest.name)} - ${s.manifest.description}`);
      }
      break;
    case 'tools':
      console.log(chalk.bold('\n⚙ Available Tools:'));
      console.log('  bash, powershell, file_read, file_write, file_edit, file_patch, notebook_edit, grep, glob, local_git, task_plan, Skills, MCP tools');
      break;
    case 'mcp':
      if (mcpTools.length === 0) console.log(chalk.yellow('No MCP tools available'));
      else {
        console.log(chalk.bold('\n▨ MCP Tools:'));
        for (const t of mcpTools) console.log(`  ${chalk.green(t.name)} - ${t.description}`);
      }
      break;
    case 'exit':
    case 'quit':
      console.log(chalk.gray('\nGoodbye!'));
      rl.close();
      process.exit(0);
      break;
    default:
      console.log(chalk.yellow(`Unknown command: /${command}. Type /help for available commands.`));
  }
}

function findSkillsDir(startDir: string): string | null {
  const candidates = ['agents/skills', '.claude/skills', '.ocean/skills'];
  let current = startDir;
  while (true) {
    for (const candidate of candidates) {
      const dir = path.join(current, candidate);
      if (fs.existsSync(dir)) return dir;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}
