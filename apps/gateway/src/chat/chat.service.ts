import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ChatService {
  constructor(
    private configService: ConfigService,
  ) { }

  /**
   * 获取当前网关配置的模型列表 (供前端动态展示)
   * ⚠️ 注意：前端应优先迁移到使用 SkillOrchestrator.getAvailableModels()
   */
  getAvailableModels() {
    const models = [
      { id: this.configService.get('DEEPSEEK_MODEL'), provider: 'deepseek', icon: 'Sparkles', color: 'text-blue-500' },
      { id: this.configService.get('ANTHROPIC_MODEL'), provider: 'anthropic', icon: 'Brain', color: 'text-purple-500' },
      { id: this.configService.get('GEMINI_MODEL'), provider: 'gemini', icon: 'Globe', color: 'text-orange-500' },
      { id: this.configService.get('DASHSCOPE_MODEL'), provider: 'dashscope', icon: 'Cloud', color: 'text-indigo-500' },
      { id: this.configService.get('OPENAI_MODEL'), provider: 'openai', icon: 'Zap', color: 'text-green-500' },
      { id: this.configService.get('LOCAL_MODEL'), provider: 'local', icon: 'Terminal', color: 'text-gray-500' }
    ];

    return models
      .filter(m => m.id)
      .map(m => ({
        id: m.id,
        name: m.id,
        provider: m.provider,
        icon: m.icon,
        color: m.color,
      }));
  }
}
