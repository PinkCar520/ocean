import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WorkspaceController } from './workspace.controller';
import { WorkspaceService } from './workspace.service';
import { WorkspaceHostController } from './workspace-host.controller';
import { WorkspaceHostService } from './workspace-host.service';

@Module({
  imports: [PrismaModule],
  controllers: [WorkspaceController, WorkspaceHostController],
  providers: [WorkspaceService, WorkspaceHostService],
  exports: [WorkspaceService, WorkspaceHostService],
})
export class WorkspaceModule {}
