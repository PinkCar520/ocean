import { Controller, Get, SetMetadata } from '@nestjs/common';
import { AppService } from './app.service';
import { IS_PUBLIC_KEY } from './auth/sso.guard';

const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
