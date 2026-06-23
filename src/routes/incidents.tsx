import { API_BASE } from "@/lib/api";
import { useState, useEffect } from "react";
import {
  Siren, Plus, Trash2, AlertTriangle, Clock, MapPin, Radio, CheckCircle2, Send,
  TrendingUp, ShieldAlert, Truck, Ambulance, Zap, ClipboardCheck, Brain, ArrowRight, BrainCircuit,
} from "lucide-react";
import {
  useIncidents, uid,
  type Incident, type IncidentKind, type IncidentSeverity,
} from "@/lib/store";
import { computeEscalation, ESCALATION_STYLE } from "@/lib/escalation";
import { LocationSearch } from "@/components/LocationSearch";
import { DEFAULT_PLACE, ALL_PLACES } from "@/lib/locations";
import { toast } from "sonner";
import type { Venue } from "@/lib/gridmind";

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

export default function IncidentsPage() {
  useEffect(() => {
    document.title = "Incident Reporting — Talos.ai";
  }, []);
  const { incidents, addIncident, updateIncident, removeIncident } = useIncidents();
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);
  const [retrainingState, setRetrainingState] = useState<"idle" | "running" | "completed">("idle");
  const open = incidents.filter((i) => i.status !== "Resolved");

  // Smart Escalation Engine: rank every open incident by computed urgency.
  const escalated = open
    .map((i) => ({ i, esc: computeEscalation(i, incidents) }))
    .filter((x) => x.esc.level === "High Priority" || x.esc.level === "Critical")
    .sort((a, b) => b.esc.score - a.esc.score);

  return (
    <div className="min-h-screen grid-bg">

      <main className="mx-auto w-[90%] md:w-[85%] pb-24 pt-6">
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
                    <Action active={feedbackFor === i.id || i.status === "Resolved"} onClick={() => setFeedbackFor(feedbackFor === i.id ? null : i.id)} icon={<ClipboardCheck className="size-3.5" />}>Post-incident feedback</Action>
                  </div>

                  {i.outcome && feedbackFor !== i.id && (
                    <div className="mt-3 rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
                      <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                        <span>Clearance time <strong className="text-foreground">{i.actualDelayMin} min</strong></span>
                        <span>Officers used <strong className="text-foreground">{i.actualOfficers}</strong></span>
                        <span>Outcome <strong className="text-foreground">{i.outcome}</strong></span>
                      </div>
                      {i.lesson && <p className="mt-2 flex items-start gap-1.5 text-muted-foreground"><Brain className="mt-0.5 size-3.5 text-primary" /> {i.lesson}</p>}
                    </div>
                  )}

                  {feedbackFor === i.id && (
                    <IncidentFeedbackForm
                      i={i}
                      onSave={async (patch) => {
                        const locLower = i.location.toLowerCase();
                        const place = ALL_PLACES.find(p => locLower.includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
                        
                        setRetrainingState("running");
                        
                        // 1. Fetch prediction
                        let predictedDelayMin = 30;
                        try {
                          const predRes = await fetch(`${API_BASE}/api/predict-impact`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              event_type: i.event_type || "unplanned",
                              event_cause: i.event_cause || "others",
                              corridor: i.corridor || "Non-corridor",
                              veh_type: i.veh_type || "heavy_vehicle",
                              priority: i.severity === "Critical" ? "Critical" : i.severity === "High" ? "High" : i.severity === "Medium" ? "Medium" : "Low",
                              zone: i.zone || "Central Zone 2",
                              latitude: place.lat,
                              longitude: place.lng,
                              endlatitude: 0,
                              endlongitude: 0,
                              created_date: new Date(i.createdAt).toISOString(),
                              reason_breakdown: i.description || ""
                            })
                          });
                          if (predRes.ok) {
                            const predData = await predRes.json();
                            predictedDelayMin = Math.round(predData.s_impact);
                          }
                        } catch (e) {
                          console.warn("Incident prediction fetch failed:", e);
                        }

                        // 2. Retrain model
                        try {
                          const res = await fetch(`${API_BASE}/api/retrain`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: i.id,
                              event_type: i.event_type || "unplanned",
                              latitude: place.lat,
                              longitude: place.lng,
                              endlatitude: 0,
                              endlongitude: 0,
                              event_cause: i.event_cause || "others",
                              created_date: new Date(i.createdAt).toISOString(),
                              actual_duration_mins: patch.actualDelayMin ?? predictedDelayMin,
                              zone: i.zone || "Central Zone 2",
                              corridor: i.corridor || "Non-corridor",
                              description: i.description || "",
                              priority: i.severity
                            })
                          });
                          if (!res.ok) throw new Error("Retrain failed");
                          
                          updateIncident(i.id, {
                            ...patch,
                            status: "Resolved",
                            predictedDelayMin,
                            modelUpdated: true
                          });
                          setRetrainingState("completed");
                          toast.success("Model retrained successfully (Model OP).");
                        } catch (err) {
                          console.error("Retrain failed:", err);
                          updateIncident(i.id, {
                            ...patch,
                            status: "Resolved",
                            predictedDelayMin,
                            modelUpdated: false
                          });
                          setRetrainingState("completed");
                          toast.error("Model retraining failed. Saved locally.");
                        }
                        setFeedbackFor(null);
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <RetrainingPopup state={retrainingState} onClose={() => setRetrainingState("idle")} />
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

