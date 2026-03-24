import { ChevronLeft, ChevronRight } from "lucide-react";

interface DateNavProps {
  date: string;
  onDateChange: (date: string) => void;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split("T")[0];
}

export function DateNav({ date, onDateChange }: DateNavProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <h1 className="text-xl font-semibold">
        {isToday(date) ? "Today's Briefing" : "Briefing"}
      </h1>
      <div className="flex items-center gap-1 ml-auto">
        <button onClick={() => onDateChange(addDays(date, -1))} className="p-1.5 rounded-md hover:bg-[#1e1e2e] text-[#666] hover:text-[#999] transition-colors">
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full">{formatDate(date)}</span>
        <button onClick={() => onDateChange(addDays(date, 1))} disabled={isToday(date)} className="p-1.5 rounded-md hover:bg-[#1e1e2e] text-[#666] hover:text-[#999] transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
