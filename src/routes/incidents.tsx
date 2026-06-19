import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Siren, Plus, Trash2, AlertTriangle, Clock, MapPin, Radio, CheckCircle2, Send,
  TrendingUp, ShieldAlert, Truck, Ambulance, Zap,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import {
  useIncidents, uid,
  type Incident, type IncidentKind, type IncidentSeverity,
} from "@/lib/store";
import { computeEscalation, ESCALATION_STYLE } from "@/lib/escalation";
import { LocationSearch } from "@/components/LocationSearch";
import { DEFAULT_PLACE } from "@/lib/locations";
import type { Venue } from "@/lib/gridmind";

export const Route = createFileRoute("/incidents")({
  head: () => ({
    meta: [
      { title: "Incident Reporting — GridMind AI" },
      { name: "description", content: "Report and track live traffic incidents — accidents, breakdowns, signal failures and crowd surges — and dispatch response across Bengaluru." },
    ],
  }),
  component: IncidentsPage,
});

const KINDS: IncidentKind[] = ["Accident", "Breakdown", "Signal Failure", "Waterlogging", "Road Block", "VIP Movement", "Crowd Surge"];
const SEVERITIES: IncidentSeverity[] = ["Low", "Medium", "High", "Critical"];

const sevStyle: Record<IncidentSeverity, string> = {
  Low: "border-success/40 bg-success/10 text-success",
  Medium: "border-info/40 bg-info/10 text-info",
  High: "border-warning/40 bg-warning/10 text-warning",
  Critical: "border-critical/40 bg-critical/10 text-critical",
};
const statusStyle = {
  Open: "border-critical/40 bg-critical/10 text-critical",
  Dispatched: "border-warning/40 bg-warning/10 text-warning",
  Resolved: "border-success/40 bg-success/10 text-success",
} as const;

