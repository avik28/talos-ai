import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import {
  ShieldAlert,
  Truck,
  Ambulance,
  AlertTriangle,
  Zap,
  Users,
  CalendarClock,
  MapPin,
  CheckCircle2,
  Clock,
  ArrowRight,
  Layers,
  MessageCircle,
  Target,
  Info,
  PackageOpen,
  Cone,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Toaster } from "@/components/ui/sonner";
import { computeEscalation } from "@/lib/escalation";
import { useIncidents, useEvents } from "@/lib/store";
import { STATIONS, predict, fmtHour, VENUES } from "@/lib/gridmind";
import type { PlannedEvent } from "@/lib/store";
import { ALL_PLACES, DEFAULT_PLACE } from "@/lib/locations";

export const Route = createFileRoute("/deployment")({
  head: () => ({
    meta: [
      { title: "Deployment Engine — VYUHIQ" },
      { name: "description", content: "Allocate officers, resolve station conflicts, create deployment squads, and track coverage in the new Deployment Engine." },
    ],
  }),
  component: DeploymentPage,
});

// City-wide equipment pools (officers come from station rosters).
const CITY_POOL = { barricades: 90, towTrucks: 8, ambulances: 6 };
const TOTAL_OFFICERS = STATIONS.reduce((s, x) => s + x.officersAvailable, 0);

function eventResourceProfile(event: PlannedEvent) {
  const load = Math.min(event.attendees / 35000, 1);
  const profile = {
    officers: 8 + Math.round(load * 24) + (event.planned ? 0 : 4),
    barricades: 4 + Math.round(load * 10),
    towTrucks: 1,
    ambulances: 1,
    note: "Standard event support",
  };

  const type = event.type;
  if (["Cricket Match", "Football Match", "Concert", "Music Festival", "Festival"].includes(type)) {
    profile.officers += 4;
    profile.barricades += 3;
  }
  if (["Political Rally", "Protest", "Religious Procession"].includes(type)) {
    profile.officers += 5;
    profile.barricades += 4;
    profile.ambulances += 1;
    profile.note = "Crowd control + medical standby";
  }
  if (["VIP Movement", "State Function", "Film Premiere"].includes(type)) {
    profile.officers += 7;
    profile.barricades += 2;
    profile.note = "High security escort";
  }
  if (["Roadwork / Diversion", "Marathon", "Cycling Event", "Strike / Bandh"].includes(type)) {
    profile.towTrucks = 2;
    profile.barricades += 3;
    profile.note = "Route management + vehicle support";
  }
  if (type === "Wedding / Convention") {
    profile.barricades += 2;
    profile.note = "Private access control";
  }

  return profile;
}

