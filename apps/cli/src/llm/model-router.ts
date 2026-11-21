import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import { chatImageMiddleware } from './chat-image-middleware.js';
import type { ModelConfig, ModelProvider, CliConfig } from '../types.js';
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
export function createModelRouter(config: CliConfig): ModelRouter {
  const defaultProvider = config.defaultAiProvider || 'deepseek';
  
  const allModels: Array<{ id: string; provider: ModelProvider }> = [];

  const addModel = (modelStr: string | undefined, provider: ModelProvider) => {
    if (!modelStr) return;
    const models = modelStr.split(',').map(m => m.trim()).filter(Boolean);
    for (const id of models) {
      if (!allModels.some(m => m.id === id)) {
        allModels.push({ id, provider });
      }
    }
  };

  addModel(config.deepseekModel, 'deepseek');
  addModel(config.anthropicModel, 'anthropic');
  addModel(config.geminiModel, 'gemini');
  addModel(config.dashscopeModel, 'dashscope');
  addModel(config.openaiModel, 'openai');
  addModel(config.localModel, 'local');

  function resolveModel(modelId?: string): ModelConfig {
    let selectedId = modelId;
    let selectedProviderStr = defaultProvider;

    if (modelId) {
      const found = allModels.find(m => m.id === modelId);
      if (found) {
        selectedProviderStr = found.provider;
      }
    } else {
      const found = allModels.find(m => m.provider === defaultProvider);
      if (found) {
        selectedId = found.id;
      } else if (allModels.length > 0) {
        selectedId = allModels[0].id;
        selectedProviderStr = allModels[0].provider;
      }
    }

    const providerMap: Record<string, { baseURL: string; apiKey: string }> = {
      deepseek: {
        baseURL: config.deepseekBaseUrl || 'https://api.deepseek.com/v1',
        apiKey: config.deepseekApiKey || '',
      },
      anthropic: {
        baseURL: '',
        apiKey: config.anthropicApiKey || '',
      },
      gemini: {
        baseURL: '',
        apiKey: config.geminiApiKey || '',
      },
      dashscope: {
        baseURL: config.dashscopeBaseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: config.dashscopeApiKey || '',
      },
      openai: {
        baseURL: config.openaiBaseUrl || 'https://api.openai.com/v1',
        apiKey: config.openaiApiKey || '',
      },
      local: {
        baseURL: config.localBaseUrl || 'http://localhost:11434/v1',
        apiKey: config.localApiKey || 'ollama',
      }
    };

    const prov = providerMap[selectedProviderStr];
    if (!selectedId || !prov) throw new Error('No supported Ocean model is configured. Set a model or pass --model.');

    return {
      id: selectedId,
      provider: selectedProviderStr as ModelProvider,
      baseURL: prov.baseURL,
      apiKey: prov.apiKey,
    };
  }

  function getModel(modelId?: string) {
    const resolved = resolveModel(modelId);
    
    if (resolved.provider === 'anthropic') {
      return createAnthropic({ apiKey: resolved.apiKey })(resolved.id);
    }
    
    if (resolved.provider === 'gemini') {
      return createGoogleGenerativeAI({ apiKey: resolved.apiKey })(resolved.id);
    }

    const isDeepseekCompatible = resolved.provider === 'dashscope' || resolved.provider === 'deepseek';

    const model = createOpenAI({
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey || 'empty',
      ...(isDeepseekCompatible && resolved.id.includes('deepseek') ? {
        fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.body && typeof init.body === 'string') {
            try {
              const body = JSON.parse(init.body);
              if (resolved.provider === 'deepseek') {
                body.thinking = { type: 'enabled' };
                body.reasoning_effort = 'high';
              } else {
                body.enable_thinking = true;
              }
              init.body = JSON.stringify(body);
            } catch { /* ignore */ }
          }
          return globalThis.fetch(input, init);
        },
      } : {}),
    }).chat(resolved.id);
    return wrapLanguageModel({ model, middleware: chatImageMiddleware });
  }

  return {
    getModel,
    resolveModel,
    listModels: () => allModels,
  };
}
