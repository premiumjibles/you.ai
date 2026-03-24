import { useApi } from "../hooks/useApi";
import { DropZone } from "../components/DropZone";

interface ImportRecord {
  id: string; filename: string; file_type: string;
  records_imported: number; duplicates_merged: number; created_at: string;
}

export default function Import() {
  const { data, refetch } = useApi<{ imports: ImportRecord[] }>("/api/import/history");

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Import</h1>
      <DropZone onUploadComplete={refetch} />
      {data?.imports && data.imports.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-[#999] mb-3">Import History</h2>
          <div className="rounded-lg border border-[#1e1e2e] overflow-hidden">
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
                    <td className="p-3 text-right text-[#e2e8f0]">{imp.records_imported}</td>
                    <td className="p-3 text-right text-[#666]">{imp.duplicates_merged}</td>
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
