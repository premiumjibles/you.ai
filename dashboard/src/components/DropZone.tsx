import { useState, useRef, useCallback } from "react";
import { Upload, CheckCircle, XCircle } from "lucide-react";

interface DropZoneProps { onUploadComplete: () => void; }

type UploadState = "idle" | "uploading" | "success" | "error";

const FILE_TYPE_MAP: Record<string, string> = {
  csv: "/api/import/csv", mbox: "/api/import/mbox", ics: "/api/import/ics",
};

export function DropZone({ onUploadComplete }: DropZoneProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const endpoint = FILE_TYPE_MAP[ext];
    if (!endpoint) {
      setState("error");
      setResult(`Unsupported file type: .${ext}. Use .csv, .mbox, or .ics`);
      return;
    }
    setState("uploading");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(endpoint, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const data = await res.json();
      setState("success");
      setResult(`Imported ${data.total ?? data.contacts_created ?? "?"} records` + (data.merged ? `, ${data.merged} duplicates merged` : ""));
      if (fileRef.current) fileRef.current.value = "";
      onUploadComplete();
    } catch (err: any) {
      setState("error");
      setResult(err.message);
    }
  }, [onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  return (
    <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
        dragOver ? "border-indigo-500 bg-indigo-500/5"
        : state === "success" ? "border-green-500/30 bg-green-500/5"
        : state === "error" ? "border-red-500/30 bg-red-500/5"
        : "border-[#1e1e2e] hover:border-[#2a2a3e] bg-[#111118]"
      }`}
      onClick={() => state !== "uploading" && fileRef.current?.click()}>
      <input ref={fileRef} type="file" accept=".csv,.mbox,.ics" onChange={handleFileSelect} className="hidden" />
      {state === "idle" && (<><Upload size={32} className="mx-auto mb-3 text-[#666]" /><p className="text-[#999] mb-1">Drop a file here or click to browse</p><p className="text-xs text-[#666]">Supports .csv, .mbox, .ics</p></>)}
      {state === "uploading" && (<><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" /><p className="text-[#999]">Uploading...</p></>)}
      {state === "success" && (<><CheckCircle size={32} className="mx-auto mb-3 text-green-400" /><p className="text-green-400">{result}</p><button onClick={(e) => { e.stopPropagation(); setState("idle"); setResult(null); }} className="text-xs text-[#666] mt-2 hover:text-[#999]">Upload another</button></>)}
      {state === "error" && (<><XCircle size={32} className="mx-auto mb-3 text-red-400" /><p className="text-red-400">{result}</p><button onClick={(e) => { e.stopPropagation(); setState("idle"); setResult(null); }} className="text-xs text-[#666] mt-2 hover:text-[#999]">Try again</button></>)}
    </div>
  );
}
