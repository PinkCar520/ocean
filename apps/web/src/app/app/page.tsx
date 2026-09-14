import OceanShell from '../../App';
import { getOceanServerBootstrap } from '../../lib/server-session';

export const dynamic = 'force-dynamic';

export default async function AppPage() {
  const bootstrap = await getOceanServerBootstrap();
  return (
    <OceanShell
      initialAuthenticated={Boolean(bootstrap)}
      initialUser={bootstrap?.user}
      initialConversations={bootstrap?.conversations}
      initialModels={bootstrap?.models}
      initialProjects={bootstrap?.projects}
      initialSkills={bootstrap?.skills}
      initialSkillStats={bootstrap?.skillStats}
    />
  );
}
