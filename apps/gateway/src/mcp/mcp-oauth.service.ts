import {
  BadRequestException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

export interface MCPOAuthServer {
  serverUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
  scope?: string;
}
export interface MCPOAuthOptions {
  root: string;
  key: string;
  servers: Record<string, MCPOAuthServer>;
}
interface Pending {
  userId: string;
  serverId: string;
  verifier: string;
  expiresAt: number;
  binding: string;
  epoch: string;
}
interface Tokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  binding: string;
}

@Injectable()
export class MCPOAuthService {
  private readonly options: MCPOAuthOptions;
  constructor(
    @Optional() @Inject('MCP_OAUTH_OPTIONS') options?: MCPOAuthOptions,
  ) {
    this.options = options ?? {
      root:
        process.env.OCEAN_MCP_OAUTH_ROOT ?? join(homedir(), '.ocean', 'oauth'),
      key: process.env.OCEAN_MCP_OAUTH_KEY ?? '',
      servers: JSON.parse(process.env.OCEAN_MCP_OAUTH_SERVERS ?? '{}'),
    };
  }
  private server(id: string): MCPOAuthServer {
    if (!Object.hasOwn(this.options.servers, id))
      throw new BadRequestException('Unknown OAuth server');
    const config = this.options.servers[id];
    for (const value of [
      config.serverUrl,
      config.authorizationUrl,
      config.tokenUrl,
      config.redirectUri,
    ]) {
      const url = new URL(value);
      if (
        url.username ||
        url.password ||
        url.hash ||
        (url.protocol !== 'https:' &&
          !(
            url.protocol === 'http:' &&
            ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
          ))
      )
        throw new Error('Unsafe OAuth endpoint');
    }
    if (
      !config.clientId ||
      Buffer.from(this.options.key, 'base64').length !== 32
    )
      throw new Error('OAuth client and 32-byte encryption key required');
    return config;
  }
  private binding(config: MCPOAuthServer) {
    return createHash('sha256').update(JSON.stringify(config)).digest('hex');
  }
  private tokenId(userId: string, serverId: string) {
    if (typeof userId !== 'string' || !userId || userId.length > 200)
      throw new UnauthorizedException();
    return `token-${createHash('sha256')
      .update(JSON.stringify([userId, serverId]))
      .digest('hex')}`;
  }
  private async directory() {
    await fs.mkdir(this.options.root, { recursive: true, mode: 0o700 });
    const info = await fs.lstat(this.options.root);
    if (!info.isDirectory() || info.isSymbolicLink() || info.mode & 0o077)
      throw new Error('Unsafe OAuth credential directory');
  }
  private async write(id: string, value: unknown) {
    await this.directory();
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      Buffer.from(this.options.key, 'base64'),
      iv,
    );
    cipher.setAAD(Buffer.from(id));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    const bytes = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]);
    const temporary = join(
      this.options.root,
      `.tmp-${randomBytes(16).toString('hex')}`,
    );
    try {
      const handle = await fs.open(temporary, 'wx', 0o600);
      try {
        await handle.writeFile(bytes.toString('base64'));
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temporary, join(this.options.root, id));
      const directory = await fs.open(this.options.root, 'r');
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    } finally {
      await fs.rm(temporary, { force: true });
    }
  }
  private async read<T>(id: string): Promise<T> {
    await this.directory();
    const handle = await fs.open(
      join(this.options.root, id),
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
    );
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > 128 * 1024 || info.mode & 0o077)
        throw new Error('Unsafe OAuth credential file');
      const bytes = Buffer.from(await handle.readFile('utf8'), 'base64');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        Buffer.from(this.options.key, 'base64'),
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString(),
      );
    } finally {
      await handle.close();
    }
  }
  private async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    await this.directory();
    const lock = join(this.options.root, `${id}.lock`);
    const deadline = Date.now() + 15000;
    for (;;) {
      try {
        await fs.mkdir(lock, { mode: 0o700 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() >= deadline)
          throw new Error('OAuth credential lock unavailable');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    try {
      return await action();
    } finally {
      await fs.rmdir(lock);
    }
  }
  private async epoch(id: string): Promise<string> {
    try {
      return (await this.read<{ value: string }>(`epoch-${id}`)).value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'initial';
      throw error;
    }
  }
  private async remove(id: string) {
    await fs.rm(join(this.options.root, id), { force: true });
    const handle = await fs.open(this.options.root, 'r');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }
  async authorize(userId: string, serverId: string) {
    const config = this.server(serverId);
    this.tokenId(userId, serverId);
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const id = this.tokenId(userId, serverId);
    await this.locked(id, async () => {
      await this.write(`state-${state}`, {
        userId,
        serverId,
        verifier,
        expiresAt: Date.now() + 600000,
        binding: this.binding(config),
        epoch: await this.epoch(id),
      } satisfies Pending);
    });
    const url = new URL(config.authorizationUrl);
    for (const [key, value] of Object.entries({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource: config.serverUrl,
      ...(config.scope ? { scope: config.scope } : {}),
    }))
      url.searchParams.set(key, value);
    return { authorizationUrl: url.href };
  }
  private async exchange(
    config: MCPOAuthServer,
    params: Record<string, string>,
    previous?: Tokens,
  ): Promise<Tokens> {
    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        ...params,
        client_id: config.clientId,
        resource: config.serverUrl,
        ...(config.clientSecret ? { client_secret: config.clientSecret } : {}),
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new UnauthorizedException('OAuth token exchange failed');
    }
    let size = 0;
    const chunks: Buffer[] = [];
    if (response.body)
      for await (const chunk of response.body as any) {
        size += chunk.byteLength;
        if (size > 64 * 1024) throw new Error('OAuth response too large');
        chunks.push(Buffer.from(chunk));
      }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    if (
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      /[\r\n\0]/.test(data.access_token) ||
      String(data.token_type).toLowerCase() !== 'bearer' ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0 ||
      (data.refresh_token !== undefined &&
        typeof data.refresh_token !== 'string')
    )
      throw new Error('Invalid OAuth token response');
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? previous?.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      binding: this.binding(config),
    };
  }
  async callback(state: string, code: string) {
    if (
      !/^[A-Za-z0-9_-]{43}$/.test(state) ||
      typeof code !== 'string' ||
      !code ||
      code.length > 8192
    )
      throw new BadRequestException('Invalid OAuth callback');
    return this.locked(`state-${state}`, async () => {
      let pending: Pending;
      try {
        pending = await this.read<Pending>(`state-${state}`);
      } catch {
        throw new BadRequestException('Invalid or consumed OAuth state');
      }
      await this.remove(`state-${state}`);
      const config = this.server(pending.serverId);
      if (
        pending.expiresAt <= Date.now() ||
        pending.binding !== this.binding(config)
      )
        throw new BadRequestException('Expired OAuth state');
      const id = this.tokenId(pending.userId, pending.serverId);
      await this.locked(id, async () => {
        if (pending.epoch !== (await this.epoch(id)))
          throw new BadRequestException('OAuth authorization revoked');
        await this.write(
          id,
          await this.exchange(config, {
            grant_type: 'authorization_code',
            code,
            code_verifier: pending.verifier,
            redirect_uri: config.redirectUri,
          }),
        );
      });
      return { connected: true, serverId: pending.serverId };
    });
  }
  async accessToken(userId: string, serverId: string): Promise<string> {
    const config = this.server(serverId);
    const id = this.tokenId(userId, serverId);
    return this.locked(id, async () => {
      let tokens: Tokens;
      try {
        tokens = await this.read<Tokens>(id);
      } catch {
        throw new UnauthorizedException('MCP OAuth authorization required');
      }
      if (tokens.binding !== this.binding(config))
        throw new UnauthorizedException('MCP OAuth configuration changed');
      if (tokens.expiresAt <= Date.now()) {
        if (!tokens.refreshToken)
          throw new UnauthorizedException('MCP OAuth authorization expired');
        tokens = await this.exchange(
          config,
          { grant_type: 'refresh_token', refresh_token: tokens.refreshToken },
          tokens,
        );
        await this.write(id, tokens);
      }
      return tokens.accessToken;
    });
  }
  async disconnect(userId: string, serverId: string) {
    const id = this.tokenId(userId, serverId);
    await this.locked(id, async () => {
      await this.write(`epoch-${id}`, {
        value: randomBytes(32).toString('base64url'),
      });
      await this.remove(id);
    });
    return { connected: false };
  }
  transportFetch(
    userId: string,
    serverId: string,
    serverUrl: string,
  ): typeof fetch | undefined {
    if (!Object.hasOwn(this.options.servers, serverId)) return undefined;
    const config = this.server(serverId);
    if (new URL(serverUrl).href !== new URL(config.serverUrl).href)
      throw new Error('OAuth resource binding mismatch');
    return async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== new URL(config.serverUrl).origin)
        throw new Error('OAuth cross-origin request denied');
      const headers = new Headers(
        input instanceof Request ? input.headers : undefined,
      );
      new Headers(init?.headers).forEach((value, key) =>
        headers.set(key, value),
      );
      headers.set(
        'authorization',
        `Bearer ${await this.accessToken(userId, serverId)}`,
      );
      return fetch(input, { ...init, headers, redirect: 'error' });
    };
  }
}
