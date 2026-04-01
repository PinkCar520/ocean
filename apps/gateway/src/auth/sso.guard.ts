import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class SsoAuthGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    // 增加更鲁棒的 Token 检测，兼容各种 Header 大小写和 Mock 情况
    const ssoToken = request.headers['x-sso-token'] || request.headers['authorization'];

    // POC 期间，我们允许带有 mock 字样的请求直接通过
    if (!ssoToken && !request.query['mock-token']) {
      console.warn('[Guard] Blocked unauthorized request to:', request.url);
      throw new UnauthorizedException('Missing X-SSO-Token in Headers.');
    }

    // 将用户身份注入上下文
    request.user = {
      empId: 'WangEr',
      role: 'developer',
      scopes: ['zentao:write', 'gitlab:read'],
    };

    return true;
  }
}
