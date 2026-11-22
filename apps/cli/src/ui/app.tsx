import type { PermissionMode } from '@ocean/core/permission-policy';
import { LifecycleHooks } from '../utils/lifecycle-hooks.js';
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { render, Box, Text, useInput, useApp, useStdin, measureElement, type DOMElement } from 'ink';
import TextInput from 'ink-text-input';
import type { ModelMessage } from 'ai';
import type { CliConfig, LoadedSkill, ModelProvider, ToolContext } from '../types.js';
import { createModelRouter } from '../llm/model-router.js';
import { buildSystemPrompt, runChatLoop } from '../llm/chat.js';
import { runOceanCoreLocal } from '../llm/core-local-runtime.js';
import { createCliToolAuthorization } from '../tools/core-tool-authorization.js';
import { compactContext } from '../llm/compaction.js';
import { randomUUID } from 'node:crypto';
import { toAgentToolSet } from '../tools/index.js';
import { discoverSkills } from '../skills/loader.js';
import { SkillAvailability } from '../skills/availability.js';
import { McpPanel } from './mcp-panel.js';
import { SkillsPanel } from './skills-panel.js';
import { McpClientManager } from '../mcp/client.js';
import { SessionStore, type StoredSession } from '../utils/session-store.js';
import { formatTaskPlan } from '../utils/task-manager.js';
import { PermissionPolicy, defaultSessionPermissionGrants } from '../utils/permission-policy.js';
import { StatusBar } from './status-bar.js';
import { MessageList } from './message-list.js';
import { ToolCallDisplay } from './tool-call-display.js';
import { MessageInput } from './message-input.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

export interface InkAppProps {
  userId: string;
  displayName?: string;
  workspace: string;
  cliConfig: CliConfig;
  skills: LoadedSkill[];
  skillAvailability?: SkillAvailability;
  toolContext: ToolContext;
  setSessionMode?: (mode: PermissionMode) => void;
  tools: Record<string, any>;
  modelRouter: ReturnType<typeof createModelRouter>;
  mcpManager: McpClientManager;
  mcpTools: Array<{ name: string; description: string }>;
  sessionStore: SessionStore;
  activeSession: { session: StoredSession };
  systemPrompt: string;
  /** Native Ink approval coordinator for interactive terminal approvals. */
  approvalCoordinator: InkApprovalCoordinator;
  /** Approval handler bound to the coordinator; passed to runChatLoop. */
  approvalHandler: ApprovalHandler;
  /** Returns the current policy fingerprint for drift detection. */
  getPolicyVersion: () => string;
}

import { resolveApiKey, removeCredentials, getAutoUserId, saveCredentials } from '../utils/auth.js';
import { runAuthMenu } from './auth.js';
import { CONFIG } from '../utils/config.js';
import { InkApprovalCoordinator, type PendingApproval } from '../approval/ink-approval.js';
import { ApprovalPrompt } from './approval-prompt.js';
import type { ApprovalHandler, ApprovalRequest } from '../approval/types.js';

/**
 * Main Ink App component
 */
