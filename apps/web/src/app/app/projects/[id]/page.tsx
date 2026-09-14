import OceanShell from '../../../../App';
import { getOceanServerBootstrap } from '../../../../lib/server-session';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bootstrap = await getOceanServerBootstrap({
    projectId: id,
    includeProjects: true,
  });
  if (!bootstrap) redirect('/auth');

  return (
    <OceanShell
      key={id}
      initialAuthenticated
      initialUser={bootstrap.user}
      initialConversations={bootstrap.conversations}
      initialModels={bootstrap.models}
      initialProjects={bootstrap.projects}
      initialSkills={bootstrap.skills}
      initialSkillStats={bootstrap.skillStats}
      initialTab="projects"
      initialActiveProject={bootstrap.knowledgeProject}
      initialKnowledgeDocuments={bootstrap.knowledgeDocuments}
      initialKnowledgeStats={bootstrap.knowledgeStats}
    />
  );
}
