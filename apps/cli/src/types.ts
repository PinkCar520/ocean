// Core types for Ocean CLI

import type { UIMessage, ModelMessage } from 'ai';

// ─── Tool System ──────────────────────────────────────────────

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: any; // Zod schema
  execute: (input: TInput, context: ToolContext) => Promise<TOutput>;
}

export interface ToolContext {
  cwd: string;
  userId: string;
  sessionId: string;
  signal?: AbortSignal;
}

export interface ToolResult<T = any> {
  data: T;
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
