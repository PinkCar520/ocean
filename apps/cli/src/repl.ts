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
} from './llm/chat.js';
import { resolveApiKey } from './utils/auth.js';
import { getTools } from './tools/index.js';
import { createGatewayApprovalHandler } from './approval/gateway-approval.js';
import { loadSkillsFromDir } from './skills/loader.js';
import { McpClientManager } from './mcp/client.js';
import { runInkApp } from './ui/app.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import chalk from 'chalk';
import readline from 'node:readline';
import ora from 'ora';

interface ReplOptions {
  userId: string;
  workspace: string;
  singleQuery?: string;
  /** 通过 Gateway Run API 执行（第 3 条：CLI 接入统一 Run API） */
  gateway?: boolean;
}

/**
 * Run the interactive REPL
 * - Single query mode: legacy text-based approach
 * - Interactive mode: Ink UI if TTY, otherwise readline fallback
 */
export async function runRepl(options: ReplOptions) {
  // Single query mode - use simple text approach
  if (options.singleQuery) {
    await runSingleQuery(options);
    process.exit(0);
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

/**
 * Run a single query without Ink UI (for scripting/CI)
 */
async function runSingleQuery(options: ReplOptions) {
  const query = options.singleQuery;
  if (!query) return;

  // 第 3 条：--gateway 时走统一 Run API（Gateway worker 执行，工具/审批/审计入 Run）
  if (options.gateway) {
    const gatewayUrl =
      process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000';
    const apiKey = await resolveApiKey();
    if (!apiKey) {
      console.log(chalk.yellow('[Ocean] --gateway 需要 API Key，请先运行 ocean login'));
      return;
    }
    console.log(chalk.cyan(`[Ocean] Query: ${query}`));
    console.log(chalk.cyan(`[Ocean] User: ${options.userId}`));
    console.log(chalk.cyan(`[Ocean] Gateway: ${gatewayUrl} (Run API)\n`));
    try {
      await runChatLoopViaGateway({
        gatewayUrl,
        apiKey,
        input: query,
        onText: (text) => process.stdout.write(text),
      });
      process.stdout.write('\n');
    } catch (err: any) {
      console.log(chalk.red(`[Ocean] Gateway error: ${err.message}`));
    }
    return;
  }

  console.log(chalk.cyan(`[Ocean] Query: ${query}`));
  console.log(chalk.cyan(`[Ocean] User: ${options.userId}`));
  console.log(chalk.cyan(`[Ocean] Workspace: ${options.workspace}\n`));

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
  const skillsDir = findSkillsDir(options.workspace);
  const skills: LoadedSkill[] = [];
  if (skillsDir) {
    try {
      const loaded = loadSkillsFromDir(skillsDir);
      skills.push(...loaded);
    } catch { /* skip */ }
  }

  // Build tools
  const toolContext: ToolContext = {
    cwd: options.workspace,
    userId: options.userId,
    sessionId: Math.random().toString(36).substring(2, 15),
  };
  const coreTools = getTools(toolContext);
  const tools: Record<string, any> = {};
  for (const [name, toolDef] of Object.entries(coreTools)) {
    const tool = toolDef as any;
    tools[name] = {
      description: tool.description,
      parameters: tool.inputSchema,
      requiresApproval: tool.requiresApproval === true,
      execute: async (args: any) => tool.execute(args, toolContext),
    };
  }

  const systemPrompt = buildSystemPrompt(options.userId, skills, options.workspace);
  const messages: ModelMessage[] = [{ role: 'user', content: query }];

  // 审批门：CLI 负责执行，审批弹在对话窗口（Web 审批面板）——有 API Key 时启用
  const apiKey = await resolveApiKey();
  const approvalHandler = apiKey
    ? createGatewayApprovalHandler({
        gatewayUrl: process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000',
        apiKey,
        sessionId: toolContext.sessionId,
      })
    : undefined;

  const spinner = ora(chalk.cyan('Thinking...')).start();

  try {
    const model = modelRouter.getModel();
    let streamedText = '';

    const result = await runChatLoop(messages, {
      model,
      systemPrompt,
      tools,
      approvalHandler,
      onText: (text: string) => {
        if (streamedText.length === 0) spinner.stop();
        process.stdout.write(text);
        streamedText += text;
      },
    });

    if (streamedText.length > 0) process.stdout.write('\n');
  } catch (err: any) {
    spinner.stop();
    console.error(chalk.red(`\n✗ Error: ${err.message}`));
    if (process.env.DEBUG) console.error(err.stack);
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
  const skillsDir = findSkillsDir(options.workspace);
  const skills: LoadedSkill[] = [];
  if (skillsDir) {
    try {
      const loaded = loadSkillsFromDir(skillsDir);
      skills.push(...loaded);
      if (loaded.length > 0) {
        console.log(chalk.gray(`[Skills] Loaded ${loaded.length} skills: ${loaded.map((s: LoadedSkill) => s.manifest.name).join(', ')}`));
      }
    } catch { /* skip */ }
  }

  // MCP
  const mcpManager = new McpClientManager(cliConfig);
  let mcpTools: Array<{ name: string; description: string }> = [];
  try {
    await mcpManager.loadConfig();
    await mcpManager.connectAll();
    mcpTools = await mcpManager.getAllTools();
  } catch { /* skip */ }

  // Build tools
  const toolContext: ToolContext = {
    cwd: options.workspace,
    userId: options.userId,
    sessionId: Math.random().toString(36).substring(2, 15),
  };
  const coreTools = getTools(toolContext);
  const tools: Record<string, any> = {};
  for (const [name, toolDef] of Object.entries(coreTools)) {
    const tool = toolDef as any;
    tools[name] = {
      description: tool.description,
      parameters: tool.inputSchema,
      requiresApproval: tool.requiresApproval === true,
      execute: async (args: any) => tool.execute(args, toolContext),
    };
  }

  const systemPrompt = buildSystemPrompt(options.userId, skills, options.workspace);
  const messages: ModelMessage[] = [];

  // 审批门：CLI 负责执行，审批弹在对话窗口（Web 审批面板）——有 API Key 时启用
  const apiKey = await resolveApiKey();
  const approvalHandler = apiKey
    ? createGatewayApprovalHandler({
        gatewayUrl: process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000',
        apiKey,
        sessionId: toolContext.sessionId,
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

      if (trimmed.startsWith('/')) {
        handleCommand(trimmed, rl, modelRouter, mcpTools, skills, messages);
        prompt();
        return;
      }

      messages.push({ role: 'user', content: trimmed });
      const spinner = ora(chalk.cyan('Thinking...')).start();

      try {
        const model = modelRouter.getModel();
        let streamedText = '';
        const result = await runChatLoop(messages, {
          model, systemPrompt, tools, approvalHandler,
          onText: (text: string) => {
            if (!streamedText) spinner.stop();
            process.stdout.write(text);
            streamedText += text;
          },
        });
        if (streamedText) process.stdout.write('\n');
        messages.push({ role: 'assistant', content: result.text });
      } catch (err: any) {
        spinner.stop();
        console.error(chalk.red(`\n✗ Error: ${err.message}`));
      }

      prompt();
    });
  }

  prompt();
}

function handleCommand(
  cmd: string,
  rl: readline.Interface,
  modelRouter: ReturnType<typeof createModelRouter>,
  mcpTools: Array<{ name: string; description: string }>,
  skills: LoadedSkill[],
  messages: ModelMessage[],
) {
  const parts = cmd.slice(1).split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case 'help':
      console.log(chalk.bold('\n▤ Available Commands:'));
      console.log(chalk.cyan('  /help              ') + chalk.white('- Show this help'));
      console.log(chalk.cyan('  /clear             ') + chalk.white('- Clear conversation history'));
      console.log(chalk.cyan('  /model [name]      ') + chalk.white('- Switch model'));
      console.log(chalk.cyan('  /skills            ') + chalk.white('- List available skills'));
      console.log(chalk.cyan('  /tools             ') + chalk.white('- List available tools'));
      console.log(chalk.cyan('  /mcp               ') + chalk.white('- List MCP tools'));
      console.log(chalk.cyan('  /exit, /quit       ') + chalk.white('- Exit REPL'));
      break;
    case 'clear':
      messages.length = 0;
      console.log(chalk.gray('Conversation cleared'));
      break;
    case 'model': {
      const models = modelRouter.listModels();
      if (args) console.log(chalk.gray(`Selected model: ${args}`));
      else {
        console.log(chalk.bold('\n▸ Available Models:'));
        for (const m of models) console.log(`  ${m.id} (${m.provider})`);
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
      console.log('  bash, file_read, file_write, file_edit, grep, glob');
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
