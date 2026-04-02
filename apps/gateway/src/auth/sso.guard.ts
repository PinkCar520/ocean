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

    // POC 期间，允许带有 mock 字样的请求通过
    if (!ssoToken && !request.query['mock-token']) {
      throw new UnauthorizedException('Missing X-SSO-Token.');
    }

    // 提取真实工号
    const workId = (request.headers['x-user-id'] as string) || 'Guest';
    const userName = (request.headers['x-user-name'] as string) || workId;

    // 核心变更：同步影子用户到数据库，获取持久化 ID 和偏好
    const dbUser = await this.userService.syncUserFromSso(workId, userName);

    // 将数据库中的“平台用户”对象注入 Context
    request.user = {
      workId: workId,
      dbId: dbUser?.id, // 数据库 UUID
      name: dbUser?.name || userName,
      preferences: dbUser?.preferences,
      role: 'developer',
    };

    return true;
  }
}
