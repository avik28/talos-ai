import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity, Radio, Cone, Truck, Ambulance, ShieldAlert, Users, AlertTriangle,
  MapPin, Clock, Gauge, Zap, ArrowRight, Copy, Check, Siren, Brain, History,
  TrendingUp, Megaphone, ChevronRight, CircleDot, Sparkles, CalendarPlus, RotateCw,
  Terminal, HelpCircle, Layers, Undo, Moon, Sun, Send, Info
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";

// GridMind libraries
import {
  predict, buildActionPlan, fmtHour, severityColor, STATIONS,
  type PredictionInput, type Prediction, type Severity, type Venue,
  VENUES,
} from "@/lib/gridmind";
import { ALL_PLACES, DEFAULT_PLACE } from "@/lib/locations";
import { generateActionPlan } from "@/lib/actionplan.functions";
import { fetchHistoricalData, type HistoricalData } from "@/lib/historical.functions";
import { useEvents, useIncidents, uid, type Incident, type IncidentSeverity, type IncidentKind, type PlannedEvent } from "@/lib/store";

// Diversion Engine libraries
import {
  INITIAL_CORRIDORS,
  calculateDynamicImpactScore,
  calculateResourceRequirements,
  bootstrapFromHistoricalData,
  parseWhatIfQuery,
  predictImpactWithModel,
  type Corridor,
  type Route,
  type WhatIfResponse,
  type ModelPredictionResponse
} from "@/lib/diversionEngine";

const sevBg: Record<Severity, string> = {
  Critical: "bg-critical/15 text-critical border-critical/40",
  High: "bg-warning/15 text-warning border-warning/40",
  Moderate: "bg-info/15 text-info border-info/40",
  Low: "bg-success/15 text-success border-success/40",
};

const sevStyle = {
  Low: "border-success/40 bg-success/10 text-success",
  Medium: "border-info/40 bg-info/10 text-info",
  High: "border-warning/40 bg-warning/10 text-warning",
  Critical: "border-critical/40 bg-critical/10 text-critical",
};

interface UnifiedCommandCenterProps {
  defaultTab: "briefing" | "sandbox";
}

// Helper to resolve CSS var tokens to color strings for Leaflet
function resolveVar(token: string): string {
  if (typeof window === "undefined") return "#f5a623";
  const m = token.match(/var\((--[\w-]+)\)/);
  if (!m) return token;
  const val = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return val || "#f5a623";
}

// Global cache for persistent map component (prevents reloading on route changes)
let cachedMapDiv: HTMLDivElement | null = null;
let globalMap: any = null;
let globalLayer: any = null;
let globalL: any = null;

