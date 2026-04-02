import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { SsoAuthGuard } from './sso.guard';
import { UserService } from './user.service';

@Module({
  providers: [
    UserService,
    {
      provide: APP_GUARD,
      useClass: SsoAuthGuard,
    },
  ],
  exports: [UserService],
})
export class AuthModule {}
