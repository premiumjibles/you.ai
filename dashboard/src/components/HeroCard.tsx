import { apiFetch } from "../api";
import { useState } from "react";
import { Markdown } from "./Markdown";

interface HeroCardProps {
  content: string | null;
  isToday: boolean;
  loading: boolean;
  onGenerated: () => void;
}

export function HeroCard({ content, isToday, loading, onGenerated }: HeroCardProps) {
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await apiFetch("/api/briefings/trigger", { method: "POST" });
      onGenerated();
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl bg-[#111118] border border-[#1e1e2e] p-6 mb-6 animate-pulse">
        <div className="h-4 bg-[#1e1e2e] rounded w-3/4 mb-3" />
        <div className="h-4 bg-[#1e1e2e] rounded w-1/2" />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="rounded-xl bg-[#111118] border border-[#1e1e2e] p-8 mb-6 text-center">
        <p className="text-[#666] mb-4">{isToday ? "No briefing generated yet today." : "No briefing was generated for this date."}</p>
        {isToday && (
          <button onClick={handleGenerate} disabled={generating} className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-sm transition-colors disabled:opacity-50">
            {generating ? "Generating..." : "Generate now"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-br from-[#111118] to-[#161625] border border-[#2a2a3e] p-6 mb-6">
      <div className="text-xs text-indigo-400 uppercase tracking-wider mb-3 font-medium">AI Summary</div>
      <div className="text-[#e2e8f0] leading-relaxed"><Markdown>{content}</Markdown></div>
    </div>
  );
}
