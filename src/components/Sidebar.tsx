import { Link } from "@tanstack/react-router";
import {
  Brain, Layers, CalendarClock, Siren, Zap, BarChart2,
  PanelLeftClose, PanelLeftOpen, Sun, Moon
} from "lucide-react";
import { useEffect, useState } from "react";

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
}

const links = [
  { to: "/", label: "Dynamic Diversion Generator", icon: Brain },
  { to: "/deployment", label: "Intelligent Deployment Engine", icon: Layers },
  { to: "/planner", label: "Event Planner", icon: CalendarClock },
  { to: "/incidents", label: "Incident Reporting", icon: Siren },
  { to: "/forecasts", label: "Event Impact Forecaster", icon: Zap },
  { to: "/analytics", label: "Learning and Analytics", icon: BarChart2 },
] as const;

export function Sidebar({ expanded, onToggle }: SidebarProps) {
  const [now, setNow] = useState<Date | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);

    // Read the active theme from localStorage on client-side mount
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
    setMounted(true);

    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme, mounted]);

  return (
    <aside
      className={`h-screen sticky top-0 z-[600] border-r border-border panel-glass shrink-0 transition-all duration-300 ease-in-out flex flex-col justify-between ${expanded ? "w-64" : "w-20"
        }`}
    >
      {/* Top Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-border/40 shrink-0">
        {expanded ? (
          <>
            <Link to="/" className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
                <Brain className="size-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-sm font-extrabold leading-tight tracking-tight bg-clip-text bg-gradient-to-r from-primary to-accent">
                  VYUHIQ
                </h1>
                <p className="text-[9px] text-muted-foreground font-semibold">Strategic Intel</p>
              </div>
            </Link>
            <button
              onClick={onToggle}
              className="flex size-8 items-center justify-center rounded-lg border border-border bg-input/10 text-muted-foreground hover:bg-input hover:text-foreground transition cursor-pointer"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="size-4.5" />
            </button>
          </>
        ) : (
          <div className="w-full flex justify-center">
            <button
              onClick={onToggle}
              className="flex size-9 items-center justify-center rounded-xl border border-border bg-primary text-primary-foreground shadow-glow hover:brightness-110 transition cursor-pointer"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="size-5" />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-grow overflow-y-auto py-4 px-3 space-y-1.5 scrollbar-thin">
        {links.map((link) => {
          const Icon = link.icon;
          return (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: link.to === "/" }}
              className={`group flex items-center rounded-xl transition-all duration-200 [&.active]:bg-primary [&.active]:text-primary-foreground [&.active]:shadow-glow ${expanded
                  ? "gap-3 px-3 py-2.5 text-xs font-bold text-muted-foreground hover:bg-input/40 hover:text-foreground"
                  : "justify-center p-3 text-muted-foreground hover:bg-input/40 hover:text-foreground"
                }`}
              title={!expanded ? link.label : undefined}
            >
              <Icon className="size-4 shrink-0 transition-transform group-hover:scale-110" />
              {expanded && <span className="truncate">{link.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Area */}
      <div className="p-4 border-t border-border/40 shrink-0 space-y-3.5 flex flex-col">
        {/* Theme Switcher */}
        <button
          onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
          className={`flex items-center rounded-xl border border-border bg-input/20 hover:bg-input hover:text-foreground text-muted-foreground transition duration-200 cursor-pointer shadow-sm ${expanded ? "gap-3 px-3 py-2 text-xs font-bold" : "justify-center p-2.5"
            }`}
          title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {theme === "dark" ? (
            <Sun className="size-4 text-amber-500 shrink-0" />
          ) : (
            <Moon className="size-4 text-indigo-500 shrink-0" />
          )}
          {expanded && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
        </button>

        {/* System Live Indicator */}
        <div className={`flex items-center text-[10px] font-bold text-success ${expanded ? "gap-2 px-1" : "justify-center"
          }`}>
          <span className="size-2 rounded-full bg-success animate-pulse shrink-0 shadow-[0_0_8px_var(--color-success)]" />
          {expanded && <span>SYSTEM LIVE</span>}
        </div>

        {/* Live Clock */}
        {expanded && (
          <div className="px-1 text-mono text-[10px] text-muted-foreground font-semibold select-none">
            {now
              ? now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })
              : "--:--:--"}
          </div>
        )}
      </div>
    </aside>
  );
}
