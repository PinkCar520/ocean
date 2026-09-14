import OceanShell from '../App';
import { getOceanServerBootstrap } from '../lib/server-session';
import { redirect } from 'next/navigation';

export default async function ServerOceanShell({ initialTab }: { initialTab?: string }) {
  const bootstrap = await getOceanServerBootstrap({
    includeModels: initialTab === 'chat',
    includeProjects: initialTab === 'projects',
    includeSkills: initialTab === 'library',
  });
  if (!bootstrap) redirect('/auth');

  return (
    <OceanShell
      initialAuthenticated
      initialUser={bootstrap.user}
      initialConversations={bootstrap.conversations}
      initialModels={bootstrap.models}
      initialProjects={bootstrap.projects}
      initialSkills={bootstrap.skills}
      initialSkillStats={bootstrap.skillStats}
      initialTab={initialTab}
    />
  );
}
