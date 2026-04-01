import { Injectable, OnModuleInit } from '@nestjs/common';
import { ZentaoTool } from '@uclaw/tools-zentao';
import { BugDetail } from '@uclaw/types';

@Injectable()
export class ZentaoService implements OnModuleInit {
  private zentaoTool: ZentaoTool;

  onModuleInit() {
    this.zentaoTool = new ZentaoTool();
  }

  async getBugInfo(bugId: string): Promise<BugDetail | null> {
    return this.zentaoTool.getBugInfo(bugId);
  }

  async searchBugs(query: string): Promise<BugDetail[]> {
    return this.zentaoTool.searchBugs(query);
  }
}
