import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { useApi } from "./hooks/useApi";
import Briefings from "./pages/Briefings";
import GitHub from "./pages/GitHub";
import Outreach from "./pages/Outreach";
import Import from "./pages/Import";
import Settings from "./pages/Settings";

export default function App() {
  const { data } = useApi<{ sub_agents: { type: string }[] }>("/api/sub-agents");
  const hasGithub = data?.sub_agents?.some((a) => a.type === "github_activity") ?? false;

  return (
    <BrowserRouter>
      <div className="flex h-screen bg-[#0a0a0f] text-[#e2e8f0] overflow-hidden">
        <Sidebar hasGithub={hasGithub} />
        <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6">
          <Routes>
            <Route path="/" element={<Briefings />} />
            <Route path="/github" element={<GitHub />} />
            <Route path="/outreach" element={<Outreach />} />
            <Route path="/import" element={<Import />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
