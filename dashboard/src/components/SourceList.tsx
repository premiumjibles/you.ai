import { useState } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface SourceStep {
  text: string;
  url?: string;
}

export interface Source {
  icon: LucideIcon;
  title: string;
  fileType: string;
  fileName: string;
  description: string;
  steps?: SourceStep[];
  columns?: string[];
}

export function SourceList({ sources }: { sources: Source[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const toggle = (i: number) => setExpanded(expanded === i ? null : i);

  return (
    <div>
      <h2 className="text-sm font-medium text-[#999] mb-3">Suggested Sources</h2>
      <div className="space-y-1">
        {sources.map((source, i) => (
          <div key={source.title}>
            <button
              onClick={() => toggle(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  toggle(i);
                }
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left hover:bg-[#111118] transition-colors group"
              aria-expanded={expanded === i}
            >
              <source.icon size={16} className="text-[#666] shrink-0" />
              <span className="text-sm text-[#e2e8f0] flex-1 truncate">{source.title}</span>
              <span className="text-[10px] uppercase tracking-wider bg-[#1a1a2e] px-1.5 py-0.5 rounded text-[#666]">
                {source.fileType}
              </span>
              <ChevronDown
                size={14}
                className={`text-[#555] transition-transform ${expanded === i ? "rotate-180" : ""}`}
              />
            </button>

            {expanded === i && (
              <div className="px-3 pb-3 pt-1 ml-7 text-xs">
                <p className="text-[#999] mb-1">{source.description}</p>
                <p className="text-[#666] mb-2">
                  Look for: <span className="text-[#888] font-mono">{source.fileName}</span>
                </p>

                {source.steps && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#555] mb-1.5">How to export</p>
                    <ol className="text-[#888] space-y-1">
                      {source.steps.map((step, j) => (
                        <li key={j} className="flex gap-2">
                          <span className="text-[#555] shrink-0">{j + 1}.</span>
                          {step.url ? (
                            <a
                              href={step.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {step.text}
                              <ExternalLink size={10} />
                            </a>
                          ) : (
                            <span>{step.text}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {source.columns && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#555] mb-1.5">Recognized columns</p>
                    <div className="flex flex-wrap gap-1.5">
                      {source.columns.map((col) => (
                        <span key={col} className="text-[11px] bg-[#1a1a2e] px-1.5 py-0.5 rounded text-[#777] font-mono">
                          {col}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
