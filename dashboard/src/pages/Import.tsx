import { useApi } from "../hooks/useApi";
import { DropZone } from "../components/DropZone";
import { Mail, Calendar, Link, FileSpreadsheet, ExternalLink } from "lucide-react";

interface ImportRecord {
  id: string; filename: string; file_type: string;
  records_imported: number; duplicates_merged: number; created_at: string;
}

const sources = [
  {
    icon: Mail,
    title: "Gmail",
    fileType: ".mbox",
    fileName: "All mail Including Spam and Trash.mbox",
    description: "Email contacts and interaction history. Large mailboxes (10GB+) work fine.",
    steps: [
      { text: "Go to Google Takeout", url: "https://takeout.google.com" },
      { text: "Deselect all, then select only \"Mail\"" },
      { text: "Click \"Next step\" → \"Create export\"" },
      { text: "Download and unzip when ready" },
    ],
  },
  {
    icon: Calendar,
    title: "Google Calendar",
    fileType: ".ics",
    fileName: "*.ics (one per calendar)",
    description: "People you've had meetings with and each meeting as an interaction.",
    steps: [
      { text: "Go to Google Takeout", url: "https://takeout.google.com" },
      { text: "Deselect all, then select only \"Calendar\"" },
      { text: "Click \"Next step\" → \"Create export\"" },
      { text: "Download and unzip — you'll find .ics files for each calendar" },
    ],
  },
  {
    icon: Link,
    title: "LinkedIn Connections",
    fileType: ".csv",
    fileName: "Connections.csv",
    description: "Your connections with name, company, role, and email.",
    steps: [
      { text: "Go to LinkedIn Data Export", url: "https://www.linkedin.com/mypreferences/d/download-my-data" },
      { text: "Select \"Connections\" and click \"Request archive\"" },
      { text: "Download and unzip when ready (usually ~10 minutes)" },
    ],
  },
  {
    icon: Link,
    title: "LinkedIn Messages",
    fileType: ".csv",
    fileName: "messages.csv",
    description: "Message history imported as interaction data.",
    steps: [
      { text: "Go to LinkedIn Data Export", url: "https://www.linkedin.com/mypreferences/d/download-my-data" },
      { text: "Select \"Messages\" and click \"Request archive\"" },
      { text: "Download and unzip when ready" },
    ],
  },
  {
    icon: FileSpreadsheet,
    title: "Other Contacts (CSV)",
    fileType: ".csv",
    fileName: "any .csv file",
    description: "CRM exports, spreadsheets, or any CSV with contact data.",
    columns: ["First Name / Last Name (or Name)", "Email (or Email Address)", "Phone", "Company (or Organization)", "Position (or Title, Job Title, Role)", "Location (or City)", "LinkedIn URL"],
  },
];

export default function Import() {
  const { data, refetch } = useApi<{ imports: ImportRecord[] }>("/api/import/history");

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-balance mb-2">Import</h1>
      <p className="text-sm text-[#999] mb-6">
        Import your contacts and interaction history from multiple sources. Duplicates are automatically detected and merged.
      </p>

      <DropZone onUploadComplete={refetch} />

      <div className="mt-10">
        <h2 className="text-sm font-medium text-[#999] mb-4">Supported Sources</h2>
        <div className="grid gap-4">
          {sources.map((source, i) => (
            <div key={source.title} className="rounded-lg bg-[#111118] card-shadow p-4 animate-fade-in-up" style={{ '--stagger': i } as React.CSSProperties}>
              <div className="flex items-start gap-3">
                <source.icon size={18} className="text-[#666] mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <h3 className="text-sm font-medium text-[#e2e8f0]">{source.title}</h3>
                    <span className="text-[10px] uppercase tracking-wider bg-[#1a1a2e] px-1.5 py-0.5 rounded text-[#666]">
                      {source.fileType}
                    </span>
                  </div>
                  <p className="text-xs text-[#999] mt-1">{source.description}</p>
                  <p className="text-xs text-[#666] mt-1">
                    Look for: <span className="text-[#888] font-mono">{source.fileName}</span>
                  </p>

                  {source.steps && (
                    <div className="mt-3">
                      <p className="text-[10px] uppercase tracking-wider text-[#555] mb-1.5">How to export</p>
                      <ol className="text-xs text-[#888] space-y-1">
                        {source.steps.map((step, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-[#555] shrink-0">{i + 1}.</span>
                            {step.url ? (
                              <span>
                                <a href={step.url} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1">
                                  {step.text}
                                  <ExternalLink size={10} />
                                </a>
                              </span>
                            ) : (
                              <span>{step.text}</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {source.columns && (
                    <div className="mt-3">
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
              </div>
            </div>
          ))}
        </div>
      </div>

      {data?.imports && data.imports.length > 0 && (
        <div className="mt-10">
          <h2 className="text-sm font-medium text-[#999] mb-3">Import History</h2>
          <div className="rounded-lg card-shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#111118] text-[#666] text-xs uppercase tracking-wider">
                  <th className="text-left p-3">Date</th><th className="text-left p-3">File</th>
                  <th className="text-left p-3">Type</th><th className="text-right p-3">Records</th>
                  <th className="text-right p-3">Merged</th>
                </tr>
              </thead>
              <tbody>
                {data.imports.map((imp) => (
                  <tr key={imp.id} className="border-t border-[#1e1e2e]">
                    <td className="p-3 text-[#999]">{new Date(imp.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-[#e2e8f0]">{imp.filename}</td>
                    <td className="p-3"><span className="text-[10px] uppercase tracking-wider bg-[#1e1e2e] px-2 py-0.5 rounded text-[#999]">{imp.file_type}</span></td>
                    <td className="p-3 text-right text-[#e2e8f0] tabular-nums">{imp.records_imported}</td>
                    <td className="p-3 text-right text-[#666] tabular-nums">{imp.duplicates_merged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
