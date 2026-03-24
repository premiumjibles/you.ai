import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Markdown } from "./Markdown";

const CATEGORY_COLORS: Record<string, string> = {
  market_tracker: "#6366f1", financial_tracker: "#6366f1", github_activity: "#f59e0b",
  rss_feed: "#22c55e", web_search: "#ec4899", network_activity: "#06b6d4", custom: "#a78bfa",
};

const CATEGORY_LABELS: Record<string, string> = {
  market_tracker: "Markets", financial_tracker: "Financial", github_activity: "GitHub",
  rss_feed: "RSS Feed", web_search: "Web Search", network_activity: "Network", custom: "Custom",
};

interface SourceCardProps { name: string; output: string; type?: string; }

export function SourceCard({ name, output, type }: SourceCardProps) {
  const [expanded, setExpanded] = useState(false);
  const color = (type && CATEGORY_COLORS[type]) || "#6366f1";
  const label = (type && CATEGORY_LABELS[type]) || name;
  const preview = output.split("\n").slice(0, 2).join(" ").slice(0, 100);

  return (
    <button onClick={() => setExpanded(!expanded)} className="w-full text-left rounded-lg bg-[#111118] card-shadow card-shadow-hover p-4 transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-widest font-medium mb-2" style={{ color }}>{label}</div>
          {!expanded && <div className="text-sm text-[#999] truncate">{preview}</div>}
        </div>
        {expanded ? <ChevronUp size={16} className="text-[#666] shrink-0 mt-1" /> : <ChevronDown size={16} className="text-[#666] shrink-0 mt-1" />}
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#1e1e2e] text-sm text-[#e2e8f0] leading-relaxed"><Markdown>{output}</Markdown></div>
      )}
    </button>
  );
}