export function UnifiedCommandCenter({ defaultTab }: UnifiedCommandCenterProps) {
  const navigate = useNavigate();

  // ==========================================
  // SHARED STATES
  // ==========================================
  const { incidents, addIncident } = useIncidents();
  const { events, addEvent } = useEvents();

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

  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const selectedIncident = useMemo(() => {
    return combinedContexts.find((c) => c.id === selectedIncidentId) ?? combinedContexts[0] ?? null;
  }, [combinedContexts, selectedIncidentId]);

  // Set default selection on mount
  useEffect(() => {
    if (!selectedIncidentId && combinedContexts.length > 0) {
      setSelectedIncidentId(combinedContexts[0].id);
    }
  }, [combinedContexts, selectedIncidentId]);

  // ==========================================
  // INCIDENT-DRIVEN AUTOMATION HELPERS
  // ==========================================
  function getCorridorFromIncident(ctx: Incident | PlannedEvent): string {
    const loc = (isEvent(ctx) ? ctx.location?.name || ALL_PLACES.find(p => p.id === ctx.venueId)?.name || ctx.venueId : ctx.location).toLowerCase();
    if (loc.includes("mg road") || loc.includes("cubbon") || loc.includes("richmond") || loc.includes("brigade") || loc.includes("queens")) {
      return "mg_road";
    }
    if (loc.includes("hebbal") || loc.includes("rt nagar") || loc.includes("palace") || loc.includes("sadashivanagar") || loc.includes("sanjaynagar")) {
      return "hebbal";
    }
    if (loc.includes("orr") || loc.includes("outer ring") || loc.includes("marathahalli") || loc.includes("kr puram") || loc.includes("whitefield") || loc.includes("hoodi") || loc.includes("manyata") || loc.includes("sarjapur")) {
      return "orr";
    }
    return "mg_road";
  }

  function getClosedRoadsFromIncident(ctx: Incident | PlannedEvent): string[] {
    if (isEvent(ctx)) {
      const locName = ctx.location?.name || ALL_PLACES.find(p => p.id === ctx.venueId)?.name || ctx.venueId;
      return [locName];
    }
    const loc = ctx.location.toLowerCase();
    if (loc.includes("mg road") || loc.includes("cubbon") || loc.includes("richmond") || loc.includes("brigade") || loc.includes("queens")) {
      return ["MG Road"];
    }
    if (loc.includes("gate 3")) {
      return ["Gate 3 Exit"];
    }
    if (loc.includes("queens road")) {
      return ["Queens Road"];
    }
    const parts = ctx.location.split(",");
    if (parts.length > 0 && parts[0].trim()) {
      return [parts[0].trim()];
    }
    return [];
  }

  // ==========================================
  // SIMULATION STATES (driven automatically by selectedIncident)
  // ==========================================
  const [corridors, setCorridors] = useState<Corridor[]>(INITIAL_CORRIDORS);
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>("mg_road");
  const selectedCorridor = useMemo(() => {
    return corridors.find((c) => c.id === selectedCorridorId) || corridors[0];
  }, [corridors, selectedCorridorId]);
  const [closedRoads, setClosedRoads] = useState<string[]>([]);
  const [deployedOfficers, setDeployedOfficers] = useState<number>(0);
  const [rain, setRain] = useState<boolean>(false);
  const [peakHour, setPeakHour] = useState<boolean>(false);
  const [activeStackType, setActiveStackType] = useState<"alpha" | "beta" | "gamma">("alpha");

  // ML Model simulation states
  const [modelLoading, setModelLoading] = useState<boolean>(false);
  const [modelOutputs, setModelOutputs] = useState<ModelPredictionResponse | null>(null);
  const [diversionWarnings, setDiversionWarnings] = useState<string[]>([]);
  const [assessmentTrigger, setAssessmentTrigger] = useState<number>(0);

  const [intakeType, setIntakeType] = useState<"planned" | "unplanned">("unplanned");
  const [eventCause, setEventCause] = useState<string>("accident");
  const [corridorName, setCorridorName] = useState<string>("mg_road");
  const [vehType, setVehType] = useState<string>("heavy_vehicle");
  const [priorityLevel, setPriorityLevel] = useState<string>("High");
  const [reasonText, setReasonText] = useState<string>("");
  const [actualClearanceTime, setActualClearanceTime] = useState<number>(45);
  const [estimatedVolume, setEstimatedVolume] = useState<number>(15000);
  const [networkCapacity, setNetworkCapacity] = useState<number>(4000);

  // Load Demo Incidents helper
  function loadDemoIncidents() {
    const demo: Incident[] = [
      {
        id: uid("INC"),
        kind: "Waterlogging",
        severity: "Critical",
        location: "MG Road, Central Business District",
        description: "Heavy flooding at the underpass. Vehicles unable to cross.",
        reporter: "Traffic Police patrol",
        status: "Open",
        createdAt: Date.now() - 3600000
      },
      {
        id: uid("INC"),
        kind: "Accident",
        severity: "High",
        location: "Hebbal Flyover, North Zone",
        description: "Three-car pileup on the outbound ramp blocking one lane.",
        reporter: "Field Unit 4",
        status: "Open",
        createdAt: Date.now() - 7200000
      },
      {
        id: uid("INC"),
        kind: "Crowd Surge",
        severity: "High",
        location: "Outer Ring Road, East Zone 1",
        description: "Public rally near Manyata Tech Park exit causing massive tailbacks.",
        reporter: "NHAI Monitor",
        status: "Open",
        createdAt: Date.now() - 10800000
      }
    ];
    demo.forEach((inc) => addIncident(inc));
    toast.success("Loaded 3 demo incidents successfully!");
    setSelectedIncidentId(demo[0].id);
  }

  // Helper to generate a dynamic corridor around the active incident/event
  function generateDynamicCorridor(ctx: Incident | PlannedEvent): Corridor {
    const locationStr = isEvent(ctx) 
      ? ctx.location?.name || ALL_PLACES.find(p => p.id === ctx.venueId)?.name || ctx.venueId 
      : ctx.location;
    const place = ALL_PLACES.find(p => locationStr.toLowerCase().includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
    const incLat = place.lat;
    const incLng = place.lng;

    // Use hash of ID to vary angles (0, 45, 90, 135 degrees)
    const idNum = parseInt(ctx.id.replace(/\D/g, "")) || 0;
    const angleDeg = [0, 45, 90, 135][idNum % 4];
    const phi = (angleDeg * Math.PI) / 180;

    // Calculate start/end on 3km circumference (opposite ends of the incident area)
    const rLat = 0.027;
    const rLng = 0.02775;

    const startPt: [number, number] = [incLat - rLat * Math.cos(phi), incLng - rLng * Math.sin(phi)];
    const endPt: [number, number] = [incLat + rLat * Math.cos(phi), incLng + rLng * Math.sin(phi)];

    // Calculate waypoints offset perpendicular to the center by 1.8km
    const perpPhi = phi + Math.PI / 2;
    const wp2: [number, number] = [incLat + 0.018 * Math.cos(perpPhi), incLng + 0.018 * Math.sin(perpPhi)];
    const wp3: [number, number] = [incLat - 0.018 * Math.cos(perpPhi), incLng - 0.018 * Math.sin(perpPhi)];

    // Generate stacks
    const generateRoutes = (prefix: string, timeFactor: number): Route[] => [
      {
        id: `${prefix}_r1`,
        name: "Route A · Direct Detour",
        points: [startPt, endPt],
        distanceKm: 6.0,
        crossStreets: 8,
        strikes: 0,
        status: "Active",
        baseTimeMin: Math.round(18 * timeFactor),
      },
      {
        id: `${prefix}_r2`,
        name: "Route B · Parallel Eastern/Northern Bypass",
        points: [startPt, wp2, endPt],
        distanceKm: 7.8,
        crossStreets: 12,
        strikes: 0,
        status: "Active",
        baseTimeMin: Math.round(24 * timeFactor),
      },
      {
        id: `${prefix}_r3`,
        name: "Route C · Parallel Western/Southern Bypass",
        points: [startPt, wp3, endPt],
        distanceKm: 8.4,
        crossStreets: 10,
        strikes: 0,
        status: "Active",
        baseTimeMin: Math.round(28 * timeFactor),
      }
    ];

    const baselineClearance = isEvent(ctx) 
      ? (ctx.attendees >= 25000 ? 60 : ctx.attendees >= 10000 ? 45 : 30)
      : (ctx.severity === "Critical" ? 60 : ctx.severity === "High" ? 45 : 30);

    return {
      id: "incident_corridor",
      name: isEvent(ctx) ? `${ctx.title} Corridor` : `${ctx.kind} Corridor`,
      zone: place.area || "Active Incident Zone",
      lat: incLat,
      lng: incLng,
      baseLoad: place.baseLoad || 0.75,
      baselineClearanceMin: baselineClearance,
      stacks: {
        alpha: generateRoutes("alpha", 1.0),
        beta: generateRoutes("beta", 1.4),
        gamma: generateRoutes("gamma", 1.8),
      }
    };
  }

  // Auto-drive simulation variables when incident context changes
  useEffect(() => {
    if (!selectedIncident) return;

    // 1. Auto-derive corridor dynamically around the active incident
    const dynCorridor = generateDynamicCorridor(selectedIncident);
    setCorridors([dynCorridor]);
    setSelectedCorridorId("incident_corridor");
    setCorridorName("incident_corridor");

    // 2. Auto-derive rain weather
    const isRain = !isEvent(selectedIncident) && selectedIncident.kind === "Waterlogging";
    setRain(isRain);

    // 3. Auto-derive peak hour
    const hour = new Date(selectedIncident.createdAt).getHours();
    const isPeakTime = (hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21);
    const isHighSev = isEvent(selectedIncident)
      ? (selectedIncident.attendees >= 15000)
      : (selectedIncident.severity === "Critical" || selectedIncident.severity === "High");
    setPeakHour(isPeakTime || isHighSev);

    // 4. Auto-derive deployed officers count
    const officerMap = { Low: 2, Medium: 5, High: 10, Critical: 15 };
    const derivedSevForOfficers = isEvent(selectedIncident)
      ? (selectedIncident.attendees >= 35000 ? "Critical" : selectedIncident.attendees >= 15000 ? "High" : selectedIncident.attendees >= 5000 ? "Medium" : "Low")
      : selectedIncident.severity;
    setDeployedOfficers(officerMap[derivedSevForOfficers] || 5);

    // 5. Auto-derive stack type
    let stack: "alpha" | "beta" | "gamma" = "alpha";
    if (isEvent(selectedIncident)) {
      if (selectedIncident.type === "VIP Movement" || selectedIncident.type === "Political Rally" || selectedIncident.type === "Protest" || selectedIncident.type === "Strike / Bandh") {
        stack = "gamma";
      } else {
        stack = "beta";
      }
    } else {
      if (selectedIncident.kind === "VIP Movement" || selectedIncident.kind === "Crowd Surge") {
        stack = "gamma";
      } else if (selectedIncident.kind === "Waterlogging" || selectedIncident.kind === "Signal Failure" || isHighSev) {
        stack = "beta";
      }
    }
    setActiveStackType(stack);

    // 6. Auto-derive closed roads list
    const newClosed = getClosedRoadsFromIncident(selectedIncident);
    setClosedRoads(newClosed);

    // 7. Auto-derive new model variables
    const isPlanned = isEvent(selectedIncident) ? true : selectedIncident.kind === "VIP Movement";
    setIntakeType(isPlanned ? "planned" : "unplanned");

    const causeMap: Record<string, string> = {
      "Accident": "accident",
      "Breakdown": "vehicle_breakdown",
      "Signal Failure": "others",
      "Waterlogging": "water_logging",
      "Road Block": "others",
      "VIP Movement": "public_event",
      "Crowd Surge": "public_event"
    };

    if (isEvent(selectedIncident)) {
      if (selectedIncident.type === "Roadwork / Diversion") {
        setEventCause("others");
      } else {
        setEventCause("public_event");
      }
    } else {
      setEventCause(causeMap[selectedIncident.kind] || "others");
    }

    let severityLevelLocal: Severity = "Moderate";
    if (isEvent(selectedIncident)) {
      severityLevelLocal = selectedIncident.attendees >= 35000 ? "Critical" : selectedIncident.attendees >= 15000 ? "High" : selectedIncident.attendees >= 5000 ? "Moderate" : "Low";
    } else {
      severityLevelLocal = selectedIncident.severity === "Medium" ? "Moderate" : selectedIncident.severity;
    }
    setPriorityLevel(severityLevelLocal === "Critical" ? "High" : severityLevelLocal);
    
    setReasonText(isEvent(selectedIncident) ? `${selectedIncident.title} (${selectedIncident.type})` : selectedIncident.description || "");

    const desc = (isEvent(selectedIncident) ? selectedIncident.title : selectedIncident.description || "").toLowerCase();
    if (desc.includes("bus")) setVehType("bmtc_bus");
    else if (desc.includes("truck") || desc.includes("lcv")) setVehType("lcv");
    else if (desc.includes("car")) setVehType("private_car");
    else setVehType("heavy_vehicle");

    if (isEvent(selectedIncident)) {
      setEstimatedVolume(selectedIncident.attendees);
    } else {
      setEstimatedVolume(isPlanned ? 18000 : 8000);
    }
    setNetworkCapacity(4000);
    setActualClearanceTime(45);

    // Reset predictions when switching context
    setPrediction(null);
    setScheduled(false);
  }, [selectedIncidentId, selectedIncident]);

  // ML Model prediction caller
  useEffect(() => {
    if (!selectedCorridor) return;

    let isCancelled = false;
    const triggerPrediction = async () => {
      setModelLoading(true);

      const mappedCorridor = corridorName === "incident_corridor" ? "Non-corridor" : corridorName === "mg_road" ? "CBD 2" : corridorName === "hebbal" ? "Tumkur Road" : "ORR East 1";
      const mappedPriority = priorityLevel === "Critical" ? "High" : priorityLevel;
      const mappedZone = selectedCorridor.zone || "Central Zone 2";

      const inputs = {
        event_type: intakeType,
        event_cause: eventCause,
        corridor: mappedCorridor,
        veh_type: vehType,
        priority: mappedPriority,
        zone: mappedZone,
        latitude: selectedCorridor.lat,
        longitude: selectedCorridor.lng,
        endlatitude: selectedCorridor.lat + 0.005,
        endlongitude: selectedCorridor.lng + 0.005,
        created_date: new Date(selectedIncident ? selectedIncident.createdAt : Date.now()).toISOString(),
        reason_breakdown: reasonText,
        actual_clearance_time: actualClearanceTime
      };

      if (selectedCorridorId === "incident_corridor" && selectedIncident) {
        const allIncidentsPayload = combinedContexts.map(item => {
          if (isEvent(item)) {
            const locName = item.location?.name || ALL_PLACES.find(p => p.id === item.venueId)?.name || item.venueId;
            const place = ALL_PLACES.find(p => locName.toLowerCase().includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
            const severityLevel = item.attendees >= 35000 ? "Critical" : item.attendees >= 15000 ? "High" : "Medium";
            return {
              id: item.id,
              latitude: place.lat,
              longitude: place.lng,
              severity: severityLevel,
              kind: item.type === "Protest" ? "Crowd Surge" : item.type === "Roadwork / Diversion" ? "Road Block" : item.type,
              event_type: "planned",
              event_cause: item.type === "Roadwork / Diversion" ? "others" : "public_event",
              corridor: "Non-corridor",
              veh_type: "heavy_vehicle",
              priority: item.attendees >= 15000 ? "High" : "Medium",
              reason_breakdown: item.title,
              created_date: new Date(item.createdAt).toISOString(),
              endlatitude: place.lat + 0.005,
              endlongitude: place.lng + 0.005
            };
          } else {
            const place = ALL_PLACES.find(p => item.location.toLowerCase().includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
            const causeMap: Record<string, string> = {
              "Accident": "accident",
              "Breakdown": "vehicle_breakdown",
              "Signal Failure": "others",
              "Waterlogging": "water_logging",
              "Road Block": "others",
              "VIP Movement": "public_event",
              "Crowd Surge": "public_event"
            };
            return {
              id: item.id,
              latitude: place.lat,
              longitude: place.lng,
              severity: item.severity,
              kind: item.kind,
              event_type: item.kind === "VIP Movement" ? "planned" : "unplanned",
              event_cause: causeMap[item.kind] || "others",
              corridor: "Non-corridor",
              veh_type: "heavy_vehicle",
              priority: item.severity === "Critical" ? "High" : item.severity,
              reason_breakdown: item.description || "",
              created_date: new Date(item.createdAt).toISOString(),
              endlatitude: place.lat + 0.005,
              endlongitude: place.lng + 0.005
            };
          }
        });

        const primaryPayload = {
          id: selectedIncident.id,
          latitude: selectedCorridor.lat,
          longitude: selectedCorridor.lng,
          severity: isEvent(selectedIncident) ? (selectedIncident.attendees >= 35000 ? "Critical" : selectedIncident.attendees >= 15000 ? "High" : "Medium") : selectedIncident.severity,
          kind: isEvent(selectedIncident) ? (selectedIncident.type === "Protest" ? "Crowd Surge" : selectedIncident.type === "Roadwork / Diversion" ? "Road Block" : selectedIncident.type) : selectedIncident.kind,
          event_type: intakeType,
          event_cause: eventCause,
          corridor: "Non-corridor",
          veh_type: vehType,
          priority: mappedPriority,
          zone: mappedZone,
          reason_breakdown: reasonText,
          created_date: new Date(selectedIncident.createdAt).toISOString(),
          endlatitude: selectedCorridor.lat + 0.005,
          endlongitude: selectedCorridor.lng + 0.005
        };

        try {
          const response = await fetch("http://localhost:8000/api/generate-diversions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              primary_incident: primaryPayload,
              all_incidents: allIncidentsPayload,
              rain,
              peak_hour: peakHour,
              deployed_officers: deployedOfficers
            })
          });

          if (!response.ok) {
            throw new Error(`Server returned status: ${response.status}`);
          }

          const data = await response.json();
          if (!isCancelled) {
            setModelOutputs({
              s_impact: data.s_impact,
              strike_threshold: data.strike_threshold,
              officers: Math.ceil((data.routes[0]?.distanceKm || 2.0) / 1.5) + 2,
              barricades: Math.max(2, Math.round(5 * (data.s_impact / 100) * 8)),
              tow_trucks: Math.max(1, Math.round(data.s_impact / 33)),
              strike_issued: actualClearanceTime > data.strike_threshold,
              features: {
                hour_of_day: new Date(selectedIncident.createdAt).getHours(),
                day_of_week: new Date(selectedIncident.createdAt).getDay(),
                is_peak_hour: peakHour ? 1 : 0,
                impact_distance_km: data.routes[0]?.distanceKm || 2.0,
                has_mech_failure: reasonText ? 1 : 0,
                t_base: 45.0
              }
            });

            setDiversionWarnings(data.warnings || []);

            setCorridors((prevCorridors) => {
              return prevCorridors.map((c) => {
                if (c.id === "incident_corridor") {
                  const currentRoutes = c.stacks[activeStackType] || [];
                  let updatedRoutes = [];
                  if (currentRoutes.length === 0) {
                    updatedRoutes = data.routes;
                  } else {
                    updatedRoutes = currentRoutes.map((existingRoute) => {
                      const isRouteA = existingRoute.id.endsWith("r1") || existingRoute.id.endsWith("_1") || existingRoute.name.includes("Route A");
                      const isRouteB = existingRoute.id.endsWith("r2") || existingRoute.id.endsWith("_2") || existingRoute.name.includes("Route B");
                      const isRouteC = existingRoute.id.endsWith("r3") || existingRoute.id.endsWith("_3") || existingRoute.name.includes("Route C");

                      const newRoute = data.routes.find((nr: any) => {
                        if (isRouteA) return nr.id.endsWith("_1") || nr.name.includes("Route A");
                        if (isRouteB) return nr.id.endsWith("_2") || nr.name.includes("Route B");
                        if (isRouteC) return nr.id.endsWith("_3") || nr.name.includes("Route C");
                        return false;
                      });

                      if (newRoute) {
                        return {
                          ...existingRoute,
                          points: newRoute.points,
                          distanceKm: newRoute.distanceKm,
                          crossStreets: newRoute.crossStreets,
                          baseTimeMin: newRoute.baseTimeMin,
                        };
                      }
                      return existingRoute;
                    });
                  }
                  return {
                    ...c,
                    stacks: {
                      ...c.stacks,
                      [activeStackType]: updatedRoutes
                    }
                  };
                }
                return c;
              });
            });

            setOsrmGeometries((prev) => {
              const cleaned = { ...prev };
              data.routes.forEach((r: any) => {
                delete cleaned[r.id];
              });
              return cleaned;
            });

            setModelLoading(false);
          }
        } catch (err) {
          console.warn("FastAPI generate-diversions failed, running predict-impact fallback...", err);
          const result = await predictImpactWithModel(inputs);
          if (!isCancelled) {
            setModelOutputs(result);
            setDiversionWarnings([]);
            setModelLoading(false);
          }
        }
      } else {
        const result = await predictImpactWithModel(inputs);
        if (!isCancelled) {
          setModelOutputs(result);
          setDiversionWarnings([]);
          setModelLoading(false);
        }
      }
    };

    triggerPrediction();

    return () => {
      isCancelled = true;
    };
  }, [intakeType, eventCause, corridorName, vehType, priorityLevel, reasonText, actualClearanceTime, estimatedVolume, networkCapacity, selectedCorridor?.id, selectedCorridor?.lat, selectedCorridor?.lng, selectedCorridor?.zone, selectedIncident, selectedCorridorId, rain, peakHour, deployedOfficers, activeStackType]);

  // ==========================================
  // COMMAND CENTER CORE (AI prediction trigger)
  // ==========================================
  const [prediction, setPrediction] = useState<Prediction | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [history, setHistory] = useState<HistoricalData | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const predictionInput: PredictionInput | null = selectedIncident
    ? (isEvent(selectedIncident)
      ? {
          type: selectedIncident.type,
          venueId: selectedIncident.venueId,
          location: selectedIncident.location,
          attendees: selectedIncident.attendees,
          hour: selectedIncident.hour,
          durationHr: selectedIncident.durationHr,
          planned: selectedIncident.planned,
        }
      : {
          type: (selectedIncident.kind === "VIP Movement" ? "VIP Movement" : selectedIncident.kind === "Crowd Surge" ? "Protest" : "Roadwork / Diversion"),
          venueId: VENUES.find(v => selectedIncident.location.toLowerCase().includes(v.name.toLowerCase()))?.id ?? DEFAULT_PLACE.id,
          location: VENUES.find(v => selectedIncident.location.toLowerCase().includes(v.name.toLowerCase())) ?? DEFAULT_PLACE,
          attendees: selectedIncident.severity === "Critical" ? 26000 : selectedIncident.severity === "High" ? 18000 : selectedIncident.severity === "Medium" ? 9000 : 2500,
          hour: new Date(selectedIncident.createdAt).getHours(),
          durationHr: selectedIncident.severity === "Critical" ? 4 : selectedIncident.severity === "High" ? 3 : 2,
          planned: selectedIncident.kind === "VIP Movement",
        })
    : null;

  function runAnalysis() {
    if (!predictionInput) return;
    setAnalyzing(true);
    setTimeout(() => {
      setPrediction(predict(predictionInput, history ? { incidents: history.incidents, stations: history.stations, plans: history.plans } : undefined));
      setAnalyzing(false);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
      toast.success("AI operational impact and green corridor allocations calculated!");
    }, 950);
  }

  function scheduleEvent() {
    if (!selectedIncident || !predictionInput) return;
    const locName = isEvent(selectedIncident)
      ? (selectedIncident.location?.name || ALL_PLACES.find(p => p.id === selectedIncident.venueId)?.name || selectedIncident.venueId)
      : selectedIncident.location;
    addEvent({
      id: uid("EVT"),
      type: predictionInput.type,
      venueId: predictionInput.venueId ?? DEFAULT_PLACE.id,
      location: predictionInput.location ?? DEFAULT_PLACE,
      attendees: predictionInput.attendees,
      hour: predictionInput.hour,
      durationHr: predictionInput.durationHr,
      planned: predictionInput.planned,
      date: new Date().toISOString().slice(0, 10),
      title: `Incident response · ${locName}`,
      status: "Scheduled",
      createdAt: Date.now(),
    });
    setScheduled(true);
    setTimeout(() => navigate({ to: "/planner" }), 600);
  }

  useEffect(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    fetchHistoricalData()
      .then((data) => setHistory(data))
      .catch((error) => {
        console.error("Failed to load historical data", error);
        setHistoryError("Unable to load historical records.");
      })
      .finally(() => setHistoryLoading(false));
  }, []);

  // ==========================================
  // CLI & SIMULATION OVERLAYS
  // ==========================================
  const [commandInput, setCommandInput] = useState<string>(
    selectedIncident
      ? `Deploy officers for ${isEvent(selectedIncident) ? selectedIncident.title : selectedIncident.kind}`
      : ""
  );
  const [consoleMessages, setConsoleMessages] = useState<Array<{ sender: "user" | "system", text: string }>>([
    { sender: "system", text: "GridMind Diversion CLI v1.0. Ready. Type queries to override simulation (e.g. 'Deploy 12 officers')." }
  ]);
  const [queryResponse, setQueryResponse] = useState<WhatIfResponse | null>(null);

  // Sync default prompt command with selected incident
  useEffect(() => {
    if (selectedIncident) {
      setCommandInput(`Deploy officers for ${isEvent(selectedIncident) ? selectedIncident.title : selectedIncident.kind}`);
    }
  }, [selectedIncidentId, selectedIncident]);

  const [bootstrapComplete, setBootstrapComplete] = useState<boolean>(false);
  const [bootstrapLogs, setBootstrapLogs] = useState<string[]>([]);
  const [logIndex, setLogIndex] = useState<number>(0);
  const [osrmGeometries, setOsrmGeometries] = useState<Record<string, [number, number][]>>({});

  const [autoApplyLiveIncidents, setAutoApplyLiveIncidents] = useState<boolean>(true);

  const resources = useMemo(() => {
    if (modelOutputs) {
      return {
        barricades: modelOutputs.barricades,
        officers: modelOutputs.officers,
        towTrucks: modelOutputs.tow_trucks
      };
    }
    if (!selectedCorridor) return { barricades: 0, officers: 0, towTrucks: 0 };
    const activeStack = selectedCorridor.stacks[activeStackType];
    if (!activeStack || activeStack.length === 0) return { barricades: 0, officers: 0, towTrucks: 0 };
    const primaryRoute = activeStack[0];
    const severity = selectedIncident 
      ? (isEvent(selectedIncident)
        ? (selectedIncident.attendees >= 35000 ? "Critical" : selectedIncident.attendees >= 15000 ? "High" : "Medium")
        : selectedIncident.severity)
      : "Medium";

    const engineSeverity: "Low" | "Medium" | "High" | "Critical" =
      severity === "Low" ? "Low" :
        severity === "Medium" ? "Medium" :
          severity === "High" ? "High" : "Critical";

    const planned = selectedIncident ? (isEvent(selectedIncident) ? true : selectedIncident.kind === "VIP Movement") : false;

    const impactScore = calculateDynamicImpactScore({
      planned,
      severity: engineSeverity,
      historicalClosureProbability: 0.25,
      estimatedVolume: planned ? (isEvent(selectedIncident) ? selectedIncident.attendees : 18000) : 8000,
      hourlyCapacity: 4000,
      durationHr: planned ? 4 : 2,
    });

    return calculateResourceRequirements({
      planned,
      impactScore,
      crossStreets: primaryRoute.crossStreets,
      distanceKm: primaryRoute.distanceKm,
      attendees: planned ? 18000 : undefined,
    });
  }, [selectedCorridor, activeStackType, selectedIncident, modelOutputs]);

  const liveClosedRoads = useMemo(() => {
    if (!autoApplyLiveIncidents) return [];
    const roads: string[] = [];
    combinedContexts.forEach((item) => {
      if (isEvent(item)) {
        const locName = item.location?.name || ALL_PLACES.find(p => p.id === item.venueId)?.name || item.venueId;
        const match = ALL_PLACES.find((p) => locName.toLowerCase().includes(p.name.toLowerCase()));
        if (match) {
          roads.push(match.name);
        } else {
          roads.push(locName);
        }
      } else {
        if (
          item.kind === "Road Block" ||
          item.kind === "Accident" ||
          item.kind === "Waterlogging" ||
          item.severity === "Critical" ||
          item.severity === "High"
        ) {
          const match = ALL_PLACES.find((p) =>
            item.location.toLowerCase().includes(p.name.toLowerCase())
          );
          if (match) {
            roads.push(match.name);
          } else {
            const parts = item.location.split(",");
            roads.push(parts[0].trim());
          }
        }
      }
    });
    return Array.from(new Set(roads));
  }, [combinedContexts, autoApplyLiveIncidents]);

  const effectiveClosedRoads = useMemo(() => {
    return Array.from(new Set([...closedRoads, ...liveClosedRoads]));
  }, [closedRoads, liveClosedRoads]);

  // Fetch coordinates for the selected corridor's routes to snap them to actual roads
  useEffect(() => {
    if (!selectedCorridor || selectedCorridor.id === "incident_corridor") return;

    const fetchCorridorGeometries = async () => {
      const activeCorridor = selectedCorridor;
      const newGeometries = { ...osrmGeometries };
      let updated = false;

      const fetchRoute = async (routeId: string, pts: [number, number][]) => {
        const cacheKey = `${routeId}_r${rain}_p${peakHour}_o${deployedOfficers}_c${effectiveClosedRoads.join(",")}`;
        if (newGeometries[cacheKey]) {
          newGeometries[routeId] = newGeometries[cacheKey];
          return;
        }

        try {
          const mappedClosedRoads = effectiveClosedRoads.map((roadName) => {
            const place = ALL_PLACES.find((p) => p.name.toLowerCase() === roadName.toLowerCase());
            return {
              name: roadName,
              lat: place ? place.lat : null,
              lng: place ? place.lng : null
            };
          });

          // Always ensure the selected incident itself is blocked in the routing engine
          if (selectedIncident) {
            const locName = isEvent(selectedIncident)
              ? (selectedIncident.location?.name || ALL_PLACES.find(p => p.id === selectedIncident.venueId)?.name || selectedIncident.venueId)
              : selectedIncident.location;
            const place = ALL_PLACES.find(p => locName.toLowerCase().includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
            if (!mappedClosedRoads.some(r => r.lat === place.lat && r.lng === place.lng)) {
              mappedClosedRoads.push({
                name: isEvent(selectedIncident) ? selectedIncident.title : selectedIncident.kind,
                lat: place.lat,
                lng: place.lng
              });
            }
          }

          const res = await fetch("http://localhost:8000/api/route", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              waypoints: pts,
              closedRoads: mappedClosedRoads,
              variables: {
                rain,
                peakHour,
                deployedOfficers
              }
            })
          });
          const data = await res.json();
          if (data.points && data.points.length > 0) {
            newGeometries[cacheKey] = data.points;
            newGeometries[routeId] = data.points;
            updated = true;
            return;
          }
        } catch (e) {
          console.warn("Local FastAPI route service unavailable, falling back to OSRM...", e);
        }

        try {
          const coordsStr = pts.map(p => `${p[1]},${p[0]}`).join(";");
          const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
            const roadPoints = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
            newGeometries[cacheKey] = roadPoints;
            newGeometries[routeId] = roadPoints;
            updated = true;
          }
        } catch (e) {
          console.error("OSRM fetch failed for route", routeId, e);
        }
      };

      const promises: Promise<void>[] = [];
      (["alpha", "beta", "gamma"] as const).forEach(stack => {
        activeCorridor.stacks[stack].forEach(route => {
          promises.push(fetchRoute(route.id, route.points));
        });
      });

      await Promise.all(promises);
      if (updated) {
        setOsrmGeometries(newGeometries);
      }
    };

    fetchCorridorGeometries();
  }, [selectedCorridorId, selectedCorridor, rain, peakHour, deployedOfficers, effectiveClosedRoads]);

  // Run Bootstrap logs simulation on mount
  useEffect(() => {
    const res = bootstrapFromHistoricalData([]);
    const totalLogs = res.logs;

    const interval = setInterval(() => {
      if (logIndex < totalLogs.length) {
        setBootstrapLogs((prev) => [...prev, totalLogs[logIndex]]);
        setLogIndex((prev) => prev + 1);
      } else {
        clearInterval(interval);
        setBootstrapComplete(true);
        setCorridors((prevCorridors) => {
          return prevCorridors.map((c) => {
            if (c.id === "mg_road") {
              const updatedAlpha = [...c.stacks.alpha];
              updatedAlpha[0] = { ...updatedAlpha[0], strikes: 3, status: "Penalty Box" };
              return {
                ...c,
                stacks: {
                  ...c.stacks,
                  alpha: [updatedAlpha[1], updatedAlpha[2], updatedAlpha[0]]
                }
              };
            }
            return c;
          });
        });
      }
    }, 80);

    return () => clearInterval(interval);
  }, [logIndex]);

  // Map drawing helper
  function drawMapElements() {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layerRef.current;
    if (!L || !map || !group) return;

    group.clearLayers();

    // 1. Draw Police Stations (Shared layer)
    STATIONS.forEach((s) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:3px;background:#7c87a0;border:2px solid #cfd6e6;box-shadow:0 0 6px rgba(0,0,0,.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([s.lat, s.lng], { icon }).bindTooltip(`${s.name} · ${s.officersAvailable} avail`, { direction: "top" }).addTo(group);
    });

    // 2. Draw Live Active Incidents pulsing markers (Shared layer)
    liveIncidents.forEach((inc) => {
      const place = ALL_PLACES.find(p => inc.location.toLowerCase().includes(p.name.toLowerCase()));
      if (place) {
        const isSelected = inc.id === selectedIncidentId;
        const iconHtml = `<div class="flex items-center justify-center rounded-full border-2 ${isSelected ? "border-primary bg-primary/20 scale-125" : "border-critical bg-critical/20"} text-critical shadow-glow animate-pulse" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px ${isSelected ? "var(--primary)" : "var(--critical)"};">
          <svg style="width:12px;height:12px;color:${isSelected ? "var(--primary)" : "var(--critical)"};" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>`;
        const customIcon = L.divIcon({
          className: "",
          html: iconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        L.marker([place.lat, place.lng], { icon: customIcon })
          .bindTooltip(`<b>${isSelected ? "ACTIVE CONTEXT: " : ""}Incident: ${inc.kind}</b><br/>Severity: ${inc.severity}<br/>Location: ${inc.location}<br/>Description: ${inc.description}`, { direction: "top" })
          .addTo(group);
      }
    });

    // Draw Planned Events pulsing markers (Shared layer)
    activeEvents.forEach((ev) => {
      const locName = ev.location?.name || ALL_PLACES.find(p => p.id === ev.venueId)?.name || ev.venueId;
      const place = ALL_PLACES.find(p => locName.toLowerCase().includes(p.name.toLowerCase()));
      if (place) {
        const isSelected = ev.id === selectedIncidentId;
        const iconHtml = `<div class="flex items-center justify-center rounded-full border-2 border-primary bg-primary/20 text-primary shadow-glow animate-pulse ${isSelected ? "scale-125" : ""}" style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px var(--primary);">
          <svg style="width:12px;height:12px;color:var(--primary);" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2v4M16 2v4M3 10h18M3 4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4Z"/>
          </svg>
        </div>`;
        const customIcon = L.divIcon({
          className: "",
          html: iconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        L.marker([place.lat, place.lng], { icon: customIcon })
          .bindTooltip(`<b>${isSelected ? "ACTIVE CONTEXT: " : ""}Planned Event: ${ev.title}</b><br/>Type: ${ev.type}<br/>Location: ${locName}<br/>Attendees: ${ev.attendees.toLocaleString()}`, { direction: "top" })
          .addTo(group);
      }
    });

    // 3. Draw Corridor simulation lines (Sandbox)
    if (selectedCorridor) {
      // Selected Corridor Marker
      const markerHtml = `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--primary);border:2px solid #fff;box-shadow:0 0 10px rgba(0,0,0,0.5);">
        <div style="width:8px;height:8px;border-radius:50%;background:#fff;"></div>
      </div>`;
      const icon = L.divIcon({
        className: "",
        html: markerHtml,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([selectedCorridor.lat, selectedCorridor.lng], { icon })
        .bindTooltip(`<b>${selectedCorridor.name}</b><br/>Base Load: ${(selectedCorridor.baseLoad * 100).toFixed(0)}%`, { direction: "top" })
        .addTo(group);

      // Draw active routes in the selected stack
      const activeStack = selectedCorridor.stacks[activeStackType];
      activeStack.forEach((route, index) => {
        const isPrimary = index === 0;
        const isSecondary = index === 1;

        let color = "var(--muted-foreground)";
        let opacity = 0.4;
        let dashArray = "5, 10";

        if (isPrimary && route.status === "Active") {
          color = "var(--success)";
          opacity = 0.95;
          dashArray = "";
        } else if (isSecondary && route.status === "Active") {
          color = "var(--warning)";
          opacity = 0.75;
          dashArray = "4, 6";
        }

        const pointsToDraw = osrmGeometries[route.id] || route.points;

        L.polyline(pointsToDraw, {
          color,
          weight: isPrimary ? 6 : 4,
          opacity,
          dashArray,
          lineCap: "round"
        }).bindTooltip(`<b>${route.name}</b><br/>Status: ${route.status}<br/>Distance: ${route.distanceKm} km`, { direction: "top" }).addTo(group);
      });

      // Draw closed/avoid roads if active
      effectiveClosedRoads.forEach((road) => {
        let closedCoords: [number, number][] = [];
        let label = "";

        if (road.toLowerCase().includes("mg road")) {
          closedCoords = [[12.9736, 77.6074], [12.9740, 77.6110]];
          label = "MG Road Blocked";
        } else if (road.toLowerCase().includes("gate 3")) {
          closedCoords = [[12.9788, 77.5996], [12.9780, 77.5980]];
          label = "Gate 3 Exit Closed";
        } else if (road.toLowerCase().includes("queens")) {
          closedCoords = [[12.9836, 77.5966], [12.9800, 77.5950]];
          label = "Queens Road Restricted";
        } else {
          const place = ALL_PLACES.find(p => p.name.toLowerCase() === road.toLowerCase() || p.name.toLowerCase().includes(road.toLowerCase()));
          if (place) {
            closedCoords = [[place.lat - 0.0006, place.lng - 0.0006], [place.lat + 0.0006, place.lng + 0.0006]];
            label = `${place.name} Blocked`;
          }
        }

        if (closedCoords.length > 0) {
          L.polyline(closedCoords, {
            color: "var(--critical)",
            weight: 7,
            opacity: 0.9,
            lineCap: "round"
          }).bindTooltip(`<b style="color:var(--critical);">${label}</b>`, { permanent: true, direction: "top" }).addTo(group);
        }
      });

      // 4. Overlap AI Prediction results if generated
      if (prediction) {
        const p = prediction;
        const sev = resolveVar(severityColor(p.severity));

        // Impact radius circle
        L.circle([p.venue.lat, p.venue.lng], {
          radius: p.radiusKm * 1000,
          color: sev,
          weight: 2,
          fillColor: sev,
          fillOpacity: 0.14,
        }).addTo(group);

        // Junction load circles
        p.junctions.forEach((j) => {
          const col = j.load > 0.7 ? resolveVar("var(--critical)") : j.load > 0.45 ? resolveVar("var(--warning)") : resolveVar("var(--success)");
          L.circleMarker([j.lat, j.lng], { radius: 7, color: col, fillColor: col, fillOpacity: 0.85, weight: 1 })
            .bindTooltip(`${j.name} · ${(j.load * 100).toFixed(0)}%`, { direction: "top" })
            .addTo(group);
        });

        // Suggested AI Detours
        p.diversions.forEach((d) => {
          const col = resolveVar(d.color);
          L.polyline(d.points, { color: col, weight: 4, opacity: 0.9, dashArray: "2 8", lineCap: "round" })
            .bindTooltip(`${d.name} · AI suggested detours`)
            .addTo(group);
        });
      }

      // Fly map to active focus only when the corridor or location actually changes
      const locationKey = `${selectedCorridor.id}_${selectedCorridor.lat}_${selectedCorridor.lng}`;
      if (prevCorridorLocationRef.current !== locationKey) {
        map.flyTo([selectedCorridor.lat, selectedCorridor.lng], 12.5, { duration: 0.8 });
        prevCorridorLocationRef.current = locationKey;
      }
    }
  }

  // ==========================================
  // MAP INITIALIZATION
  // ==========================================
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const prevCorridorLocationRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !elRef.current) return;

      try {
        // Health-check the cached map instance:
        // After HMR or route navigation the container div can become detached.
        if (globalMap) {
          try {
            const container = globalMap.getContainer();
            if (!container || !container.isConnected) {
              globalMap.remove();
              globalMap = null;
              globalLayer = null;
              cachedMapDiv = null;
            }
          } catch {
            globalMap = null;
            globalLayer = null;
            cachedMapDiv = null;
          }
        }

        if (!cachedMapDiv) {
          cachedMapDiv = document.createElement("div");
          // Absolute fill so Leaflet measures real parent dimensions on init
          cachedMapDiv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
        }

        // Always re-attach to the current elRef so the div is in the DOM
        // BEFORE Leaflet initialises (so it can measure real dimensions).
        if (elRef.current) {
          elRef.current.style.position = "relative";
          elRef.current.innerHTML = "";
          elRef.current.appendChild(cachedMapDiv);
        }

        if (!globalMap) {
          // Guard against Leaflet "Map container is already initialized" error
          // which occurs when HMR reloads a div that still has _leaflet_id set.
          if ((cachedMapDiv as any)._leaflet_id) {
            cachedMapDiv = document.createElement("div");
            cachedMapDiv.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
            elRef.current!.innerHTML = "";
            elRef.current!.appendChild(cachedMapDiv);
          }

          globalL = L;
          const map = L.map(cachedMapDiv, { zoomControl: true, attributionControl: false }).setView([12.9716, 77.5946], 12);
          L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
            maxZoom: 19,
          }).addTo(map);

          globalMap = map;
          globalLayer = L.layerGroup().addTo(map);
        }

        LRef.current = globalL;
        mapRef.current = globalMap;
        layerRef.current = globalLayer;

        // Fire invalidateSize at two intervals to guarantee the tiles render
        // regardless of how quickly the CSS layout settles.
        setTimeout(() => { if (!cancelled && globalMap) globalMap.invalidateSize(); }, 50);
        setTimeout(() => { if (!cancelled && globalMap) globalMap.invalidateSize(); }, 300);

        drawMapElements();
      } catch (err) {
        console.error("[Map] Initialization failed, resetting stale state:", err);
        try { globalMap?.remove(); } catch { /* ignore */ }
        globalMap = null;
        globalLayer = null;
        globalL = null;
        cachedMapDiv = null;
        LRef.current = null;
        mapRef.current = null;
        layerRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      if (cachedMapDiv && cachedMapDiv.parentNode) {
        cachedMapDiv.parentNode.removeChild(cachedMapDiv);
      }
    };
  }, []);



  // Redraw when variables change
  useEffect(() => {
    drawMapElements();
  }, [prediction, selectedCorridor, activeStackType, effectiveClosedRoads, bootstrapComplete, osrmGeometries, combinedContexts, selectedIncidentId]);

  // ==========================================
  // DIVERSION SANDBOX HANDLERS
  // ==========================================
  async function runQuery(cmd: string) {
    if (!cmd.trim()) return;

    setConsoleMessages((prev) => [...prev, { sender: "user", text: cmd }]);
    const activeStack = selectedCorridor.stacks[activeStackType];
    const activeRoute = activeStack[0];
    const currentPoints = activeRoute.points;

    try {
      const mappedClosedRoads = effectiveClosedRoads.map((roadName) => {
        const place = ALL_PLACES.find((p) => p.name.toLowerCase() === roadName.toLowerCase());
        return {
          name: roadName,
          lat: place ? place.lat : null,
          lng: place ? place.lng : null
        };
      });

      // Always ensure the selected incident itself is blocked in the routing engine
      if (selectedIncident) {
        const locName = isEvent(selectedIncident)
          ? (selectedIncident.location?.name || ALL_PLACES.find(p => p.id === selectedIncident.venueId)?.name || selectedIncident.venueId)
          : selectedIncident.location;
        const place = ALL_PLACES.find(p => locName.toLowerCase().includes(p.name.toLowerCase())) ?? DEFAULT_PLACE;
        if (!mappedClosedRoads.some(r => r.lat === place.lat && r.lng === place.lng)) {
          mappedClosedRoads.push({
            name: isEvent(selectedIncident) ? selectedIncident.title : selectedIncident.kind,
            lat: place.lat,
            lng: place.lng
          });
        }
      }

      const response = await fetch("http://localhost:8000/api/what-if", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: cmd,
          waypoints: currentPoints,
          closedRoads: mappedClosedRoads,
          variables: { rain, peakHour, deployedOfficers }
        })
      });
      const data = await response.json();

      if (data.closedRoads) {
        setClosedRoads(data.closedRoads.map((cr: any) => cr.name));
      }
      if (data.officersDeployed !== undefined) setDeployedOfficers(data.officersDeployed);

      if (data.points && data.points.length > 0) {
        setOsrmGeometries((prev) => ({
          ...prev,
          [activeRoute.id]: data.points
        }));
      }

      setQueryResponse({
        queryMatched: data.queryMatched,
        title: data.title,
        congestionBefore: data.congestionBefore,
        congestionAfter: data.congestionAfter,
        delayBefore: data.delayBefore,
        delayAfter: data.delayAfter,
        officersDeployed: data.officersDeployed,
        spilloverImpact: data.spilloverImpact,
        recommendations: data.recommendations,
        description: data.description
      });

      setConsoleMessages((prev) => [
        ...prev,
        { sender: "system", text: `Scenario Projection Generated: ${data.title}. Congestion: ${data.congestionBefore}% → ${data.congestionAfter}%. ${data.description}` }
      ]);
    } catch (error) {
      console.error("FastAPI what-if call failed, falling back to local mock...", error);
      const res = parseWhatIfQuery(cmd, { closedRoads: effectiveClosedRoads, deployedOfficers });

      if (cmd.toLowerCase().includes("close mg road") || cmd.toLowerCase().includes("mg road closed")) {
        if (!closedRoads.includes("MG Road")) setClosedRoads((prev) => [...prev, "MG Road"]);
      }
      if (cmd.toLowerCase().includes("close gate 3") || cmd.toLowerCase().includes("gate 3 exit closed")) {
        if (!closedRoads.includes("Gate 3 Exit")) setClosedRoads((prev) => [...prev, "Gate 3 Exit"]);
      }
      if (cmd.toLowerCase().includes("convert queens road") || cmd.toLowerCase().includes("queens road one-way")) {
        if (!closedRoads.includes("Queens Road")) setClosedRoads((prev) => [...prev, "Queens Road"]);
      }
      const officerMatch = cmd.match(/(?:deploy|place|add|use)\s+(\d+)\s+officer/i) || cmd.match(/(\d+)\s+officer/i);
      if (officerMatch) setDeployedOfficers(parseInt(officerMatch[1], 10));

      setQueryResponse(res);
      setConsoleMessages((prev) => [
        ...prev,
        { sender: "system", text: `[FALLBACK] Scenario Projection Generated: ${res.title}. Congestion: ${res.congestionBefore}% → ${res.congestionAfter}%. ${res.description}` }
      ]);
    }
    setCommandInput("");
  }

  function triggerLiveStrike() {
    if (!modelOutputs) {
      toast.error("Model prediction not available. Please wait.");
      return;
    }

    const strikeThreshold = modelOutputs.strike_threshold;
    const isStrike = actualClearanceTime > strikeThreshold;

    setCorridors((prevCorridors) => {
      return prevCorridors.map((c) => {
        if (c.id === selectedCorridorId) {
          const stack = { ...c.stacks };
          const activeRoutes = [...stack[activeStackType]];
          const primaryRoute = { ...activeRoutes[0] };

          if (isStrike) {
            const newStrikes = primaryRoute.strikes + 1;
            primaryRoute.strikes = newStrikes;

            if (newStrikes >= 3) {
              primaryRoute.status = "Penalty Box";
              primaryRoute.cooldownRemaining = 30;
              const rotatedRoutes = [activeRoutes[1], activeRoutes[2], primaryRoute];
              toast.error(`3-Strike Threshold breached! Actual clearance (${actualClearanceTime} mins) exceeded threshold (${strikeThreshold.toFixed(1)} mins). Demoting ${primaryRoute.name} to Penalty Box. Promoted ${activeRoutes[1].name} to Primary.`);
              return {
                ...c,
                stacks: { ...stack, [activeStackType]: rotatedRoutes }
              };
            } else {
              toast.warning(`Strike issued! Actual clearance (${actualClearanceTime} mins) exceeded threshold (${strikeThreshold.toFixed(1)} mins). Strikes: ${newStrikes}/3`);
              activeRoutes[0] = primaryRoute;
              return {
                ...c,
                stacks: { ...stack, [activeStackType]: activeRoutes }
              };
            }
          } else {
            toast.success(`Clearance successful! Actual clearance (${actualClearanceTime} mins) is within strike threshold (${strikeThreshold.toFixed(1)} mins). No strikes issued.`);
            return c;
          }
        }
        return c;
      });
    });
  }

  function resetSimulation() {
    setClosedRoads([]);
    setQueryResponse(null);
    setOsrmGeometries({});
    if (selectedIncident) {
      const dynCorridor = generateDynamicCorridor(selectedIncident);
      setCorridors([dynCorridor]);
      setSelectedCorridorId("incident_corridor");
      const isRain = !isEvent(selectedIncident) && selectedIncident.kind === "Waterlogging";
      setRain(isRain);
      const hour = new Date(selectedIncident.createdAt).getHours();
      const isPeakTime = (hour >= 8 && hour <= 11) || (hour >= 17 && hour <= 21);
      const isHighSev = isEvent(selectedIncident)
        ? (selectedIncident.attendees >= 15000)
        : (selectedIncident.severity === "Critical" || selectedIncident.severity === "High");
      setPeakHour(isPeakTime || isHighSev);
      const officerMap = { Low: 2, Medium: 5, High: 10, Critical: 15 };
      const derivedSevForOfficers = isEvent(selectedIncident)
        ? (selectedIncident.attendees >= 35000 ? "Critical" : selectedIncident.attendees >= 15000 ? "High" : selectedIncident.attendees >= 5000 ? "Medium" : "Low")
        : selectedIncident.severity;
      setDeployedOfficers(officerMap[derivedSevForOfficers] || 5);
      let stack: "alpha" | "beta" | "gamma" = "alpha";
      if (isEvent(selectedIncident)) {
        if (selectedIncident.type === "VIP Movement" || selectedIncident.type === "Political Rally" || selectedIncident.type === "Protest" || selectedIncident.type === "Strike / Bandh") {
          stack = "gamma";
        } else {
          stack = "beta";
        }
      } else {
        if (selectedIncident.kind === "VIP Movement" || selectedIncident.kind === "Crowd Surge") {
          stack = "gamma";
        } else if (selectedIncident.kind === "Waterlogging" || selectedIncident.kind === "Signal Failure" || isHighSev) {
          stack = "beta";
        }
      }
      setActiveStackType(stack);
    } else {
      setSelectedCorridorId("incident_corridor");
      setRain(false);
      setPeakHour(false);
      setDeployedOfficers(0);
      setActiveStackType("alpha");
    }
    toast.success("Simulation map and routes reset to baseline.");
  }

  // ==========================================
  // VIEW RENDER
  // ==========================================
  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">

        {/* Page Title & Navigation Banner */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Layers className="size-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Command & Diversion Center</h1>
              <p className="text-xs text-muted-foreground">
                Tactical Sandbox driven by live incident dispatching, with integrated AI operational assessment.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetSimulation}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-input/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              <Undo className="size-3.5" /> Reset Map
            </button>
            <span className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-bold text-success">
              <span className="size-2 rounded-full bg-success pulse-dot" /> SYSTEM LIVE
            </span>
          </div>
        </div>

        {/* Phase 0 Historical Bootstrapping Panel */}
        {!bootstrapComplete && (
          <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <div className="flex items-center gap-2 text-primary">
              <Terminal className="size-5 animate-spin" />
              <h2 className="text-sm font-bold uppercase tracking-wide">Phase 0: Bootstrapping Stacks...</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Pre-aging routing stacks using 8,100+ historical incident records.</p>
            <div className="mt-4 max-h-36 overflow-y-auto rounded-lg border border-border bg-background/90 p-3 text-mono text-[10px] text-primary-foreground leading-relaxed font-semibold">
              {bootstrapLogs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))}
            </div>
          </div>
        )}

        {/* MAIN PANEL GRID */}
        <section className="grid gap-6 lg:grid-cols-[380px_1fr]">

          {/* SIDEBAR (LEFT): Live Incident List & Simulation Status */}
          <div className="space-y-6">

            {/* Live Field Incidents & Selector */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-critical" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">Active Targets & Events</h2>
                </div>
                <span className="rounded-md bg-critical/15 px-2 py-0.5 text-[10px] font-bold text-critical">
                  {combinedContexts.length} active
                </span>
              </div>

              {combinedContexts.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  <p className="mb-3">No active live incidents or planned events. Log them in the Planner or Incidents tab.</p>
                  <button
                    onClick={loadDemoIncidents}
                    className="mx-auto flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition hover:brightness-110"
                  >
                    <Sparkles className="size-3.5" /> Load Demo Incidents
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {combinedContexts.map((item) => {
                    const isSelected = item.id === selectedIncidentId;
                    const isEv = isEvent(item);
                    
                    let title = "";
                    let subtitle = "";
                    let severityStr = "";
                    let severityClass = "";
                    let reporterOrType = "";

                    if (isEv) {
                      title = item.title;
                      subtitle = item.location?.name || ALL_PLACES.find(p => p.id === item.venueId)?.name || item.venueId;
                      const severity = item.attendees >= 35000 ? "Critical" : item.attendees >= 15000 ? "High" : item.attendees >= 5000 ? "Medium" : "Low";
                      severityStr = severity;
                      severityClass = severity === "Critical" ? "border-critical bg-critical/10 text-critical" :
                        severity === "High" ? "border-warning bg-warning/10 text-warning" :
                        severity === "Medium" ? "border-info bg-info/10 text-info" :
                        "border-success bg-success/10 text-success";
                      reporterOrType = `Planned · ${item.type}`;
                    } else {
                      title = item.kind;
                      subtitle = item.location;
                      severityStr = item.severity;
                      severityClass = item.severity === "Critical" ? "border-critical bg-critical/10 text-critical" :
                        item.severity === "High" ? "border-warning bg-warning/10 text-warning" :
                        item.severity === "Medium" ? "border-info bg-info/10 text-info" :
                        "border-success bg-success/10 text-success";
                      reporterOrType = `Reporter: ${item.reporter}`;
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
                        <div className="mt-2 flex items-center justify-between text-[9px]">
                          <span>{reporterOrType}</span>
                          {isSelected ? (
                            <span className="text-primary font-bold flex items-center gap-0.5">
                              <span className="size-1.5 rounded-full bg-primary animate-pulse" /> Simulating
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Queue</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Route Stack Rotation & Strikes */}
            <div className="rounded-2xl border border-border panel-glass p-5 flex flex-col justify-between text-xs">
              <div>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <RotateCw className="size-4 text-primary animate-spin-slow" />
                    <h2 className="text-xs font-bold uppercase tracking-wide">Route Stack Rotation & Strikes</h2>
                  </div>
                  <button
                    onClick={triggerLiveStrike}
                    className="flex items-center gap-1 rounded-lg bg-critical px-2 py-0.5 text-[10px] font-bold text-primary-foreground shadow-glow transition hover:brightness-110"
                  >
                    <AlertTriangle className="size-3" /> Trigger Strike
                  </button>
                </div>

                <div className="rounded-xl border border-border bg-input/30 p-3">
                  <div className="flex items-center justify-between border-b border-border pb-1.5 mb-2 text-[10px]">
                    <span className="font-bold">ACTIVE STACK ({activeStackType.toUpperCase()}) FOR {selectedCorridor.name.toUpperCase()}</span>
                    <span className="text-muted-foreground font-semibold">Hierarchy</span>
                  </div>

                  <div className="space-y-1.5">
                    {selectedCorridor.stacks[activeStackType].map((route, idx) => {
                      const isPrimary = idx === 0;
                      const isSecondary = idx === 1;

                      return (
                        <div key={route.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/50 p-2 text-[11px]">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[9px] font-bold uppercase rounded px-1 py-0.2 ${isPrimary ? "bg-success/20 text-success border border-success/40" :
                                  isSecondary ? "bg-warning/20 text-warning border border-warning/40" :
                                    "bg-muted/40 text-muted-foreground border border-border"
                                }`}>
                                {isPrimary ? "Primary" : isSecondary ? "Secondary" : "Tertiary"}
                              </span>
                              <span className="font-semibold text-foreground">{route.name}</span>
                            </div>
                            <div className="mt-0.5 flex gap-3 text-[9px] text-muted-foreground">
                              <span>Distance: {route.distanceKm} km</span>
                              <span>Junctions: {route.crossStreets}</span>
                              <span>Base: {route.baseTimeMin}m</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <span className="text-[8px] uppercase text-muted-foreground block">Strikes</span>
                              <span className={`text-[10px] font-extrabold ${route.strikes >= 3 ? "text-critical" : route.strikes > 0 ? "text-warning" : "text-muted-foreground"}`}>
                                {route.strikes}/3
                              </span>
                            </div>
                            <div>
                              <span className="text-[8px] uppercase text-muted-foreground block">Status</span>
                              <span className={`text-[9px] font-bold uppercase rounded px-1 py-0.2 ${route.status === "Active" ? "bg-success/15 text-success" :
                                  route.status === "Penalty Box" ? "bg-critical/15 text-critical" :
                                    "bg-warning/15 text-warning"
                                }`}>
                                {route.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid gap-2 grid-cols-2 text-[9px] leading-normal text-muted-foreground border-t border-border/40 pt-2.5">
                <div className="rounded-lg border border-critical/20 bg-critical/5 p-1.5">
                  <span className="font-bold text-critical block">PENALTY BOX</span>
                  3-strike routes cooldown for 30 rounds.
                </div>
                <div className="rounded-lg border border-info/20 bg-info/5 p-1.5">
                  <span className="font-bold text-info block">REHABILITATION</span>
                  Cooldown routes re-tested off-peak.
                </div>
              </div>
            </div>

            {/* What-If Console */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-success" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">What-If Console</h2>
                </div>
                <span title="Simulate variables by typing questions.">
                  <HelpCircle className="size-4 text-muted-foreground cursor-pointer" />
                </span>
              </div>

              <div className="mb-4 h-36 overflow-y-auto rounded-lg border border-border bg-background/80 p-3 text-mono text-[11px] leading-relaxed flex flex-col gap-2">
                {consoleMessages.map((msg, i) => (
                  <div key={i} className={msg.sender === "user" ? "text-primary" : "text-success"}>
                    <span className="text-muted-foreground font-semibold">{msg.sender === "user" ? "BTP_OFFICER> " : "GRIDMIND_AI> "}</span>
                    {msg.text}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. What if I close MG Road?"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runQuery(commandInput)}
                  className="flex-1 rounded-lg border border-border bg-input/60 px-3 py-2 text-xs outline-none focus:border-primary text-mono"
                />
                <button
                  onClick={() => runQuery(commandInput)}
                  className="rounded-lg bg-primary px-3 py-2 text-primary-foreground transition hover:brightness-110"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>

          </div>

          {/* SPATIAL TACTICAL MAP (RIGHT) */}
          <div className="relative min-h-[460px] overflow-hidden rounded-2xl border border-border panel-glass flex flex-col">
            <div className="absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur">
              <CircleDot className="size-3.5 text-accent animate-pulse" /> Live Tactical Map & Route Analysis
            </div>

            <div ref={elRef} className="h-[460px] w-full" />

            <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-background/80 px-3 py-2 text-[9px] backdrop-blur leading-none">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" /> Recommended detour</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-warning" /> Secondary</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-critical" /> Blocked Road</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground" /> Police station</span>
              {prediction && (
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-primary" /> AI Sourced Junctions</span>
              )}
            </div>
          </div>

        </section>

        {/* WORKSPACE DETAIL GRID (BELOW MAP) */}
        <section className="mt-8 grid gap-6 md:grid-cols-2">

          {/* Column 1: Dynamic Event Intake */}
          {selectedIncident ? (
            <div className="rounded-2xl border border-border panel-glass p-5 text-xs flex flex-col justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2 border-b border-border pb-2">
                  <Brain className="size-4 text-primary animate-pulse" />
                  <h3 className="font-bold uppercase tracking-wide">Dynamic Event Intake</h3>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Intake Type Selector */}
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Intake Type</label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setIntakeType("unplanned")}
                        className={`flex-1 py-1 px-2 rounded-md border text-center transition font-semibold text-[10px] uppercase ${intakeType === "unplanned"
                            ? "bg-primary/20 text-primary border-primary/40 font-bold"
                            : "bg-input/20 border-border text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        Unplanned (Incident)
                      </button>
                      <button
                        onClick={() => setIntakeType("planned")}
                        className={`flex-1 py-1 px-2 rounded-md border text-center transition font-semibold text-[10px] uppercase ${intakeType === "planned"
                            ? "bg-primary/20 text-primary border-primary/40 font-bold"
                            : "bg-input/20 border-border text-muted-foreground hover:text-foreground"
                          }`}
                      >
                        Planned (Event)
                      </button>
                    </div>
                  </div>

                  {/* Corridor Selector */}
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Corridor</label>
                    <select
                      value={corridorName}
                      onChange={(e) => {
                        setCorridorName(e.target.value);
                        setSelectedCorridorId(e.target.value);
                      }}
                      className="w-full rounded-md border border-border bg-input/40 px-2 py-1 text-xs outline-none text-foreground font-semibold"
                    >
                      <option value="incident_corridor">Incident Corridor (Dynamic)</option>
                      <option value="mg_road">MG Road Corridor</option>
                      <option value="hebbal">Hebbal Flyover Corridor</option>
                      <option value="orr">Outer Ring Road Corridor</option>
                    </select>
                  </div>

                  {/* Condition Fields */}
                  {intakeType === "unplanned" ? (
                    <>
                      {/* Event Cause */}
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Event Cause</label>
                        <select
                          value={eventCause}
                          onChange={(e) => setEventCause(e.target.value)}
                          className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs outline-none text-foreground"
                        >
                          <option value="accident">Accident</option>
                          <option value="vehicle_breakdown">Vehicle Breakdown</option>
                          <option value="water_logging">Water Logging / Flooding</option>
                          <option value="tree_fall">Tree Fall</option>
                          <option value="pot_holes">Potholes / Road Damage</option>
                          <option value="others">Others</option>
                        </select>
                      </div>

                      {/* Vehicle Type */}
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Vehicle Type</label>
                        <select
                          value={vehType}
                          onChange={(e) => setVehType(e.target.value)}
                          className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs outline-none text-foreground"
                        >
                          <option value="private_car">Private Car / SUV</option>
                          <option value="bmtc_bus">BMTC Bus</option>
                          <option value="ksrtc_bus">KSRTC Bus</option>
                          <option value="private_bus">Private Bus</option>
                          <option value="lcv">Light Commercial Vehicle (LCV)</option>
                          <option value="heavy_vehicle">Heavy Vehicle (HGV/Truck)</option>
                          <option value="none">None / No Vehicle</option>
                        </select>
                      </div>

                      {/* Priority Level */}
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Priority / Severity</label>
                        <select
                          value={priorityLevel}
                          onChange={(e) => setPriorityLevel(e.target.value)}
                          className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs outline-none text-foreground"
                        >
                          <option value="Low">Low</option>
                          <option value="Medium">Medium</option>
                          <option value="High">High</option>
                        </select>
                      </div>

                      {/* Reason Description Text */}
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Incident Details</label>
                        <input
                          type="text"
                          value={reasonText}
                          onChange={(e) => setReasonText(e.target.value)}
                          placeholder="e.g. engine stall, tyres burst, brake failure"
                          className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs outline-none text-foreground font-mono"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Event Cause */}
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Event Cause</label>
                        <select
                          value={eventCause}
                          onChange={(e) => setEventCause(e.target.value)}
                          className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs outline-none text-foreground"
                        >
                          <option value="public_event">Public Event (Sports/Concerts)</option>
                          <option value="others">VIP Movement / Rally</option>
                        </select>
                      </div>

                      {/* Estimated Volume Vest */}
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Estimated Volume (V_est)</label>
                        <input
                          type="number"
                          value={estimatedVolume}
                          onChange={(e) => setEstimatedVolume(parseInt(e.target.value) || 0)}
                          className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs outline-none text-foreground font-mono"
                        />
                      </div>

                      {/* Network Capacity Cnet */}
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-muted-foreground block mb-1">Network Capacity (C_network)</label>
                        <input
                          type="number"
                          value={networkCapacity}
                          onChange={(e) => setNetworkCapacity(parseInt(e.target.value) || 0)}
                          className="w-full rounded-md border border-border bg-input/40 px-2 py-1.5 text-xs outline-none text-foreground font-mono"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Simulated Clearance Audit Slider */}
                <div className="border-t border-border pt-3 mt-3">
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-semibold text-muted-foreground">Actual Clearance Time</label>
                    <span className="text-xs font-bold font-mono text-primary">{actualClearanceTime} mins</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="180"
                    step="5"
                    value={actualClearanceTime}
                    onChange={(e) => setActualClearanceTime(parseInt(e.target.value))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <span className="text-[9px] text-muted-foreground block mt-1 leading-tight">
                    Adjust to test if clearance breaches the strike threshold of {(modelOutputs ? modelOutputs.strike_threshold : 0).toFixed(1)} mins.
                  </span>
                </div>
              </div>

              {/* Assessment Confirmation Button */}
              <button
                onClick={() => {
                  setAssessmentTrigger(prev => prev + 1);
                  toast.success("AI Assessment triggered! Running predictive inferences...");
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground shadow-glow transition hover:brightness-110 mt-4"
              >
                <Brain className="size-4 animate-pulse" /> Run AI Assessment & Generate Detours
              </button>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground flex flex-col items-center justify-center h-full min-h-[300px] panel-glass">
              <Brain className="size-8 text-muted-foreground/40 mb-2" />
              <p>Please select an active incident to view or edit the intake parameters.</p>
            </div>
          )}

          {/* Column 2: Tactical Resource Recommendations & Projection Output */}
          <div className="space-y-6">

            {/* ML Telemetry & Resource Recommendations */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="size-4 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">ML Telemetry & Resource Matrix</h2>
                </div>
                {modelLoading && (
                  <span className="text-[10px] text-primary animate-pulse font-semibold">Updating...</span>
                )}
              </div>

              {/* Real-time Telemetry Section */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl border border-border bg-input/30 p-3 relative overflow-hidden">
                  <span className="text-[9px] uppercase font-bold tracking-wide text-muted-foreground block mb-1 flex items-center gap-1">
                    {"Expected Resolution ($S_{impact}$)"}
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-foreground">
                      {modelOutputs ? modelOutputs.s_impact.toFixed(1) : "---"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">mins</span>
                  </div>
                  {modelOutputs && (
                    <div className="absolute right-2 top-2">
                      <span className="rounded bg-purple-500/15 border border-purple-500/30 px-1 py-0.5 text-[7px] font-extrabold text-purple-300 uppercase tracking-wide">
                        Model OP
                      </span>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-border bg-input/30 p-3 relative overflow-hidden">
                  <span className="text-[9px] uppercase font-bold tracking-wide text-muted-foreground block mb-1">
                    Demotion Threshold (1.25x)
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold font-mono text-warning">
                      {modelOutputs ? modelOutputs.strike_threshold.toFixed(1) : "---"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">mins</span>
                  </div>
                  {modelOutputs && (
                    <div className="absolute right-2 top-2">
                      <span className="rounded bg-purple-500/15 border border-purple-500/30 px-1 py-0.5 text-[7px] font-extrabold text-purple-300 uppercase tracking-wide">
                        Model OP
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Proximity Conflicts warnings box */}
              {diversionWarnings.length > 0 && (
                <div className="mb-4 rounded-xl border border-warning/30 bg-warning/5 p-3 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 text-warning">
                      <AlertTriangle className="size-4 animate-bounce" />
                      <span className="font-bold uppercase tracking-wider text-[10px]">Multi-Incident Proximity Conflict</span>
                    </div>
                    <span className="rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[7px] font-extrabold text-purple-300 uppercase tracking-wider">
                      Model OP
                    </span>
                  </div>
                  <ul className="space-y-1 text-muted-foreground text-[10px] list-disc list-inside">
                    {diversionWarnings.map((warn, i) => (
                      <li key={i}>{warn}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Resource Dispatch Matrix Section */}
              <div className="border-t border-border/60 pt-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                    Resource Dispatch Matrix
                  </span>
                  {modelOutputs && (
                    <span className="rounded bg-purple-500/15 border border-purple-500/30 px-1.5 py-0.5 text-[7px] font-extrabold text-purple-300 uppercase tracking-wider">
                      Model OP
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-border bg-input/30 p-2.5">
                    <Cone className="mx-auto mb-1 size-5 text-primary" />
                    <p className="text-lg font-bold text-mono">{resources.barricades}</p>
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Barricades</span>
                  </div>
                  <div className="rounded-xl border border-border bg-input/30 p-2.5">
                    <ShieldAlert className="mx-auto mb-1 size-5 text-primary" />
                    <p className="text-lg font-bold text-mono">{resources.officers}</p>
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Personnel</span>
                  </div>
                  <div className="rounded-xl border border-border bg-input/30 p-2.5">
                    <Truck className="mx-auto mb-1 size-5 text-primary" />
                    <p className="text-lg font-bold text-mono">{resources.towTrucks}</p>
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Tow Trucks</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Projection Output */}
            <div className="rounded-2xl border border-border panel-glass p-5 min-h-[178px] flex flex-col justify-between">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Activity className="size-4 text-accent" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">Projection Output</h2>
                </div>

                {queryResponse ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg border border-success/30 bg-success/5 p-2">
                        <span className="text-[9px] uppercase text-muted-foreground block">Congestion Reduction</span>
                        <p className="text-lg font-extrabold text-success">
                          ↓ {Math.max(0, queryResponse.congestionBefore - queryResponse.congestionAfter)}%
                        </p>
                      </div>
                      <div className="rounded-lg border border-success/30 bg-success/5 p-2">
                        <span className="text-[9px] uppercase text-muted-foreground block">Travel Time Saved</span>
                        <p className="text-lg font-extrabold text-success">
                          ↓ {Math.max(0, queryResponse.delayBefore - queryResponse.delayAfter)} min
                        </p>
                      </div>
                    </div>

                    <div>
                      <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">Cascading Road Spills</span>
                      <div className="mt-1 space-y-1 text-[11px]">
                        {queryResponse.spilloverImpact.slice(0, 2).map((spill, idx) => (
                          <div key={idx} className="flex justify-between items-center">
                            <span>{spill.road}</span>
                            <span className={spill.delta > 0 ? "text-critical font-bold" : "text-success font-bold"}>
                              {spill.delta > 0 ? `+${spill.delta}%` : `${spill.delta}%`}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border bg-input/10 p-5 text-center text-xs text-muted-foreground">
                    <Sparkles className="mx-auto mb-1 size-5 text-muted-foreground/60" />
                    Enter queries in the What-If console to view expected congestion changes.
                  </div>
                )}
              </div>
              {queryResponse && (
                <p className="mt-2 text-[9px] text-muted-foreground leading-normal border-t border-border pt-1">
                  <Info className="inline size-3 mr-1" /> {queryResponse.description}
                </p>
              )}
            </div>

          </div>
        </section>


      </main>
    </div>
  );
}
