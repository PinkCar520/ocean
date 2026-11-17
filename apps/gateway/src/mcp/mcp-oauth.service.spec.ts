import { createServer } from 'node:http';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { MCPOAuthService } from './mcp-oauth.service';

describe('MCP OAuth real token endpoint', () => {
  it('binds PKCE/state, encrypts tenant tokens, rejects callback replay and serializes rotated refresh', async () => {
    const root = await mkdtemp(join(tmpdir(), 'ocean-oauth-'));
    let challenge = '';
    let refreshes = 0;
    const server = createServer(async (request, response) => {
      if (request.url === '/mcp') {
        response.setHeader('content-type', 'application/json');
        response.end(
          JSON.stringify({ authorization: request.headers.authorization }),
        );
        return;
      }
      let body = '';
      for await (const chunk of request) body += chunk;
      const params = new URLSearchParams(body);
      if (params.get('grant_type') === 'authorization_code') {
        expect(
          createHash('sha256')
            .update(params.get('code_verifier')!)
            .digest('base64url'),
        ).toBe(challenge);
        expect(params.get('resource')).toContain('/mcp');
      } else {
        refreshes++;
        expect(params.get('refresh_token')).toBe('refresh-secret');
      }
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          access_token: refreshes ? 'refreshed-secret' : 'access-secret',
          token_type: 'Bearer',
          expires_in: refreshes ? 3600 : 1,
          refresh_token: refreshes ? 'rotated-secret' : 'refresh-secret',
        }),
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const options = {
      root,
      key: randomBytes(32).toString('base64'),
      servers: {
        test: {
          serverUrl: base + '/mcp',
          authorizationUrl: base + '/authorize',
          tokenUrl: base + '/token',
          redirectUri: 'http://127.0.0.1:4321/api/mcp-oauth/callback',
          clientId: 'ocean',
          scope: 'tools',
        },
      },
    };
    try {
      const service = new MCPOAuthService(options);
      const { authorizationUrl } = await service.authorize('alice', 'test');
      const url = new URL(authorizationUrl);
      challenge = url.searchParams.get('code_challenge')!;
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      const state = url.searchParams.get('state')!;
      expect(await service.callback(state, 'code')).toEqual({
        connected: true,
        serverId: 'test',
      });
      await expect(service.callback(state, 'code')).rejects.toThrow();
      await expect(service.accessToken('bob', 'test')).rejects.toThrow();
      expect(await service.accessToken('alice', 'test')).toBe('access-secret');
      const authenticatedFetch = service.transportFetch(
        'alice',
        'test',
        base + '/mcp',
      )!;
      expect(await (await authenticatedFetch(base + '/mcp')).json()).toEqual({
        authorization: 'Bearer access-secret',
      });
      await expect(
        authenticatedFetch('https://another.example/mcp'),
      ).rejects.toThrow('cross-origin');
      expect(() =>
        service.transportFetch('alice', 'test', base + '/other'),
      ).toThrow('binding');
      const files = await readdir(root);
      for (const file of files)
        expect(await readFile(join(root, file), 'utf8')).not.toMatch(
          /access-secret|refresh-secret|code_verifier/,
        );
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const restarted = new MCPOAuthService(options);
      expect(
        await Promise.all([
          service.accessToken('alice', 'test'),
          restarted.accessToken('alice', 'test'),
        ]),
      ).toEqual(['refreshed-secret', 'refreshed-secret']);
      expect(refreshes).toBe(1);
      await service.disconnect('alice', 'test');
      await expect(restarted.accessToken('alice', 'test')).rejects.toThrow();
      const pending = new URL(
        (await service.authorize('alice', 'test')).authorizationUrl,
      );
      challenge = pending.searchParams.get('code_challenge')!;
      await service.disconnect('alice', 'test');
      await expect(
        service.callback(pending.searchParams.get('state')!, 'late-code'),
      ).rejects.toThrow('revoked');
      const expired = new URL(
        (await service.authorize('alice', 'test')).authorizationUrl,
      );
      const clock = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 600001);
      try {
        await expect(
          service.callback(expired.searchParams.get('state')!, 'late-code'),
        ).rejects.toThrow('Expired');
      } finally {
        clock.mockRestore();
      }
      const changed = new URL(
        (await service.authorize('alice', 'test')).authorizationUrl,
      );
      const changedOptions = {
        ...options,
        servers: {
          test: { ...options.servers.test, clientId: 'another-client' },
        },
      };
      await expect(
        new MCPOAuthService(changedOptions).callback(
          changed.searchParams.get('state')!,
          'code',
        ),
      ).rejects.toThrow('Expired');
      const renewed = new URL(
        (await service.authorize('alice', 'test')).authorizationUrl,
      );
      challenge = renewed.searchParams.get('code_challenge')!;
      await service.callback(renewed.searchParams.get('state')!, 'new-code');
      const wrongKey = new MCPOAuthService({
        ...options,
        key: randomBytes(32).toString('base64'),
      });
      await expect(wrongKey.accessToken('alice', 'test')).rejects.toThrow(
        'authorization required',
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
