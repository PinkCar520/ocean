import { createOpenAI } from '@ai-sdk/openai';
import type { ModelConfig, ModelProvider } from '../types.js';
import type { LanguageModel } from 'ai';

interface ModelRouter {
  getModel(modelId?: string): LanguageModel;
  resolveModel(modelId?: string): ModelConfig;
  listModels(): Array<{ id: string; provider: ModelProvider }>;
}

/**
 * Model router - mirrors Gateway's getModel() logic
 * Supports VLLM (local), DashScope (cloud), and oMLX (local)
 */
export function createModelRouter(config: {
  vllmBaseUrl?: string;
  vllmModelName?: string;
  vllmApiKey?: string;
  dashscopeBaseUrl?: string;
  dashscopeApiKey?: string;
  dashscopeDefaultModel?: string;
  dashscopeModelName?: string;
  omlxBaseUrl?: string;
  omlxModel?: string;
  omlxApiKey?: string;
}): ModelRouter {
  const vllmModels = (config.vllmModelName || 'qwen2.5-coder:7b').split(',').map(m => m.trim());
  const omlxModel = config.omlxModel?.trim();

  const allModels: Array<{ id: string; provider: ModelProvider }> = [
    ...vllmModels.map(id => ({ id, provider: 'vllm' as ModelProvider })),
  ];

  if (omlxModel && !allModels.some(m => m.id === omlxModel)) {
    allModels.push({ id: omlxModel, provider: 'omlx' as ModelProvider });
  }

  // Add cloud models
  const defaultCloudModel = config.dashscopeDefaultModel?.trim();
  const configuredCloudModels = config.dashscopeModelName
    ? config.dashscopeModelName.split(',').map(m => m.trim())
    : ['deepseek-chat', 'qwen-plus', 'qwen-max'];
  
  // Build cloud models list: default first, then others (excluding default)
  const orderedCloudModels = defaultCloudModel
    ? [defaultCloudModel, ...configuredCloudModels.filter(m => m !== defaultCloudModel)]
    : configuredCloudModels;
  
  for (const id of orderedCloudModels) {
    if (!allModels.some(m => m.id === id)) {
      allModels.push({ id, provider: 'dashscope' as ModelProvider });
    }
  }

  function resolveModel(modelId?: string): ModelConfig {
    // If no model specified, pick the best available one
    let selected: { id: string; provider: ModelProvider };
    
    if (modelId && allModels.some(m => m.id === modelId)) {
      selected = allModels.find(m => m.id === modelId)!;
    } else {
      // Priority: dashscope (if API key set) > vllm (if URL set) > omlx > first available
      const hasDashscope = !!(config.dashscopeBaseUrl && config.dashscopeApiKey);
      const hasVllm = !!config.vllmBaseUrl;
      const hasOmlx = !!config.omlxBaseUrl;
      
      if (hasDashscope) {
        selected = allModels.find(m => m.provider === 'dashscope')!;
      } else if (hasVllm) {
        selected = allModels.find(m => m.provider === 'vllm')!;
      } else if (hasOmlx) {
        selected = allModels.find(m => m.provider === 'omlx')!;
      } else {
        selected = allModels[0];
      }
    }

    // Use explicit provider field instead of pattern matching on model name
    const isCloud = selected.provider === 'dashscope';
    const isOmlx = selected.provider === 'omlx';

    let baseURL: string;
    let apiKey: string;

    if (isCloud) {
      baseURL = config.dashscopeBaseUrl || '';
      apiKey = config.dashscopeApiKey || '';
    } else if (isOmlx) {
      baseURL = config.omlxBaseUrl || '';
      apiKey = config.omlxApiKey || 'unused';
    } else {
      // VLLM provider
      baseURL = config.vllmBaseUrl || '';
      apiKey = config.vllmApiKey || 'ollama';
    }

    return {
      id: selected.id,
      provider: selected.provider,
      baseURL,
      apiKey,
    };
  }

  function getModel(modelId?: string) {
    const resolved = resolveModel(modelId);
    // Use explicit provider field instead of pattern matching
    const isCloud = resolved.provider === 'dashscope';

    return createOpenAI({
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      ...(isCloud ? {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.body && typeof init.body === 'string') {
            try {
              const body = JSON.parse(init.body);
              body.enable_thinking = true;
              init.body = JSON.stringify(body);
            } catch { /* ignore */ }
          }
          return globalThis.fetch(input, init);
        },
      } : {}),
    }).chat(resolved.id);
  }

  return {
    getModel,
    resolveModel,
    listModels: () => allModels,
  };
}
