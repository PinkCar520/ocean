import { cookies } from 'next/headers';
import { cache } from 'react';

export interface OceanServerBootstrap {
  user: Record<string, unknown>;
  conversations: unknown[];
  messages: unknown[];
  models: unknown[];
  projects: unknown[];
  skills: unknown[];
  skillStats: Record<string, unknown>;
  knowledgeProject: Record<string, unknown> | null;
  knowledgeDocuments: unknown[];
  knowledgeStats: Record<string, unknown>;
}

interface GatewayPayload {
  success?: boolean;
  profile?: Record<string, unknown>;
  data?: unknown[] | Record<string, unknown>;
  models?: unknown[];
}

async function oceanServerFetch(path: string) {
  const cookieStore = await cookies();
  const gatewayUrl = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';
  return fetch(`${gatewayUrl}${path}`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
}

export const getOceanServerUser = cache(async (): Promise<Record<string, unknown> | null> => {
  const cookieStore = await cookies();
  if (!cookieStore.has('ocean_session')) return null;

  try {
    const response = await oceanServerFetch('/api/user/profile');
    if (!response.ok) return null;
    const payload = await response.json() as GatewayPayload;
    return payload.success && payload.profile ? payload.profile : null;
  } catch (error) {
    throw new Error('Ocean Gateway is unavailable during server rendering.', { cause: error });
  }
});

export async function getOceanServerBootstrap(options: {
  sessionId?: string;
  projectId?: string;
  includeModels?: boolean;
  includeProjects?: boolean;
  includeSkills?: boolean;
} = {}): Promise<OceanServerBootstrap | null> {
  const cookieStore = await cookies();
  if (!cookieStore.has('ocean_session')) return null;
  const request = oceanServerFetch;

  try {
    const [user, conversationsResponse, messagesResponse, modelsResponse, projectsResponse, skillsResponse, skillStatsResponse, projectResponse, documentsResponse, knowledgeStatsResponse] = await Promise.all([
      getOceanServerUser(),
      request('/api/sessions'),
      options.sessionId ? request(`/api/sessions/${encodeURIComponent(options.sessionId)}/messages`) : null,
      options.includeModels ? request('/api/chat/models') : null,
      options.includeProjects ? request('/api/knowledge-projects') : null,
      options.includeSkills ? request('/api/skills') : null,
      options.includeSkills ? request('/api/skills/stats') : null,
      options.projectId ? request(`/api/knowledge-projects/${encodeURIComponent(options.projectId)}`) : null,
      options.projectId ? request(`/api/rag/documents?projectId=${encodeURIComponent(options.projectId)}`) : null,
      options.projectId ? request('/api/rag/stats') : null,
    ]);

    if (!user) return null;

    const [conversationsPayload, messagesPayload, modelsPayload, projectsPayload, skillsPayload, skillStatsPayload, projectPayload, documentsPayload, knowledgeStatsPayload] = await Promise.all([
      conversationsResponse.ok ? conversationsResponse.json() as Promise<GatewayPayload> : null,
      messagesResponse?.ok ? messagesResponse.json() as Promise<GatewayPayload> : null,
      modelsResponse?.ok ? modelsResponse.json() as Promise<GatewayPayload> : null,
      projectsResponse?.ok ? projectsResponse.json() as Promise<GatewayPayload> : null,
      skillsResponse?.ok ? skillsResponse.json() as Promise<GatewayPayload> : null,
      skillStatsResponse?.ok ? skillStatsResponse.json() as Promise<GatewayPayload> : null,
      projectResponse?.ok ? projectResponse.json() as Promise<GatewayPayload> : null,
      documentsResponse?.ok ? documentsResponse.json() as Promise<GatewayPayload> : null,
      knowledgeStatsResponse?.ok ? knowledgeStatsResponse.json() as Promise<GatewayPayload> : null,
    ]);

    return {
      user,
      conversations: Array.isArray(conversationsPayload?.data) ? conversationsPayload.data : [],
      messages: Array.isArray(messagesPayload?.data) ? messagesPayload.data : [],
      models: Array.isArray(modelsPayload?.models) ? modelsPayload.models : [],
      projects: Array.isArray(projectsPayload?.data) ? projectsPayload.data : [],
      skills: Array.isArray(skillsPayload?.data) ? skillsPayload.data : [],
      skillStats: skillStatsPayload?.data && !Array.isArray(skillStatsPayload.data)
        ? skillStatsPayload.data
        : {},
      knowledgeProject: projectPayload?.data && !Array.isArray(projectPayload.data)
        ? projectPayload.data
        : null,
      knowledgeDocuments: Array.isArray(documentsPayload?.data) ? documentsPayload.data : [],
      knowledgeStats: knowledgeStatsPayload?.data && !Array.isArray(knowledgeStatsPayload.data)
        ? knowledgeStatsPayload.data
        : {},
    };
  } catch (error) {
    throw new Error('Ocean Gateway is unavailable during server rendering.', { cause: error });
  }
}
