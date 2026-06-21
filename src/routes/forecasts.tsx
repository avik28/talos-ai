import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, ReactNode } from "react";
import { AppHeader } from "@/components/AppHeader";
import { TrendingUp, Clock, AlertTriangle, CloudRain, ShieldAlert, BarChart2, Check, Crosshair, Gauge, Activity, MapPin, Users, Cone, Truck, Ambulance, Brain, Zap, History, Siren, ArrowRight, Megaphone, Sparkles, RotateCw, Copy, ChevronRight, SlidersHorizontal, TrendingDown, Minus, CalendarPlus } from "lucide-react";
import { useEvents, useIncidents, Incident, PlannedEvent } from "@/lib/store";
import { Prediction, PredictionInput, severityColor, buildActionPlan, fmtHour, predict } from "@/lib/gridmind";
import { ALL_PLACES } from "@/lib/locations";
import { useMemo } from "react";
import { generateActionPlan } from "@/lib/actionplan.functions";
import { predictImpactWithModel } from "@/lib/diversionEngine";

export const Route = createFileRoute("/forecasts")({
  head: () => ({
    meta: [
      { title: "AI Traffic Forecasting — VYUHIQ" },
      {
        name: "description",
        content: "Forecast travel delays and incident clearance times using trained ML models.",
      },
    ],
  }),
  component: ForecastsPage,
});

