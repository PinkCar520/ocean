import { streamText, type ModelMessage, type ToolResultPart, type ToolCallPart, stepCountIs, convertToModelMessages } from 'ai';
import type { ModelConfig } from '../types.js';
import type { LoadedSkill } from '../types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Build system prompt for CLI
 */
export function buildSystemPrompt(
  userId: string,
  skills: LoadedSkill[],
  workspacePath: string,
): string {
  let prompt = `你是银行内网 AI 助手 Ocean。
当前登录用户工号: ${userId}
工作目录: ${workspacePath}

你可以使用以下内置工具：
- bash: 执行 shell 命令（沙盒化，危险命令会被拦截）
- file_read: 读取文件内容
- file_write: 创建或覆盖文件
- file_edit: 编辑文件中的特定文本
- grep: 使用正则搜索文件内容
- glob: 快速匹配文件路径

拿到工具执行结果后，请用中文进行通俗易懂的总结。`;

  // Inject skill catalog if skills available
  if (skills.length > 0) {
    prompt += `\n\n以下 Skills 提供了特定任务的专项指令。当用户的请求与某个 Skill 的描述匹配时，
请按照该 Skill 的指令执行任务。

<available_skills>\n`;
    for (const skill of skills) {
      prompt += `  <skill>\n`;
      prompt += `    <name>${skill.manifest.name}</name>\n`;
      prompt += `    <description>${skill.manifest.description}</description>\n`;
      if (skill.manifest['allowed-tools']) {
        prompt += `    <allowed-tools>${skill.manifest['allowed-tools'].join(', ')}</allowed-tools>\n`;
      }
      prompt += `  </skill>\n`;
    }
    prompt += '</available_skills>\n';
  }

  // Load .AIGUIDE.md if exists
  const guidePath = path.join(workspacePath, '.AIGUIDE.md');
  if (fs.existsSync(guidePath)) {
    const guide = fs.readFileSync(guidePath, 'utf-8');
    prompt += `\n\n## 团队开发规范（.AIGUIDE.md，必须严格遵守）\n${guide}`;
  }

  return prompt;
}

/**
 * Run a streaming chat with tools
 */
/**
 * 通过 Gateway Run API 执行单轮对话（第 3 条：CLI 接入统一 Run API）。
 * 使用与 Web 相同的 POST /api/chat（AI SDK data stream），由 Gateway worker
 * 完成工具循环/审批/审计，CLI 只做流式转文本。
 */
export async function runChatLoopViaGateway(options: {
  gatewayUrl: string;
  apiKey: string;
  input: string;
  onText?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const base = options.gatewayUrl.replace(/\/$/, '');
  const res = await fetch(`${base}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': options.apiKey,
      Authorization: `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: options.input }],
      stream: true,
    }),
    signal: options.signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Gateway chat failed: HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (t.startsWith('0:')) {
        let payload: string = t.slice(2);
        try {
          payload = JSON.parse(payload) as string;
        } catch {
          /* 保留原文 */
        }
        fullText += payload;
        options.onText?.(payload);
      } else if (t.startsWith('e:')) {
        throw new Error(`Gateway stream error: ${t.slice(2)}`);
      }
    }
  }
  return fullText;
}

export async function runChatLoop(
  messages: ModelMessage[],
  options: {
    model: any; // AI SDK chat model
    systemPrompt: string;
    tools: Record<string, any>;
    onText?: (text: string) => void;
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any) => void;
    signal?: AbortSignal;
  },
): Promise<{ text: string; toolCalls: ToolCallPart[]; toolResults: ToolResultPart[] }> {
  let fullText = '';
  const toolCalls: ToolCallPart[] = [];
  const toolResults: ToolResultPart[] = [];

  const result = streamText({
    model: options.model,
    messages,
    system: options.systemPrompt,
    tools: options.tools,
    toolChoice: 'auto',
    stopWhen: stepCountIs(10),
    abortSignal: options.signal,
    onChunk: ({ chunk }) => {
      if (chunk.type === 'text-delta') {
        fullText += chunk.text;
        options.onText?.(chunk.text);
      }
    },
    onStepFinish: ({ toolCalls: stepToolCalls, toolResults: stepToolResults }) => {
      if (stepToolCalls) {
        toolCalls.push(...(stepToolCalls as ToolCallPart[]));
      }
      if (stepToolResults) {
        for (const tr of stepToolResults as ToolResultPart[]) {
          toolResults.push(tr);
          options.onToolResult?.(tr.toolName, tr.output);
        }
      }
    },
  });

  // Consume the stream
  const finalResult = await result;
  const text = await finalResult.text;

  return {
    text: text || fullText,
    toolCalls,
    toolResults,
  };
}

/**
 * Activate a skill and get its content
 */
export function activateSkill(skills: LoadedSkill[], skillName: string): { message: string; content: string } | null {
  const skill = skills.find(s => s.manifest.name === skillName);
  if (!skill) {
    return null;
  }

  return {
    message: `Skill "${skillName}" has been successfully activated. Instructions are provided below. Please follow them strictly for all subsequent steps in this task.`,
    content: skill.content,
  };
}
