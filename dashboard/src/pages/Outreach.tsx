import { useState } from "react";
import { useApi } from "../hooks/useApi";
import { DraftCard } from "../components/DraftCard";

const TABS = ["all", "pending", "approved", "sent", "discarded"] as const;

export default function Outreach() {
  const [tab, setTab] = useState<string>("all");
  const statusParam = tab === "all" ? "" : `?status=${tab}`;
  const { data, loading, refetch } = useApi<{ drafts: any[] }>(`/api/outreach/drafts${statusParam}`);

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Outreach Drafts</h1>
      <div className="flex gap-1 mb-6 bg-[#111118] rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs capitalize transition-colors ${
              tab === t ? "bg-indigo-500/15 text-indigo-400" : "text-[#666] hover:text-[#999]"
            }`}>{t}</button>
        ))}
      </div>
      <div className="space-y-3">
        {data?.drafts?.map((draft) => (<DraftCard key={draft.id} draft={draft} onUpdate={refetch} />))}
      </div>
      {!loading && (!data?.drafts || data.drafts.length === 0) && (
        <div className="text-center text-[#666] mt-12">
          <p>No outreach drafts{tab !== "all" ? ` with status "${tab}"` : ""}.</p>
        </div>
      )}
    </div>
  );
}
