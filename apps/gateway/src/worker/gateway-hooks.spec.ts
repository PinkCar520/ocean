import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GatewayHooks } from './gateway-hooks';

const command = (script: string) => `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;

describe('GatewayHooks', () => {
  it('ignores hooks for untrusted Spaces and unmatched tool matchers', async () => {
    const hooks = new GatewayHooks({
      trustedSpaces: ['space-1'],
      hooks: { PreToolUse: [{ matcher: 'file_write', hooks: [{ type: 'command', command: command('process.exit(2)') }] }] },
    });
    await expect(hooks.run('PreToolUse', { tool_name: 'file_write' }, { spaceId: 'space-2' })).resolves.toEqual({ blocked: false, reason: '' });
    await expect(hooks.run('PreToolUse', { tool_name: 'file_read' }, { spaceId: 'space-1' })).resolves.toEqual({ blocked: false, reason: '' });
  });

  it('blocks on exit code 2 and on structured deny output', async () => {
    const hooks = new GatewayHooks({
      trustedSpaces: ['space-1'],
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: command("process.stderr.write('shell denied');process.exit(2)") }] }] },
    });
    await expect(hooks.run('PreToolUse', { tool_name: 'file_write' }, { spaceId: 'space-1' })).resolves.toEqual({ blocked: true, reason: 'shell denied' });
    const json = new GatewayHooks({
      trustedSpaces: ['space-1'],
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: command("console.log(JSON.stringify({decision:'block',reason:'json deny'}))") }] }] },
    });
    await expect(json.run('PreToolUse', { tool_name: 'file_write' }, { spaceId: 'space-1' })).resolves.toEqual({ blocked: true, reason: 'json deny' });
  });

  it('fails closed on non-zero exits, invalid output and timeouts', async () => {
    const nonzero = new GatewayHooks({ trustedSpaces: ['s'], hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: command('process.exit(3)') }] }] } });
    await expect(nonzero.run('PreToolUse', { tool_name: 'x' }, { spaceId: 's' })).rejects.toThrow('Hook exited 3');
    const invalid = new GatewayHooks({ trustedSpaces: ['s'], hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: command("process.stdout.write('not-json')") }] }] } });
    await expect(invalid.run('PreToolUse', { tool_name: 'x' }, { spaceId: 's' })).rejects.toThrow('Invalid hook JSON');
    const timeout = new GatewayHooks({ trustedSpaces: ['s'], hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: command('setTimeout(()=>{},1000)'), timeout: 0.05 }] }] } });
    await expect(timeout.run('PreToolUse', { tool_name: 'x' }, { spaceId: 's' })).rejects.toThrow('Hook timeout');
  });

  it('disables itself when no administrator file is configured', async () => {
    const hooks = GatewayHooks.load(undefined);
    await expect(hooks.run('PreToolUse', { tool_name: 'file_write' }, { spaceId: 'space-1' })).resolves.toEqual({ blocked: false, reason: '' });
  });

  it('loads only a private administrator file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-gateway-hooks-'));
    try {
      const file = join(root, 'hooks.json');
      await writeFile(file, JSON.stringify({ trustedSpaces: ['space-1'], hooks: {} }), { mode: 0o600 });
      await expect(GatewayHooks.load(file).run('PreToolUse', { tool_name: 'x' }, { spaceId: 'space-1' })).resolves.toEqual({ blocked: false, reason: '' });
      await chmod(file, 0o666);
      expect(() => GatewayHooks.load(file)).toThrow('Unsafe Gateway hooks');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it('reloads a private administrator file before the next invocation and fails closed on malformed updates', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-hook-reload-'));
    try {
      const file = join(root, 'hooks.json');
      await writeFile(file, JSON.stringify({ trustedSpaces: ['s'], hooks: {} }), { mode: 0o600 });
      const hooks = GatewayHooks.load(file);
      await expect(hooks.run('PreToolUse', {}, { spaceId: 's' })).resolves.toMatchObject({ blocked: false });
      await writeFile(file, JSON.stringify({ trustedSpaces: ['s'], hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: command('process.exit(2)') }] }] } }));
      await expect(hooks.run('PreToolUse', {}, { spaceId: 's' })).resolves.toMatchObject({ blocked: true });
      await writeFile(file, '{broken');
      await expect(hooks.run('PreToolUse', {}, { spaceId: 's' })).rejects.toThrow();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('fails closed when an explicitly configured administrator file is missing', () => {
    expect(() => GatewayHooks.load(join(tmpdir(), `missing-hooks-${process.pid}-${Date.now()}.json`))).toThrow();
  });

  it('posts lifecycle JSON to a real HTTP hook and rejects redirects and non-success responses', async () => {
    const bodies: any[] = [];
    const server = createServer(async (request, response) => {
      let body = ''; for await (const chunk of request) body += chunk;
      bodies.push(JSON.parse(body));
      if (request.url === '/redirect') { response.writeHead(302, { location: '/deny' }); response.end(); return; }
      if (request.url === '/error') { response.writeHead(500); response.end(); return; }
      response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ decision: 'block', reason: 'HTTP denied' }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const hook = (path: string) => new GatewayHooks({ trustedSpaces: ['s'], hooks: { PreToolUse: [{ hooks: [{ type: 'http', url: `http://127.0.0.1:${address.port}${path}` } as any] }] } });
    try {
      await expect(hook('/deny').run('PreToolUse', { tool_name: 'write' }, { spaceId: 's' })).resolves.toMatchObject({ blocked: true, reason: 'HTTP denied' });
      expect(bodies[0]).toMatchObject({ hook_event_name: 'PreToolUse', tool_name: 'write' });
      await expect(hook('/redirect').run('PreToolUse', {}, { spaceId: 's' })).rejects.toThrow();
      await expect(hook('/error').run('PreToolUse', {}, { spaceId: 's' })).rejects.toThrow();
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });

  it('evaluates prompt hooks without exposing tools and validates the structured verdict', async () => {
    const generate = jest.fn().mockResolvedValue({ text: JSON.stringify({ ok: false, reason: 'needs verification' }), toolCalls: [] });
    const hooks = new GatewayHooks({ trustedSpaces: ['s'], hooks: { Stop: [{ hooks: [{ type: 'prompt', prompt: 'Check $ARGUMENTS' }] }] } }, process.cwd(), undefined, { generate });
    await expect(hooks.run('Stop', { answer: 'done' }, { spaceId: 's' })).resolves.toMatchObject({ blocked: true, reason: 'needs verification' });
    expect(generate.mock.calls[0][0].messages[0].text).toContain('"answer":"done"');
    expect(generate.mock.calls[0][0].tools).toBeUndefined();
    generate.mockResolvedValue({ text: '{"ok":"yes"}', toolCalls: [] });
    await expect(hooks.run('Stop', {}, { spaceId: 's' })).rejects.toThrow();
  });

  it('aborts the underlying prompt model request on timeout', async () => {
    let request: any;
    const hooks = new GatewayHooks({ trustedSpaces: ['s'], hooks: { Stop: [{ hooks: [{ type: 'prompt', prompt: 'check', timeout: 0.01 }] }] } }, process.cwd(), undefined, {
      generate: async (input) => { request = input; return new Promise(() => {}); },
    });
    await expect(hooks.run('Stop', {}, { spaceId: 's' })).rejects.toThrow('Hook timeout');
    expect(request.signal?.aborted).toBe(true);
  });

  it('enforces URL restrictions before sending and interpolates only allowed header variables', async () => {
    const previous = process.env.OCEAN_HOOK_TEST_TOKEN;
    process.env.OCEAN_HOOK_TEST_TOKEN = 'safe\r\nInjected: value';
    const headers: any[] = [];
    const server = createServer((request, response) => { headers.push(request.headers); request.resume(); response.end('{}'); });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/allowed`;
    const config: any = { trustedSpaces: ['s'], allowedHttpHookUrls: [url], httpHookAllowedEnvVars: ['OCEAN_HOOK_TEST_TOKEN'],
      hooks: { Stop: [{ hooks: [{ type: 'http', url, headers: { 'x-token': '$OCEAN_HOOK_TEST_TOKEN', 'x-secret': '${PATH}' } }] }] } };
    try {
      await expect(new GatewayHooks(config).run('Stop', {}, { spaceId: 's' })).resolves.toMatchObject({ blocked: false });
      expect(headers[0]['x-token']).toBe('safeInjected: value');
      expect(headers[0]['x-secret']).toBe('');
      config.allowedHttpHookUrls = [];
      await expect(new GatewayHooks(config).run('Stop', {}, { spaceId: 's' })).rejects.toThrow('not allowed');
      expect(headers).toHaveLength(1);
      config.allowedHttpHookUrls = [url + '*'];
      config.hooks.Stop[0].hooks[0].url = url + '/child';
      await expect(new GatewayHooks(config).run('Stop', {}, { spaceId: 's' })).resolves.toMatchObject({ blocked: false });
    } finally {
      if (previous === undefined) delete process.env.OCEAN_HOOK_TEST_TOKEN; else process.env.OCEAN_HOOK_TEST_TOKEN = previous;
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

});
