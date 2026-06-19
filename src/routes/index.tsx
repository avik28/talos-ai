import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect } from "react";
import {
  Activity, Radio, Cone, Truck, Ambulance, ShieldAlert, Users, AlertTriangle,
  MapPin, Clock, Gauge, Zap, ArrowRight, Copy, Check, Siren, Brain, History,
  TrendingUp, Megaphone, ChevronRight, CircleDot, Sparkles, CalendarPlus, RotateCw,
} from "lucide-react";
import {
  predict, buildActionPlan, fmtHour, severityColor,
  type PredictionInput, type Prediction, type Severity, type Venue,
  VENUES,
} from "@/lib/gridmind";
import { DEFAULT_PLACE } from "@/lib/locations";
import { CommandMap } from "@/components/CommandMap";
import { AppHeader } from "@/components/AppHeader";
import { generateActionPlan } from "@/lib/actionplan.functions";
import { fetchHistoricalData, type HistoricalData } from "@/lib/historical.functions";
import { useEvents, useIncidents, uid, type Incident } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GridMind AI — Event-Aware Traffic Command Center" },
      { name: "description", content: "Predict event congestion, recommend police resources, generate diversions, and learn from past events across Bengaluru." },
    ],
  }),
  component: CommandCenter,
});

const sevBg: Record<Severity, string> = {
  Critical: "bg-critical/15 text-critical border-critical/40",
  High: "bg-warning/15 text-warning border-warning/40",
  Moderate: "bg-info/15 text-info border-info/40",
  Low: "bg-success/15 text-success border-success/40",
};

function CommandCenter() {
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [history, setHistory] = useState<HistoricalData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { addEvent } = useEvents();
  const { incidents } = useIncidents();
  const navigate = useNavigate();

  const openIncidents = incidents.filter((i) => i.status !== "Resolved");
  const selectedIncident = openIncidents.find((i) => i.id === selectedIncidentId) ?? openIncidents[0] ?? null;

  useEffect(() => {
    if (!selectedIncidentId && openIncidents.length > 0) {
      setSelectedIncidentId(openIncidents[0].id);
    }
  }, [openIncidents, selectedIncidentId]);

  const input: PredictionInput | null = selectedIncident
    ? mapIncidentToPredictionInput(selectedIncident)
    : null;

  function runAnalysis() {
    if (!input) return;
    setAnalyzing(true);
    setTimeout(() => {
      setPrediction(predict(input, history ? { incidents: history.incidents, stations: history.stations, plans: history.plans } : undefined));
      setAnalyzing(false);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    }, 900);
  }

  function scheduleEvent() {
    if (!selectedIncident || !input) return;
    addEvent({
      id: uid("EVT"),
      type: input.type,
      venueId: input.venueId ?? DEFAULT_PLACE.id,
      location: input.location ?? DEFAULT_PLACE,
      attendees: input.attendees,
      hour: input.hour,
      durationHr: input.durationHr,
      planned: input.planned,
      date: new Date().toISOString().slice(0, 10),
      title: `Incident response · ${selectedIncident.location}`,
      status: "Scheduled",
      createdAt: Date.now(),
    });
    setScheduled(true);
    setTimeout(() => navigate({ to: "/planner" }), 600);
  }

  function mapIncidentToPredictionInput(incident: Incident): PredictionInput {
    const incidentTypeMap: Record<Incident["kind"], PredictionInput["type"]> = {
      "Accident": "Roadwork / Diversion",
      "Breakdown": "Roadwork / Diversion",
      "Signal Failure": "Roadwork / Diversion",
      "Waterlogging": "Roadwork / Diversion",
      "Road Block": "Roadwork / Diversion",
      "VIP Movement": "VIP Movement",
      "Crowd Surge": "Protest",
    };

    const type = incidentTypeMap[incident.kind] ?? "Roadwork / Diversion";
    const estimatedAttendees = {
      Low: 2500,
      Medium: 9000,
      High: 18000,
      Critical: 26000,
    }[incident.severity];
    const durationHr = incident.severity === "Critical" ? 4 : incident.severity === "High" ? 3 : 2;
    const hour = new Date(incident.createdAt).getHours();

    const normalizedLocation = incident.location.toLowerCase();
    const venue = VENUES.find((venue) =>
      normalizedLocation.includes(venue.name.toLowerCase()) || normalizedLocation.includes(venue.area.toLowerCase())
    );

    return {
      type,
      venueId: venue?.id,
      location: venue ?? DEFAULT_PLACE,
      attendees: estimatedAttendees,
      hour,
      durationHr,
      planned: incident.kind === "VIP Movement",
    };
  }

  useEffect(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    fetchHistoricalData()
      .then((data) => {
        setHistory(data);
      })
      .catch((error) => {
        console.error("Failed to load historical data", error);
        setHistoryError("Unable to load historical records.");
      })
      .finally(() => setHistoryLoading(false));
  }, []);


  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <CopilotPanel
            {...{ selectedIncident, setSelectedIncidentId, openIncidents, runAnalysis, analyzing, history, historyLoading, historyError }}
          />
          <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-border panel-glass">
            <div className="absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur">
              <CircleDot className="size-3.5 text-accent" /> Live Command Map · Bengaluru
            </div>
            <div className="h-full w-full">
              <CommandMap prediction={prediction} />
            </div>
            <MapLegend />
          </div>
        </section>

        {prediction && (
          <div ref={resultsRef} className="mt-8 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border panel-glass px-5 py-4">
              <p className="text-sm text-muted-foreground">
                Lock this plan into the operational calendar to track it and brief field units.
              </p>
              <button
                onClick={scheduleEvent}
                disabled={scheduled}
                className="flex items-center justify-center gap-2 rounded-xl border border-accent/50 bg-accent/15 px-4 py-2.5 text-sm font-bold text-accent transition hover:bg-accent/25 disabled:opacity-70"
              >
                {scheduled ? <><Check className="size-4" /> Added to planner</> : <><CalendarPlus className="size-4" /> Schedule this event</>}
              </button>
            </div>
            <ImpactRow p={prediction} />
            <div className="grid gap-6 lg:grid-cols-2">
              <ResourcePanel p={prediction} />
              <ExplainPanel p={prediction} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <ChainPanel p={prediction} />
              <SimilarPanel p={prediction} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <DiversionPanel p={prediction} />
              <ActionPlanPanel input={input} p={prediction} />
            </div>
            <CitizenAlert input={input} p={prediction} />
          </div>
        )}

        {!prediction && <EmptyHint />}
      </main>
    </div>
  );
}



