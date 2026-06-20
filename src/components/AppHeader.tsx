import { Link } from "@tanstack/react-router";
import { Brain, CalendarClock, Siren } from "lucide-react";
import { useEffect, useState } from "react";

const links = [
  { to: "/", label: "Command & Diversions" },
  { to: "/simulator", label: "What-If" },
  { to: "/resources", label: "Resources" },
  { to: "/deployment", label: "Deployment" },
  { to: "/planner", label: "Planner" },
  { to: "/incidents", label: "Incidents" },
  { to: "/forecasts", label: "Forecasts" },
  { to: "/analytics", label: "Analytics" },
  { to: "/ai-assistant", label: "GridMind AI" },
] as const;

export function AppHeader() {
  // Render the live clock only after mount to avoid SSR/client hydration mismatch.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="sticky top-0 z-[600] border-b border-border panel-glass">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link to="/" className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow">
            <Brain className="size-5" />
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-extrabold leading-tight tracking-tight">
              GridMind <span className="text-primary">AI</span>
            </h1>
            <p className="text-[11px] text-muted-foreground">Event-Aware Traffic Command Center</p>
          </div>
        </Link>

        <nav className="flex items-center gap-1 rounded-xl border border-border bg-input/30 p-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground [&.active]:bg-primary [&.active]:text-primary-foreground"
              activeOptions={{ exact: l.to === "/" }}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 text-xs lg:flex">
          <span className="flex items-center gap-1.5 text-success">
            <span className="size-2 rounded-full bg-success pulse-dot" /> SYSTEM LIVE
          </span>
          <span
            className="text-mono w-[88px] text-right text-muted-foreground"
            suppressHydrationWarning
          >
            {now
              ? now.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "--:--:--"}
          </span>
        </div>
      </div>
    </header>
  );
}

export { CalendarClock, Siren };