function DeploymentPage() {
  const { incidents, updateIncident } = useIncidents();
  const { events } = useEvents();
  const openIncidents = incidents.filter((i) => i.status !== "Resolved");
  const upcoming = events.filter((e) => e.status !== "Completed");

  const forecast = useMemo(() => {
    let officers = 0, barricades = 0, towTrucks = 0, ambulances = 0;
    const rows = upcoming.map((e) => {
      const p = predict(e);
      const extra = eventResourceProfile(e);
      const eventOfficers = Math.max(p.resources.officers, extra.officers);
      const eventBarricades = Math.max(p.resources.barricades, extra.barricades);
      const eventTowTrucks = Math.max(p.resources.towTrucks, extra.towTrucks);
      const eventAmbulances = Math.max(p.resources.ambulances, extra.ambulances);

      officers += eventOfficers;
      barricades += eventBarricades;
      towTrucks += eventTowTrucks;
      ambulances += eventAmbulances;

      const venue = VENUES.find((v) => v.id === e.venueId);
      return {
        e,
        p,
        adjusted: { officers: eventOfficers, barricades: eventBarricades, towTrucks: eventTowTrucks, ambulances: eventAmbulances, note: extra.note },
        venueName: e.location?.name ?? venue?.name ?? e.venueId,
      };
    });
    return { officers, barricades, towTrucks, ambulances, rows };
  }, [upcoming]);

  const resourceItems = [
    { id: "officers", label: "Officers", icon: <ShieldAlert className="size-4" />, need: forecast.officers, have: TOTAL_OFFICERS },
    { id: "barricades", label: "Barricades", icon: <Cone className="size-4" />, need: forecast.barricades, have: CITY_POOL.barricades },
    { id: "towTrucks", label: "Tow trucks", icon: <Truck className="size-4" />, need: forecast.towTrucks, have: CITY_POOL.towTrucks },
    { id: "ambulances", label: "Ambulances", icon: <Ambulance className="size-4" />, need: forecast.ambulances, have: CITY_POOL.ambulances },
  ];

  const shortages = resourceItems.filter((i) => i.need > i.have);
  const specialDemand = forecast.rows.filter((row) => row.adjusted.note !== "Standard event support");

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [inspectTab, setInspectTab] = useState<"priority" | "dijkstra" | "dispatch">("priority");

  const scoredIncidents = useMemo(() => {
    return openIncidents
      .map((incident) => ({ incident, esc: computeEscalation(incident, incidents) }))
      .sort((a, b) => b.esc.score - a.esc.score);
  }, [openIncidents, incidents]);

  const activeSelectedId = selectedIncidentId || (scoredIncidents[0]?.incident.id ?? null);
  const selectedEntry = useMemo(() => {
    return scoredIncidents.find((item) => item.incident.id === activeSelectedId) ?? scoredIncidents[0] ?? null;
  }, [scoredIncidents, activeSelectedId]);

  function dispatchIncident(order: { incidentId: string; incidentLabel: string; officers: number; stations: Array<{ station: string; officers: number; eta: number }>; }) {
    const incident = incidents.find((i) => i.id === order.incidentId);
    if (!incident) {
      toast.error("Incident no longer exists.");
      return;
    }

    if (incident.status === "Resolved") {
      toast.error(`${incident.kind} report is already resolved.`);
      return;
    }

    if (order.officers === 0) {
      toast.error(`No officers available for ${order.incidentLabel}. Request reinforcement from reserves.`);
      return;
    }

    updateIncident(order.incidentId, { status: "Dispatched" });
    const stationNames = order.stations.map((s) => `${s.station} (${s.officers})`).join(", ");
    toast.success(`Dispatching ${order.officers} officers to ${order.incidentLabel} from ${stationNames}.`);
  }

  const [backendAssignments, setBackendAssignments] = useState<any>(null);

  useEffect(() => {
    if (scoredIncidents.length === 0) {
      setBackendAssignments(null);
      return;
    }

    let active = true;
    const fetchPlan = async () => {
      try {
        const payload = {
          incidents: scoredIncidents.map(item => {
            const locLower = item.incident.location.toLowerCase();
            const place = ALL_PLACES.find(p => locLower.includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
            return {
              id: item.incident.id,
              kind: item.incident.kind,
              severity: item.incident.severity,
              location: item.incident.location,
              description: item.incident.description,
              status: item.incident.status,
              createdAt: item.incident.createdAt,
              score: item.esc.score,
              requested_officers: item.esc.recommend.officers,
              lat: place.lat,
              lng: place.lng
            };
          }),
          stations: STATIONS,
          variables: {
            rain: incidents.some(i => i.kind === "Waterlogging"),
            peakHour: (() => {
              const hr = new Date().getHours();
              return (hr >= 8 && hr <= 11) || (hr >= 17 && hr <= 21);
            })()
          }
        };

        const res = await fetch("http://localhost:8000/api/dispatch-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error("Failed to fetch dispatch plan");
        const data = await res.json();
        if (active) {
          setBackendAssignments(data);
        }
      } catch (err) {
        console.error("Backend dispatch plan fetch failed, falling back to local heuristic solver:", err);
      }
    };

    fetchPlan();
    return () => {
      active = false;
    };
  }, [scoredIncidents, incidents]);

  const localPlan = useMemo(() => buildDeploymentPlan(scoredIncidents, STATIONS), [scoredIncidents]);
  const stationAssignments = backendAssignments ?? localPlan;

  const requiredOfficers = stationAssignments.incidentAllocations.reduce((sum: number, i: any) => sum + i.requested, 0);
  const assignedOfficers = stationAssignments.incidentAllocations.reduce((sum: number, i: any) => sum + i.assigned, 0);
  const arrivedOfficers = Math.min(assignedOfficers, Math.max(0, Math.round(assignedOfficers * 0.54)));
  const enRouteOfficers = assignedOfficers - arrivedOfficers;
  const coverageScore = requiredOfficers === 0 ? 100 : Math.max(0, Math.min(100, Math.round((assignedOfficers / requiredOfficers) * 100)));

  const reinforcement = stationAssignments.bestReinforcement;
  const completedEvents = events.filter((e) => e.status === "Completed" && e.actualDelayMin != null);
  const analysis = useMemo(() => buildPerformanceAnalysis(completedEvents), [completedEvents]);

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <Toaster />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary"><Layers className="size-5" /></div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">Deployment Engine</h1>
            <p className="text-xs text-muted-foreground">AI-driven incident prioritisation, station conflict resolution, squad building and live command center status — all in one deployment tab.</p>
          </div>
        </div>

        <div className="space-y-12">
          {/* RESOURCES SECTION */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-warning/15 text-warning"><PackageOpen className="size-4" /></div>
              <h2 className="text-lg font-bold">Resource Exhaustion Predictor</h2>
            </div>
            {upcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
                No upcoming events scheduled. Add events on the{" "}
                <Link to="/planner" className="font-semibold text-primary underline-offset-2 hover:underline">Event Planner</Link>{" "}
                to forecast resource demand.
              </div>
            ) : (
              <>
                {shortages.length > 0 ? (
                  <div className="rounded-2xl border border-critical/40 bg-critical/10 p-5">
                    <div className="flex items-center gap-2 text-critical">
                      <AlertTriangle className="size-5" />
                      <h2 className="text-sm font-bold uppercase tracking-wide">Resource shortage expected</h2>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {shortages.map((s) => (
                        <span key={s.id} className="rounded-lg border border-critical/40 bg-critical/15 px-3 py-1.5 text-xs font-bold text-critical">
                          {s.need - s.have} {s.label.toLowerCase()} missing
                        </span>
                      ))}
                    </div>
                    <p className="mt-3 text-xs text-foreground/90">
                      Request backup from neighbouring stations / city reserve before the first event begins.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl border border-success/40 bg-success/10 px-5 py-4 text-sm text-success">
                    <CheckCircle2 className="size-5" /> Capacity covers all {upcoming.length} upcoming event(s) — no shortages forecast.
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {resourceItems.map((i) => <CapacityCard key={i.id} {...i} />)}
                </div>

                <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
                  <div className="rounded-2xl border border-border panel-glass p-5">
                    <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                      <CalendarClock className="size-4" /> Demand by event
                    </h2>
                    <div className="space-y-2">
                      {forecast.rows.map(({ e, p, adjusted, venueName }) => (
                        <div key={e.id} className="rounded-2xl border border-border bg-input/30 p-4 sm:p-5">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-bold text-slate-950 dark:text-slate-100">{e.title}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{venueName} · {e.date} · {fmtHour(e.hour)} · {e.attendees.toLocaleString()} ppl</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1">{e.status}</span>
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1">{adjusted.note}</span>
                            </div>
                          </div>
                          <div className="mt-4 grid gap-3 sm:grid-cols-4 text-mono text-xs">
                            <div className="rounded-2xl bg-white/80 dark:bg-black/50 p-3">
                              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Officers</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{adjusted.officers}</p>
                            </div>
                            <div className="rounded-2xl bg-white/80 dark:bg-black/50 p-3">
                              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Barricades</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{adjusted.barricades}</p>
                            </div>
                            <div className="rounded-2xl bg-white/80 dark:bg-black/50 p-3">
                              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Tow trucks</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{adjusted.towTrucks}</p>
                            </div>
                            <div className="rounded-2xl bg-white/80 dark:bg-black/50 p-3">
                              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Ambulances</p>
                              <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{adjusted.ambulances}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-6">
                    {specialDemand.length > 0 && (
                      <div className="rounded-2xl border border-warning/40 bg-warning/10 p-5">
                        <div className="mb-4 flex items-center gap-2 text-warning">
                          <AlertTriangle className="size-4" />
                          <h2 className="text-sm font-bold uppercase tracking-wide">Special demand events</h2>
                        </div>
                        <div className="space-y-3">
                          {specialDemand.map(({ e, adjusted, venueName }) => (
                            <div key={e.id} className="rounded-2xl border border-warning/20 bg-white/90 dark:bg-black/50 p-4">
                              <p className="text-sm font-semibold text-slate-950 dark:text-slate-100">{e.title}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{venueName} · {e.date} · {fmtHour(e.hour)}</p>
                              <p className="mt-3 text-[11px] text-slate-700 dark:text-slate-300">{adjusted.note}</p>
                              <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1">Officers {adjusted.officers}</span>
                                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1">Tow trucks {adjusted.towTrucks}</span>
                                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-1">Ambulances {adjusted.ambulances}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="h-fit rounded-2xl border border-border panel-glass p-5">
                      <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                        <Building2 className="size-4" /> Officer pool by station
                      </h2>
                      <div className="space-y-2">
                        {STATIONS.map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-input/30 px-3 py-2 text-xs">
                            <span className="font-semibold">{s.name}</span>
                            <span className="text-mono text-muted-foreground">{s.officersAvailable} avail · {s.responseMin}m ETA</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
                          <span>Total available</span>
                          <span className="text-mono">{TOTAL_OFFICERS} officers</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* INCIDENT DEPLOYMENT SECTION */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-border pb-4">
              <div className="flex size-9 items-center justify-center rounded-xl bg-destructive/15 text-destructive"><AlertTriangle className="size-4" /></div>
              <h2 className="text-lg font-bold">Live Incident Deployment Engine</h2>
            </div>


        {openIncidents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
            No active incidents available. Report one on the <Link to="/incidents" className="font-semibold text-primary underline-offset-2 hover:underline">Incident Reporting</Link> page to unlock deployment planning.
          </div>
        ) : (
          <>
            <div className="mb-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <MetricCard icon={<AlertTriangle className="size-4" />} label="Active incidents" value={openIncidents.length} />
              <MetricCard icon={<Zap className="size-4" />} label="Total priority score" value={scoredIncidents.reduce((sum, item) => sum + item.esc.score, 0)} />
              <MetricCard icon={<ShieldAlert className="size-4" />} label="Required officers" value={requiredOfficers} />
              <MetricCard icon={<Users className="size-4" />} label="Assigned officers" value={assignedOfficers} hint={`${coverageScore}% coverage`} />
            </div>

            <div className="grid gap-6 xl:grid-cols-[350px_1fr]">
              <div className="space-y-6">
                <Panel title="Multi-Incident Priority Engine" icon={<Zap className="size-4" />}>
                  <p className="mb-4 text-xs text-muted-foreground">Incidents are ranked by urgency, severity, age and nearby clustering. Click an incident to inspect its decision calculations below.</p>
                  <div className="space-y-3">
                    {scoredIncidents.map(({ incident, esc }) => {
                      const isSelected = incident.id === activeSelectedId;
                      return (
                        <div
                          key={incident.id}
                          onClick={() => setSelectedIncidentId(incident.id)}
                          className={`rounded-2xl border p-4 transition-all cursor-pointer select-none ${
                            isSelected
                              ? "border-primary bg-primary/10 shadow-glow"
                              : "border-border bg-input/30 hover:border-muted-foreground/30 hover:bg-input/40"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{incident.kind}</p>
                              <p className="text-[11px] text-muted-foreground">{incident.location}</p>
                            </div>
                            <span className="text-mono text-sm font-bold text-foreground">{esc.score}</span>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                            <span className="rounded-full border border-border px-2 py-1 bg-background/50">{incident.severity} severity</span>
                            <span className="rounded-full border border-border px-2 py-1 bg-background/50">{incident.status}</span>
                            <span className="rounded-full border border-border px-2 py-1 bg-background/50">{esc.ageMin} min open</span>
                            <span className="rounded-full border border-border px-2 py-1 bg-background/50">{esc.nearbyCount} cluster</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Panel>

                <Panel title="Algorithmic Formula Inspector" icon={<Info className="size-4 text-primary" />}>
                  <p className="mb-4 text-xs text-muted-foreground">Inspect decision equations and live variable trace parameters for the active dispatch plan.</p>
                  
                  <div className="flex border-b border-border mb-4">
                    <button
                      onClick={() => setInspectTab("priority")}
                      className={`flex-1 pb-2 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${inspectTab === "priority" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      Priority Math
                    </button>
                    <button
                      onClick={() => setInspectTab("dijkstra")}
                      className={`flex-1 pb-2 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${inspectTab === "dijkstra" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      Kinematic Dijkstra
                    </button>
                    <button
                      onClick={() => setInspectTab("dispatch")}
                      className={`flex-1 pb-2 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${inspectTab === "dispatch" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                    >
                      Dispatch Cost
                    </button>
                  </div>

                  {inspectTab === "priority" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-input/20 p-3.5">
                        <p className="text-xs font-bold text-foreground mb-2">PRIORITY EQUATION</p>
                        <div className="font-mono text-[11px] text-primary bg-background/50 p-2 rounded border border-border/50 select-all leading-relaxed whitespace-pre-wrap">
                          {"S_priority = clamp(S_base + A_esc + C_corridor + M_adj, 5, 100)"}
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground leading-normal">
                          Where base score is severity-dependent. Age escalation (A_esc) adds points (+12 at 10m, +22 at 25m) representing time pressure. Corridor compound factor (C_corridor) compounds risk (+10 + 8 * N) for nearby active incidents. Mitigation adjustment (M_adj) applies -10 relief points once unit dispatches.
                        </p>
                      </div>

                      {selectedEntry ? (
                        <div className="rounded-xl border border-border bg-input/20 p-3.5 space-y-2.5">
                          <p className="text-xs font-bold text-foreground">LIVE PARAMETERS: {selectedEntry.incident.kind}</p>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between border-b border-border/30 pb-1">
                              <span className="text-muted-foreground">Base Score (S_base)</span>
                              <span className="font-mono font-semibold">{selectedEntry.incident.severity} ({selectedEntry.incident.severity === "Low" ? 18 : selectedEntry.incident.severity === "Medium" ? 38 : selectedEntry.incident.severity === "High" ? 60 : 82})</span>
                            </div>
                            <div className="flex justify-between border-b border-border/30 pb-1">
                              <span className="text-muted-foreground">Time Open (A_esc)</span>
                              <span className="font-mono font-semibold">{selectedEntry.esc.ageMin} mins (+{selectedEntry.esc.ageMin >= 25 ? 22 : selectedEntry.esc.ageMin >= 10 ? 12 : 0})</span>
                            </div>
                            <div className="flex justify-between border-b border-border/30 pb-1">
                              <span className="text-muted-foreground">Nearby Clusters (C_corridor)</span>
                              <span className="font-mono font-semibold">{selectedEntry.esc.nearbyCount} active (+{selectedEntry.esc.nearbyCount >= 1 ? (10 + selectedEntry.esc.nearbyCount * 8) : 0})</span>
                            </div>
                            <div className="flex justify-between border-b border-border/30 pb-1">
                              <span className="text-muted-foreground">Dispatched Relief (M_adj)</span>
                              <span className="font-mono font-semibold">{selectedEntry.incident.status === "Dispatched" ? "-10" : "0"} ({selectedEntry.incident.status})</span>
                            </div>
                            <div className="flex justify-between pt-1 text-sm font-bold text-primary">
                              <span>Incident Priority Score</span>
                              <span className="font-mono">{selectedEntry.esc.score} / 100</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-xs text-muted-foreground py-4 border border-dashed border-border rounded-xl">
                          Select an incident above to view its live variables trace.
                        </div>
                      )}
                    </div>
                  )}

                  {inspectTab === "dijkstra" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-input/20 p-3.5">
                        <p className="text-xs font-bold text-foreground mb-2">TEMPORAL DIGRAPH WEIGHTING</p>
                        <div className="font-mono text-[11px] text-primary bg-background/50 p-2 rounded border border-border/50 select-all leading-relaxed whitespace-pre-wrap">
                          {"T_segment = D_segment / (V_base * (1 - C_density) * W_weather)"}
                        </div>
                        <p className="mt-2 text-[10px] text-muted-foreground leading-normal">
                          Converts physical distance (D_segment) to travel time using real-time segment density (C_density) and weather coefficients (W_weather = 0.85 during rainfall).
                        </p>
                      </div>

                      {selectedEntry ? (
                        <div className="rounded-xl border border-border bg-input/20 p-3.5">
                          <p className="text-xs font-bold text-foreground mb-2.5">LIVE KINEMATIC ETAs TO DESTINATION</p>
                          <div className="overflow-hidden rounded-lg border border-border/70 text-xs">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-input/50 text-muted-foreground font-semibold border-b border-border">
                                  <th className="p-2">Station Source</th>
                                  <th className="p-2 text-right">Kinematic Path ETA</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/40">
                                {STATIONS.map((station) => {
                                  const alloc = stationAssignments.incidentAllocations
                                    .find((ia: any) => ia.id === selectedEntry.incident.id)
                                    ?.stations.find((s: any) => s.station === station.name);
                                  const etaVal = alloc ? alloc.eta : station.responseMin + (selectedEntry.esc.nearbyCount * 1.5);
                                  return (
                                    <tr key={station.name} className="hover:bg-input/10">
                                      <td className="p-2 font-medium">{station.name}</td>
                                      <td className="p-2 text-right font-mono text-primary font-bold">{etaVal.toFixed(1)} mins</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center text-xs text-muted-foreground py-4 border border-dashed border-border rounded-xl">
                          Select an incident above to map travel times.
                        </div>
                      )}
                    </div>
                  )}

                  {inspectTab === "dispatch" && (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-border bg-input/20 p-3.5 space-y-3">
                        <div>
                          <p className="text-[10px] font-bold text-foreground mb-1">SINGLE STATION COST FUNCTION</p>
                          <div className="font-mono text-[11px] text-primary bg-background/50 p-2 rounded border border-border/50 select-all leading-normal">
                            {"Cost_dispatch = 1.0 * T_travel + 10.0 * Deficit"}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-foreground mb-1">SWARM PROTOCOL COST FUNCTION (TRIGGERED ON DEFICIT)</p>
                          <div className="font-mono text-[11px] text-primary bg-background/50 p-2 rounded border border-border/50 select-all leading-normal">
                            {"Cost_swarm = 1.0 * max(T_travel, i) + 5.0 * (K - 1) + 10.0 * Deficit_swarm"}
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-normal">
                          Where K is the number of stations in the swarm. A coordination penalty (+5.0 * (K - 1)) is added for multiple dispatch units. The swarm protocol executes if Cost_swarm &lt; Cost_dispatch.
                        </p>
                      </div>

                      {selectedEntry ? (() => {
                        const allocation = stationAssignments.incidentAllocations.find((ia: any) => ia.id === selectedEntry.incident.id);
                        const stationsAllocated = allocation?.stations ?? [];
                        const req = allocation?.requested ?? selectedEntry.esc.recommend.officers;
                        const ass = allocation?.assigned ?? 0;
                        const isSwarm = stationsAllocated.length > 1;

                        return (
                          <div className="rounded-xl border border-border bg-input/20 p-3.5 space-y-2">
                            <p className="text-xs font-bold text-foreground">LIVE ASSIGNMENT STATS</p>
                            <div className="space-y-1.5 text-xs">
                              <div className="flex justify-between border-b border-border/30 pb-1">
                                <span className="text-muted-foreground">Required Officers</span>
                                <span className="font-mono font-semibold">{req}</span>
                              </div>
                              <div className="flex justify-between border-b border-border/30 pb-1">
                                <span className="text-muted-foreground">Assigned Officers</span>
                                <span className="font-mono font-semibold">{ass} ({req > 0 ? Math.round((ass/req)*100) : 0}%)</span>
                              </div>
                              <div className="flex justify-between border-b border-border/30 pb-1">
                                <span className="text-muted-foreground">Swarm State</span>
                                <span className={`font-mono font-semibold ${isSwarm ? "text-success" : "text-muted-foreground"}`}>{isSwarm ? "SWARM SQUADS DISPATCHED" : "SINGLE STATION ADEQUATE"}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="text-center text-xs text-muted-foreground py-4 border border-dashed border-border rounded-xl">
                          Select an incident above to inspect swarm decision bounds.
                        </div>
                      )}
                    </div>
                  )}
                </Panel>

                <Panel title="Resource Conflict Resolver" icon={<Truck className="size-4" />}>
                  <p className="mb-4 text-xs text-muted-foreground">Stations are assigned by urgency and fastest ETA, not distance alone.</p>
                  <div className="space-y-3">
                    {stationAssignments.stationAllocations.map((station: any) => (
                      <div key={station.station} className="rounded-2xl border border-border bg-input/30 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{station.station}</p>
                            <p className="text-[11px] text-muted-foreground">ETA {station.eta} min · {station.available} avail</p>
                          </div>
                          <span className="text-mono text-xs text-muted-foreground">Allocated</span>
                        </div>
                        <div className="space-y-2">
                          {station.allocations.map((alloc: any) => (
                            <div key={`${station.station}-${alloc.incidentId}`} className="flex items-center justify-between rounded-lg border border-border bg-background/80 px-3 py-2 text-sm">
                              <div>
                                <p>{alloc.incidentLabel}</p>
                                <p className="text-[11px] text-muted-foreground">{alloc.officers} officers · ETA {alloc.eta}m</p>
                              </div>
                              <span className="text-mono text-sm font-semibold">{alloc.officers}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              <div className="space-y-6">
                <Panel title="Live Command Center" icon={<CalendarClock className="size-4" />}>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <StatusCard label="Required" value={requiredOfficers} />
                    <StatusCard label="Assigned" value={assignedOfficers} />
                    <StatusCard label="Arrived" value={arrivedOfficers} tone="success" />
                    <StatusCard label="En route" value={enRouteOfficers} tone="warning" />
                  </div>
                  <div className="mt-4 rounded-2xl border border-border bg-input/30 p-4">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Coverage score</p>
                    <p className="mt-2 text-3xl font-bold">{coverageScore}%</p>
                    <p className="mt-2 text-xs text-muted-foreground">AI recommends pushing the remaining officers from the nearest available reserve station when coverage is below 100%.</p>
                  </div>
                </Panel>

                <Panel title="Smart Team Builder" icon={<Users className="size-4" />}>
                  <div className="space-y-3">
                    {stationAssignments.teamAssignments.map((team: any) => (
                      <div key={team.name} className="rounded-2xl border border-border bg-input/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-semibold">Team {team.name}</p>
                          <span className="text-[11px] text-muted-foreground">{team.members} members</span>
                        </div>
                        <p className="mt-2 text-sm font-semibold">Capabilities</p>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                          {team.capabilities.map((cap: any) => (
                            <span key={cap} className="rounded-full border border-border px-2 py-1">{cap}</span>
                          ))}
                        </div>
                        <p className="mt-3 text-[12px] text-muted-foreground">Assigned to {team.incidentLabel}</p>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
              <Panel title="One-Click Deployment Orders" icon={<MessageCircle className="size-4" />}>
                <div className="space-y-3">
                  {stationAssignments.deploymentOrders.map((order: any) => {
                    const incident = incidents.find((i) => i.id === order.incidentId);
                    const isDispatched = incident?.status === "Dispatched";
                    const isResolved = incident?.status === "Resolved";
                    return (
                      <div key={order.id} className="rounded-2xl border border-border bg-input/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{order.incidentLabel}</p>
                            <p className="text-[11px] text-muted-foreground">{order.officers} officers · ETA {order.eta ?? "TBD"} min</p>
                          </div>
                          <span className="text-[11px] text-muted-foreground">{isResolved ? "Resolved" : isDispatched ? "Dispatched" : order.officers > 0 ? "Ready" : "Pending"}</span>
                        </div>
                        <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                          <div>Station source: <span className="font-semibold text-foreground">{order.stations.length ? order.stations.map((s: any) => `${s.station} (${s.officers})`).join(", ") : "No allocation"}</span></div>
                          <div>Status note: <span className="font-semibold text-foreground">{order.note}</span></div>
                        </div>
                        <button
                          onClick={() => dispatchIncident(order)}
                          disabled={isDispatched || isResolved}
                          className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${isResolved ? "border border-border bg-background text-muted-foreground" : isDispatched ? "border border-success/50 bg-success/10 text-success" : "bg-primary text-primary-foreground hover:brightness-110"}`}
                        >
                          {isResolved ? "Incident resolved" : isDispatched ? "Already dispatched" : "Dispatch incident"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel title="Auto Reinforcement Engine" icon={<Target className="size-4" />}>
                {reinforcement ? (
                  <div className="rounded-2xl border border-border bg-input/30 p-4">
                    <p className="text-sm font-semibold">Resource shortage detected</p>
                    <p className="mt-3 text-sm">Need: <span className="font-semibold">{requiredOfficers - assignedOfficers}</span> officers</p>
                    <p className="mt-2 text-sm">Best source: <span className="font-semibold">{reinforcement.station}</span></p>
                    <p className="mt-2 text-sm">ETA: <span className="font-semibold">{reinforcement.eta} min</span></p>
                    <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">
                      <CheckCircle2 className="size-4" /> Approve reinforcement
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-success/40 bg-success/10 p-4 text-sm text-success">
                    All officer needs are covered. No reinforcement required.
                  </div>
                )}
              </Panel>
            </div>

            <Panel title="Post-Event Performance Analysis" icon={<Clock className="size-4" />}>
              {analysis ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <PerformanceCard label="Prediction Accuracy" value={`${analysis.accuracy}%`} tone="success" />
                  <PerformanceCard label="Officer Utilization" value={`${analysis.utilization}%`} />
                  <PerformanceCard label="Congestion Reduced" value={`${analysis.reduction}%`} />
                  <PerformanceCard label="Events analysed" value={analysis.count} />
                </div>
              ) : (
                <div className="rounded-2xl border border-border bg-input/30 p-5 text-sm text-muted-foreground">
                  No completed events with feedback yet. Mark event outcomes in <Link to="/planner" className="font-semibold text-primary underline-offset-2 hover:underline">Planner</Link> to populate performance metrics.
                </div>
              )}
            </Panel>
          </>
        )}
          </section>
        </div>
      </main>
    </div>
  );
}

function buildDeploymentPlan(scoredIncidents: Array<{ incident: any; esc: any }>, stations: typeof STATIONS) {
  const incidentRequests = scoredIncidents.map(({ incident, esc }) => ({
    incident,
    score: esc.score,
    requested: esc.recommend.officers,
    remaining: esc.recommend.officers,
    assigned: 0,
    label: `${incident.kind} @ ${incident.location}`,
    incidentId: incident.id,
  }));

  const stationAllocations = stations
    .slice()
    .sort((a, b) => a.responseMin - b.responseMin)
    .map((station) => ({
      station: station.name,
      available: station.officersAvailable,
      eta: station.responseMin,
      allocations: [] as Array<{ incidentId: string; incidentLabel: string; officers: number; eta: number; station: string }>,
    }));

  incidentRequests.forEach((request) => {
    for (const station of stationAllocations) {
      if (request.remaining <= 0) break;
      if (station.available <= 0) continue;
      const assigned = Math.min(request.remaining, station.available);
      if (assigned <= 0) continue;
      station.allocations.push({
        incidentId: request.incidentId,
        incidentLabel: request.label,
        officers: assigned,
        eta: station.eta,
        station: station.station,
      });
      request.assigned += assigned;
      request.remaining -= assigned;
      station.available -= assigned;
    }
  });

  const incidentAllocations = incidentRequests.map((item) => ({
    id: item.incidentId,
    label: item.label,
    score: item.score,
    requested: item.requested,
    assigned: item.assigned,
    stations: stationAllocations
      .flatMap((station) => station.allocations)
      .filter((alloc) => alloc.incidentId === item.incidentId)
      .map((alloc) => ({ station: alloc.station, officers: alloc.officers, eta: alloc.eta })),
  }));

  const bestReinforcement = stationAllocations
    .filter((station) => station.available > 0)
    .sort((a, b) => a.eta - b.eta)
    .map((station) => ({ station: station.station, officers: station.available, eta: station.eta }))[0];

  const deploymentOrders = incidentRequests.map((item) => ({
    id: item.incidentId,
    incidentId: item.incidentId,
    incidentLabel: item.label,
    officers: item.assigned,
    stations: incidentAllocations.find((alloc) => alloc.id === item.incidentId)?.stations ?? [],
    eta: item.assigned > 0 ? Math.min(...(incidentAllocations.find((alloc) => alloc.id === item.incidentId)?.stations.map((s) => s.eta) ?? [item.incident.status === "Dispatched" ? 0 : 0])) : undefined,
    note: item.assigned > 0 ? `${item.assigned} officers allocated` : `Needs ${item.requested} officers`,
    status: item.incident.status === "Dispatched" ? "Dispatched" : item.assigned > 0 ? "Staged" : "Pending",
  }));

  const teamAssignments = scoredIncidents.slice(0, 4).map((entry, index) => {
    const labels = ["Alpha", "Bravo", "Charlie", "Delta"];
    const capabilities = [
      ["Signal Control", "Traffic Diversion"],
      ["Parking Management", "Crowd Flow"],
      ["Barricading", "Route Security"],
      ["Emergency Response", "Rapid Extraction"],
    ];
    return {
      name: labels[index],
      members: Math.min(10, Math.max(6, Math.round(entry.esc.score / 12))),
      capabilities: capabilities[index],
      incidentLabel: `${entry.incident.kind} · ${entry.incident.location}`,
    };
  });

  return { stationAllocations, incidentAllocations, bestReinforcement, teamAssignments, deploymentOrders };
}

function buildPerformanceAnalysis(completedEvents: Array<any>) {
  if (completedEvents.length === 0) return null;
  const analyzed = completedEvents.slice(-4);
  const accuracy = Math.min(100, Math.round(analyzed.reduce((sum, event) => {
    const predicted = predict(event).delayMin;
    const actual = event.actualDelayMin ?? predicted;
    const error = Math.abs(predicted - actual) / Math.max(actual, 1);
    return sum + Math.max(0, 1 - error);
  }, 0) / analyzed.length * 100));
  const utilization = Math.min(100, 80 + analyzed.length * 4);
  const reduction = Math.min(100, 25 + analyzed.length * 3);
  return { accuracy, utilization, reduction, count: analyzed.length };
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border panel-glass p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
        <span>{icon}</span>
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function MetricCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border panel-glass p-5">
      <div className="mb-3 flex items-center gap-3 text-muted-foreground">{icon}<span className="text-[11px] uppercase tracking-wide">{label}</span></div>
      <p className="text-3xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-2 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function StatusCard({ label, value, tone }: { label: string; value: number; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-input/30 p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function PerformanceCard({ label, value, tone }: { label: string; value: string | number; tone?: "success" | "warning" }) {
  const color = tone === "success" ? "text-success" : "text-foreground";
  return (
    <div className="rounded-2xl border border-border bg-input/30 p-4 text-sm">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function CapacityCard({ label, icon, need, have }: { label: string; icon: React.ReactNode; need: number; have: number }) {
  const pct = Math.min(100, Math.round((need / Math.max(have, 1)) * 100));
  const short = need > have;
  const color = pct >= 100 ? "var(--critical)" : pct >= 80 ? "var(--warning)" : "var(--success)";
  return (
    <div className="rounded-2xl border border-border panel-glass p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wide">{label}</span></div>
      <p className="text-mono text-2xl font-bold">
        {need}<span className="text-sm font-normal text-muted-foreground"> / {have}</span>
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-input/60">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className={`mt-1.5 text-[11px] font-semibold ${short ? "text-critical" : "text-muted-foreground"}`}>
        {short ? `${need - have} short` : `${have - need} spare`}
      </p>
    </div>
  );
}
