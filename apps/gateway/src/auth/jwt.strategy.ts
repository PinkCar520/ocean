import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { OCEAN_SESSION_COOKIE, readCookie } from './auth-cookie';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => readCookie(request?.headers?.cookie, OCEAN_SESSION_COOKIE) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'ocean-secret-key-2024',
    });
  }

  async validate(payload: any) {
    return { 
      userId: payload.sub, 
      workId: payload.workId, 
      email: payload.email, 
      name: payload.name 
    };
  }
}
