import { LifecycleHooks } from '../utils/lifecycle-hooks.js';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { render, Box, Text, useInput, useApp, useStdin } from 'ink';
import TextInput from 'ink-text-input';
import type { ModelMessage } from 'ai';
import type { CliConfig, LoadedSkill, ModelProvider, ToolContext } from '../types.js';
import { createModelRouter } from '../llm/model-router.js';
import { buildSystemPrompt, runChatLoop } from '../llm/chat.js';
import { createGatewayApprovalHandler } from '../approval/gateway-approval.js';
import { toAgentToolSet } from '../tools/index.js';
import { discoverSkills } from '../skills/loader.js';
import { McpClientManager } from '../mcp/client.js';
import { SessionStore, type StoredSession } from '../utils/session-store.js';
import { formatTaskPlan } from '../utils/task-manager.js';
import { PermissionPolicy } from '../utils/permission-policy.js';
import { StatusBar } from './status-bar.js';
import { MessageList } from './message-list.js';
import { ToolCallDisplay } from './tool-call-display.js';
import { MessageInput } from './message-input.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface InkAppProps {
  userId: string;
  workspace: string;
  cliConfig: CliConfig;
  skills: LoadedSkill[];
  toolContext: ToolContext;
  tools: Record<string, any>;
  modelRouter: ReturnType<typeof createModelRouter>;
  mcpManager: McpClientManager;
  mcpTools: Array<{ name: string; description: string }>;
  sessionStore: SessionStore;
  activeSession: { session: StoredSession };
  systemPrompt: string;
  /** 审批门：CLI 负责执行、对话窗口弹审批（无 API Key 时 undefined） */
  approvalHandler?: (
    toolName: string,
    args: any,
  ) => Promise<'approved' | 'rejected' | 'expired'>;
}

import { resolveApiKey, removeCredentials, getAutoUserId, saveCredentials } from '../utils/auth.js';
import { runAuthMenu } from './auth.js';
import { CONFIG } from '../utils/config.js';

/**
 * Main Ink App component
 */
