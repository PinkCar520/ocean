import { ToolRegistry } from './tool.registry';
import { z } from 'zod';

describe('Gateway shared tool descriptor adapter', () => {
  it('maps registered tools into host-neutral schema descriptors', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'descriptor_test',
      description: 'Test adapter',
      inputSchema: z.object({ count: z.number().int() }),
      execute: async () => ({ ok: true }),
    });
    const descriptor = registry.getDescriptor('descriptor_test');
    expect(descriptor?.host).toBe('remote');
    await expect(descriptor?.validate({ count: 2 })).resolves.toEqual({ count: 2 });
    await expect(descriptor?.validate({ count: 'invalid' })).rejects.toThrow();
    expect(registry.getDescriptor('missing')).toBeUndefined();
  });
});
