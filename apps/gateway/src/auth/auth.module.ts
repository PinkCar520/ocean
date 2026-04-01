import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SsoAuthGuard } from './sso.guard';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: SsoAuthGuard,
    },
  ],
})
export class AuthModule {}
