import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createChatModel } from '../ai/model.factory';

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  icon: string;
  color: string;
}

/**
 * ModelRegistry —— Agent Runtime 的模型实例与清单管理。
 * 从原 SkillOrchestrator 拆分（Phase: Agent Runtime 拆分，第 1/6 模块）。
 * - getModel：按 modelId 解析聊天模型实例（委托 ai/model.factory，支持多 provider）。
 * - getAvailableModels：从环境变量枚举当前网关配置的全部模型清单。
 */
@Injectable()
export class ModelRegistry {
  constructor(private readonly configService: ConfigService) {}

  getModel(modelId?: string) {
    return createChatModel(this.configService, modelId);
  }

  /** 获取当前网关配置的模型列表（provider 元数据 + 显示信息）。 */
  getAvailableModels(): AvailableModel[] {
    const providers = [
      {
        env: 'DEEPSEEK_MODEL',
        provider: 'deepseek',
        icon: 'Sparkles',
        color: 'text-blue-500',
      },
      {
        env: 'ANTHROPIC_MODEL',
        provider: 'anthropic',
        icon: 'Brain',
        color: 'text-purple-500',
      },
      {
        env: 'GEMINI_MODEL',
        provider: 'gemini',
        icon: 'Globe',
        color: 'text-orange-500',
      },
      {
        env: 'DASHSCOPE_MODEL',
        provider: 'dashscope',
        icon: 'Cloud',
        color: 'text-indigo-500',
      },
      {
        env: 'OPENAI_MODEL',
        provider: 'openai',
        icon: 'Zap',
        color: 'text-green-500',
      },
      {
        env: 'LOCAL_MODEL',
        provider: 'local',
        icon: 'Terminal',
        color: 'text-gray-500',
      },
    ];

    return providers
      .map(({ env, ...meta }) => ({ id: this.configService.get(env), ...meta }))
      .filter((m): m is AvailableModel & { id: string } => Boolean(m.id))
      .map((m) => ({
        id: m.id,
        name: m.id,
        provider: m.provider,
        icon: m.icon,
        color: m.color,
      }));
  }
}
