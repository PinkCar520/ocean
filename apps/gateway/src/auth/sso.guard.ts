import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UserService } from './user.service';

@Injectable()
export class SsoAuthGuard implements CanActivate {
  constructor(private userService: UserService) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ssoToken = request.headers['x-sso-token'] || request.headers['authorization'];

    // 严谨校验：不再允许 mock-token，必须有合法的 SSO 令牌
    if (!ssoToken) {
      throw new UnauthorizedException('Authentication Failed: Missing SSO Token.');
    }

    // 提取工号（必须由上游网关或 SSO 注入）
    const workId = request.headers['x-user-id'] as string;
    if (!workId) {
      throw new UnauthorizedException('Authentication Failed: Missing Work-ID.');
    }

    const userName = (request.headers['x-user-name'] as string) || workId;

    // 同步影子用户到数据库
    const dbUser = await this.userService.syncUserFromSso(workId, userName);

    // 将真实的持久化 ID 注入 Context
    request.user = {
      workId: workId,
      dbId: dbUser?.id,
      name: dbUser?.name || userName,
      preferences: dbUser?.preferences,
      role: 'developer',
    };

    return true;
  }
}
