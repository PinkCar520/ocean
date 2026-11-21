import { runChatLoopViaGateway, type GatewayPromptOptions } from './llm/chat.js';

export type { OceanPromptEvent } from './llm/chat.js';

export type OceanPromptOptions = Omit<GatewayPromptOptions, 'nonInteractive'>;

/** Execute an Ocean Gateway prompt without requiring an interactive client. */
export function runOceanPrompt(options: OceanPromptOptions): Promise<string> {
  if (!options.input.trim()) return Promise.reject(new Error('A prompt is required.'));
  return runChatLoopViaGateway({ ...options, nonInteractive: true });
}

export { streamOceanRunEvents, type OceanRunEventsOptions } from './llm/gateway-run-events.js';

export { runOceanCoreLocal } from './llm/core-local-runtime.js';