export function InkApp(props: InkAppProps) {
  const { exit } = useApp();

  const [userId, setUserId] = useState(props.userId);
  const [displayName, setDisplayName] = useState(props.displayName);
  const [messages, setMessages] = useState<ModelMessage[]>(props.activeSession.session.messages);
  const [isThinking, setIsThinking] = useState(false);
  const [isWaitingInput, setIsWaitingInput] = useState(true);
  const [currentToolCalls, setCurrentToolCalls] = useState<Array<{ name: string; args: any }>>([]);
  const [currentToolResults, setCurrentToolResults] = useState<Array<{ name: string; result: any }>>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const permissionPolicy = useMemo(
    () => new PermissionPolicy(props.workspace, undefined, { mode: props.toolContext.getPermissionMode }),
    [props.workspace, props.toolContext.getPermissionMode],
  );
  const permissionMode = permissionPolicy.getMode();
  const [mcpOpen, setMcpOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [, refreshSkills] = useState(0);
  const [commandOutput, setCommandOutput] = useState<string | null>(null);
  const [commandType, setCommandType] = useState<'help' | 'model' | 'skills' | 'tools' | 'mcp' | 'tasks' | 'error' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  const [showExitHint, setShowExitHint] = useState(false);
  const exitHintArmed = useRef(false);
  const exitHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAbortController = useRef<AbortController | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);

  // Subscribe to the approval coordinator so the UI re-renders when a tool
  // needs approval or a decision is made.
  useEffect(() => {
    const sync = () => setPendingApprovals(props.approvalCoordinator.getPending());
    sync();
    return props.approvalCoordinator.subscribe(sync);
  }, [props.approvalCoordinator]);
  const pendingApproval = pendingApprovals[0];

  // 测量整帧高度：输入框据此把真实终端光标放到输入行，
  // 否则中文输入法的预编辑文本和候选词会画在整帧最底部。
  const rootRef = useRef<DOMElement>(null);
  const [frameHeight, setFrameHeight] = useState(0);
  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;
    const { height } = measureElement(element);
    setFrameHeight(prev => (prev === height ? prev : height));
  });

  useEffect(() => () => {
    if (exitHintTimer.current) clearTimeout(exitHintTimer.current);
  }, []);

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

    if (trimmed.toLowerCase() === '/mcp') { setMcpOpen(true); return; }
    if (trimmed.toLowerCase() === '/skills') { setSkillsOpen(true); return; }
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
      const refreshed = await toAgentToolSet(props.toolContext, props.mcpManager, props.skills, props.sessionStore);
      for (const name of Object.keys(props.tools)) delete props.tools[name];
      Object.assign(props.tools, refreshed);
      const model = props.modelRouter.getModel(selectedModel);
      const systemPrompt = props.skillAvailability ? buildSystemPrompt(userId, props.skills, props.workspace) : props.systemPrompt;
      const allMessages = [...messages, userMsg];
      await props.sessionStore.save(props.activeSession.session.id, props.workspace, allMessages);

      let nextMessages: ModelMessage[];
      if (process.env.OCEAN_AGENT_CORE === 'legacy') {
        const result = await runChatLoop(allMessages, {
          journal: { store: props.sessionStore, sessionId: props.activeSession.session.id, workspace: props.workspace },
          delegation: { workspace: props.workspace, permissions: { mode: props.toolContext.getPermissionMode } },
          hooks: LifecycleHooks.load(props.workspace),
          model,
          compaction: {
            previous: props.activeSession.session.compaction,
            usage: props.activeSession.session.usage,
            persist: async snapshot => {
              props.activeSession.session = await props.sessionStore.saveCompaction(props.activeSession.session.id, props.workspace, snapshot);
            },
          },
          systemPrompt,
          tools: props.tools,
          approvalHandler: props.approvalHandler,
          approvalOptions: {
            getPolicyVersion: props.getPolicyVersion,
            sessionId: () => props.activeSession.session.id,
            workspace: props.workspace,
          },
          signal: abortController.signal,
          onText: text => setStreamingText(prev => prev + text),
          onToolCall: (toolName, args) => setCurrentToolCalls(prev => [...prev, { name: toolName, args }]),
          onToolResult: (toolName, toolResult) => setCurrentToolResults(prev => [...prev, { name: toolName, result: toolResult }]),
        });
        nextMessages = [...allMessages, ...result.responseMessages];
        props.activeSession.session = await props.sessionStore.save(
          props.activeSession.session.id, props.workspace, nextMessages,
        );
        if (result.usage) {
          props.activeSession.session = await props.sessionStore.saveUsage(
            props.activeSession.session.id, props.workspace, result.usage,
          );
        }
      } else {
        const hooks = LifecycleHooks.load(props.workspace);
        const sessionId = props.activeSession.session.id;
        const authorization = createCliToolAuthorization(
          permissionPolicy,
          async context => {
            const decision = await props.approvalHandler({
              toolName: context.toolName,
              toolCallId: context.invocationId,
              args: context.input as Record<string, unknown>,
              sessionId, workspace: props.workspace,
              policyVersion: props.getPolicyVersion(),
              signal: abortController.signal,
            });
            if (decision.persistUpdates) await decision.persistUpdates();
            return decision.kind === 'approved' && !decision.interrupt && !decision.updatedInput;
          },
          props.tools,
        );
        let stopFeedback: string | undefined;
        await runOceanCoreLocal({
          sessionStore: props.sessionStore,
          sessionId, runId: randomUUID(), workspace: props.workspace,
          model, tools: props.tools, skills: props.skills, systemPrompt,
          authorization, streaming: true, signal: abortController.signal,
          completion: {
            verify: async (_, text) => {
              if (!text.trim()) return [];
              const stop = await hooks.run('Stop', { last_assistant_message: text }, abortController.signal);
              if (stop.blocked) {
                stopFeedback = stop.reason || 'Continue working before stopping.';
                return [];
              }
              return ['Stop hook accepted'];
            },
            onIncomplete: async () => stopFeedback
              ? { role: 'user', content: `Stop hook feedback: ${stopFeedback}` }
              : undefined,
          },
          prepareContext: async request => compactContext([...request], {
            model, systemPrompt, signal: abortController.signal,
            scope: sessionId, previous: props.activeSession.session.compaction,
            usage: props.activeSession.session.usage,
            persist: async snapshot => {
              props.activeSession.session = await props.sessionStore.saveCompaction(sessionId, props.workspace, snapshot);
            },
          }),
          beforeToolUse: async (name, input, callId) => {
            const verdict = await hooks.run('PreToolUse', {
              tool_name: name, tool_input: input, tool_use_id: callId,
            }, abortController.signal);
            return verdict.blocked ? verdict.reason || 'PreToolUse hook blocked execution.' : undefined;
          },
          afterToolUse: async (name, input, callId, output) => {
            const verdict = await hooks.run('PostToolUse', {
              tool_name: name, tool_input: input, tool_use_id: callId, tool_response: output,
            }, abortController.signal);
            return verdict.blocked ? { result: output, hookFeedback: verdict.reason } : output;
          },
          onToolFailure: async (name, input, callId, error) => {
            await hooks.run('ToolUseFailure', {
              tool_name: name, tool_input: input, tool_use_id: callId, error: String(error),
            }, abortController.signal);
          },
          onText: text => setStreamingText(prev => prev + text),
          onToolCall: (toolName, args) => setCurrentToolCalls(prev => [...prev, { name: toolName, args }]),
          onToolResult: (toolName, toolResult) => setCurrentToolResults(prev => [...prev, { name: toolName, result: toolResult }]),
        });
        const persisted = await props.sessionStore.load(sessionId, props.workspace);
        if (!persisted) throw new Error('Shared Agent Core completed without a persisted session');
        props.activeSession.session = persisted;
        nextMessages = persisted.messages;
      }
      // Commit the view after the durable transcript has been loaded.
      setMessages(nextMessages);
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
  }, [isThinking, messages, selectedModel, props, userId]);

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
          '  /mcp               - Manage MCP servers\n' +
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
          setDisplayName(undefined);
        } else {
          setCommandOutput('! Already logged out.');
        }
        break;

      case 'whoami':
        const key = await resolveApiKey();
        if (!key) {
          setCommandOutput('Status: Not Logged In');
        } else {
          const id = displayName || await getAutoUserId();
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
        props.activeSession.session = props.sessionStore.createDraft(props.workspace);
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
        const policy = new PermissionPolicy(props.workspace, undefined, { mode: props.toolContext.getPermissionMode });
        const modes = ['default', 'acceptEdits', 'plan', 'dontAsk', 'bypassPermissions'] as const;
        if (!args) {
          setCommandOutput(`Permission mode: ${policy.getMode()}\nAvailable: ${modes.join(', ')}`);
          setCommandType('help');
        } else if (!modes.includes(args as typeof modes[number])) {
          setCommandOutput(`Unknown mode: ${args}. Available: ${modes.join(', ')}`);
          setCommandType('error');
        } else {
          try {
            const next = args as typeof modes[number];
            if (props.setSessionMode) props.setSessionMode(next);
            else await policy.setWorkspaceMode(next);
            setCommandOutput(`Permission mode: ${policy.getMode()}`);
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
        setSkillsOpen(true);
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
        setMcpOpen(true);
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
    if (key.shift && key.tab && !isThinking && props.setSessionMode) {
      const cycle: PermissionMode[] = ['default', 'acceptEdits', 'plan'];
      props.setSessionMode(cycle[(cycle.indexOf(permissionMode) + 1) % cycle.length]);
      setCommandOutput(`Permission mode: ${permissionPolicy.getMode()}`);
      setCommandType('help');
      return;
    }
    if (key.escape && isThinking) {
      activeAbortController.current?.abort(new Error('Stopped by user'));
      return;
    }
    if (input === 'c' && key.ctrl) {
      // 连续按两次 Ctrl-C 才退出，第一次给出提示。
      if (exitHintArmed.current) exit();
      exitHintArmed.current = true;
      setShowExitHint(true);
      if (exitHintTimer.current) clearTimeout(exitHintTimer.current);
      exitHintTimer.current = setTimeout(() => {
        exitHintArmed.current = false;
        setShowExitHint(false);
      }, 2000);
      return;
    }
    if (input === 'd' && key.ctrl) {
      exit();
    }
  }, { isActive: !skillsOpen && !mcpOpen });

  return (
    <Box ref={rootRef} flexDirection="column" width="100%">
      <StatusBar
        userId={userId}
        displayName={displayName}
        workspace={props.workspace}
        model={selectedModel}
        permissionMode={permissionMode}
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

      {pendingApproval && (
        <ApprovalPrompt
          pending={pendingApproval}
          onDecide={(id, decision) => props.approvalCoordinator.decide(id, decision)}
        />
      )}

      {mcpOpen && <McpPanel manager={props.mcpManager} onClose={() => setMcpOpen(false)} />}
      {skillsOpen && <SkillsPanel skills={props.skillAvailability?.catalog ?? props.skills}
        enabled={skill => props.skills.includes(skill)}
        onToggle={skill => {
          try { props.skillAvailability?.toggle(skill); refreshSkills(n => n + 1); }
          catch (err) { setError(String(err)); }
        }} onClose={() => setSkillsOpen(false)} />}
      <Box display={skillsOpen || mcpOpen ? 'none' : 'flex'} flexDirection="column">
      <MessageInput
        key={props.activeSession.session.id}
        history={messages.flatMap((message) => {
          if (message.role !== 'user') return [];
          const text = typeof message.content === 'string' ? message.content
            : message.content.flatMap((part) => part.type === 'text' ? [part.text] : []).join('');
          return text ? [text] : [];
        })}
        isWaiting={isWaitingInput}
        isThinking={isThinking}
        onSubmit={handleSubmit}
        frameHeight={frameHeight}
        rowsBelowInput={showExitHint ? 1 : 0}
        isActive={!pendingApproval && !skillsOpen && !mcpOpen}
      />

      </Box>
      {showExitHint && (
        <Box marginLeft={3}>
          <Text color="gray">Press Ctrl-C again to exit</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Resolve the logged-in user's display name from Gateway.
 * Falls back to undefined so the caller can show the local user id.
 */
async function resolveDisplayName(apiKey: string | null): Promise<string | undefined> {
  if (!apiKey) return undefined;
  try {
    const gatewayUrl = process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000';
    const response = await fetch(`${gatewayUrl}/api/user/profile`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'x-api-key': apiKey },
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) return undefined;
    const data = await response.json() as { profile?: { name?: string; workId?: string } };
    return data.profile?.name?.trim() || data.profile?.workId || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Initialize and render the Ink app
 */
export async function runInkApp(options: { userId: string; workspace: string; continueSession?: boolean; resume?: string }) {
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

  const skillAvailability = new SkillAvailability(discoverSkills(options.workspace), options.workspace);
  const skills = skillAvailability.enabled;

  const mcpManager = new McpClientManager(cliConfig);
  let mcpTools: Array<{ name: string; description: string }> = [];
  try {
    await mcpManager.loadConfig();
    await mcpManager.connectAll();
    mcpTools = await mcpManager.getAllTools();
  } catch { /* skip */ }

  const sessionStore = new SessionStore();
  // Default: every interactive launch starts a fresh conversation; previous
  // sessions are persisted and can be reopened with -r/--resume or -c/--continue.
  // A fresh conversation stays in memory and is only written once it has messages.
  const activeSession: { session: StoredSession } = {
    session: options.resume
      ? await sessionStore.load(options.resume, options.workspace)
      : options.continueSession
        ? await sessionStore.latestOrCreate(options.workspace)
        : sessionStore.createDraft(options.workspace),
  };

  const modes = new Map<string, PermissionMode>();
  const toolContext: ToolContext = {
    cwd: options.workspace,
    userId: options.userId,
    sessionId: activeSession.session.id,
    getSessionId: () => activeSession.session.id,
    getPermissionMode: () => modes.get(activeSession.session.id),
  };

  const tools: Record<string, any> = await toAgentToolSet(toolContext, mcpManager, skills, sessionStore);

  const systemPrompt = buildSystemPrompt(options.userId, skills, options.workspace);

  // Interactive CLI uses native terminal approval by default (no forced web jump).
  // A single PermissionPolicy instance backs both session grants and the policy
  // fingerprint used for drift detection.
  const approvalPolicy = new PermissionPolicy(options.workspace, undefined, {
    grants: defaultSessionPermissionGrants,
    mode: () => modes.get(activeSession.session.id),
    sessionId: () => activeSession.session.id,
  });
  const approvalCoordinator = new InkApprovalCoordinator({
    grantSession: (toolName, args) => approvalPolicy.grantSession(toolName, args),
  });
  const approvalHandler: ApprovalHandler = (request: ApprovalRequest) => approvalCoordinator.request(request);

  const apiKey = await resolveApiKey();
  const displayName = await resolveDisplayName(apiKey);

  const { waitUntilExit } = render(
    <InkApp
      userId={options.userId}
      displayName={displayName}
      workspace={options.workspace}
      cliConfig={cliConfig}
      skills={skills}
      skillAvailability={skillAvailability}
      toolContext={toolContext}
      setSessionMode={(mode) => modes.set(activeSession.session.id, mode)}
      tools={tools}
      modelRouter={modelRouter}
      mcpManager={mcpManager}
      mcpTools={mcpTools}
      sessionStore={sessionStore}
      activeSession={activeSession}
      systemPrompt={systemPrompt}
      approvalCoordinator={approvalCoordinator}
      approvalHandler={approvalHandler}
      getPolicyVersion={() => approvalPolicy.getPolicyVersion()}
    />,
    { exitOnCtrlC: false },
  );

  await waitUntilExit();
  await mcpManager.disconnectAll();
  if (activeSession.session.messages.length > 0) {
    process.stdout.write(`\nResume this session with:\nocean --resume ${activeSession.session.id}\n`);
  }
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
