import { useApi } from "../hooks/useApi";
import { DropZone } from "../components/DropZone";
import { SourceList, type Source } from "../components/SourceList";
import { Mail, Calendar, Link, FileSpreadsheet } from "lucide-react";

interface ImportRecord {
  id: string; filename: string; file_type: string;
  records_imported: number; duplicates_merged: number; created_at: string;
}

const sources: Source[] = [
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
  const { data, loading, refetch } = useApi<{ imports: ImportRecord[] }>("/api/import/history");

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold text-balance mb-2">Import</h1>
      <p className="text-sm text-[#999] mb-6">
        Import your contacts and interaction history from multiple sources. Duplicates are automatically detected and merged.
      </p>

      {/* Three-column grid on desktop, stacked on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-[250px_1fr_300px] gap-6">
        {/* Left: Suggested Sources */}
        <div className="order-2 lg:order-1">
          <SourceList sources={sources} />
        </div>

        {/* Center: Drop Zone */}
        <div className="order-1 lg:order-2 self-center">
          <DropZone onUploadComplete={refetch} />
        </div>

        {/* Right: Import History */}
        <div className="order-3 overflow-y-auto max-h-[calc(100vh-200px)]">
          <h2 className="text-sm font-medium text-[#999] mb-3">Import History</h2>
          {loading ? (
            <div className="rounded-lg bg-[#111118] card-shadow p-8 text-center">
              <div className="w-5 h-5 border-2 border-[#555] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : data?.imports && data.imports.length > 0 ? (
            <div className="rounded-lg card-shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#111118] text-[#666] text-xs uppercase tracking-wider">
                    <th className="text-left p-3">Date</th>
                    <th className="text-left p-3">File</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-right p-3">Records</th>
                    <th className="text-right p-3">Merged</th>
                  </tr>
                </thead>
                <tbody>
                  {data.imports.map((imp) => (
                    <tr key={imp.id} className="border-t border-[#1e1e2e]">
                      <td className="p-3 text-[#999] whitespace-nowrap">{new Date(imp.created_at).toLocaleDateString()}</td>
                      <td className="p-3 text-[#e2e8f0] truncate max-w-[120px]">{imp.filename}</td>
                      <td className="p-3"><span className="text-[10px] uppercase tracking-wider bg-[#1e1e2e] px-2 py-0.5 rounded text-[#999]">{imp.file_type}</span></td>
                      <td className="p-3 text-right text-[#e2e8f0] tabular-nums">{imp.records_imported}</td>
                      <td className="p-3 text-right text-[#666] tabular-nums">{imp.duplicates_merged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-lg bg-[#111118] card-shadow p-8 text-center">
              <p className="text-sm text-[#555]">No imports yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