export function InkApp(props: InkAppProps) {
  const { exit } = useApp();

  const [userId, setUserId] = useState(props.userId);
  const [messages, setMessages] = useState<ModelMessage[]>(props.activeSession.session.messages);
  const [isThinking, setIsThinking] = useState(false);
  const [isWaitingInput, setIsWaitingInput] = useState(true);
  const [currentToolCalls, setCurrentToolCalls] = useState<Array<{ name: string; args: any }>>([]);
  const [currentToolResults, setCurrentToolResults] = useState<Array<{ name: string; result: any }>>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [commandType, setCommandType] = useState<'help' | 'model' | 'skills' | 'tools' | 'mcp' | 'tasks' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const activeAbortController = useRef<AbortController | null>(null);

  const models = props.modelRouter.listModels();

  useEffect(() => {
    const resolved = props.modelRouter.resolveModel();
    setSelectedModel(resolved.id);
  }, []);

  const handleSubmit = useCallback(async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;

    setCommandOutput(null);
    setCommandType(null);
    setError(null);
    setStreamingText('');

    if (trimmed.startsWith('/') && !props.skills.some((skill) => skill.manifest.name === trimmed.slice(1).split(/\s+/)[0])) {
      handleCommand(trimmed);
      return;
    }

    const userMsg: ModelMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMsg]);
    setIsThinking(true);
    setIsWaitingInput(false);
    const abortController = new AbortController();
    activeAbortController.current = abortController;

    try {
      const model = props.modelRouter.getModel(selectedModel);
      const allMessages = [...messages, userMsg];
      await props.sessionStore.save(props.activeSession.session.id, props.workspace, allMessages);

      const result = await runChatLoop(allMessages, {
        delegation: { workspace: props.workspace },
        hooks: LifecycleHooks.load(props.workspace),
        model,

        compaction: {
          previous: props.activeSession.session.compaction,
          persist: async (snapshot) => {
            await props.sessionStore.saveCompaction(props.activeSession.session.id, props.workspace, snapshot);
            props.activeSession.session.compaction = snapshot;
          },
        },
        systemPrompt: props.systemPrompt,
        tools: props.tools,
        approvalHandler: props.approvalHandler,
        signal: abortController.signal,
        onText: (text: string) => {
          setStreamingText(prev => prev + text);
        },
        onToolCall: (toolName: string, args: any) => {
          setCurrentToolCalls(prev => [...prev, { name: toolName, args }]);
        },
        onToolResult: (toolName: string, toolResult: any) => {
          setCurrentToolResults(prev => [...prev, { name: toolName, result: toolResult }]);
        },
      });

      const nextMessages = [...allMessages, ...result.responseMessages];
      setMessages(nextMessages);
      props.activeSession.session = await props.sessionStore.save(
        props.activeSession.session.id,
        props.workspace,
        nextMessages,
      );
      setStreamingText('');
      setCurrentToolCalls([]);
      setCurrentToolResults([]);
    } catch (err: any) {
      setError(abortController.signal.aborted ? 'Stopped current turn.' : (err.message || 'Unknown error occurred'));
      setStreamingText('');
      setCurrentToolCalls([]);
      setCurrentToolResults([]);
    } finally {
      if (activeAbortController.current === abortController) activeAbortController.current = null;
      setIsThinking(false);
      setIsWaitingInput(true);
    }
  }, [isThinking, messages, selectedModel, props]);

  const handleCommand = useCallback(async (cmd: string) => {
    const parts = cmd.slice(1).split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1).join(' ');

    switch (command) {
      case 'help':
        setCommandOutput(
          '▤ Available Commands:\n' +
          '  /help              - Show this help\n' +
          '  /login             - Authenticate with Gateway\n' +
          '  /logout            - Remove local credentials\n' +
          '  /whoami            - Show current identity\n' +
          '  /clear             - Clear conversation history\n' +
          '  /new               - Start a new persistent session\n' +
          '  /sessions          - List saved sessions\n' +
          '  /resume <id>       - Resume a saved session\n' +
          '  /tasks             - Show the current plan and task status\n' +
          '  /permissions [mode] - Show or set the permission mode\n' +
          '  /model [name]      - Switch model\n' +
          '  /skills            - List available skills\n' +
          '  /tools             - List available tools\n' +
          '  /mcp               - List MCP tools\n' +
          '  /exit, /quit       - Exit REPL',
        );
        setCommandType('help');
        break;

      case 'login':
        setIsWaitingInput(false);
        try {
          const { action } = await runAuthMenu();
          if (action === 'browser' || action === 'headless') {
            setCommandOutput(`\nRedirecting to ${action} login flow... (Follow CLI prompt if any)`);
          } else if (action === 'apiKey') {
            setCommandOutput('\nPlease provide your API Key in the prompt above.');
          }
          // Note: Full OAuth flow might need to trigger outside of the pure Ink loop 
          // but we can at least show the menu.
          setCommandOutput('Authentication started. (Feature is bridging from CLI)');
        } catch (err: any) {
          setError(`Login failed: ${err.message}`);
        }
        setIsWaitingInput(true);
        break;

      case 'logout':
        const removed = await removeCredentials();
        if (removed) {
          setCommandOutput('✓ Successfully logged out. Credentials removed.');
          setUserId('guest');
        } else {
          setCommandOutput('! Already logged out.');
        }
        break;

      case 'whoami':
        const key = await resolveApiKey();
        if (!key) {
          setCommandOutput('Status: Not Logged In');
        } else {
          const id = await getAutoUserId();
          setCommandOutput(`Status: Logged In\nIdentity: ${id}`);
        }
        break;

      case 'clear':
        setMessages([]);
        props.activeSession.session = await props.sessionStore.save(
          props.activeSession.session.id,
          props.workspace,
          [],
        );
        setCommandOutput('Conversation cleared');
        setCommandType('help');
        break;

      case 'new':
        props.activeSession.session = await props.sessionStore.create(props.workspace);
        setMessages([]);
        setCommandOutput(`Started session ${props.activeSession.session.id}`);
        setCommandType('help');
        break;

      case 'sessions': {
        const saved = await props.sessionStore.list(props.workspace);
        setCommandOutput(saved.length
          ? saved.slice(0, 20).map((session) => `${session.id}  ${session.title}`).join('\n')
          : 'No saved sessions');
        setCommandType('help');
        break;
      }

      case 'resume':
        if (!args) {
          setCommandOutput('Usage: /resume <session-id>');
          setCommandType('error');
          break;
        }
        props.activeSession.session = await props.sessionStore.load(args, props.workspace);
        setMessages(props.activeSession.session.messages);
        setCommandOutput(`Resumed ${props.activeSession.session.title}`);
        setCommandType('help');
        break;

      case 'tasks': {
        const session = await props.sessionStore.load(props.activeSession.session.id, props.workspace);
        setCommandOutput(formatTaskPlan(session.plan));
        setCommandType('tasks');
        break;
      }

      case 'permissions':
      case 'mode': {
        const policy = new PermissionPolicy(props.workspace);
        const modes = ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'] as const;
        if (!args) {
          setCommandOutput(`Permission mode: ${policy.getMode()}\nAvailable: ${modes.join(', ')}`);
          setCommandType('help');
        } else if (!modes.includes(args as typeof modes[number])) {
          setCommandOutput(`Unknown mode: ${args}. Available: ${modes.join(', ')}`);
          setCommandType('error');
        } else {
          try {
            await policy.setWorkspaceMode(args as typeof modes[number]);
            setCommandOutput(`Permission mode set to ${args}`);
            setCommandType('help');
          } catch (err: any) {
            setCommandOutput(`Could not change permission mode: ${err.message}`);
            setCommandType('error');
          }
        }
        break;
      }

      case 'model':
        if (args) {
          const exists = models.some(m => m.id === args);
          if (exists) {
            setSelectedModel(args);
            setCommandOutput(`✓ Selected model: ${args}`);
          } else {
            setCommandOutput(`✗ Model not found: ${args}`);
            setCommandType('error');
          }
        } else {
          const modelList = models.map(m => `  ${m.id} (${m.provider})`).join('\n');
          setCommandOutput(`▸ Available Models:\n${modelList}`);
        }
        setCommandType('model');
        break;

      case 'skills':
        if (props.skills.length === 0) {
          setCommandOutput('No skills loaded');
        } else {
          const skillList = props.skills.map(s => `  ${s.manifest.name} - ${s.manifest.description}`).join('\n');
          setCommandOutput(`◎ Available Skills:\n${skillList}`);
        }
        setCommandType('skills');
        break;

      case 'tools':
        setCommandOutput(
          '⚙ Available Tools:\n' +
          '  bash              - Execute shell commands\n' +
          '  powershell        - Execute PowerShell commands when installed\n' +
          '  file_read         - Read file contents\n' +
          '  file_write        - Create/overwrite files\n' +
          '  file_edit         - Edit specific text in files\n' +
          '  file_patch        - Apply multiple exact edits atomically\n' +
          '  grep              - Search file contents with regex\n' +
          '  glob              - Match file paths with glob patterns\n' +
          '  local_git         - Inspect and change Git state\n' +
          '  task_plan         - Create and track a plan with read-only plan mode\n' +
          '  activate_skill    - Load a listed skill\n' +
          '  MCP tools         - Call approved tools from enabled servers',
        );
        setCommandType('tools');
        break;

      case 'mcp':
        if (props.mcpTools.length === 0) {
          setCommandOutput('No MCP tools available');
        } else {
          const toolList = props.mcpTools.map(t => `  ${t.name} - ${t.description}`).join('\n');
          setCommandOutput(`▨ MCP Tools:\n${toolList}`);
        }
        setCommandType('mcp');
        break;

      case 'exit':
      case 'quit':
        exit();
        break;

      default:
        setCommandOutput(`Unknown command: /${command}. Type /help for available commands.`);
        setCommandType('error');
    }
  }, [models, props.skills, props.mcpTools, exit]);

  useInput((input, key) => {
    if (key.escape && isThinking) {
      activeAbortController.current?.abort(new Error('Stopped by user'));
      return;
    }
    if (input === 'd' && key.ctrl) {
      exit();
    }
  }, { isActive: true });

  return (
    <Box flexDirection="column" width="100%">
      <StatusBar
        userId={userId}
        workspace={props.workspace}
        model={selectedModel}
        skills={props.skills}
      />

      <MessageList
        messages={messages}
        streamingText={streamingText}
        isThinking={isThinking}
        toolCalls={currentToolCalls}
        toolResults={currentToolResults}
        commandOutput={commandOutput}
        commandType={commandType}
        error={error}
      />

      <MessageInput
        isWaiting={isWaitingInput}
        isThinking={isThinking}
        onSubmit={handleSubmit}
      />
    </Box>
  );
}

