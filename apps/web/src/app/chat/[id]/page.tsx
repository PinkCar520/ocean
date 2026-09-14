import OceanShell from '../../../App';
import { getOceanServerBootstrap } from '../../../lib/server-session';

export const dynamic = 'force-dynamic';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bootstrap = await getOceanServerBootstrap({ sessionId: id });
  return (
    <OceanShell
      key={id}
      sessionId={id}
      initialAuthenticated={Boolean(bootstrap)}
      initialUser={bootstrap?.user}
      initialConversations={bootstrap?.conversations}
      initialMessages={bootstrap?.messages}
      initialModels={bootstrap?.models}
      initialProjects={bootstrap?.projects}
      initialSkills={bootstrap?.skills}
      initialSkillStats={bootstrap?.skillStats}
    />
  );
}
