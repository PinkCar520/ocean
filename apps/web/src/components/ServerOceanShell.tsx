import OceanShell from '../App';
import { getOceanServerBootstrap } from '../lib/server-session';
import { redirect } from 'next/navigation';

export default async function ServerOceanShell({
  initialTab,
  preloadAll = false,
}: {
  initialTab?: string;
  preloadAll?: boolean;
}) {
  const bootstrap = await getOceanServerBootstrap({
    includeModels: preloadAll || initialTab === 'chat',
    includeProjects: preloadAll || initialTab === 'projects',
    includeSkills: preloadAll || initialTab === 'library',
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
      initialPermissionMode={bootstrap.permissionMode}
    />
  );
}
