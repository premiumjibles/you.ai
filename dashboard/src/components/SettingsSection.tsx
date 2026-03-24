import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface SettingsSectionProps { title: string; children: React.ReactNode; defaultOpen?: boolean; }

export function SettingsSection({ title, children, defaultOpen = false }: SettingsSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg bg-[#111118] card-shadow overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-[#161620] transition-colors">
        <h3 className="font-medium text-[#e2e8f0]">{title}</h3>
        {open ? <ChevronUp size={18} className="text-[#666]" /> : <ChevronDown size={18} className="text-[#666]" />}
      </button>
      {open && <div className="px-4 pb-4 border-t border-[#1e1e2e] pt-4">{children}</div>}
    </div>
  );
}
