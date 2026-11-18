import { ConfigService } from '@nestjs/config';
import {
  createDeepSeek,
  type DeepSeekLanguageModelChatOptions,
} from '@ai-sdk/deepseek';
import { createOpenAI } from '@ai-sdk/openai';
import { wrapLanguageModel } from 'ai';
import { chatImageMiddleware } from './chat-image-middleware';

interface ChatModelConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

interface ResolvedChatModel {
  provider: string;
  modelId?: string;
  config: ChatModelConfig;
}

function resolveChatModel(
  config: ConfigService,
  modelId?: string,
): ResolvedChatModel {
  const defaultProvider = config.get<string>('DEFAULT_AI_PROVIDER') || 'deepseek';
  const configs: Record<string, ChatModelConfig> = {
    deepseek: {
      apiKey: config.get('DEEPSEEK_API_KEY'),
      baseURL: config.get('DEEPSEEK_BASE_URL') || 'https://api.deepseek.com/v1',
      model: config.get('DEEPSEEK_MODEL'),
    },
    anthropic: {
      apiKey: config.get('ANTHROPIC_API_KEY'),
      model: config.get('ANTHROPIC_MODEL'),
    },
    gemini: {
      apiKey: config.get('GEMINI_API_KEY'),
      model: config.get('GEMINI_MODEL'),
    },
    dashscope: {
      apiKey: config.get('DASHSCOPE_API_KEY'),
      baseURL:
        config.get('DASHSCOPE_BASE_URL') ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: config.get('DASHSCOPE_MODEL'),
    },
    openai: {
      apiKey: config.get('OPENAI_API_KEY'),
      baseURL: config.get('OPENAI_BASE_URL') || 'https://api.openai.com/v1',
      model: config.get('OPENAI_MODEL'),
    },
    local: {
      apiKey: config.get('LOCAL_API_KEY'),
      baseURL: config.get('LOCAL_BASE_URL') || 'http://localhost:11434/v1',
      model: config.get('LOCAL_MODEL'),
    },
  };

  let provider = defaultProvider;
  let selectedModelId = configs[provider]?.model;

  if (modelId) {
    if (configs[modelId]) {
      provider = modelId;
      selectedModelId = configs[modelId].model;
    } else {
      for (const [key, providerConfig] of Object.entries(configs)) {
        if (
          providerConfig.model === modelId ||
          providerConfig.model
            ?.split(',')
            .map((candidate) => candidate.trim())
            .includes(modelId)
        ) {
          provider = key;
          selectedModelId = modelId;
          break;
        }
      }
    }
  }

  return {
    provider,
    modelId: selectedModelId,
    config: configs[provider] ?? {},
  };
}

export function createChatProviderOptions(
  config: ConfigService,
  modelId?: string,
): { deepseek: DeepSeekLanguageModelChatOptions } | undefined {
  if (resolveChatModel(config, modelId).provider !== 'deepseek') return undefined;

  return {
    deepseek: {
      thinking: { type: 'enabled' },
      reasoningEffort: 'high',
    },
  };
}

/**
 * 多 Provider 聊天模型构造（唯一来源）。
 *
 * 从 SkillOrchestrator.getModel 提取，供 SkillOrchestrator（Web 直驱链路）与
 * Worker 的 ModelGateway（Run 链路）共同复用，避免两套 provider 配置漂移。
 */
export function createChatModel(config: ConfigService, modelId?: string): any {
  const { provider: activeProviderKey, modelId: selectedModelId, config: conf } =
    resolveChatModel(config, modelId);
  if (!selectedModelId) {
    throw new Error(`No model configured for provider "${activeProviderKey}"`);
  }

  if (activeProviderKey === 'anthropic') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAnthropic } = require('@ai-sdk/anthropic');
    return createAnthropic({ apiKey: conf.apiKey })(selectedModelId);
  }

  if (activeProviderKey === 'gemini') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createGoogleGenerativeAI } = require('@ai-sdk/google');
    return createGoogleGenerativeAI({ apiKey: conf.apiKey })(selectedModelId);
  }

  if (activeProviderKey === 'deepseek') {
    const deepseek = createDeepSeek({
      apiKey: conf.apiKey,
      baseURL: conf.baseURL,
    });
    return wrapLanguageModel({
      model: deepseek(selectedModelId),
      middleware: chatImageMiddleware,
    });
  }

  const provider = createOpenAI({
    baseURL: conf.baseURL,
    apiKey: conf.apiKey || 'empty',
    ...(activeProviderKey === 'dashscope' &&
    selectedModelId?.includes('deepseek')
      ? {
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.body && typeof init.body === 'string') {
              try {
                const body = JSON.parse(init.body);
                body.enable_thinking = true;
                init.body = JSON.stringify(body);
              } catch {
                /* ignore parse errors */
              }
            }
            return globalThis.fetch(input, init);
          },
        }
      : {}),
  });

  return wrapLanguageModel({ model: provider.chat(selectedModelId), middleware: chatImageMiddleware });
}
