import type { Command } from 'commander';
import { resolve } from 'node:path';
import { readGatewaySessions } from '../llm/gateway-session.js';
import { resolveApiKey } from '../utils/auth.js';
import { SessionStore } from '../utils/session-store.js';

async function readRemote(sessionId?: string, spaceId?: string) {
  const apiKey = await resolveApiKey();
  if (!apiKey) throw new Error('Gateway sessions require authentication. Run ocean login first.');
  return readGatewaySessions({
    gatewayUrl: process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000',
    apiKey,
    signal: AbortSignal.timeout(15_000),
  }, sessionId, spaceId);
}

export function registerSessionCommands(program: Command): void {
  const sessions = program.command('sessions').description('Find saved sessions and conversation messages');
  sessions.command('list')
    .option('--space <id>', 'List Gateway sessions in this Space')
    .action(async (_options: unknown, command: Command) => {
      const options = command.optsWithGlobals<{ gateway?: boolean; space?: string; workspace: string }>();
      if (options.space && !options.gateway) throw new Error('--space requires --gateway.');
      const rows = options.gateway
        ? await readRemote(undefined, options.space)
        : (await new SessionStore().list(resolve(options.workspace))).map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
      process.stdout.write(`${JSON.stringify(rows)}\n`);
    });
  sessions.command('history').argument('<session-id>')
    .action(async (id: string, _options: unknown, command: Command) => {
      const options = command.optsWithGlobals<{ gateway?: boolean; workspace: string }>();
      const messages = options.gateway
        ? await readRemote(id)
        : (await new SessionStore().load(id, resolve(options.workspace))).messages;
      process.stdout.write(`${JSON.stringify(messages)}\n`);
    });
}
