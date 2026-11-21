import { PrismaClient } from '@prisma/client';
import {
  AgentExecutionEngine,
  type AgentModelPort,
  type AgentTranscriptPort,
  type AgentCompletionPort,
  type ToolAuthorization,
} from '@ocean/core';
import { PrismaRuntimeEventStore } from '../run/runtime-event-store';
import { ToolRegistry } from './tool.registry';
import { createGatewayToolHost } from './core-tool-host';
import type { ToolContext } from './tool.types';

/** Gateway host composition of the same portable Agent Core used by local CLI.
 * Existing Gateway Worker continues to own legacy runs during migration.
 */
export function createGatewayAgentCore<Message>(options: {
  prisma: PrismaClient;
  registry: ToolRegistry;
  toolContext: ToolContext;
  model: AgentModelPort<Message>;
  transcript: AgentTranscriptPort<Message>;
  reconcileRecovery?: import('@ocean/core').AgentExecutionPorts<Message>['reconcileRecovery'];
  verifyToolJournal?: import('@ocean/core').AgentExecutionPorts<Message>['verifyToolJournal'];
  completion: AgentCompletionPort<Message>;
  authorization: ToolAuthorization;
  toMessage: (decision: import('@ocean/core').AgentModelDecision, result?: unknown) => Message;
  toMessages?: (decision: import('@ocean/core').AgentModelDecision, result?: unknown) => readonly Message[];
}) {
  const { host, resolveTool } = createGatewayToolHost(options.registry, options.toolContext);
  return new AgentExecutionEngine<Message>({
    events: new PrismaRuntimeEventStore(options.prisma),
    host,
    model: options.model,
    transcript: options.transcript,
    reconcileRecovery: options.reconcileRecovery,
    verifyToolJournal: options.verifyToolJournal,
    authorization: options.authorization,
    resolveTool,
    toMessage: options.toMessage,
    toMessages: options.toMessages,
    completion: options.completion,
  });
}
