import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiSdkModelGateway } from '../src/ai/ai-sdk-model-gateway';

describe('Real model provider acceptance', () => {
  it('streams a response from the configured provider through the production gateway', async () => {
    await ConfigModule.forRoot({ envFilePath: ['../../.env', '.env'] });
    const gateway = new AiSdkModelGateway(new ConfigService());
    let deltas = '';
    try {
      const result = await gateway.generate({
        modelId: process.env.OCEAN_LIVE_PROVIDER,
        messages: [
          {
            role: 'user',
            text: 'Reply with exactly OCEAN_LIVE_OK and no other text.',
          },
        ],
        signal: AbortSignal.timeout(30000),
        onDelta: (text) => {
          deltas += text;
        },
      });
      expect(result.text.trim()).toBe('OCEAN_LIVE_OK');
      expect(deltas).toBe(result.text);
      expect(result.toolCalls).toEqual([]);
      expect(result.usage?.inputTokens).toBeGreaterThan(0);
      expect(result.usage?.outputTokens).toBeGreaterThan(0);
      expect(result.usage?.totalTokens).toBeGreaterThan(0);
    } catch (error) {
      // Do not serialize provider request metadata or credentials in test output.
      if ((error as any)?.matcherResult) throw error;
      throw new Error(
        `Live provider acceptance failed; HTTP status: ${(error as any)?.statusCode ?? 'unavailable'}`,
      );
    }
  }, 35000);
});
