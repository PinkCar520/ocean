import { cookies } from 'next/headers';

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

export async function getOceanServerBootstrap(options: {
  sessionId?: string;
  projectId?: string;
} = {}): Promise<OceanServerBootstrap | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return null;

  const gatewayUrl = process.env.OCEAN_GATEWAY_URL ?? 'http://localhost:3000';
  const request = (path: string) => fetch(`${gatewayUrl}${path}`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });

  try {
    const [profileResponse, conversationsResponse, messagesResponse, modelsResponse, projectsResponse, skillsResponse, skillStatsResponse, projectResponse, documentsResponse, knowledgeStatsResponse] = await Promise.all([
      request('/api/user/profile'),
      request('/api/sessions'),
      options.sessionId ? request(`/api/sessions/${encodeURIComponent(options.sessionId)}/messages`) : null,
      request('/api/chat/models'),
      request('/api/knowledge-projects'),
      request('/api/skills'),
      request('/api/skills/stats'),
      options.projectId ? request(`/api/knowledge-projects/${encodeURIComponent(options.projectId)}`) : null,
      options.projectId ? request(`/api/rag/documents?projectId=${encodeURIComponent(options.projectId)}`) : null,
      options.projectId ? request('/api/rag/stats') : null,
    ]);

    if (!profileResponse.ok) return null;

    const [profilePayload, conversationsPayload, messagesPayload, modelsPayload, projectsPayload, skillsPayload, skillStatsPayload, projectPayload, documentsPayload, knowledgeStatsPayload] = await Promise.all([
      profileResponse.json() as Promise<GatewayPayload>,
      conversationsResponse.ok ? conversationsResponse.json() as Promise<GatewayPayload> : null,
      messagesResponse?.ok ? messagesResponse.json() as Promise<GatewayPayload> : null,
      modelsResponse.ok ? modelsResponse.json() as Promise<GatewayPayload> : null,
      projectsResponse.ok ? projectsResponse.json() as Promise<GatewayPayload> : null,
      skillsResponse.ok ? skillsResponse.json() as Promise<GatewayPayload> : null,
      skillStatsResponse.ok ? skillStatsResponse.json() as Promise<GatewayPayload> : null,
      projectResponse?.ok ? projectResponse.json() as Promise<GatewayPayload> : null,
      documentsResponse?.ok ? documentsResponse.json() as Promise<GatewayPayload> : null,
      knowledgeStatsResponse?.ok ? knowledgeStatsResponse.json() as Promise<GatewayPayload> : null,
    ]);

    if (!profilePayload.success || !profilePayload.profile) return null;

    return {
      user: profilePayload.profile,
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