function IncidentFeedbackForm({ i, onSave }: { i: Incident; onSave: (patch: Partial<Incident>) => void }) {
  const [delay, setDelay] = useState(i.actualDelayMin ?? 30);
  const [officers, setOfficers] = useState(i.actualOfficers ?? 2);
  const [outcome, setOutcome] = useState<NonNullable<Incident["outcome"]>>(i.outcome ?? "Successful");
  const [lesson, setLesson] = useState(i.lesson ?? "");

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <ClipboardCheck className="size-3.5" /> Record clearance metrics
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label={`Clearance time · ${delay} min`}>
          <input type="range" min={5} max={240} step={5} value={delay} onChange={(ev) => setDelay(+ev.target.value)} className="w-full accent-[var(--primary)]" />
        </FieldLabel>
        <FieldLabel label={`Officers deployed · ${officers}`}>
          <input type="range" min={0} max={40} value={officers} onChange={(ev) => setOfficers(+ev.target.value)} className="w-full accent-[var(--primary)]" />
        </FieldLabel>
      </div>
      <FieldLabel label="Response Outcome">
        <div className="flex gap-2">
          {(["Successful", "Partial", "Strained"] as const).map((o) => (
            <button key={o} onClick={() => setOutcome(o)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition ${outcome === o ? "border-primary bg-primary/15 text-primary" : "border-border bg-input/40 text-muted-foreground"}`}>{o}</button>
          ))}
        </div>
      </FieldLabel>
      <FieldLabel label="Field Notes / Lessons">
        <textarea value={lesson} onChange={(ev) => setLesson(ev.target.value)} rows={2} placeholder="e.g. Needed 2 more barricades to block the service road." className={inputCls} />
      </FieldLabel>
      <button
        onClick={() => onSave({ actualDelayMin: delay, actualOfficers: officers, outcome, lesson })}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110"
      >
        <CheckCircle2 className="size-4" /> Save feedback & mark resolved
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

function RetrainingPopup({ state, onClose }: { state: "idle" | "running" | "completed"; onClose: () => void }) {
  if (state === "idle") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm">
      <div className="w-[95%] max-w-sm rounded-2xl border border-primary/30 bg-background/90 panel-glass p-6 text-center shadow-2xl relative overflow-hidden">
        <div className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-primary/20 text-primary">
          Model OP
        </div>
        
        {state === "running" ? (
          <div className="space-y-4 py-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary animate-pulse">
              <BrainCircuit className="size-6 animate-spin duration-3000" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">TALOS.AI Model Retraining Active</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-normal">
                Appending feedback to historical dataset and performing Random Forest regression training...
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-3">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-success/40 bg-success/10 text-success">
              <CheckCircle2 className="size-6 animate-bounce" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground uppercase tracking-wide">Model Retrained Successfully!</h3>
              <p className="mt-1.5 text-xs text-muted-foreground leading-normal">
                Neural network coefficients updated. Analytics page marked with alignment status.
              </p>
            </div>
            <button
              onClick={onClose}
              className="mt-2 w-full rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110 shadow-md"
            >
              Acknowledge & Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