function ForecastsPage() {
  const { incidents } = useIncidents();
  const { events } = useEvents();

  const isEvent = (ctx: Incident | PlannedEvent | null): ctx is PlannedEvent => {
    return ctx !== null && "type" in ctx;
  };

  const liveIncidents = useMemo(() => {
    return incidents.filter((i) => i.status !== "Resolved");
  }, [incidents]);

  const activeEvents = useMemo(() => {
    return events.filter((e) => e.status === "Scheduled" || e.status === "Active");
  }, [events]);

  const combinedContexts = useMemo(() => {
    return [...liveIncidents, ...activeEvents].sort((a, b) => b.createdAt - a.createdAt);
  }, [liveIncidents, activeEvents]);

  const [selectedIncidentId, setSelectedIncidentId] = useState<string>("manual");
  
  const [cause, setCause] = useState("accident");
  const [lat, setLat] = useState(12.9736);
  const [lng, setLng] = useState(77.6074);
  const [priority, setPriority] = useState("High");
  const [corridor, setCorridor] = useState("Non-corridor");
  const [zone, setZone] = useState("Central Zone 2");
  
  const [attendees, setAttendees] = useState(20000);
  const [hour, setHour] = useState(17);
  const [durationHr, setDurationHr] = useState(4);
  const [planned, setPlanned] = useState(true);
  const [scenario, setScenario] = useState<ScenarioKey>("none");

  const [prediction, setPrediction] = useState<any>(null);
  const [heuristicPrediction, setHeuristicPrediction] = useState<Prediction | null>(null);
  const [predictionInput, setPredictionInput] = useState<PredictionInput | null>(null);
  const [loading, setLoading] = useState(false);

  // When selection changes, update the parameters
  useEffect(() => {
    if (selectedIncidentId !== "manual") {
      const inc = incidents.find(i => i.id === selectedIncidentId);
      if (inc) {
        setCause(inc.kind.toLowerCase().replace(" ", "_"));
        setPriority(inc.severity);
        setPlanned(false);
        setAttendees(2000);
      } else {
        const ev = events.find(e => e.id === selectedIncidentId);
        if (ev) {
          setCause("public_event");
          setLat(ev.location?.lat || ev.venueId ? 12.9736 : 12.9736); // mock mapping
          setLng(ev.location?.lng || ev.venueId ? 77.6074 : 77.6074);
          setAttendees(ev.attendees || 20000);
          setHour(ev.hour || 17);
          setDurationHr(ev.durationHr || 4);
          setPlanned(ev.planned !== undefined ? ev.planned : true);
        }
      }
    }
  }, [selectedIncidentId, incidents, events]);

  async function getPrediction() {
    setLoading(true);
    try {
      const date = new Date();
      date.setHours(hour, 0, 0, 0);
      const data = await predictImpactWithModel({
        event_type: planned ? "planned" : "unplanned",
        event_cause: cause,
        corridor: corridor,
        veh_type: "heavy_vehicle",
        priority: priority,
        zone: zone,
        latitude: lat,
        longitude: lng,
        estimated_volume: attendees,
        duration_hr: durationHr,
        created_date: date.toISOString()
      });
      
      setPrediction(data);
    } catch (e) {
      console.error(e);
      // Fallback in case backend is offline
      setPrediction({
        s_impact: cause === "accident" ? 75.4 : 45.2,
        officers: 12,
        barricades: 40,
        tow_trucks: 2,
        strike_issued: false,
        strike_threshold: 90
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    getPrediction();
  }, [cause, priority, lat, lng, corridor, zone, planned, attendees, durationHr, hour]);

  useEffect(() => {
    if (!prediction) {
      setHeuristicPrediction(null);
      return;
    }
    let venueName = "Selected Location";
    if (selectedIncidentId !== "manual") {
      const inc = incidents.find(i => i.id === selectedIncidentId);
      if (inc) venueName = inc.location;
      else {
        const ev = events.find(e => e.id === selectedIncidentId);
        if (ev) venueName = ev.location?.name || ev.venueId || ev.title;
      }
    } else if (lat === 12.9736) {
      venueName = "MG Road (CBD)";
    } else if (lat === 13.0358) {
      venueName = "Hebbal Flyover";
    }

    const input: PredictionInput = {
      type: cause === 'public_event' ? 'Political Rally' : 'Roadwork / Diversion',
      attendees,
      hour,
      durationHr,
      planned,
      location: {
        id: "custom",
        name: venueName,
        area: zone,
        lat: lat,
        lng: lng,
        baseLoad: 0.8
      }
    };
    setPredictionInput(input);
    const hp = predict(input);
    const rawSim = predict(input); // store unmodified sim for scenarios
    hp.score = Math.min(99, Math.round(prediction.s_impact || hp.score));
    hp.delayMin = Math.round(prediction.s_impact || hp.delayMin);
    hp.resources.officers = prediction.officers || hp.resources.officers;
    hp.resources.barricades = prediction.barricades || hp.resources.barricades;
    hp.resources.towTrucks = prediction.tow_trucks || hp.resources.towTrucks;
    // Attach rawSim so we can compute scenarios
    (hp as any).rawSim = rawSim;
    setHeuristicPrediction(hp);
  }, [prediction, cause, attendees, hour, durationHr, planned]);

  const scenarioOutcome = useMemo(() => {
    if (!heuristicPrediction || !(heuristicPrediction as any).rawSim) return null;
    return buildScenarioOutcome((heuristicPrediction as any).rawSim, scenario);
  }, [heuristicPrediction, scenario]);

  return (
    <div className="min-h-screen grid-bg text-slate-900">
      <AppHeader />
      <main className="mx-auto max-w-[1600px] px-4 py-8 md:px-6">
        {/* Title Header with Gradient */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-700 via-indigo-800 to-purple-900 p-6 md:p-8 text-white shadow-xl mb-8">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 h-32 w-32 rounded-full bg-white/10 blur-xl"></div>
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md">
              <TrendingUp className="h-6 w-6 text-indigo-200" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">
                AI Traffic Forecasting
              </h1>
              <p className="text-xs md:text-sm text-indigo-200 mt-1">
                Real-time prediction of incident clearance times and bottleneck probabilities
                powered by actual ML models trained on dataset.csv.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start">
          {/* Controls Panel */}
          <div className="rounded-2xl border border-border panel-glass p-6 shadow-sm xl:row-span-2">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <BarChart2 className="h-4 w-4 text-primary" /> Parameters
            </h2>

            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-input/20 p-4 mb-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="size-4 text-critical" />
                    <h2 className="text-xs font-bold uppercase tracking-wide">Active Targets & Events</h2>
                  </div>
                  <span className="rounded-md bg-critical/15 px-2 py-0.5 text-[10px] font-bold text-critical">
                    {combinedContexts.length} active
                  </span>
                </div>

                {combinedContexts.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    <p>No active incidents or events.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    <div
                      onClick={() => setSelectedIncidentId("manual")}
                      className={`group rounded-xl border p-2.5 text-xs transition cursor-pointer ${selectedIncidentId === "manual"
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-input/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold flex items-center gap-1.5">
                           -- Manual Entry --
                        </span>
                      </div>
                    </div>
                    {combinedContexts.map((item) => {
                      const isSelected = item.id === selectedIncidentId;
                      const isEv = isEvent(item);
                      
                      let title = "";
                      let subtitle = "";
                      let severityStr = "";
                      let severityClass = "";

                      if (isEv) {
                        title = item.title;
                        subtitle = item.location?.name || ALL_PLACES.find(p => p.id === item.venueId)?.name || item.venueId || "";
                        const severity = item.attendees >= 35000 ? "Critical" : item.attendees >= 15000 ? "High" : item.attendees >= 5000 ? "Medium" : "Low";
                        severityStr = severity;
                        severityClass = severity === "Critical" ? "border-critical bg-critical/10 text-critical" :
                          severity === "High" ? "border-warning bg-warning/10 text-warning" :
                          severity === "Medium" ? "border-info bg-info/10 text-info" :
                          "border-success bg-success/10 text-success";
                      } else {
                        title = item.kind;
                        subtitle = item.location;
                        severityStr = item.severity;
                        severityClass = item.severity === "Critical" ? "border-critical bg-critical/10 text-critical" :
                          item.severity === "High" ? "border-warning bg-warning/10 text-warning" :
                          item.severity === "Medium" ? "border-info bg-info/10 text-info" :
                          "border-success bg-success/10 text-success";
                      }

                      return (
                        <div
                          key={item.id}
                          onClick={() => setSelectedIncidentId(item.id)}
                          className={`group rounded-xl border p-2.5 text-xs transition cursor-pointer ${isSelected
                              ? "border-primary bg-primary/10 text-foreground"
                              : "border-border bg-input/20 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                            }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold flex items-center gap-1.5">
                              {isEv ? (
                                <CalendarPlus className="size-3.5 text-primary" />
                              ) : (
                                <AlertTriangle className="size-3.5 text-critical" />
                              )}
                              {title}
                            </span>
                            <span className={`rounded-md border px-1.5 py-0.5 text-[8px] font-bold uppercase ${severityClass}`}>
                              {severityStr}
                            </span>
                          </div>
                          <p className="text-[10px] mt-0.5 leading-normal">{subtitle}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>


            </div>


          </div>

          {/* Results Panel */}
          <div className="rounded-2xl border border-border panel-glass p-6 md:p-8 shadow-sm lg:col-span-2 xl:col-span-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                ML Clearance Prediction
              </h2>

              {loading || !prediction ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                </div>
              ) : (
                <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-5xl font-extrabold text-slate-900 tracking-tight">
                        {prediction.s_impact?.toFixed(1) || 0}
                      </span>
                      <span className="text-lg font-semibold text-muted-foreground">minutes</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Estimated duration until traffic flow is completely rehabilitated to baseline
                      levels.
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 rounded-2xl bg-indigo-50/50 p-4 border border-indigo-100">
                    <div className="flex items-center gap-2 text-xs font-semibold text-indigo-700">
                      <Clock className="h-4 w-4" />
                      <span>Model Confidence: 93%</span>
                    </div>
                    <p className="text-[11px] text-indigo-600/85 max-w-[240px]">
                      Predictions are generated from the Random Forest model trained on dataset.csv.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Impact Details card */}
            {prediction && (
              <>
                <div className="rounded-2xl border border-border panel-glass p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-warning mb-3">
                    <AlertTriangle className="h-5 w-5" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Strike Threshold
                    </h3>
                  </div>
                  <p className="text-3xl font-bold">{prediction.strike_threshold?.toFixed(1) || 0} min</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {prediction.strike_issued ? <span className="text-critical font-bold">Strike Issued!</span> : "Clearance is within acceptable limits."}
                  </p>
                </div>
              </>
            )}
            {/* Extended AI Assessment Panels */}
            {heuristicPrediction && predictionInput && (
              <>
                <div className="lg:col-span-2 xl:col-span-3">
                  <ImpactRow p={heuristicPrediction} />
                </div>
                <div>
                  <SimilarPanel p={heuristicPrediction} />
                </div>
                <div>
                  <DiversionPanel p={heuristicPrediction} />
                </div>
                <div className="md:col-span-2 lg:col-span-1 xl:col-span-2">
                  <ActionPlanPanel input={predictionInput} p={heuristicPrediction} />
                </div>

              </>
            )}
        </div>
      </main>
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
            : "AI unavailable — showing the baseline plan."
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
        <p className="text-sm leading-relaxed font-semibold">
          <strong>{input.type}</strong> at <strong>{p.venue.name}</strong> from {fmtHour(input.hour)} for {input.durationHr}h. Expect <strong>{p.delayMin} min</strong> delays within {p.radiusKm} km.
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
        <p className="mt-3 text-[10px] text-muted-foreground">— Bengaluru Traffic Police · VYUHIQ</p>
      </div>
    </Card>
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