interface CopilotProps {
  selectedIncident: Incident | null;
  setSelectedIncidentId: (id: string | null) => void;
  openIncidents: Incident[];
  runAnalysis: () => void;
  analyzing: boolean;
  history: HistoricalData | null;
  historyLoading: boolean;
  historyError: string | null;
}

function CopilotPanel(p: CopilotProps) {
  return (
    <div className="rounded-2xl border border-border panel-glass p-5">
      <div className="mb-4 flex items-center gap-2">
        <Radio className="size-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide">War-Room Copilot</h2>
      </div>
      <p className="mb-5 text-xs leading-relaxed text-muted-foreground">
        Use the latest incident from Incident Reporting to generate a response assessment.
      </p>
      <Field label="Select open incident">
        <div className="space-y-2">
          {p.openIncidents.length === 0 ? (
            <div className="rounded-xl border border-border bg-input/30 px-3 py-2 text-[11px] text-muted-foreground">
              No open incidents available. Report one under Incident Reporting.
            </div>
          ) : p.openIncidents.map((incident) => (
            <button
              key={incident.id}
              onClick={() => p.setSelectedIncidentId(incident.id)}
              className={`w-full rounded-xl border px-3 py-3 text-left text-sm transition ${p.selectedIncident?.id === incident.id ? "border-primary bg-primary/10 text-primary" : "border-border bg-input/40 text-muted-foreground hover:border-primary/40"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{incident.kind}</span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{incident.severity}</span>
              </div>
              <div className="mt-1 text-[12px] text-muted-foreground">{incident.location}</div>
            </button>
          ))}
        </div>
      </Field>

      {p.selectedIncident ? (
        <div className="mb-4 rounded-2xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Selected incident</p>
          <p className="mt-1">{p.selectedIncident.kind} reported at {p.selectedIncident.location}.</p>
          <p className="mt-1 text-[12px]">Reporter: {p.selectedIncident.reporter} · Status: {p.selectedIncident.status}</p>
        </div>
      ) : null}

      {p.historyLoading ? (
        <div className="mb-4 rounded-xl border border-border bg-input/30 px-3 py-2 text-[11px] text-muted-foreground">
          Loading historical incident and station data...
        </div>
      ) : p.historyError ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          Historical data unavailable — predictions use baseline heuristics.
        </div>
      ) : p.history ? (
        <div className="mb-4 rounded-xl border border-border bg-input/30 px-3 py-2 text-[11px] text-muted-foreground">
          Historical data source: <span className="font-semibold text-foreground">{p.history.source}</span>. {p.history.incidents.length} incidents, {p.history.stations.length} stations, {p.history.plans.length} prior plans.
        </div>
      ) : null}

      {p.openIncidents.length === 0 ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] text-warning">
          Report an incident under Incident Reporting before generating an assessment.
        </div>
      ) : null}
      <button
        onClick={p.runAnalysis}
        disabled={p.analyzing || !p.selectedIncident}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-70"
      >
        {p.analyzing ? (
          <><span className="size-4 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> Analyzing…</>
        ) : (
          <><Zap className="size-4" /> Generate AI Assessment</>
        )}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function MapLegend() {
  const items = [
    { c: "var(--critical)", l: "High load junction" },
    { c: "var(--success)", l: "Diversion route" },
    { c: "#7c87a0", l: "Police station" },
  ];
  return (
    <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-[10px] backdrop-blur">
      {items.map((i) => (
        <span key={i.l} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ background: i.c }} /> {i.l}
        </span>
      ))}
    </div>
  );
}

function Card({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-border panel-glass p-5 ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <h3 className="text-sm font-bold uppercase tracking-wide">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function ImpactRow({ p }: { p: Prediction }) {
  const sev = severityColor(p.severity);
  const stats = [
    { icon: <Gauge className="size-4" />, label: "Congestion Score", value: `${p.score}`, sub: "/ 100" },
    { icon: <Clock className="size-4" />, label: "Predicted Delay", value: `${p.delayMin}`, sub: "min" },
    { icon: <MapPin className="size-4" />, label: "Affected Radius", value: `${p.radiusKm}`, sub: "km" },
    { icon: <TrendingUp className="size-4" />, label: "Recovery Time", value: `${p.recoveryHr}`, sub: "h" },
  ];
  return (
    <Card title="AI Congestion Impact" icon={<Activity className="size-4" />}>
      <div className="mb-5 flex items-center justify-between rounded-xl border p-4" style={{ borderColor: `${sev}66`, background: `${sev}1a` }}>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Severity assessment</p>
          <p className="text-2xl font-extrabold" style={{ color: sev }}>{p.severity}</p>
          <p className="mt-1 text-xs text-muted-foreground">{p.venue.name} · {p.venue.area}</p>
        </div>
        <div className="relative grid size-20 place-items-center">
          <svg className="size-20 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--border)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={sev} strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${(p.score / 100) * 97.4} 97.4`} />
          </svg>
          <span className="absolute text-mono text-lg font-bold" style={{ color: sev }}>{p.score}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-input/30 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{s.icon}<span className="text-[10px] uppercase tracking-wide">{s.label}</span></div>
            <p className="text-mono text-xl font-bold">{s.value}<span className="ml-1 text-xs font-normal text-muted-foreground">{s.sub}</span></p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ResourcePanel({ p }: { p: Prediction }) {
  const r = p.resources;
  const res = [
    { icon: <Users className="size-4" />, label: "Officers", value: r.officers },
    { icon: <Cone className="size-4" />, label: "Barricades", value: r.barricades },
    { icon: <Truck className="size-4" />, label: "Tow Trucks", value: r.towTrucks },
    { icon: <Ambulance className="size-4" />, label: "Ambulances", value: r.ambulances },
  ];
  return (
    <Card title="Resource Recommendation" icon={<ShieldAlert className="size-4" />}>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {res.map((x) => (
          <div key={x.label} className="rounded-xl border border-border bg-input/30 p-3 text-center">
            <div className="mx-auto mb-1 flex size-8 items-center justify-center rounded-lg bg-primary/15 text-primary">{x.icon}</div>
            <p className="text-mono text-2xl font-bold">{x.value}</p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{x.label}</p>
          </div>
        ))}
      </div>

      {r.deficit > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-critical/40 bg-critical/15 px-3 py-2.5 text-xs font-semibold text-critical">
          <AlertTriangle className="size-4" /> SHORTAGE: {r.deficit} officers — escalate to city reserve.
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/40 bg-success/15 px-3 py-2.5 text-xs font-semibold text-success">
          <Check className="size-4" /> Demand fully covered by nearby stations.
        </div>
      )}

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Officer sourcing</p>
      <div className="space-y-2">
        {r.allocations.map((a) => (
          <div key={a.station} className="flex items-center justify-between rounded-lg border border-border bg-input/20 px-3 py-2 text-sm">
            <span className="flex items-center gap-2"><MapPin className="size-3.5 text-accent" /> {a.station}</span>
            <span className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="text-mono font-bold text-foreground">{a.officers} off.</span>
              <span className="flex items-center gap-1"><Clock className="size-3" /> {a.responseMin}m</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ExplainPanel({ p }: { p: Prediction }) {
  const max = Math.max(...p.factors.map((f) => f.weight));
  return (
    <Card title="Explainable AI" icon={<Brain className="size-4" />}>
      <p className="mb-4 text-xs text-muted-foreground">Why this severity? Top contributing signals, weighted.</p>
      <div className="space-y-3">
        {p.factors.map((f) => (
          <div key={f.label}>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span>{f.label}</span>
              <span className="text-mono font-semibold text-primary">+{f.weight}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-input/50">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(f.weight / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChainPanel({ p }: { p: Prediction }) {
  return (
    <Card title="Chain-Reaction Predictor" icon={<Zap className="size-4" />}>
      <p className="mb-4 text-xs text-muted-foreground">What happens next if no intervention is made.</p>
      <div className="space-y-1">
        {p.chain.map((c, i) => {
          const col = c.risk > 0.66 ? "var(--critical)" : c.risk > 0.4 ? "var(--warning)" : "var(--success)";
          return (
            <div key={c.step}>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-input/20 px-3 py-2.5">
                <span className="text-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="flex-1 text-sm">{c.step}</span>
                <span className="text-mono text-xs font-bold" style={{ color: col }}>{(c.risk * 100).toFixed(0)}%</span>
              </div>
              {i < p.chain.length - 1 && <div className="ml-[18px] h-3 w-px bg-border" />}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function SimilarPanel({ p }: { p: Prediction }) {
  const s = p.similar;
  return (
    <Card title="Event Similarity AI" icon={<History className="size-4" />}>
      <div className="mb-3 flex items-center justify-between rounded-xl border border-accent/40 bg-accent/10 px-4 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Closest historical match</p>
          <p className="text-sm font-bold">{s.event.id} · {s.event.type}</p>
        </div>
        <span className="text-mono text-2xl font-extrabold text-accent">{(s.match * 100).toFixed(0)}%</span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Row k="Venue" v={s.event.venue} />
        <Row k="Attendees" v={s.event.attendees.toLocaleString()} />
        <Row k="Actual delay" v={`${s.event.delayMin} min`} />
        <Row k="Officers used" v={`${s.event.officersUsed}`} />
        <Row k="Outcome" v={s.event.outcome} />
        <Row k="Time" v={fmtHour(s.event.hour)} />
      </dl>
      <div className="mt-3 rounded-lg border border-border bg-input/20 p-3">
        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-primary"><Brain className="size-3.5" /> Lesson learned</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{s.event.lesson}</p>
      </div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg border border-border bg-input/20 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</dt>
      <dd className="text-sm font-semibold">{v}</dd>
    </div>
  );
}

function DiversionPanel({ p }: { p: Prediction }) {
  return (
    <Card title="Diversion & Emergency Corridor" icon={<Siren className="size-4" />}>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Suggested diversions</p>
      <div className="space-y-2">
        {p.diversions.map((d) => (
          <div key={d.name} className="flex items-center justify-between rounded-lg border border-border bg-input/20 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm">
              <span className="size-3 rounded-full" style={{ background: d.color }} /> {d.name}
            </span>
            <span className="text-mono text-xs font-semibold text-success">−{d.saveMin} min</span>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl border border-info/40 bg-info/10 p-4">
        <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-info"><Ambulance className="size-4" /> Emergency green corridor</p>
        <div className="flex items-center justify-center gap-4">
          <div className="text-center">
            <p className="text-mono text-2xl font-bold text-muted-foreground line-through">{p.emergency.baselineMin}</p>
            <p className="text-[10px] uppercase text-muted-foreground">baseline</p>
          </div>
          <ArrowRight className="size-5 text-info" />
          <div className="text-center">
            <p className="text-mono text-3xl font-extrabold text-info">{p.emergency.optimizedMin}</p>
            <p className="text-[10px] uppercase text-muted-foreground">optimized min</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ActionPlanPanel({ input, p }: { input: PredictionInput; p: Prediction }) {
  const heuristic = useMemo(() => buildActionPlan(input, p), [input, p]);
  const [aiPlan, setAiPlan] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const plan = aiPlan ?? heuristic;

  async function generate() {
    setLoading(true);
    setErr(null);
    try {
      const res = await generateActionPlan({ data: { briefing: heuristic } });
      if (res.source === "ai" && res.plan) {
        setAiPlan(res.plan);
      } else {
        setErr(
          res.status === 429
            ? "AI rate limit reached — try again shortly."
            : res.status === 402
            ? "AI credits exhausted — add credits to continue."
            : "AI unavailable — showing the baseline plan.",
        );
      }
    } catch {
      setErr("AI unavailable — showing the baseline plan.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(plan);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Card title="AI Action Plan" icon={<Megaphone className="size-4" />}>
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={generate}
          disabled={loading}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-70"
        >
          {loading ? (
            <><span className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" /> Generating…</>
          ) : aiPlan ? (
            <><RotateCw className="size-3.5" /> Regenerate with AI</>
          ) : (
            <><Sparkles className="size-3.5" /> Generate with AI</>
          )}
        </button>
        <span className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${aiPlan ? "border-accent/40 bg-accent/10 text-accent" : "border-border bg-input/30 text-muted-foreground"}`}>
          {aiPlan ? "AI-generated" : "Baseline"}
        </span>
      </div>
      {err && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] font-medium text-warning">
          <AlertTriangle className="size-3.5" /> {err}
        </div>
      )}
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background/60 p-3 text-mono text-[11px] leading-relaxed text-foreground/90">{plan}</pre>
      <button onClick={copy} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-primary/50 bg-primary/15 px-4 py-2.5 text-sm font-semibold text-primary transition hover:bg-primary/25">
        {copied ? <><Check className="size-4" /> Copied to clipboard</> : <><Copy className="size-4" /> Copy action plan</>}
      </button>
    </Card>
  );
}


function CitizenAlert({ input, p }: { input: PredictionInput; p: Prediction }) {
  return (
    <Card title="Citizen Alert System" icon={<Megaphone className="size-4" />}>
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-background/70 p-4 shadow-glow">
        <div className="mb-2 flex items-center gap-2 text-warning">
          <AlertTriangle className="size-4" /> <span className="text-xs font-bold uppercase tracking-wide">Traffic Advisory</span>
        </div>
        <p className="text-sm leading-relaxed">
          <strong>{input.type}</strong> at <strong>{p.venue.name}</strong> from {fmtHour(input.hour)} for {input.durationHr}h.
          Expect <strong>{p.delayMin} min</strong> delays within {p.radiusKm} km.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-critical/30 bg-critical/10 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Avoid</p>
            <p className="font-semibold text-critical">{p.junctions[0].name}</p>
          </div>
          <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2">
            <p className="text-[10px] uppercase text-muted-foreground">Use</p>
            <p className="font-semibold text-success">{p.diversions[0].name.replace(/^Route \w+ · /, "")}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] text-muted-foreground">— Bengaluru Traffic Police · GridMind AI</p>
      </div>
    </Card>
  );
}

function EmptyHint() {
  const steps = ["Enter event", "AI predicts impact", "Recommend resources", "Map diversions", "Generate plan", "Learn from history"];
  return (
    <div className="mt-10 rounded-2xl border border-dashed border-border panel-glass p-8 text-center">
      <Activity className="mx-auto mb-3 size-8 text-primary" />
      <h3 className="text-lg font-bold">Configure an event to launch the assessment</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">GridMind runs the full command-center pipeline in one click.</p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-xs">
        {steps.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span className="rounded-full border border-border bg-input/40 px-3 py-1.5 font-medium">{s}</span>
            {i < steps.length - 1 && <ChevronRight className="size-3.5 text-muted-foreground" />}
          </span>
        ))}
      </div>
    </div>
  );
}
