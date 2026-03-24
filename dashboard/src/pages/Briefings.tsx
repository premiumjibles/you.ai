import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { DateNav } from "../components/DateNav";
import { HeroCard } from "../components/HeroCard";
import { SourceCard } from "../components/SourceCard";

interface Briefing {
  id: string; date: string; content: string;
  sub_agent_outputs: { name: string; output: string; type?: string }[] | null;
  created_at: string;
}

export default function Briefings() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const { data, loading, refetch } = useApi<{ briefings: Briefing[] }>(`/api/briefings/history?date=${date}`);
  const briefing = data?.briefings?.[0] ?? null;
  const outputs = briefing?.sub_agent_outputs ?? [];

  return (
    <div className="max-w-4xl mx-auto">
      <DateNav date={date} onDateChange={setDate} />
      <HeroCard content={briefing?.content ?? null} isToday={date === today} loading={loading} onGenerated={refetch} />
      {outputs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {outputs.map((output, i) => (
            <div key={i} className="animate-fade-in-up" style={{ '--stagger': i } as React.CSSProperties}>
              <SourceCard name={output.name} output={output.output} type={output.type} />
            </div>
          ))}
        </div>
      )}
      {!loading && !briefing && outputs.length === 0 && (
        <div className="text-center text-[#666] mt-8">
          <p>No data sources configured yet.</p>
          <a href="/settings" className="text-indigo-400 hover:text-indigo-300 text-sm mt-2 inline-block">Add data sources in Settings</a>
        </div>
      )}
    </div>
  );
}
