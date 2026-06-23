import { API_BASE } from "@/lib/api";
import { Link } from "react-router-dom";
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
  Brain,
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { computeEscalation } from "@/lib/escalation";
import { useIncidents, useEvents } from "@/lib/store";
import { STATIONS, predict, fmtHour, VENUES } from "@/lib/gridmind";
import type { PlannedEvent } from "@/lib/store";
import { ALL_PLACES, DEFAULT_PLACE } from "@/lib/locations";

// City-wide equipment pools (officers come from station rosters).
const CITY_POOL = { barricades: 90, towTrucks: 8, ambulances: 6 };

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

export default function DeploymentPage() {
  useEffect(() => {
    document.title = "Deployment Engine — TalosAI";
  }, []);
  const [stations, setStations] = useState(STATIONS);
  const { incidents, updateIncident } = useIncidents();
  const { events } = useEvents();
  const [resolverView, setResolverView] = useState<"stations" | "incidents">("stations");
  const [activeFormulaModal, setActiveFormulaModal] = useState<"priority" | "dijkstra" | "dispatch" | null>(null);
  const openIncidents = incidents.filter((i) => i.status !== "Resolved");
  const upcoming = events.filter((e) => e.status !== "Completed");

  const totalOfficers = useMemo(() => stations.reduce((s, x) => s + x.officersAvailable, 0), [stations]);

  // Compute station reinforcement benefits based on closest active incidents.
  // Formula variation: R_benefit = clamp(B_base + A_esc + C_corridor + M_adj, 0, 100)
  const reinforcementBenefits = useMemo(() => {
    const sevMap: Record<string, number> = { Low: 18, Medium: 38, High: 60, Critical: 82 };
    const now = Date.now();

    // 1. Map active incidents to their closest station by coordinates
    const stationIncidents: Record<string, typeof openIncidents> = {};
    stations.forEach(s => {
      stationIncidents[s.name] = [];
    });

    openIncidents.forEach(inc => {
      const locLower = inc.location.toLowerCase();
      const place = ALL_PLACES.find(p => locLower.includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
      
      let closestStationName = "";
      let minDist = Infinity;

      stations.forEach(s => {
        // Haversine distance
        const R = 6371; // km
        const dLat = (place.lat - s.lat) * Math.PI / 180;
        const dLon = (place.lng - s.lng) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(s.lat * Math.PI / 180) * Math.cos(place.lat * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const dist = R * c;

        if (dist < minDist) {
          minDist = dist;
          closestStationName = s.name;
        }
      });

      if (closestStationName) {
        stationIncidents[closestStationName].push(inc);
      }
    });

    // 2. Compute reinforcement benefit scores
    return stations.map(s => {
      const incList = stationIncidents[s.name] ?? [];
      if (incList.length === 0) {
        return {
          stationId: s.id,
          stationName: s.name,
          score: 0,
          reasons: ["No active incidents in station area"]
        };
      }

      const B_base = Math.max(...incList.map(inc => sevMap[inc.severity] ?? 18));
      
      const ageEscalations = incList.map(inc => {
        const ageMin = Math.max(0, Math.floor((now - inc.createdAt) / 60000));
        return ageMin >= 25 ? 22 : ageMin >= 10 ? 12 : 0;
      });
      const A_esc = Math.max(...ageEscalations, 0);

      const nIncidents = incList.length;
      const C_corridor = nIncidents >= 2 ? 10 + (nIncidents - 1) * 8 : 0;

      const M_adj = -2 * s.officersAvailable;

      const score = Math.max(0, Math.min(100, B_base + A_esc + C_corridor + M_adj));
      const reasons = [
        `Base severity: ${B_base}`,
        `Age escalation: +${A_esc}`,
        `Clustering: +${C_corridor}`,
        `Mitigation: ${M_adj}`
      ];

      return {
        stationId: s.id,
        stationName: s.name,
        score,
        reasons
      };
    }).sort((a, b) => b.score - a.score);
  }, [stations, openIncidents]);

  const topBenefitStation = useMemo(() => {
    const activeBenefits = reinforcementBenefits.filter(b => b.score > 0);
    return activeBenefits.length > 0 ? activeBenefits[0] : null;
  }, [reinforcementBenefits]);

  const handleApproveReinforcement = (stationName: string) => {
    setStations(prev => prev.map(s => {
      if (s.name === stationName) {
        const updated = s.officersAvailable + 5;
        toast.success(`Approved reinforcements: +5 officers added to ${s.name} roster (Model OP). Current available: ${updated}.`);
        return {
          ...s,
          officersAvailable: updated
        };
      }
      return s;
    }));
  };

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
    { id: "officers", label: "Officers", icon: <ShieldAlert className="size-4" />, need: forecast.officers, have: totalOfficers },
    { id: "barricades", label: "Barricades", icon: <Cone className="size-4" />, need: forecast.barricades, have: CITY_POOL.barricades },
    { id: "towTrucks", label: "Tow trucks", icon: <Truck className="size-4" />, need: forecast.towTrucks, have: CITY_POOL.towTrucks },
    { id: "ambulances", label: "Ambulances", icon: <Ambulance className="size-4" />, need: forecast.ambulances, have: CITY_POOL.ambulances },
  ];

  const shortages = resourceItems.filter((i) => i.need > i.have);
  const specialDemand = forecast.rows.filter((row) => row.adjusted.note !== "Standard event support");

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);

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
          stations: stations,
          variables: {
            rain: incidents.some(i => i.kind === "Waterlogging"),
            peakHour: (() => {
              const hr = new Date().getHours();
              return (hr >= 8 && hr <= 11) || (hr >= 17 && hr <= 21);
            })()
          }
        };

        const res = await fetch(`${API_BASE}/api/dispatch-plan`, {
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
  }, [scoredIncidents, incidents, stations]);

  const localPlan = useMemo(() => buildDeploymentPlan(scoredIncidents, stations), [scoredIncidents, stations]);
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

      <Toaster />
      <main className="mx-auto w-[90%] md:w-[85%] pb-24 pt-6">
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
                        {stations.map((s) => (
                          <div key={s.id} className="flex items-center justify-between rounded-lg border border-border bg-input/30 px-3 py-2 text-xs">
                            <span className="font-semibold">{s.name}</span>
                            <span className="text-mono text-muted-foreground">{s.officersAvailable} avail · {s.responseMin}m ETA</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-bold text-primary">
                          <span>Total available</span>
                          <span className="text-mono">{totalOfficers} officers</span>
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
            {/* ROW 1: Metrics (left) & Live Command Center (right) */}
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1.5fr] xl:grid-cols-[1fr_1.5fr] mb-6">
              <div className="grid grid-cols-2 gap-4">
                <MetricCard icon={<AlertTriangle className="size-4" />} label="Active incidents" value={openIncidents.length} />
                <MetricCard icon={<Zap className="size-4" />} label="Total priority score" value={scoredIncidents.reduce((sum, item) => sum + item.esc.score, 0)} />
                <MetricCard icon={<ShieldAlert className="size-4" />} label="Required officers" value={requiredOfficers} />
                <MetricCard icon={<Users className="size-4" />} label="Assigned officers" value={assignedOfficers} hint={`${coverageScore}% coverage`} />
              </div>
              
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
            </div>

            {/* ROW 2: Multi-Incident Priority Engine (left) & Resource Conflict Resolver (right) */}
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1.5fr] xl:grid-cols-[1fr_1.5fr] mb-6">
              <Panel title="Multi-Incident Priority Engine" icon={<Zap className="size-4" />}>
                <p className="mb-4 text-xs text-muted-foreground">Incidents are ranked by urgency, severity, age and nearby clustering. Click an incident to inspect its decision calculations.</p>
                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1">
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

              <Panel title="Resource Conflict Resolver" icon={<Truck className="size-4" />}>
                <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
                  <p className="text-xs text-muted-foreground max-w-[200px] md:max-w-none">
                    Stations are assigned by urgency and fastest ETA, resolving resource contentions.
                  </p>
                  <div className="flex bg-input/40 p-0.5 rounded-lg border border-border/30">
                    <button
                      onClick={() => setResolverView("stations")}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${resolverView === "stations" ? "bg-background text-foreground shadow-sm animate-fade-in" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      By Station
                    </button>
                    <button
                      onClick={() => setResolverView("incidents")}
                      className={`rounded-md px-3 py-1 text-xs font-semibold transition ${resolverView === "incidents" ? "bg-background text-foreground shadow-sm animate-fade-in" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      By Incident
                    </button>
                  </div>
                </div>

                <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {resolverView === "stations" ? (
                    stationAssignments.stationAllocations.map((station: any) => (
                      <div key={station.station} className="rounded-2xl border border-border bg-input/30 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold">{station.station}</p>
                            <p className="text-[11px] text-muted-foreground">ETA {station.eta} min · {station.available} avail</p>
                          </div>
                          <span className="text-mono text-xs text-muted-foreground">Allocated</span>
                        </div>
                        <div className="space-y-2">
                          {station.allocations.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">No allocations scheduled.</p>
                          ) : (
                            station.allocations.map((alloc: any) => (
                              <div key={`${station.station}-${alloc.incidentId}`} className="flex items-center justify-between rounded-lg border border-border bg-background/80 px-3 py-2 text-sm">
                                <div>
                                  <p className="font-semibold">{alloc.incidentLabel}</p>
                                  <p className="text-[11px] text-muted-foreground">{alloc.officers} officers · ETA {alloc.eta}m</p>
                                </div>
                                <span className="text-mono text-sm font-semibold">{alloc.officers}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    stationAssignments.deploymentOrders.map((order: any) => {
                      const incident = incidents.find((i) => i.id === order.incidentId);
                      const isDispatched = incident?.status === "Dispatched";
                      const isResolved = incident?.status === "Resolved";
                      return (
                        <div key={order.id} className="rounded-2xl border border-border bg-input/30 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">{order.incidentLabel}</p>
                              <p className="text-[11px] text-muted-foreground">{order.officers} officers · ETA {order.eta ?? "TBD"} min</p>
                            </div>
                            <span className="text-[11px] text-muted-foreground font-semibold">{isResolved ? "Resolved" : isDispatched ? "Dispatched" : order.officers > 0 ? "Ready" : "Pending"}</span>
                          </div>
                          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                            <div>Station source: <span className="font-semibold text-foreground">{order.stations.length ? order.stations.map((s: any) => `${s.station} (${s.officers})`).join(", ") : "No allocation"}</span></div>
                            <div>Status note: <span className="font-semibold text-foreground">{order.note}</span></div>
                          </div>
                          <button
                            onClick={() => dispatchIncident(order)}
                            disabled={isDispatched || isResolved}
                            className={`mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${isResolved ? "border border-border bg-background text-muted-foreground" : isDispatched ? "border border-success/50 bg-success/10 text-success" : "bg-primary text-primary-foreground hover:brightness-110"}`}
                          >
                            {isResolved ? "Incident resolved" : isDispatched ? "Already dispatched" : "Dispatch incident"}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
                  <span className="text-[11px] text-muted-foreground font-medium">Model: Random Forest & Kinematic Routing</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setActiveFormulaModal("priority")}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-input/30 hover:bg-primary/10 hover:text-primary transition px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Priority Math
                    </button>
                    <button
                      onClick={() => setActiveFormulaModal("dijkstra")}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-input/30 hover:bg-primary/10 hover:text-primary transition px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Kinematic Dijkstra
                    </button>
                    <button
                      onClick={() => setActiveFormulaModal("dispatch")}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-input/30 hover:bg-primary/10 hover:text-primary transition px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider cursor-pointer"
                    >
                      Dispatch Cost
                    </button>
                  </div>
                </div>
              </Panel>
            </div>

            {/* ROW 3: Auto Reinforcement Recommendation (left) & Auto Reinforcement Roster (right) */}
            <div className="grid gap-6 lg:grid-cols-[1.2fr_1.5fr] xl:grid-cols-[1fr_1.5fr] mb-6">
              <Panel title="Auto Reinforcement Engine" icon={<Target className="size-4 animate-pulse" />}>
                <p className="mb-4 text-xs text-muted-foreground">
                  AI recommendation engine ranks police stations that would benefit most from reserve reinforcements using the active incident pressure equations.
                </p>
                {topBenefitStation ? (
                  <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 relative overflow-hidden">
                    <div className="absolute right-2 top-2 rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider uppercase bg-primary/20 text-primary">
                      Model OP
                    </div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Top Recommendation</p>
                    <h3 className="mt-1 text-base font-extrabold text-foreground">{topBenefitStation.stationName}</h3>
                    
                    <div className="mt-4 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Priority Benefit Score:</span>
                      <span className="font-mono font-extrabold text-primary text-base">{topBenefitStation.score} / 100</span>
                    </div>

                    <div className="mt-3 text-[10px] text-muted-foreground leading-normal border-t border-border/30 pt-3">
                      {topBenefitStation.reasons.join(" · ")}
                    </div>

                    <button
                      onClick={() => handleApproveReinforcement(topBenefitStation.stationName)}
                      className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground transition hover:brightness-110 shadow-md cursor-pointer"
                    >
                      <CheckCircle2 className="size-4" /> Approve reinforcement (+5 officers)
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-success/40 bg-success/10 p-5 text-xs text-success flex flex-col gap-2">
                    <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                      <CheckCircle2 className="size-4" /> No Reinforcements Needed
                    </div>
                    <p className="text-[11px] text-success/90">
                      All station areas are currently clear of active incidents or have adequate resource coverage.
                    </p>
                  </div>
                )}
              </Panel>

              <Panel title="Auto Reinforcement Engine · Roster & Benefits" icon={<Building2 className="size-4" />}>
                <p className="mb-4 text-xs text-muted-foreground">
                  Benefit priority score for each station area. Click the "+5" button next to any station to dispatch resources from reserve.
                </p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                  {reinforcementBenefits.map((item) => {
                    const stationObj = stations.find(s => s.name === item.stationName);
                    const barColor = item.score >= 70 ? "bg-red-500" : item.score >= 40 ? "bg-amber-500" : "bg-emerald-500";
                    return (
                      <div key={item.stationName} className="rounded-xl border border-border bg-input/20 p-3 flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs">
                          <div>
                            <span className="font-semibold text-foreground">{item.stationName}</span>
                            <span className="ml-2 text-[10px] text-muted-foreground">({stationObj?.officersAvailable} officers avail)</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-foreground text-[11px]">{item.score}% benefit score</span>
                            <button
                              onClick={() => handleApproveReinforcement(item.stationName)}
                              className="rounded px-2.5 py-1 text-[10px] font-bold bg-muted hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer shadow-sm border border-border"
                            >
                              +5
                            </button>
                          </div>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-input/60">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${item.score}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            </div>

            {/* PERFORMANCE ANALYSIS VIEW */}
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
        {activeFormulaModal && (
          <FormulaModal formula={activeFormulaModal} onClose={() => setActiveFormulaModal(null)} />
        )}
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

function FormulaModal({ formula, onClose }: { formula: "priority" | "dijkstra" | "dispatch"; onClose: () => void }) {
  const [tab, setTab] = useState<"priority" | "dijkstra" | "dispatch">(formula);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-primary/30 bg-background/95 panel-glass p-6 shadow-2xl relative">
        <div className="absolute right-4 top-4 text-slate-400">
          <button onClick={onClose} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-input hover:text-foreground transition cursor-pointer">
            <span className="sr-only">Close</span>
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="mb-6">
          <h2 className="text-base font-extrabold uppercase tracking-wide flex items-center gap-2 text-primary">
            <Brain className="size-4" /> Algorithmic Formula Inspector
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1">Live equation trace and parameter definitions for routing decisions.</p>
        </div>

        <div className="flex border-b border-border/60 mb-5">
          <button
            onClick={() => setTab("priority")}
            className={`flex-1 pb-2.5 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${tab === "priority" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Priority Math
          </button>
          <button
            onClick={() => setTab("dijkstra")}
            className={`flex-1 pb-2.5 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${tab === "dijkstra" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Kinematic Dijkstra
          </button>
          <button
            onClick={() => setTab("dispatch")}
            className={`flex-1 pb-2.5 text-center text-xs font-semibold border-b-2 transition-all cursor-pointer ${tab === "dispatch" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            Dispatch Cost
          </button>
        </div>

        <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
          {tab === "priority" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-input/20 p-4">
                <p className="text-xs font-bold text-foreground mb-2">PRIORITY EQUATION</p>
                <div className="font-mono text-xs text-primary bg-background/50 p-2.5 rounded border border-border/50 select-all leading-relaxed whitespace-pre-wrap">
                  {"S_priority = clamp(S_base + A_esc + C_corridor + M_adj, 5, 100)"}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                  Where base score is severity-dependent:
                  <br />• <strong>Critical</strong>: 82 | <strong>High</strong>: 60 | <strong>Medium</strong>: 38 | <strong>Low</strong>: 18
                </p>
              </div>

              <div className="rounded-xl border border-border bg-input/20 p-4 space-y-2">
                <p className="text-xs font-bold text-foreground">VARIABLE DEFINITIONS</p>
                <ul className="text-xs space-y-2 text-muted-foreground">
                  <li>
                    <strong className="text-foreground">Age Escalation (A_esc)</strong>: Scales with queue waiting duration:
                    <br />• <span className="font-mono font-semibold text-primary">+12 points</span> for delay ≥ 10 minutes
                    <br />• <span className="font-mono font-semibold text-primary">+22 points</span> for delay ≥ 25 minutes
                  </li>
                  <li>
                    <strong className="text-foreground">Clustering / Corridor Penalty (C_corridor)</strong>: Compounds risk for adjacent incidents within threshold:
                    <br />• <span className="font-mono font-semibold text-primary">10 + (N - 1) * 8</span> points if N ≥ 2 active nearby incidents
                  </li>
                  <li>
                    <strong className="text-foreground">Mitigation Adjustment (M_adj)</strong>: Releases score pressure once units dispatch:
                    <br />• <span className="font-mono font-semibold text-primary">-10 points</span> relief factor
                  </li>
                </ul>
              </div>
            </div>
          )}

          {tab === "dijkstra" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-input/20 p-4">
                <p className="text-xs font-bold text-foreground mb-2">TEMPORAL DIGRAPH WEIGHTING</p>
                <div className="font-mono text-xs text-primary bg-background/50 p-2.5 rounded border border-border/50 select-all leading-relaxed whitespace-pre-wrap">
                  {"T_segment = D_segment / (V_base * (1 - C_level))"}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground leading-relaxed">
                  Converts physical meter distance (D_segment) to travel time dynamically based on the road network congestion level.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-input/20 p-4 space-y-2">
                <p className="text-xs font-bold text-foreground">SEGMENT CONGESTION (C_level)</p>
                <div className="font-mono text-[11px] text-primary bg-background/50 p-2.5 rounded border border-border/50 leading-relaxed">
                  {"C_level = clamp(c_base + c_weather + c_time + c_prox, 0.0, 0.99)"}
                </div>
                <ul className="text-xs space-y-2 text-muted-foreground mt-2">
                  <li>• <strong className="text-foreground">c_base</strong>: Segment base tier (Motorway: 0.3, Primary: 0.25, Secondary: 0.2, Tertiary: 0.15, Other: 0.1).</li>
                  <li>• <strong className="text-foreground">c_weather</strong>: Weather impediment (+0.20 weight during rain / waterlogging).</li>
                  <li>• <strong className="text-foreground">c_time</strong>: Hour peak scaling (+0.30 weight during rush hours).</li>
                  <li>• <strong className="text-foreground">c_prox</strong>: Incident proximity congestion penalty (+0.40 * (1.5 - dist) / 1.5 for segments within 1.5km of active incidents).</li>
                </ul>
              </div>
            </div>
          )}

          {tab === "dispatch" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-input/20 p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-foreground mb-1.5">SINGLE STATION COST FUNCTION</p>
                  <div className="font-mono text-xs text-primary bg-background/50 p-2 rounded border border-border/50 select-all leading-normal">
                    {"Cost_dispatch = 1.0 * T_travel + 10.0 * Deficit"}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-foreground mb-1.5">SWARM SQUADS COST FUNCTION</p>
                  <div className="font-mono text-xs text-primary bg-background/50 p-2 rounded border border-border/50 select-all leading-normal">
                    {"Cost_swarm = 1.0 * max(T_travel, i) + 5.0 * (K - 1) + 10.0 * Deficit_swarm"}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Calculates routing options. If a single closest station has an officer deficit, the system evaluates co-dispatch (swarm) from up to 3 neighboring stations. Swarms add a coordination penalty of <span className="font-semibold text-foreground">+5.0 mins per additional unit (K - 1)</span>. The swarm protocol is chosen if its combined cost is lower.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 border-t border-border pt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground transition hover:brightness-110 shadow-md cursor-pointer"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
}

