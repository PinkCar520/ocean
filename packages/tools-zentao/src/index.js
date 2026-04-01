"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZentaoTool = void 0;
const axios_1 = __importDefault(require("axios"));
class ZentaoTool {
    client = null;
    isMock = true;
    mockBugs = [
        {
            id: 'BUG-2048',
            title: 'UI Crash: Navigation bar disappears when resizing window on iOS 16 Safari',
            status: 'active',
            assignee: 'Mei Feng Li',
            severity: 'high',
            createdAt: '2026-03-31',
            description: 'The navigation bar component fails to recalculate layout dimensions on orientation change.',
        }
    ];
    constructor(config) {
        if (config?.baseUrl && !config.isMock) {
            this.isMock = false;
            this.client = axios_1.default.create({
                baseURL: config.baseUrl,
                headers: {
                    'Token': config.token || '',
                    'Content-Type': 'application/json',
                },
                timeout: 5000,
            });
        }
    }
    async getBugInfo(bugId) {
        console.log(`[@uclaw/tools-zentao] Fetching bug: ${bugId} (Mode: ${this.isMock ? 'Mock' : 'API'})`);
        if (this.isMock || !this.client) {
            const bug = this.mockBugs.find(b => b.id.includes(bugId) || bugId.includes(b.id));
            return bug || null;
        }
        try {
            const numericId = bugId.replace(/[^0-9]/g, '');
            const response = await this.client.get(`/api.php/v1/bugs/${numericId}`);
            const data = response.data;
            return {
                id: `BUG-${data.id}`,
                title: data.title,
                status: this.mapStatus(data.status),
                assignee: data.assignedTo?.realname || data.assignedTo || 'Unassigned',
                severity: this.mapSeverity(data.severity),
                createdAt: data.openedDate,
                description: data.steps || data.description || '',
            };
        }
        catch (err) {
            console.error(`[@uclaw/tools-zentao] API Error:`, err.message);
            return null;
        }
    }
    async searchBugs(query) {
        console.log(`[@uclaw/tools-zentao] Searching bugs with query: ${query} (Mode: ${this.isMock ? 'Mock' : 'API'})`);
        if (this.isMock || !this.client) {
            const normalizedQuery = query.toLowerCase();
            return this.mockBugs.filter((bug) => bug.title.toLowerCase().includes(normalizedQuery) ||
                bug.id.toLowerCase().includes(normalizedQuery));
        }
        try {
            const response = await this.client.get('/api.php/v1/bugs', {
                params: { title: query }
            });
            const items = Array.isArray(response.data.bugs) ? response.data.bugs : [];
            return items.map((data) => ({
                id: `BUG-${data.id}`,
                title: data.title,
                status: this.mapStatus(data.status),
                assignee: data.assignedTo?.realname || data.assignedTo || 'Unassigned',
                severity: this.mapSeverity(data.severity),
                createdAt: data.openedDate,
                description: '',
            }));
        }
        catch (err) {
            console.error(`[@uclaw/tools-zentao] API Search Error:`, err.message);
            return [];
        }
    }
    mapStatus(status) {
        const s = status.toLowerCase();
        if (s === 'active' || s === 'doing')
            return 'active';
        if (s === 'resolved' || s === 'done')
            return 'resolved';
        return 'closed';
    }
    mapSeverity(severity) {
        const s = Number(severity);
        if (s === 1 || s === 2)
            return 'high';
        if (s === 3)
            return 'medium';
        return 'low';
    }
}
exports.ZentaoTool = ZentaoTool;
//# sourceMappingURL=index.js.map