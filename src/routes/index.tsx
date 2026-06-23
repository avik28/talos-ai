import { Link } from "react-router-dom";
import { Brain, Layers, CalendarClock, Siren, Zap, BarChart2, ArrowRight } from "lucide-react";
import { useEffect } from "react";

export default function LandingPage() {
  useEffect(() => {
    document.title = "Talos.ai — Traffic Analysis, Learning and Optimization System";
  }, []);
  const cards = [
    {
      to: "/diversions",
      title: "Dynamic Diversion Generator",
      desc: "Tactical Sandbox driven by live incident dispatching and threshold-triggered route rotation.",
      icon: Brain,
      color: "text-amber-500",
      bg: "hover:border-amber-500/30 hover:bg-amber-500/5",
    },
    {
      to: "/deployment",
      title: "Intelligent Deployment Engine",
      desc: "Priority-based officer reinforcement allocations, shortages trackers, and deployment planning.",
      icon: Layers,
      color: "text-blue-500",
      bg: "hover:border-blue-500/30 hover:bg-blue-500/5",
    },
    {
      to: "/planner",
      title: "Event Planner",
      desc: "Pre-event scenario scheduling, venue assessments, and crowd impact modeling.",
      icon: CalendarClock,
      color: "text-emerald-500",
      bg: "hover:border-emerald-500/30 hover:bg-emerald-500/5",
    },
    {
      to: "/incidents",
      title: "Incident Reporting",
      desc: "Live incident feeds, dispatcher intake controls, and realtime emergency signaling.",
      icon: Siren,
      color: "text-rose-500",
      bg: "hover:border-rose-500/30 hover:bg-rose-500/5",
    },
    {
      to: "/forecasts",
      title: "Event Impact Forecaster",
      desc: "Machine learning travel delay predictions and clearance time forecasts.",
      icon: Zap,
      color: "text-indigo-500",
      bg: "hover:border-indigo-500/30 hover:bg-indigo-500/5",
    },
    {
      to: "/analytics",
      title: "Learning and Analytics",
      desc: "Event intelligence memory log, model alignment metrics, and historical performance charts.",
      icon: BarChart2,
      color: "text-cyan-500",
      bg: "hover:border-cyan-500/30 hover:bg-cyan-500/5",
    },
  ];

  return (
    <div className="min-h-screen grid-bg flex flex-col justify-center py-12 px-6">
      <main className="mx-auto w-[90%] md:w-[85%] max-w-7xl">
        {/* Landing Page Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-border panel-glass p-8 md:p-12 mb-8 grid-bg">
          {/* Subtle gradient glowing blobs */}
          <div className="absolute -right-24 -top-24 size-[400px] rounded-full bg-amber-500/10 blur-3xl pointer-events-none" />
          <div className="absolute right-1/4 -bottom-16 size-[320px] rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/50 px-3 py-1 text-[10px] font-extrabold tracking-widest text-muted-foreground uppercase mb-4">
                <span className="flex h-1.5 w-1.5 relative mr-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success"></span>
                </span>
                <span>Event-Driven Congestion Intelligence</span>
              </div>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight max-w-4xl">
                Forecast, visualize and <span className="text-amber-500">res</span><span className="text-sky-500">pond</span> to traffic events with <span className="text-primary">Talos.ai</span>.
              </h1>
              <p className="text-xs md:text-sm text-muted-foreground max-w-3xl mt-3 font-medium leading-relaxed">
                Talos.ai (Traffic Analysis, Learning and Optimization System) is an event-driven congestion intelligence platform that predicts the impact of closures, crowds, and weather to recommend optimal dispatches and dynamic routing.
              </p>
            </div>

            <div className="flex flex-col gap-3 shrink-0">
              <Link
                to="/diversions"
                className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3.5 text-sm font-bold text-primary-foreground shadow-glow hover:brightness-110 transition cursor-pointer"
              >
                Launch Sandbox <ArrowRight className="size-4" />
              </Link>
              <span className="flex items-center justify-center gap-1.5 rounded-xl border border-success/40 bg-success/10 px-6 py-3.5 text-xs font-bold text-success shadow-sm">
                <span className="size-2 rounded-full bg-success pulse-dot" /> SYSTEM LIVE
              </span>
            </div>
          </div>
        </div>

        {/* Modules Navigation Grid */}
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.to}
                to={card.to}
                className={`group rounded-2xl border border-border panel-glass p-6 transition-all duration-300 flex flex-col justify-between cursor-pointer ${card.bg}`}
              >
                <div>
                  <div className={`mb-4 flex size-11 items-center justify-center rounded-xl bg-muted/60 ${card.color} group-hover:scale-110 transition-transform`}>
                    <Icon className="size-5" />
                  </div>
                  <h3 className="text-base font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                    {card.title}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {card.desc}
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-1.5 text-xs font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Open module <ArrowRight className="size-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
