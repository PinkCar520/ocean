import { BugDetail } from '@uclaw/types';
export interface ZentaoConfig {
    baseUrl: string;
    token?: string;
    isMock?: boolean;
}
export declare class ZentaoTool {
    private client;
    private isMock;
    private readonly mockBugs;
    constructor(config?: ZentaoConfig);
    getBugInfo(bugId: string): Promise<BugDetail | null>;
    searchBugs(query: string): Promise<BugDetail[]>;
    private mapStatus;
    private mapSeverity;
}
