import { useApi } from "../hooks/useApi";
import { RepoCard } from "../components/RepoCard";

interface SubAgent {
  id: string; type: string; name: string;
  config: { repos?: string[]; include_prs?: boolean };
}

export default function GitHub() {
  const { data: agentData } = useApi<{ sub_agents: SubAgent[] }>("/api/sub-agents");
  const githubAgents = agentData?.sub_agents?.filter((a) => a.type === "github_activity") ?? [];
  const repos = githubAgents.flatMap((a) => a.config.repos ?? []);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">GitHub Activity</h1>
        <span className="text-xs text-[#666]">Last 24 hours</span>
      </div>
      <div className="space-y-4">
        {repos.map((repo) => (<RepoCard key={repo} repo={repo} commits={[]} prs={[]} />))}
      </div>
      {repos.length === 0 && (
        <div className="text-center text-[#666] mt-12">
          <p>No repositories tracked.</p>
          <a href="/settings" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">Add a GitHub activity source in Settings</a>
        </div>
      )}
    </div>
  );
}
