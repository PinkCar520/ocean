import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SsoAuthGuard } from './sso.guard';
import { UserService } from './user.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'uclaw-secret-key-2024',
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    UserService,
    AuthService,
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: SsoAuthGuard, // 保持 SSO Guard 兼容性，内含自动影子同步逻辑
    },
  ],
  exports: [UserService, AuthService],
})
export class AuthModule {}
