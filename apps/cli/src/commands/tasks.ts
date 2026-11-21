import type { Command } from 'commander';
import { agentRunSchema, runSnapshotSchema, type RunSnapshot } from '@ocean/contracts';
import { z } from 'zod';
import { streamOceanRunEvents } from '../llm/gateway-run-events.js';
import { resolveApiKey } from '../utils/auth.js';

async function requestTask(path: string, method = 'GET', body?: object, resource = 'runs'): Promise<unknown> {
  const key = await resolveApiKey();
  if (!key) throw new Error('Ocean tasks requires authentication. Run ocean login first.');
  const gateway = (process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000').replace(/\/$/, '');
  const response = await fetch(`${gateway}/api/${resource}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'x-api-key': key, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Gateway task request failed: HTTP ${response.status}`);
  return response.json();
}

function writeRun(snapshot: RunSnapshot) {
  process.stdout.write(`${JSON.stringify(snapshot.run)}\n`);
}

export function registerTaskCommands(program: Command): void {
  const tasks = program.command('tasks').description('Manage durable background tasks in Ocean Gateway');
  const schedules = tasks.command('schedule').description('Manage scheduled Ocean tasks (UTC cron)');
  schedules.command('create')
    .argument('<cron>')
    .argument('<prompt>')
    .option('--space <id>', 'Space for the task', 'work')
    .option('--once', 'Run only at the next matching time')
    .action(async (cron: string, prompt: string, options: { space: string; once?: boolean }) => {
      const result = await requestTask('', 'POST', {
        cron, prompt, spaceId: options.space, recurring: !options.once,
      }, 'run-schedules');
      process.stdout.write(`${JSON.stringify(result)}\n`);
    });
  schedules.command('list').action(async () => {
    process.stdout.write(`${JSON.stringify(await requestTask('', 'GET', undefined, 'run-schedules'))}\n`);
  });
  schedules.command('cancel').argument('<schedule-id>').action(async (id: string) => {
    const result = await requestTask(`/${encodeURIComponent(id)}`, 'DELETE', undefined, 'run-schedules');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  });

  tasks.command('start')
    .argument('<prompt>')
    .option('--space <id>', 'Space for the task', 'work')
    .option('--model <id>', 'Gateway model')
    .option('--request-id <id>', 'Idempotency key for retrying task submission')
    .action(async (prompt: string, options: { space: string; model?: string; requestId?: string }) => {
      if (!prompt.trim()) throw new Error('A non-empty task prompt is required.');
      writeRun(runSnapshotSchema.parse(await requestTask('', 'POST', {
        space: { id: options.space, type: 'work' },
        input: prompt,
        priority: 'background',
        idempotencyKey: options.requestId,
        metadata: { nonInteractive: true, ...(options.model && { modelId: options.model }) },
      })));
    });

  tasks.command('delegate')
    .argument('<parent-id>')
    .argument('<agent>')
    .argument('<prompt>')
    .requiredOption('--request-id <id>', 'Stable ID for this delegation')
    .action(async (id: string, agent: string, prompt: string, options: { requestId: string }) => {
      const child = await requestTask(`/${encodeURIComponent(id)}/subagents`, 'POST', {
        toolCallId: options.requestId, agent, prompt,
      });
      process.stdout.write(`${JSON.stringify(child)}\n`);
    });

  tasks.command('team').argument('<task-id>').action(async (id: string) => {
    process.stdout.write(`${JSON.stringify(await requestTask(`/${encodeURIComponent(id)}/team`))}\n`);
  });

  tasks.command('message').argument('<sender-task-id>').argument('<recipient-task-id>').argument('<message>')
    .option('--message-id <id>', 'Stable ID for retrying the message')
    .action(async (id: string, recipientId: string, message: string, options: { messageId?: string }) => {
      const result = await requestTask(`/${encodeURIComponent(id)}/team/messages`, 'POST', {
        recipientId, message, messageId: options.messageId,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    });

  tasks.command('list')
    .option('--space <id>', 'Only show tasks in this Space')
    .action(async (options: { space?: string }) => {
      const query = new URLSearchParams({ priority: 'background' });
      if (options.space) query.set('spaceId', options.space);
      const runs = z.array(agentRunSchema).parse(await requestTask(`?${query}`));
      process.stdout.write(`${JSON.stringify(runs)}\n`);
    });

  for (const action of ['status', 'cancel', 'retry'] as const) {
    tasks.command(action).argument('<task-id>').action(async (id: string) => {
      const operation = action === 'status' ? '' : `/${action}`;
      const method = action === 'status' ? 'GET' : 'POST';
      writeRun(runSnapshotSchema.parse(await requestTask(`/${encodeURIComponent(id)}${operation}`, method)));
    });
  }

  tasks.command('output')
    .argument('<task-id>')
    .option('--events', 'Print persisted events as JSON lines')
    .option('--follow', 'Follow new events until the task ends')
    .option('--after <sequence>', 'Only include events after this sequence')
    .action(async (id: string, options: { events?: boolean; follow?: boolean; after?: string }) => {
      const after = options.after === undefined ? undefined : Number(options.after);
      if (after !== undefined && (!/^\d+$/.test(options.after!) || !Number.isSafeInteger(after))) {
        throw new Error('The event cursor must be a non-negative integer.');
      }
      if (options.follow) {
        const apiKey = await resolveApiKey();
        if (!apiKey) throw new Error('Ocean tasks requires authentication. Run ocean login first.');
        const gatewayUrl = process.env.OCEAN_GATEWAY_URL || 'http://localhost:3000';
        const abort = new AbortController();
        const onInterrupt = () => abort.abort(new Error('Stopped following task output.'));
        process.once('SIGINT', onInterrupt);
        let wroteText = false;
        try {
          for await (const event of streamOceanRunEvents({ gatewayUrl, apiKey, runId: id, after, signal: abort.signal })) {
            if (options.events) process.stdout.write(`${JSON.stringify(event)}\n`);
            else if (event.type === 'run.output_delta') {
              process.stdout.write(event.delta);
              wroteText = true;
            }
          }
        } finally {
          process.removeListener('SIGINT', onInterrupt);
          if (wroteText) process.stdout.write('\n');
        }
        return;
      }

      const snapshot = runSnapshotSchema.parse(await requestTask(`/${encodeURIComponent(id)}`));
      const events = after === undefined ? snapshot.events : snapshot.events.filter(event => event.sequence > after);
      if (options.events) {
        for (const event of events) process.stdout.write(`${JSON.stringify(event)}\n`);
      } else {
        const output = events
          .flatMap((event) => event.type === 'run.output_delta' ? [event.delta] : []).join('');
        if (output) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
      }
    });
}
