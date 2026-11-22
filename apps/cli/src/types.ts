// Core types for Ocean CLI

import type { UIMessage, ModelMessage } from 'ai';
import type { SecurityAuditResult } from './utils/security.js';

// ─── Tool System ──────────────────────────────────────────────

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: any; // Zod schema
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

export interface ToolContext {
  permissionMode?: import('@ocean/core/permission-policy').PermissionMode;
  getPermissionMode?: () => import('@ocean/core/permission-policy').PermissionMode | undefined;
  commandPermissionSettings?: { value: import('@ocean/core/permission-policy').PermissionSettings; root: string };
  permissionSources?: ReadonlySet<'user' | 'project' | 'local'>;
  cwd: string;
  userId: string;
  sessionId: string;
  /** Resolves the active id after /new or /resume changes the conversation. */
  getSessionId?: () => string;
  runId?: string;
  toolCallId?: string;
  signal?: AbortSignal;
}

export interface ToolResult<T = any> {
  data: T;
  audit?: SecurityAuditResult;
  ui?: {
    uiType: string;
    props: Record<string, any>;
  };
  error?: string;
}

// ─── Skill System ─────────────────────────────────────────────

export interface SkillManifest {
  name: string;
  description: string;
  'allowed-tools'?: string[];
  'requires-approval'?: string[];
  compatibility?: string;
  locales?: Record<string, {
    displayName: string;
    description: string;
  }>;
}

export interface LoadedSkill {
  /** Provenance determined by discovery; never trusted from SKILL.md frontmatter. */
  source?: 'plugin' | 'user' | 'project';
  manifest: SkillManifest;
  content: string;
  sourcePath: string;
}

// ─── LLM System ──────────────────────────────────────────────

export type ModelProvider = 'deepseek' | 'anthropic' | 'gemini' | 'dashscope' | 'openai' | 'local';

export interface ModelConfig {
  id: string;
  provider: ModelProvider;
  baseURL: string;
  apiKey: string;
}

export interface ChatState {
  messages: UIMessage[];
  sessionId: string;
  modelId?: string;
}

// ─── CLI Configuration ───────────────────────────────────────

export interface CliConfig {
  defaultAiProvider?: string;
  deepseekApiKey?: string;
  deepseekBaseUrl?: string;
  deepseekModel?: string;
  /** Reasoning effort for DeepSeek thinking mode. Defaults to 'medium'. */
  deepseekReasoningEffort?: 'low' | 'medium' | 'high';
  /** Enable DeepSeek thinking mode. Defaults to true. */
  deepseekThinking?: boolean;
  /** Maximum output tokens per model turn. Defaults to 8192. */
  maxOutputTokens?: number;
  anthropicApiKey?: string;
  anthropicModel?: string;
  geminiApiKey?: string;
  geminiModel?: string;
  dashscopeApiKey?: string;
  dashscopeBaseUrl?: string;
  dashscopeModel?: string;
  openaiApiKey?: string;
  openaiBaseUrl?: string;
  openaiModel?: string;
  localApiKey?: string;
  localBaseUrl?: string;
  localModel?: string;

  // Gateway settings
  gatewayUrl?: string;
  gatewayMode?: boolean;

  // Identity
  userId?: string;

  // Workspace
  workspacePath?: string;

  // MCP
  mcpConfigPath?: string;
}

// ─── RPC Types (for Gateway mode) ────────────────────────────

export interface RpcRequest {
  id: string;
  method: string;
  params?: Record<string, any>;
}

export interface RpcResponse {
  id: string;
  result?: any;
  error?: string;
}
