import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';

/**
 * 多 Provider 聊天模型构造（唯一来源）。
 *
 * 从 SkillOrchestrator.getModel 提取，供 SkillOrchestrator（Web 直驱链路）与
 * Worker 的 ModelGateway（Run 链路）共同复用，避免两套 provider 配置漂移。
 */
export function createChatModel(config: ConfigService, modelId?: string): any {
  const defaultProvider =
    config.get<string>('DEFAULT_AI_PROVIDER') || 'deepseek';

  const configs: Record<string, any> = {
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

  let activeProviderKey = defaultProvider;
  let selectedModelId = configs[defaultProvider]?.model;

  if (modelId) {
    if (configs[modelId]) {
      activeProviderKey = modelId;
      selectedModelId = configs[modelId].model;
    } else {
      for (const [key, conf] of Object.entries(configs)) {
        if (
          conf.model === modelId ||
          conf.model
            ?.split(',')
            .map((m: string) => m.trim())
            .includes(modelId)
        ) {
          activeProviderKey = key;
          selectedModelId = modelId;
          break;
        }
      }
    }
  }

  const conf = configs[activeProviderKey];

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

  const provider = createOpenAI({
    baseURL: conf.baseURL,
    apiKey: conf.apiKey || 'empty',
    ...((activeProviderKey === 'dashscope' ||
      activeProviderKey === 'deepseek') &&
    selectedModelId?.includes('deepseek')
      ? {
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            if (init?.body && typeof init.body === 'string') {
              try {
                const body = JSON.parse(init.body);
                if (activeProviderKey === 'deepseek') {
                  body.thinking = { type: 'enabled' };
                  body.reasoning_effort = 'high';
                } else {
                  body.enable_thinking = true;
                }
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

  return provider.chat(selectedModelId);
}