function IncidentsPage() {
  const { incidents, addIncident, updateIncident, removeIncident } = useIncidents();
  const open = incidents.filter((i) => i.status !== "Resolved");

  // Smart Escalation Engine: rank every open incident by computed urgency.
  const escalated = open
    .map((i) => ({ i, esc: computeEscalation(i, incidents) }))
    .filter((x) => x.esc.level === "High Priority" || x.esc.level === "Critical")
    .sort((a, b) => b.esc.score - a.esc.score);

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-critical/15 text-critical"><Siren className="size-5" /></div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Incident Reporting</h1>
            <p className="text-xs text-muted-foreground">Log live field incidents — the Smart Escalation Engine auto-prioritises them by severity, age and clustering.</p>
          </div>
        </div>

        {escalated.length > 0 && (
          <div className="mb-6 rounded-2xl border border-critical/40 bg-critical/10 p-5">
            <div className="flex items-center gap-2 text-critical">
              <Zap className="size-5" />
              <h2 className="text-sm font-bold uppercase tracking-wide">Auto-escalated — {escalated.length} critical alert(s)</h2>
            </div>
            <div className="mt-3 space-y-2">
              {escalated.slice(0, 3).map(({ i, esc }) => (
                <div key={i.id} className="rounded-xl border border-critical/30 bg-card/40 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{i.kind} · {i.location}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase ${ESCALATION_STYLE[esc.level]}`}>{esc.level}</span>
                  </div>
                  <p className="mt-1 text-muted-foreground">{esc.reasons.join(" · ")}</p>
                  <p className="mt-1 font-semibold text-foreground">
                    Recommend: +{esc.recommend.officers} officers
                    {esc.recommend.towTrucks > 0 && `, +${esc.recommend.towTrucks} tow truck(s)`}
                    {esc.recommend.ambulances > 0 && `, +${esc.recommend.ambulances} ambulance`}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Metric label="Active incidents" value={open.length} icon={<AlertTriangle className="size-4" />} />
          <Metric label="Auto-escalated" value={escalated.length} icon={<Zap className="size-4" />} />
          <Metric label="Resolved" value={incidents.filter((i) => i.status === "Resolved").length} icon={<CheckCircle2 className="size-4" />} />
        </div>


        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <ReportForm onAdd={addIncident} />

          <div className="space-y-3">
            {incidents.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
                No incidents reported. Use the form to log a field report.
              </div>
            )}
            {incidents.map((i) => {
              const esc = computeEscalation(i, incidents);
              return (
              <div key={i.id} className="rounded-2xl border border-border panel-glass p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-mono text-[11px] text-muted-foreground">{i.id}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${sevStyle[i.severity]}`}>{i.severity}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle[i.status]}`}>{i.status}</span>
                      {i.status !== "Resolved" && (
                        <span className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${ESCALATION_STYLE[esc.level]}`}>
                          <Zap className="size-3" />{esc.level}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-sm font-bold">{i.kind}</h3>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><MapPin className="size-3" /> {i.location}</span>
                      <span className="flex items-center gap-1"><Clock className="size-3" /> {timeAgo(i.createdAt)}</span>
                      <span className="flex items-center gap-1"><Radio className="size-3" /> {i.reporter}</span>
                    </div>
                    {i.description && <p className="mt-2 text-xs text-foreground/90">{i.description}</p>}
                  </div>
                  <button onClick={() => removeIncident(i.id)} className="rounded-lg border border-border p-2 text-muted-foreground transition hover:border-critical/40 hover:text-critical">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {i.status !== "Resolved" && (esc.level === "High Priority" || esc.level === "Critical") && (
                  <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
                    <div className="mb-1 flex items-center gap-1.5 font-bold text-warning"><TrendingUp className="size-3.5" /> Escalation rationale</div>
                    <p className="text-muted-foreground">{esc.reasons.join(" · ")}</p>
                    <div className="mt-2 flex flex-wrap gap-2 text-foreground">
                      <span className="flex items-center gap-1 rounded-md bg-input/40 px-2 py-1"><ShieldAlert className="size-3" />+{esc.recommend.officers} officers</span>
                      {esc.recommend.towTrucks > 0 && <span className="flex items-center gap-1 rounded-md bg-input/40 px-2 py-1"><Truck className="size-3" />+{esc.recommend.towTrucks} tow</span>}
                      {esc.recommend.ambulances > 0 && <span className="flex items-center gap-1 rounded-md bg-input/40 px-2 py-1"><Ambulance className="size-3" />+{esc.recommend.ambulances} ambulance</span>}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Action active={i.status === "Dispatched"} onClick={() => updateIncident(i.id, { status: "Dispatched" })} icon={<Send className="size-3.5" />}>Dispatch unit</Action>
                  <Action active={i.status === "Resolved"} onClick={() => updateIncident(i.id, { status: "Resolved" })} icon={<CheckCircle2 className="size-3.5" />}>Resolve</Action>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function ReportForm({ onAdd }: { onAdd: (i: Incident) => void }) {
  const [kind, setKind] = useState<IncidentKind>("Accident");
  const [severity, setSeverity] = useState<IncidentSeverity>("High");
  const [location, setLocation] = useState<Venue>(DEFAULT_PLACE);
  const [reporter, setReporter] = useState("Patrol Unit");
  const [description, setDescription] = useState("");
  const [done, setDone] = useState(false);

  function submit() {
    onAdd({
      id: uid("INC"),
      kind, severity,
      location: `${location.name}, ${location.area}`.slice(0, 120),
      reporter: reporter.trim().slice(0, 60) || "Patrol Unit",
      description: description.trim().slice(0, 400),
      status: "Open",
      createdAt: Date.now(),
    });
    setDescription("");
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }

  return (
    <div className="h-fit rounded-2xl border border-border panel-glass p-5">
      <div className="mb-4 flex items-center gap-2">
        <Plus className="size-4 text-critical" />
        <h2 className="text-sm font-bold uppercase tracking-wide">Report incident</h2>
      </div>

      <FieldLabel label="Type">
        <select value={kind} onChange={(e) => setKind(e.target.value as IncidentKind)} className={inputCls}>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </FieldLabel>

      <FieldLabel label="Severity">
        <div className="grid grid-cols-4 gap-2">
          {SEVERITIES.map((s) => (
            <button key={s} onClick={() => setSeverity(s)} className={`rounded-lg border px-1 py-2 text-[11px] font-semibold transition ${severity === s ? sevStyle[s] : "border-border bg-input/40 text-muted-foreground"}`}>{s}</button>
          ))}
        </div>
      </FieldLabel>

      <FieldLabel label="Location · Bengaluru">
        <LocationSearch value={location} onChange={setLocation} placeholder="Search incident location…" />
      </FieldLabel>
      <FieldLabel label="Reported by">
        <input value={reporter} onChange={(e) => setReporter(e.target.value)} className={inputCls} />
      </FieldLabel>
      <FieldLabel label="Description">
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Brief situation report…" className={inputCls} />
      </FieldLabel>

      <button onClick={submit} className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-critical px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110 disabled:opacity-50">
        {done ? <><CheckCircle2 className="size-4" /> Reported</> : <><Siren className="size-4" /> File report</>}
      </button>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-input/60 px-3 py-2.5 text-sm outline-none focus:border-primary";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Action({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-primary bg-primary/15 text-primary" : "border-border bg-input/30 text-muted-foreground hover:text-foreground"}`}>
      {icon}{children}
    </button>
  );
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border panel-glass p-4">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wide">{label}</span></div>
      <p className="text-mono text-2xl font-bold">{value}</p>
    </div>
  );
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
