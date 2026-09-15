import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiSdkModelGateway } from './ai-sdk-model-gateway';
import { MODEL_GATEWAY } from './model-gateway';
import { SimModelGateway } from './sim-model-gateway';

/**
 * AiModule —— 模型调用网关。
 *
 * - Web 直驱链路：SkillOrchestrator 通过 createChatModel 直接构造 provider。
 * - Run 链路：Worker 注入 MODEL_GATEWAY；WORKER_SIM_MS>0 时使用模拟网关
 *   （本地无 API key 的开发/冒烟），否则使用 ai-sdk 真实网关。
 */
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MODEL_GATEWAY,
      useFactory: (config: ConfigService) => {
        const simMs = Number(process.env.WORKER_SIM_MS ?? '0');
        return simMs > 0
          ? new SimModelGateway(simMs)
          : new AiSdkModelGateway(config);
      },
      inject: [ConfigService],
    },
  ],
  exports: [MODEL_GATEWAY],
})
export class AiModule {}
