import { Test } from '@nestjs/testing';
import { ArtifactStore } from '../artifact/artifact.store';
import { EgressPolicy } from '../sandbox/egress-policy';
import { DeviceRpcBroker } from './device-rpc.broker';
import { ToolRegistry } from './tool.registry';

it('registers device tools through the production dependency injection path', async () => {
  const module = await Test.createTestingModule({ providers: [
    ToolRegistry,
    { provide: EgressPolicy, useValue: new EgressPolicy([]) },
    { provide: ArtifactStore, useValue: {} },
    { provide: DeviceRpcBroker, useValue: { request: jest.fn() } },
  ] }).compile();
  const registry = module.get(ToolRegistry);
  expect(registry.get('local_notebook_read')?.inputSchema).toBeDefined();
  expect(registry.get('local_notebook_edit')?.requiresApproval).toBe(true);
  expect(registry.get('local_file_read')?.inputSchema).toBeDefined();
  for (const name of ['local_file_write', 'local_file_edit', 'local_file_patch']) {
    expect(registry.get(name)?.requiresApproval).toBe(true);
  }
  await module.close();
});
