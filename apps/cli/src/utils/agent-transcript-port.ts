import type { ModelMessage } from 'ai';
import type { AgentTranscriptPort } from '@ocean/core';
import type { SessionStore } from './session-store.js';

/** Adapts the existing local session transcript to the portable Agent Core. */
export class SessionTranscriptPort implements AgentTranscriptPort<ModelMessage> {
  constructor(private readonly sessions: SessionStore, private readonly workspace: string) {}

  async load(sessionId: string): Promise<readonly ModelMessage[]> {
    const session = await this.sessions.load(sessionId, this.workspace);
    return structuredClone(session.messages);
  }

  async append(sessionId: string, expectedLength: number, messages: readonly ModelMessage[]): Promise<void> {
    await this.sessions.appendMessages(sessionId, this.workspace, expectedLength, messages);
  }
}
