import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    AuthModule,
    PrismaModule,
  ],
  controllers: [UserController],
  providers: [],
  exports: [],
})
export class UserModule {}
