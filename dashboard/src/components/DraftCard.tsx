import { useState } from "react";
import { apiFetch } from "../api";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-500/15 text-yellow-400",
  approved: "bg-green-500/15 text-green-400",
  sent: "bg-blue-500/15 text-blue-400",
  discarded: "bg-[#1e1e2e] text-[#666]",
};

interface Draft {
  id: string; contact_name: string | null; contact_company: string | null;
  message: string; context: Record<string, any>; status: string; created_at: string;
}

interface DraftCardProps { draft: Draft; onUpdate: () => void; }

export function DraftCard({ draft, onUpdate }: DraftCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [editedMessage, setEditedMessage] = useState(draft.message);
  const [updating, setUpdating] = useState(false);

  const updateStatus = async (status: string, message?: string) => {
    setUpdating(true);
    try {
      await apiFetch(`/api/outreach/drafts/${draft.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, ...(message ? { message } : {}) }),
      });
      onUpdate();
    } finally {
      setUpdating(false);
      setExpanded(false);
    }
  };

  return (
    <div className="rounded-lg bg-[#111118] card-shadow overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left p-4 hover:bg-[#161620] transition-colors">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-medium text-[#e2e8f0] truncate">{draft.contact_name || "Unknown contact"}</div>
            {draft.contact_company && <div className="text-xs text-[#666] mt-0.5">{draft.contact_company}</div>}
          </div>
          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[draft.status]}`}>
            {draft.status}
          </span>
        </div>
        {!expanded && <p className="text-sm text-[#999] mt-2 line-clamp-2">{draft.message}</p>}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#1e1e2e]">
          <textarea value={editedMessage} onChange={(e) => setEditedMessage(e.target.value)}
            className="w-full mt-3 bg-[#0a0a0f] border border-[#1e1e2e] rounded-lg p-3 text-sm text-[#e2e8f0] resize-y min-h-[120px] focus:outline-none focus:border-indigo-500/50"
            rows={6} />
          <div className="flex gap-2 mt-3">
            <button onClick={() => updateStatus("approved")} disabled={updating}
              className="px-3 py-1.5 bg-green-500/15 text-green-400 rounded-md text-xs hover:bg-green-500/25 transition-colors disabled:opacity-50">Approve</button>
            <button onClick={() => updateStatus("approved", editedMessage)} disabled={updating}
              className="px-3 py-1.5 bg-indigo-500/15 text-indigo-400 rounded-md text-xs hover:bg-indigo-500/25 transition-colors disabled:opacity-50">Edit & Approve</button>
            <button onClick={() => updateStatus("discarded")} disabled={updating}
              className="px-3 py-1.5 bg-[#1e1e2e] text-[#666] rounded-md text-xs hover:bg-[#2a2a3e] transition-colors disabled:opacity-50">Discard</button>
          </div>
        </div>
      )}
    </div>
  );
}