/**
 * Initialize and render the Ink app
 */
export async function runInkApp(options: { userId: string; workspace: string }) {
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

  const skills: LoadedSkill[] = discoverSkills(options.workspace);

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

  const toolContext: ToolContext = {
    cwd: options.workspace,
    userId: options.userId,
    sessionId: activeSession.session.id,
    getSessionId: () => activeSession.session.id,
  };

  const tools: Record<string, any> = await toAgentToolSet(toolContext, mcpManager, skills, sessionStore);

  const systemPrompt = buildSystemPrompt(options.userId, skills, options.workspace);

  // 审批门：CLI 负责执行，审批弹在对话窗口（Web 审批面板）——有 API Key 时启用
  const apiKey = await resolveApiKey();
  const approvalHandler = apiKey
    ? createGatewayApprovalHandler({
        gatewayUrl: process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000',
        apiKey,
        sessionId: () => activeSession.session.id,
      })
    : undefined;

  const { waitUntilExit } = render(
    <InkApp
      userId={options.userId}
      workspace={options.workspace}
      cliConfig={cliConfig}
      skills={skills}
      toolContext={toolContext}
      tools={tools}
      modelRouter={modelRouter}
      mcpManager={mcpManager}
      mcpTools={mcpTools}
      sessionStore={sessionStore}
      activeSession={activeSession}
      systemPrompt={systemPrompt}
      approvalHandler={approvalHandler}
    />,
    { exitOnCtrlC: true },
  );

  await waitUntilExit();
  await mcpManager.disconnectAll();
  process.exit(0);
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
