import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart2, ShieldAlert, CheckCircle2, TrendingUp, Calendar, BrainCircuit, AlertTriangle, Siren } from "lucide-react";
import { useEvents, useIncidents } from "@/lib/store";
import { predict } from "@/lib/gridmind";
import { useEffect } from "react";

const dataCause = [
  { name: "Breakdown", value: 924 },
  { name: "Accident", value: 652 },
  { name: "Waterlogging", value: 341 },
  { name: "Potholes", value: 290 },
  { name: "Construction", value: 421 },
  { name: "Others", value: 150 },
];

const dataZone = [
  { name: "Central", load: 82 },
  { name: "North", load: 74 },
  { name: "East", load: 78 },
  { name: "West", load: 68 },
  { name: "South", load: 70 },
];

const COLORS = ["#3b82f6", "#ef4444", "#eab308", "#10b981", "#8b5cf6", "#6b7280"];

export default function AnalyticsPage() {
  useEffect(() => {
    document.title = "Traffic Analytics — VYUHIQ";
  }, []);
  const { events } = useEvents();
  const { incidents } = useIncidents();
  
  const completedEvents = events.filter((e) => e.status === "Completed" && e.actualDelayMin != null);
  const resolvedIncidents = incidents.filter((i) => i.status === "Resolved" && i.outcome != null);
  return (
    <div className="min-h-screen grid-bg text-slate-900">

      <main className="mx-auto w-[90%] md:w-[85%] py-8">
        {/* Header Section */}
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl flex items-center gap-2">
              <BarChart2 className="h-7 w-7 text-primary" /> System Performance & Analytics
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Historical archives overview based on 8,124 records compiled across the Bengaluru
              police network.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold rounded-xl bg-input/40 px-3 py-2 border border-border">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Archive Period: Jan 2023 - Mar 2024</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Total Logs Analyzed
            </p>
            <p className="text-3xl font-black mt-2">8,124</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Grounded in local incident registries
            </p>
          </div>
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Avg. Clearance Time
            </p>
            <p className="text-3xl font-black mt-2">48.4m</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              From initial report to resolution
            </p>
          </div>
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Diversion Success Rate
            </p>
            <p className="text-3xl font-black mt-2 text-green-600">91.2%</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Percentage of smooth traffic reroutes
            </p>
          </div>
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Active Stations Connected
            </p>
            <p className="text-3xl font-black mt-2">7</p>
            <p className="text-[10px] text-muted-foreground mt-1">BTP local division feeds</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Bar Chart */}
          <div className="rounded-2xl border border-border panel-glass p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Average Road Congestion Level by Zone
              (%)
            </h2>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataZone} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip cursor={{ fill: "transparent" }} />
                  <Bar dataKey="load" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="rounded-2xl border border-border panel-glass p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" /> Incident Distribution by Cause
            </h2>
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dataCause}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {dataCause.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
              {dataCause.map((c, idx) => (
                <div key={c.name} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: COLORS[idx] }}
                  ></span>
                  <span className="text-muted-foreground">
                    {c.name}: {c.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Event Intelligence Memory */}
        <div className="mt-8">
          <div className="flex items-center gap-3 border-b border-border pb-4 mb-6">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <BrainCircuit className="size-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Event Intelligence Memory</h2>
              <p className="text-xs text-muted-foreground">Self-correcting feedback loop from past scheduled events</p>
            </div>
          </div>

          {completedEvents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
              No historical events with feedback available yet. Mark events as completed in the Planner to build intelligence.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {completedEvents.map((event) => {
                const p = predict(event);
                const predictedDelay = p.delayMin;
                const actualDelay = event.actualDelayMin ?? predictedDelay;
                const error = actualDelay - predictedDelay;
                const isUnderestimate = error > 5;
                const isOverestimate = error < -5;
                const isAccurate = !isUnderestimate && !isOverestimate;

                return (
                  <div key={event.id} className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-foreground">{event.title}</h3>
                          {event.modelUpdated && (
                            <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-500 border border-green-500/30">
                              ✓ Model Aligned (Model OP)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{event.date} · {event.location?.name ?? event.venueId}</p>
                      </div>
                      <span className="rounded-full bg-input/50 px-2 py-1 text-[10px] font-semibold">
                        {event.outcome ?? "Completed"}
                      </span>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-border bg-input/30 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Predicted Delay</p>
                        <p className="text-sm font-mono font-bold mt-1">{predictedDelay}m</p>
                      </div>
                      <div className="rounded-xl border border-border bg-input/30 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Actual Delay</p>
                        <p className="text-sm font-mono font-bold mt-1">{actualDelay}m</p>
                      </div>
                    </div>

                    {isAccurate ? (
                      <div className="mb-3 flex items-start gap-2 text-success bg-success/10 border border-success/20 p-2 rounded-xl">
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed">Prediction was highly accurate. No model adjustments required for this venue/scale profile.</p>
                      </div>
                    ) : isUnderestimate ? (
                      <div className="mb-3 flex items-start gap-2 text-warning bg-warning/10 border border-warning/20 p-2 rounded-xl">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed">Model underestimated delay by {error}m. Base congestion multiplier for {event.type} will be increased.</p>
                      </div>
                    ) : (
                      <div className="mb-3 flex items-start gap-2 text-primary bg-primary/10 border border-primary/20 p-2 rounded-xl">
                        <BrainCircuit className="size-4 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed">Model overestimated delay by {Math.abs(error)}m. Resources were likely over-allocated. Calibrating downwards.</p>
                      </div>
                    )}

                    {event.lesson && (
                      <div className="pt-3 border-t border-border mt-auto">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Human Insight</p>
                        <p className="text-xs text-foreground italic">"{event.lesson}"</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Incident Response Intelligence */}
        <div className="mt-8">
          <div className="flex items-center gap-3 border-b border-border pb-4 mb-6">
            <div className="flex size-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive">
              <Siren className="size-4" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Incident Response Intelligence</h2>
              <p className="text-xs text-muted-foreground">Historical clearance metrics and field reports from resolved incidents</p>
            </div>
          </div>

          {resolvedIncidents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
              No historical incident feedback available yet. Resolve incidents and add field reports to build intelligence.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {resolvedIncidents.map((incident) => {
                const isCritical = incident.severity === "Critical" || incident.severity === "High";
                
                return (
                  <div key={incident.id} className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-foreground">{incident.kind}</h3>
                          {incident.modelUpdated && (
                            <span className="inline-flex items-center gap-1 rounded bg-green-500/10 px-1.5 py-0.5 text-[9px] font-bold text-green-500 border border-green-500/30">
                              ✓ Model Aligned (Model OP)
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">{incident.location} · {incident.reporter}</p>
                      </div>
                      <span className="rounded-full bg-input/50 px-2 py-1 text-[10px] font-semibold">
                        {incident.outcome}
                      </span>
                    </div>

                    <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-xl border border-border bg-input/30 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Clearance Time</p>
                        <p className="text-sm font-mono font-bold mt-1">{incident.actualDelayMin}m</p>
                      </div>
                      <div className="rounded-xl border border-border bg-input/30 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase">Officers</p>
                        <p className="text-sm font-mono font-bold mt-1">{incident.actualOfficers}</p>
                      </div>
                    </div>

                    {incident.outcome === "Successful" ? (
                      <div className="mb-3 flex items-start gap-2 text-success bg-success/10 border border-success/20 p-2 rounded-xl">
                        <CheckCircle2 className="size-4 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed">Response was highly effective. Standard operating procedure holds for {incident.kind} in this zone.</p>
                      </div>
                    ) : (
                      <div className="mb-3 flex items-start gap-2 text-warning bg-warning/10 border border-warning/20 p-2 rounded-xl">
                        <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                        <p className="text-[11px] leading-relaxed">Response was strained or partial. Review officer deployment counts for future {incident.kind} alerts.</p>
                      </div>
                    )}

                    {incident.lesson && (
                      <div className="pt-3 border-t border-border mt-auto">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Field Notes</p>
                        <p className="text-xs text-foreground italic">"{incident.lesson}"</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
