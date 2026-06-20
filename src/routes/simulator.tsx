import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import {
  SlidersHorizontal, Users, Clock, Gauge, TrendingUp, TrendingDown, Minus,
  ShieldAlert, Cone, MapPin, ArrowRight,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import {
  EVENT_TYPES, predict, fmtHour,
  type EventType, type PredictionInput, type Prediction, type Venue,
} from "@/lib/gridmind";
import { DEFAULT_PLACE } from "@/lib/locations";
import { LocationSearch } from "@/components/LocationSearch";

type ScenarioKey = "none" | "close-road" | "deploy-officers" | "diversion-b" | "signal-timing";

interface ScenarioAction {
  key: ScenarioKey;
  label: string;
  description: string;
  icon: ReactNode;
}

interface ScenarioOutcome {
  title: string;
  description: string;
  recommendation: string;
  summary: string;
  stats: { label: string; value: string }[];
}

const SCENARIO_ACTIONS: ScenarioAction[] = [
  { key: "close-road", label: "Close Road", description: "Reroute traffic from one corridor.", icon: <Cone className="size-4" /> },
  { key: "deploy-officers", label: "Deploy Officers", description: "Add 20 officers to improve intersection handling.", icon: <ShieldAlert className="size-4" /> },
  { key: "diversion-b", label: "Diversion Route B", description: "Open an alternate bypass route.", icon: <ArrowRight className="size-4" /> },
  { key: "signal-timing", label: "Signal Timing", description: "Optimize green time at critical lights.", icon: <Clock className="size-4" /> },
];

function buildScenarioOutcome(sim: Prediction, scenario: ScenarioKey): ScenarioOutcome {
  const baseline = {
    congestion: `${sim.score}/100`,
    delay: `${sim.delayMin} min`,
    radius: `${sim.radiusKm} km`,
  };

  switch (scenario) {
    case "close-road":
      return {
        title: "Close MG Road",
        description: "Simulate an arterial closure and reroute nearby corridors.",
        recommendation: "Recommended",
        summary: "Road closure shifts traffic off the primary link and reduces average delay for the simulated event.",
        stats: [
          { label: "Projected congestion", value: `${Math.max(8, sim.score - 10)}/100` },
          { label: "Average delay", value: `${Math.max(8, sim.delayMin - 7)} min` },
          { label: "Traffic shifted", value: "8,000 vehicles" },
          { label: "Queue impact", value: "+12% on adjacent corridors" },
        ],
      };
    case "deploy-officers":
      return {
        title: "Deploy 20 Officers",
        description: "Boost intersection efficiency and emergency clearance.",
        recommendation: "Recommended",
        summary: "Additional officers reduce queue length and lower delay with better traffic flow control.",
        stats: [
          { label: "Intersection efficiency", value: "+18%" },
          { label: "Signal clearance", value: "-22%" },
          { label: "Average delay", value: `${Math.max(8, sim.delayMin - 12)} min` },
          { label: "Congestion score", value: `${Math.max(8, sim.score - 7)}/100` },
        ],
      };
    case "diversion-b":
      return {
        title: "Create Diversion Route B",
        description: "Open a bypass route to shift load off the stadium perimeter.",
        recommendation: "Recommended",
        summary: "Route B shifts traffic away from the event footprint, saving fuel and reducing delay.",
        stats: [
          { label: "Traffic shifted", value: "8,000 vehicles" },
          { label: "Fuel saved", value: "450 liters" },
          { label: "Delay reduction", value: "17 min" },
          { label: "Projected congestion", value: `${Math.max(8, sim.score - 12)}/100` },
        ],
      };
    case "signal-timing":
      return {
        title: "Change Signal Timing",
        description: "Optimize green cycles at key junctions.",
        recommendation: "Recommended",
        summary: "Signal timing adjustments improve clearance and lower average delay along the corridor.",
        stats: [
          { label: "Signal clearance", value: "-22%" },
          { label: "Queue length", value: "-30%" },
          { label: "Average delay", value: `${Math.max(8, sim.delayMin - 10)} min` },
          { label: "Congestion score", value: `${Math.max(8, sim.score - 6)}/100` },
        ],
      };
    default:
      return {
        title: "No action selected",
        description: "Pick a what-if intervention to compare outcomes.",
        recommendation: "Explore scenarios",
        summary: "Use the buttons to simulate closure, officer deployment, diversion routing, or signal adjustment.",
        stats: [
          { label: "Current congestion", value: baseline.congestion },
          { label: "Current delay", value: baseline.delay },
          { label: "Affected radius", value: baseline.radius },
          { label: "Severity", value: sim.severity },
        ],
      };
  }
}

export const Route = createFileRoute("/simulator")({
  head: () => ({
    meta: [
      { title: "What-If Simulator — GridMind AI" },
      { name: "description", content: "Drag attendance, timing and event type to instantly see how predicted delay, congestion and required police resources change." },
    ],
  }),
  component: SimulatorPage,
});

function SimulatorPage() {
  const [type, setType] = useState<EventType>("Cricket Match");
  const [location, setLocation] = useState<Venue>(DEFAULT_PLACE);
  const [attendees, setAttendees] = useState(20000);
  const [hour, setHour] = useState(17);
  const [durationHr, setDurationHr] = useState(4);
  const [planned, setPlanned] = useState(true);
  const [scenario, setScenario] = useState<ScenarioKey>("none");

  // Baseline is locked at 20,000 so users can see the delta as they scrub.
  const baseInput: PredictionInput = { type, location, attendees: 20000, hour, durationHr, planned };
  const input: PredictionInput = { type, location, attendees, hour, durationHr, planned };

  const base = useMemo(() => predict(baseInput), [type, location, hour, durationHr, planned]);
  const sim = useMemo(() => predict(input), [type, location, attendees, hour, durationHr, planned]);
  const scenarioOutcome = useMemo(() => buildScenarioOutcome(sim, scenario), [sim, scenario]);

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary"><SlidersHorizontal className="size-5" /></div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">What-If Simulator</h1>
            <p className="text-xs text-muted-foreground">Scrub the inputs and watch delay, congestion and required resources react in real time.</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="h-fit rounded-2xl border border-border panel-glass p-5">
            <Field label="Event type">
              <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={inputCls}>
                {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Location · Bengaluru">
              <LocationSearch value={location} onChange={setLocation} />
            </Field>

            <Slider label="Attendance" value={attendees} min={2000} max={60000} step={1000}
              display={attendees.toLocaleString()} onChange={setAttendees} icon={<Users className="size-3.5" />} />
            <Slider label="Start hour" value={hour} min={0} max={23} step={1}
              display={fmtHour(hour)} onChange={setHour} icon={<Clock className="size-3.5" />} />
            <Slider label="Duration" value={durationHr} min={1} max={8} step={1}
              display={`${durationHr} h`} onChange={setDurationHr} icon={<Clock className="size-3.5" />} />

            <div className="mt-2 flex gap-2">
              <button onClick={() => setPlanned(true)} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${planned ? "border-success/40 bg-success/10 text-success" : "border-border bg-input/40 text-muted-foreground"}`}>Planned</button>
              <button onClick={() => setPlanned(false)} className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition ${!planned ? "border-warning/40 bg-warning/10 text-warning" : "border-border bg-input/40 text-muted-foreground"}`}>Unplanned</button>
            </div>

            <p className="mt-4 text-[11px] text-muted-foreground">
              Deltas compare against a baseline of <span className="text-foreground font-semibold">20,000</span> attendees with the same venue and timing.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <DeltaCard label="Congestion score" unit="/100" icon={<Gauge className="size-4" />}
                base={base.score} now={sim.score} />
              <DeltaCard label="Predicted delay" unit="min" icon={<Clock className="size-4" />}
                base={base.delayMin} now={sim.delayMin} />
              <DeltaCard label="Affected radius" unit="km" icon={<MapPin className="size-4" />}
                base={base.radiusKm} now={sim.radiusKm} decimals={1} />
            </div>

            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Digital Twin actions</h2>
                  <p className="text-xs text-muted-foreground">Simulate interventions and see recommendation-driven outcomes.</p>
                </div>
                <span className="rounded-full border border-border bg-input/50 px-3 py-1 text-[11px] uppercase text-muted-foreground">{scenarioOutcome.title}</span>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {SCENARIO_ACTIONS.map((action) => (
                  <button key={action.key} type="button"
                    onClick={() => setScenario(action.key)}
                    className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${scenario === action.key ? "border-primary bg-primary/10 text-foreground" : "border-border bg-input/30 text-muted-foreground"}`}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">{action.icon}</div>
                    <div>
                      <div className="font-semibold">{action.label}</div>
                      <p className="text-[11px] text-muted-foreground">{action.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {scenarioOutcome.stats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-border bg-input/30 p-4">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-xl font-bold">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-border bg-input/20 p-4">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Recommendation</p>
                <p className="mt-2 text-2xl font-bold">{scenarioOutcome.recommendation}</p>
                <p className="mt-2 text-sm text-muted-foreground">{scenarioOutcome.summary}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-border panel-glass p-5">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Resource impact vs baseline</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <ResourceDelta label="Officers" icon={<ShieldAlert className="size-4" />} base={base.resources.officers} now={sim.resources.officers} />
                <ResourceDelta label="Barricades" icon={<Cone className="size-4" />} base={base.resources.barricades} now={sim.resources.barricades} />
                <ResourceDelta label="Tow trucks" icon={<ArrowRight className="size-4" />} base={base.resources.towTrucks} now={sim.resources.towTrucks} />
              </div>
              {sim.resources.deficit > 0 && (
                <div className="mt-4 flex items-center gap-2 rounded-xl border border-critical/40 bg-critical/10 px-4 py-3 text-sm text-critical">
                  <ShieldAlert className="size-4 shrink-0" />
                  <span><strong>{sim.resources.deficit} officers short</strong> at this attendance — request city reserve before the event.</span>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Severity</h2>
                <span className="text-mono text-2xl font-bold" style={{ color: sevColor(sim.score) }}>{sim.severity}</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-input/60">
                <div className="h-full rounded-full transition-all" style={{ width: `${sim.score}%`, background: sevColor(sim.score) }} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Recovery time at this scenario: <span className="text-foreground font-semibold">{sim.recoveryHr} h</span>.
                {" "}Closest prior event: <span className="text-foreground font-semibold">{sim.similar.event.id}</span> ({(sim.similar.match * 100).toFixed(0)}% match).
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function sevColor(score: number): string {
  if (score >= 80) return "var(--critical)";
  if (score >= 60) return "var(--warning)";
  if (score >= 38) return "var(--info)";
  return "var(--success)";
}

const inputCls = "w-full rounded-lg border border-border bg-input/60 px-3 py-2.5 text-sm outline-none focus:border-primary";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Slider({ label, value, min, max, step, display, onChange, icon }: {
  label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (v: number) => void; icon: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{icon}{label}</label>
        <span className="text-mono text-sm font-bold">{display}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary" />
    </div>
  );
}

function DeltaCard({ label, unit, icon, base, now, decimals = 0 }: {
  label: string; unit: string; icon: React.ReactNode; base: number; now: number; decimals?: number;
}) {
  const diff = +(now - base).toFixed(decimals);
  return (
    <div className="rounded-2xl border border-border panel-glass p-4">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wide">{label}</span></div>
      <p className="text-mono text-3xl font-bold">{now.toFixed(decimals)}<span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span></p>
      <Trend diff={diff} unit={unit} />
    </div>
  );
}

function ResourceDelta({ label, icon, base, now }: { label: string; icon: React.ReactNode; base: number; now: number }) {
  const diff = now - base;
  return (
    <div className="rounded-xl border border-border bg-input/30 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wide">{label}</span></div>
      <p className="text-mono text-2xl font-bold">{now}</p>
      <Trend diff={diff} unit="" />
    </div>
  );
}

function Trend({ diff, unit }: { diff: number; unit: string }) {
  if (diff === 0) return <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Minus className="size-3" /> no change</p>;
  const up = diff > 0;
  return (
    <p className={`mt-0.5 flex items-center gap-1 text-[11px] font-semibold ${up ? "text-critical" : "text-success"}`}>
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : ""}{diff}{unit && ` ${unit}`} vs baseline
    </p>
  );
}
