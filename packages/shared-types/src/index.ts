export interface UClawBaseEvent {
  eventId: string;
  source: 'web' | 'cli' | 'im';
  timestamp: number;
}

export interface BugDetail {
  id: string;
  title: string;
  status: 'active' | 'resolved' | 'closed';
  assignee: string;
  severity: 'low' | 'medium' | 'high';
  createdAt: string;
  description: string;
}

export interface UClawLocalActionRequest {
  toolName: string;
  args: Record<string, any>;
}
