import { BugDetail } from '@uclaw/types';

export class ZentaoTool {
  // 模拟禅道数据库
  private readonly mockBugs: BugDetail[] = [
    {
      id: 'BUG-2048',
      title: 'UI Crash: Navigation bar disappears when resizing window on iOS 16 Safari',
      status: 'active',
      assignee: 'Mei Feng Li',
      severity: 'high',
      createdAt: '2026-03-31',
      description: 'The navigation bar component fails to recalculate layout dimensions on orientation change.',
    },
    {
      id: 'BUG-1024',
      title: 'Memory Leak: Large file uploads causing Gateway timeout',
      status: 'resolved',
      assignee: 'Zhang San',
      severity: 'high',
      createdAt: '2026-03-20',
      description: 'Streamed uploads were not closing open file handles correctly.',
    }
  ];

  async getBugInfo(bugId: string): Promise<BugDetail | null> {
    console.log(`[@uclaw/tools-zentao] Fetching bug: ${bugId}`);
    const bug = this.mockBugs.find(b => b.id.includes(bugId) || bugId.includes(b.id));
    return bug || null;
  }

  async searchBugs(query: string): Promise<BugDetail[]> {
    console.log(`[@uclaw/tools-zentao] Searching bugs with query: ${query}`);
    const normalizedQuery = query.toLowerCase();

    return this.mockBugs.filter((bug) =>
      bug.id.toLowerCase().includes(normalizedQuery) ||
      bug.title.toLowerCase().includes(normalizedQuery) ||
      bug.description.toLowerCase().includes(normalizedQuery) ||
      bug.assignee.toLowerCase().includes(normalizedQuery) ||
      bug.status.toLowerCase().includes(normalizedQuery) ||
      bug.severity.toLowerCase().includes(normalizedQuery),
    );
  }
}
