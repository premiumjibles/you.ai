import { NavLink } from "react-router-dom";
import { Home, GitBranch, Send, Upload, Settings } from "lucide-react";

const NAV_ITEMS = [
  { to: "/", icon: Home, label: "Briefings" },
  { to: "/github", icon: GitBranch, label: "GitHub", conditional: true },
  { to: "/outreach", icon: Send, label: "Outreach" },
  { to: "/import", icon: Upload, label: "Import" },
];

export function Sidebar({ hasGithub }: { hasGithub: boolean }) {
  const items = NAV_ITEMS.filter((item) => !item.conditional || hasGithub);

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-14 bg-[#111118] border-r border-[#1e1e2e] items-center py-4 gap-2 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm mb-4">
          Y
        </div>
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `w-10 h-10 rounded-lg flex items-center justify-center transition-colors group relative ${
                isActive
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-[#666] hover:text-[#999] hover:bg-[#1e1e2e]"
              }`
            }
          >
            <Icon size={20} />
            <span className="absolute left-14 bg-[#1e1e2e] text-[#e2e8f0] text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
              {label}
            </span>
          </NavLink>
        ))}
        <div className="flex-1" />
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `w-10 h-10 rounded-lg flex items-center justify-center transition-colors group relative ${
              isActive
                ? "bg-indigo-500/15 text-indigo-400"
                : "text-[#666] hover:text-[#999] hover:bg-[#1e1e2e]"
            }`
          }
        >
          <Settings size={20} />
          <span className="absolute left-14 bg-[#1e1e2e] text-[#e2e8f0] text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
            Settings
          </span>
        </NavLink>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[#111118] border-t border-[#1e1e2e] flex justify-around py-2 z-50">
        {[...items, { to: "/settings", icon: Settings, label: "Settings" }].map(
          ({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-1 ${
                  isActive ? "text-indigo-400" : "text-[#666]"
                }`
              }
            >
              <Icon size={20} />
              <span className="text-[10px]">{label}</span>
            </NavLink>
          )
        )}
      </nav>
    </>
  );
}
