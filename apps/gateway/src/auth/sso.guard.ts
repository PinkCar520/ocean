import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserService } from './user.service';
import { ApiKeyService } from './api-key.service';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class SsoAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private userService: UserService,
    private apiKeyService: ApiKeyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] || '';
    const xSsoToken = request.headers['x-sso-token'];

    // ── 1. API Key ──
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token.startsWith('uclaw_sk_')) {
      const user = await this.apiKeyService.findUserByApiKey(token);
      if (user) {
        const dbUser = await this.userService.getUserFullProfile(user.workId);
        request.user = {
          workId: user.workId,
          dbId: user.userId,
          name: dbUser?.name || user.workId,
          preferences: dbUser?.preferences,
          role: 'developer',
          authType: 'api-key',
        };
        return true;
      }
      console.warn('[SsoAuthGuard] Invalid or expired API Key');
      throw new UnauthorizedException('Invalid or expired API Key.');
    }

    // ── 2. JWT Bearer Token (with signature verification and expiry check) ──
    if (token && token.split('.').length === 3) {
      try {
        // Use JwtService to verify signature and expiration
        const payload = this.jwtService.verify(token);
        const dbUser = await this.userService.getUserFullProfile(payload.workId);
        request.user = {
          workId: payload.workId,
          dbId: payload.sub,
          name: payload.name || payload.workId,
          preferences: dbUser?.preferences,
          role: 'developer',
          authType: 'jwt',
        };
        return true;
      } catch (err: any) {
        console.error('[SsoAuthGuard] JWT verification failed:', err.message);
        // JWT verification failed (invalid signature, expired, etc.)
        // Fall through to other auth methods or throw at the end
      }
    }

    // ── 3. SSO Headers ──
    if (xSsoToken) {
      const workId = request.headers['x-user-id'] as string;
      if (!workId) {
        console.warn('[SsoAuthGuard] Missing Work-ID in SSO headers');
        throw new UnauthorizedException('Missing Work-ID.');
      }
      const userName = (request.headers['x-user-name'] as string) || workId;
      const dbUser = await this.userService.syncUserFromSso(workId, userName);
      request.user = {
        workId,
        dbId: dbUser?.id,
        name: dbUser?.name || userName,
        preferences: dbUser?.preferences,
        role: 'developer',
        authType: 'sso',
      };
      return true;
    }

    console.warn('[SsoAuthGuard] Authentication failed: No valid token or SSO headers found');
    console.debug('[SsoAuthGuard] Headers:', JSON.stringify(request.headers));
    throw new UnauthorizedException('Authentication required.');
  }
}
