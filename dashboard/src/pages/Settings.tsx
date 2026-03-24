import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { apiFetch } from "../api";
import { SettingsSection } from "../components/SettingsSection";

interface SubAgent { id: string; type: string; name: string; config: Record<string, any>; active: boolean; }

export default function Settings() {
  const { data: agentData, refetch: refetchAgents } = useApi<{ sub_agents: SubAgent[] }>("/api/sub-agents");
  const [saving, setSaving] = useState<string | null>(null);

  const saveSettings = async (updates: Record<string, string>) => {
    setSaving("settings");
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify(updates) });
    } finally {
      setSaving(null);
    }
  };

  const toggleAgent = async (id: string, active: boolean) => {
    await apiFetch(`/api/sub-agents/${id}`, { method: "PATCH", body: JSON.stringify({ active }) });
    refetchAgents();
  };

  const deleteAgent = async (id: string) => {
    await apiFetch(`/api/sub-agents/${id}`, { method: "DELETE" });
    refetchAgents();
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Settings</h1>
      <div className="space-y-4">
        <SettingsSection title="LLM Provider" defaultOpen>
          <ProviderForm label="Provider" options={["anthropic", "venice"]} envKey="LLM_PROVIDER"
            apiKeyLabel="API Key" apiKeyEnvKey="ANTHROPIC_API_KEY" onSave={saveSettings} saving={saving === "settings"} />
        </SettingsSection>

        <SettingsSection title="Messaging Provider">
          <ProviderForm label="Provider" options={["telegram", "whatsapp"]} envKey="MESSAGING_PROVIDER"
            onSave={saveSettings} saving={saving === "settings"} />
          <p className="text-xs text-[#666] mt-3">Changes take effect on next restart.</p>
        </SettingsSection>

        <SettingsSection title="Data Sources" defaultOpen>
          <div className="space-y-3">
            {agentData?.sub_agents?.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between p-3 bg-[#0a0a0f] rounded-lg border border-[#1e1e2e]">
                <div>
                  <div className="text-sm text-[#e2e8f0]">{agent.name}</div>
                  <div className="text-[10px] uppercase tracking-wider text-[#666] mt-0.5">{agent.type}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleAgent(agent.id, !agent.active)}
                    className={`text-xs px-2 py-1 rounded ${agent.active ? "bg-green-500/15 text-green-400" : "bg-[#1e1e2e] text-[#666]"}`}>
                    {agent.active ? "Active" : "Inactive"}
                  </button>
                  <button onClick={() => deleteAgent(agent.id)} className="text-xs text-[#666] hover:text-red-400 transition-colors">Remove</button>
                </div>
              </div>
            ))}
          </div>
        </SettingsSection>

        <SettingsSection title="Briefing Schedule">
          <ScheduleForm onSave={saveSettings} saving={saving === "settings"} />
        </SettingsSection>
      </div>
    </div>
  );
}

function ProviderForm({ label, options, envKey, apiKeyLabel, apiKeyEnvKey, onSave, saving }: {
  label: string; options: string[]; envKey: string; apiKeyLabel?: string; apiKeyEnvKey?: string;
  onSave: (updates: Record<string, string>) => Promise<void>; saving: boolean;
}) {
  const [selected, setSelected] = useState(options[0]);
  const [apiKey, setApiKey] = useState("");
  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-[#666] uppercase tracking-wider block mb-1.5">{label}</label>
        <div className="flex gap-2">
          {options.map((opt) => (
            <button key={opt} onClick={() => setSelected(opt)}
              className={`px-3 py-1.5 rounded-md text-sm capitalize transition-colors ${
                selected === opt ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30" : "bg-[#0a0a0f] text-[#666] border border-[#1e1e2e] hover:text-[#999]"
              }`}>{opt}</button>
          ))}
        </div>
      </div>
      {apiKeyLabel && apiKeyEnvKey && (
        <div>
          <label className="text-xs text-[#666] uppercase tracking-wider block mb-1.5">{apiKeyLabel}</label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter key..."
            className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-indigo-500/50" />
        </div>
      )}
      <button onClick={() => { const updates: Record<string, string> = { [envKey]: selected }; if (apiKeyEnvKey && apiKey) updates[apiKeyEnvKey] = apiKey; onSave(updates); }}
        disabled={saving} className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md text-sm transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function ScheduleForm({ onSave, saving }: { onSave: (updates: Record<string, string>) => Promise<void>; saving: boolean; }) {
  const [cron, setCron] = useState("0 7 * * *");
  const presets = [{ label: "6 AM", value: "0 6 * * *" }, { label: "7 AM", value: "0 7 * * *" }, { label: "8 AM", value: "0 8 * * *" }];
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {presets.map((p) => (
          <button key={p.value} onClick={() => setCron(p.value)}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              cron === p.value ? "bg-indigo-500/15 text-indigo-400 border border-indigo-500/30" : "bg-[#0a0a0f] text-[#666] border border-[#1e1e2e] hover:text-[#999]"
            }`}>{p.label}</button>
        ))}
      </div>
      <div>
        <label className="text-xs text-[#666] uppercase tracking-wider block mb-1.5">Cron Expression</label>
        <input value={cron} onChange={(e) => setCron(e.target.value)}
          className="w-full bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-[#e2e8f0] font-mono focus:outline-none focus:border-indigo-500/50" />
      </div>
      <button onClick={() => onSave({ BRIEFING_CRON: cron })} disabled={saving}
        className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-md text-sm transition-colors disabled:opacity-50">
        {saving ? "Saving..." : "Save Schedule"}
      </button>
      <p className="text-xs text-[#666]">Changes take effect on next restart.</p>
    </div>
  );
}
