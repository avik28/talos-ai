// GridMind AI — Event-Aware Traffic Command Center
// Heuristic "AI" engine + Bengaluru data grounded in the Astram event dataset.

export type Severity = "Low" | "Moderate" | "High" | "Critical";

export interface Venue {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  baseLoad: number; // 0-1 intrinsic congestion pressure
}

export interface Station {
  id: string;
  name: string;
  lat: number;
  lng: number;
  officersAvailable: number;
  responseMin: number;
  successRate: number; // %
  efficiency: number; // %
}

export interface PastEvent {
  id: string;
  type: string;
  venue: string;
  attendees: number;
  hour: number;
  weekend: boolean;
  delayMin: number;
  officersUsed: number;
  outcome: "Successful" | "Partial" | "Strained";
  lesson: string;
  vec: number[];
}

export const EVENT_TYPES = [
  "Cricket Match",
  "Football Match",
  "Political Rally",
  "Concert",
  "Music Festival",
  "Religious Procession",
  "Temple Festival",
  "Marathon",
  "Cycling Event",
  "VIP Movement",
  "State Function",
  "Festival",
  "Protest",
  "Strike / Bandh",
  "Trade Expo",
  "Wedding / Convention",
  "Film Premiere",
  "Public Holiday Rush",
  "Roadwork / Diversion",
  "Flash Mob",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const VENUES: Venue[] = [
  {
    id: "chinnaswamy",
    name: "M Chinnaswamy Stadium",
    area: "Central Zone 2",
    lat: 12.9788,
    lng: 77.5996,
    baseLoad: 0.92,
  },
  {
    id: "palace",
    name: "Palace Grounds",
    area: "North Zone 1",
    lat: 13.0048,
    lng: 77.5905,
    baseLoad: 0.8,
  },
  {
    id: "kanteerava",
    name: "Kanteerava Stadium",
    area: "Central Zone 1",
    lat: 12.9626,
    lng: 77.5946,
    baseLoad: 0.78,
  },
  {
    id: "freedompark",
    name: "Freedom Park",
    area: "Central Zone 1",
    lat: 12.9786,
    lng: 77.5806,
    baseLoad: 0.7,
  },
  {
    id: "hebbal",
    name: "Hebbal Grounds",
    area: "North Zone 2",
    lat: 13.0358,
    lng: 77.597,
    baseLoad: 0.74,
  },
  {
    id: "kbr",
    name: "KSCA / Cubbon Road",
    area: "Central Zone 2",
    lat: 12.9762,
    lng: 77.5929,
    baseLoad: 0.66,
  },
  {
    id: "whitefield",
    name: "Phoenix Marketcity",
    area: "East Zone 1",
    lat: 12.9959,
    lng: 77.6968,
    baseLoad: 0.6,
  },
];

export const STATIONS: Station[] = [
  {
    id: "cubbon",
    name: "Cubbon Park",
    lat: 12.9762,
    lng: 77.5929,
    officersAvailable: 14,
    responseMin: 6,
    successRate: 94,
    efficiency: 90,
  },
  {
    id: "halasuru",
    name: "Halasuru Gate",
    lat: 12.9784,
    lng: 77.6101,
    officersAvailable: 11,
    responseMin: 7,
    successRate: 91,
    efficiency: 87,
  },
  {
    id: "sadashiv",
    name: "Sadashivanagar",
    lat: 13.0064,
    lng: 77.5806,
    officersAvailable: 9,
    responseMin: 8,
    successRate: 92,
    efficiency: 88,
  },
  {
    id: "yeshwanth",
    name: "Yeshwanthpura",
    lat: 13.0234,
    lng: 77.5512,
    officersAvailable: 12,
    responseMin: 9,
    successRate: 88,
    efficiency: 84,
  },
  {
    id: "wilson",
    name: "Wilson Garden",
    lat: 12.9472,
    lng: 77.5986,
    officersAvailable: 8,
    responseMin: 7,
    successRate: 90,
    efficiency: 86,
  },
  {
    id: "hsr",
    name: "HSR Layout",
    lat: 12.9116,
    lng: 77.6412,
    officersAvailable: 10,
    responseMin: 11,
    successRate: 89,
    efficiency: 85,
  },
  {
    id: "byatara",
    name: "Byatarayanapura",
    lat: 13.0608,
    lng: 77.5946,
    officersAvailable: 7,
    responseMin: 10,
    successRate: 87,
    efficiency: 83,
  },
];

// Encode an event into a feature vector for similarity search.
function encode(
  type: string,
  attendees: number,
  hour: number,
  weekend: boolean,
  baseLoad: number,
): number[] {
  const typeIdx = EVENT_TYPES.indexOf(type as EventType);
  return [
    typeIdx / EVENT_TYPES.length,
    Math.min(attendees / 50000, 1),
    hour / 24,
    weekend ? 1 : 0,
    baseLoad,
  ];
}

export const PAST_EVENTS: PastEvent[] = [
  {
    id: "EVT-124",
    type: "Political Rally",
    venue: "Palace Grounds",
    attendees: 22000,
    hour: 16,
    weekend: true,
    delayMin: 38,
    officersUsed: 15,
    outcome: "Successful",
    lesson: "Outer Ring Road diversion held well; signal override at Mekhri Circle cut spillback.",
    vec: encode("Political Rally", 22000, 16, true, 0.8),
  },
  {
    id: "EVT-097",
    type: "Cricket Match",
    venue: "M Chinnaswamy Stadium",
    attendees: 35000,
    hour: 17,
    weekend: false,
    delayMin: 56,
    officersUsed: 22,
    outcome: "Strained",
    lesson: "Tow trucks arrived late at Queens Circle. Pre-position 2 tow trucks near Gate 3.",
    vec: encode("Cricket Match", 35000, 17, false, 0.92),
  },
  {
    id: "EVT-201",
    type: "Concert",
    venue: "Palace Grounds",
    attendees: 18000,
    hour: 19,
    weekend: true,
    delayMin: 41,
    officersUsed: 16,
    outcome: "Successful",
    lesson: "Staggered exit announcements reduced peak surge by ~20%.",
    vec: encode("Concert", 18000, 19, true, 0.8),
  },
  {
    id: "EVT-152",
    type: "Religious Procession",
    venue: "Freedom Park",
    attendees: 12000,
    hour: 9,
    weekend: false,
    delayMin: 33,
    officersUsed: 12,
    outcome: "Successful",
    lesson: "Rolling closures worked; keep one lane for emergency corridor.",
    vec: encode("Religious Procession", 12000, 9, false, 0.7),
  },
  {
    id: "EVT-178",
    type: "Cricket Match",
    venue: "M Chinnaswamy Stadium",
    attendees: 40000,
    hour: 19,
    weekend: true,
    delayMin: 62,
    officersUsed: 24,
    outcome: "Strained",
    lesson: "CBD saturation; widen affected radius planning to 3km and add Hosur Rd diversion.",
    vec: encode("Cricket Match", 40000, 19, true, 0.92),
  },
  {
    id: "EVT-066",
    type: "Marathon",
    venue: "Kanteerava Stadium",
    attendees: 8000,
    hour: 6,
    weekend: true,
    delayMin: 28,
    officersUsed: 14,
    outcome: "Successful",
    lesson: "Early start minimized impact; barricade volunteers helped officer load.",
    vec: encode("Marathon", 8000, 6, true, 0.78),
  },
  {
    id: "EVT-143",
    type: "VIP Movement",
    venue: "Palace Grounds",
    attendees: 3000,
    hour: 11,
    weekend: false,
    delayMin: 22,
    officersUsed: 18,
    outcome: "Successful",
    lesson: "Green corridor pre-cleared; minimal civilian disruption.",
    vec: encode("VIP Movement", 3000, 11, false, 0.8),
  },
  {
    id: "EVT-189",
    type: "Festival",
    venue: "Hebbal Grounds",
    attendees: 25000,
    hour: 18,
    weekend: true,
    delayMin: 49,
    officersUsed: 19,
    outcome: "Partial",
    lesson: "Underdeployment by ~25%; request backup earlier from Byatarayanapura.",
    vec: encode("Festival", 25000, 18, true, 0.74),
  },
];

const TYPE_FACTOR: Record<string, number> = {
  "Cricket Match": 1.0,
  "Football Match": 0.95,
  Concert: 0.92,
  "Music Festival": 0.94,
  "Political Rally": 0.95,
  "Religious Procession": 0.85,
  "Temple Festival": 0.86,
  Festival: 0.88,
  Protest: 0.9,
  "Strike / Bandh": 0.93,
  Marathon: 0.7,
  "Cycling Event": 0.62,
  "VIP Movement": 0.6,
  "State Function": 0.78,
  "Trade Expo": 0.74,
  "Wedding / Convention": 0.66,
  "Film Premiere": 0.8,
  "Public Holiday Rush": 0.82,
  "Roadwork / Diversion": 0.72,
  "Flash Mob": 0.58,
};

export interface PredictionInput {
  type: EventType;
  /** Either a known venue id, or pass `location` directly for any area. */
  venueId?: string;
  /** Direct location override (from Bengaluru area search). */
  location?: Venue;
  attendees: number;
  hour: number; // 0-23
  durationHr: number;
  planned: boolean;
}

export interface HistoricalIncident {
  id: string;
  type: "planned" | "unplanned";
  event_type: string;
  description?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  priority?: string;
  corridor?: string;
  zone?: string;
  police_station?: string;
  junction?: string;
  vehicle_type?: string;
  assigned_officers?: number;
  barricades_deployed?: number;
  created_at?: string;
}

export interface HistoricalStation {
  id: string;
  name: string;
  zone?: string;
  available_officers?: number;
  total_officers?: number;
  latitude?: number;
  longitude?: number;
}

export interface HistoricalPlan {
  id: string;
  event_name: string;
  event_type: string;
  location: string;
  zone?: string;
  junction?: string;
  attendance?: number;
  predicted_duration_mins?: number;
  predicted_radius_km?: number;
  personnel_required?: number;
  barricades_required?: number;
  diversion_routes?: string[];
  severity?: string;
  status?: string;
  event_date?: string;
  lessons_learned?: string;
  accuracy_score?: number;
}

export interface PredictionHistory {
  activeIncidentCount: number;
  relevantIncidentCount: number;
  stationCount: number;
  planCount: number;
  note: string;
  alerts: string[];
}

export interface ResourcePlan {
  officers: number;
  barricades: number;
  towTrucks: number;
  ambulances: number;
  allocations: { station: string; officers: number; responseMin: number }[];
  deficit: number; // officers short
}

export interface Junction {
  name: string;
  lat: number;
  lng: number;
  load: number; // 0-1
}

export interface DiversionRoute {
  name: string;
  color: string;
  points: [number, number][];
  saveMin: number;
}

export interface Prediction {
  score: number;
  delayMin: number;
  severity: Severity;
  radiusKm: number;
  recoveryHr: number;
  factors: { label: string; weight: number }[];
  venue: Venue;
  resources: ResourcePlan;
  junctions: Junction[];
  diversions: DiversionRoute[];
  emergency: { baselineMin: number; optimizedMin: number };
  chain: { step: string; risk: number }[];
  similar: { event: PastEvent; match: number };
  history?: PredictionHistory;
}

function severityFromScore(s: number): Severity {
  if (s >= 80) return "Critical";
  if (s >= 60) return "High";
  if (s >= 38) return "Moderate";
  return "Low";
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

function jitter(lat: number, lng: number, dLat: number, dLng: number): [number, number] {
  return [lat + dLat, lng + dLng];
}

function buildStationPool(stations?: HistoricalStation[]) {
  if (!stations || stations.length === 0) return STATIONS;
  return stations
    .filter(
      (
        s,
      ): s is HistoricalStation & {
        latitude: number;
        longitude: number;
        available_officers: number;
      } =>
        typeof s.latitude === "number" &&
        typeof s.longitude === "number" &&
        typeof s.available_officers === "number",
    )
    .map((s, idx) => ({
      id: s.id || `station-${idx}`,
      name: s.name,
      lat: s.latitude,
      lng: s.longitude,
      officersAvailable: Math.max(0, s.available_officers),
      responseMin: 6 + Math.floor(Math.random() * 7),
      successRate: 85,
      efficiency: 80,
    }));
}

function buildHistoricalSummary(
  input: PredictionInput,
  history?: {
    incidents?: HistoricalIncident[];
    stations?: HistoricalStation[];
    plans?: HistoricalPlan[];
  },
): PredictionHistory {
  const incidents = history?.incidents ?? [];
  const stations = history?.stations ?? [];
  const plans = history?.plans ?? [];
  const activeIncidentCount = incidents.filter(
    (i) => i.status && !["resolved", "closed"].includes(i.status.toLowerCase()),
  ).length;
  const relevantIncidentCount = incidents.filter((i) => {
    if (!i.zone || !i.status) return false;
    const active = !["resolved", "closed"].includes(i.status.toLowerCase());
    return (
      active &&
      (i.zone.toLowerCase().includes("central") ||
        i.zone.toLowerCase().includes("north") ||
        i.zone.toLowerCase().includes("east"))
    );
  }).length;

  const alerts: string[] = [];
  if (activeIncidentCount > 45) alerts.push("Live incident backlog is high across city zones.");
  if (relevantIncidentCount > 12) alerts.push("Nearby incident clusters increase diversion risk.");
  if (stations.length < 10)
    alerts.push("Station roster remains sparse; use conservative resource planning.");

  const note = history?.incidents
    ? `Loaded ${incidents.length} historical incidents, ${stations.length} police stations, and ${plans.length} prior event plans.`
    : "No historical records available.";

  return {
    activeIncidentCount,
    relevantIncidentCount,
    stationCount: stations.length,
    planCount: plans.length,
    note,
    alerts,
  };
}

export function predict(
  input: PredictionInput,
  history?: {
    incidents?: HistoricalIncident[];
    stations?: HistoricalStation[];
    plans?: HistoricalPlan[];
  },
): Prediction {
  const venue = input.location ?? VENUES.find((v) => v.id === input.venueId) ?? VENUES[0];
  const isPeak = (input.hour >= 8 && input.hour <= 11) || (input.hour >= 16 && input.hour <= 20);
  const typeF = TYPE_FACTOR[input.type] ?? 0.85;
  const attendF = Math.min(input.attendees / 40000, 1);

  // Weighted congestion score
  const wAtt = attendF * 34;
  const wVenue = venue.baseLoad * 26;
  const wPeak = isPeak ? 16 : 5;
  const wType = typeF * 12;
  const wUnplanned = input.planned ? 2 : 9;
  const wDur = Math.min(input.durationHr / 6, 1) * 6;
  let score = Math.round(wAtt + wVenue + wPeak + wType + wUnplanned + wDur);
  score = Math.max(8, Math.min(99, score));

  const historySummary = buildHistoricalSummary(input, history);
  const backlogPenalty =
    historySummary.activeIncidentCount > 30 ? 8 : historySummary.activeIncidentCount > 15 ? 4 : 0;
  const corridorPressure =
    historySummary.relevantIncidentCount > 8 ? 6 : historySummary.relevantIncidentCount > 4 ? 3 : 0;

  score = Math.round(Math.min(99, score + backlogPenalty + corridorPressure));
  const severity = severityFromScore(score);
  const delayMin = Math.round(
    12 + (score / 100) * 70 + (isPeak ? 8 : 0) + (historySummary.relevantIncidentCount > 8 ? 4 : 0),
  );
  const radiusKm = +(0.8 + (score / 100) * 3.2).toFixed(1);
  const recoveryHr = +(0.6 + (score / 100) * 3).toFixed(1);

  // Resources
  const officersNeeded = Math.round(
    6 + attendF * 28 + venue.baseLoad * 6 + (isPeak ? 3 : 0) + Math.min(6, backlogPenalty),
  );
  const barricades = Math.round(officersNeeded * 1.35 + attendF * 6);
  const towTrucks = Math.max(1, Math.round(score / 30));
  const ambulances = Math.max(1, Math.round(attendF * 3));

  // Allocate from nearest stations
  const pool = buildStationPool(history?.stations);
  const sorted = [...pool]
    .map((s) => ({ s, d: Math.hypot(s.lat - venue.lat, s.lng - venue.lng) }))
    .sort((a, b) => a.d - b.d);
  const allocations: ResourcePlan["allocations"] = [];
  let remaining = officersNeeded;
  for (const { s } of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(s.officersAvailable, remaining);
    if (take > 0) {
      allocations.push({ station: s.name, officers: take, responseMin: s.responseMin });
      remaining -= take;
    }
  }
  const deficit = Math.max(0, remaining);

  // Critical junctions around venue
  const junctions: Junction[] = [
    { name: "North Entry Flyover", ...pt(venue, 0.012, 0.004), load: clamp(venue.baseLoad + 0.05) },
    { name: "Service Road Merge", ...pt(venue, -0.006, 0.011), load: clamp(score / 110 + 0.2) },
    { name: "Ring Road Junction", ...pt(venue, 0.004, -0.013), load: clamp(score / 130 + 0.15) },
    { name: "CBD Approach", ...pt(venue, -0.011, -0.005), load: clamp(venue.baseLoad - 0.05) },
  ];

  // Diversion routes (illustrative polylines)
  const diversions: DiversionRoute[] = [
    {
      name: "Route A · Outer Ring Road",
      color: "var(--success)",
      points: [
        pair(venue, -0.02, -0.018),
        pair(venue, -0.01, -0.005),
        pair(venue, 0.006, 0.01),
        pair(venue, 0.022, 0.02),
      ],
      saveMin: Math.round(delayMin * 0.55),
    },
    {
      name: "Route B · Service Bypass",
      color: "var(--info)",
      points: [
        pair(venue, 0.018, -0.02),
        pair(venue, 0.008, -0.006),
        pair(venue, -0.004, 0.008),
        pair(venue, -0.016, 0.02),
      ],
      saveMin: Math.round(delayMin * 0.42),
    },
  ];

  const emergency = {
    baselineMin: Math.round(delayMin * 0.42 + 8),
    optimizedMin: Math.max(4, Math.round(delayMin * 0.16)),
  };

  // Chain-reaction predictor
  const chain = [
    { step: `${input.type} surge begins`, risk: clamp(attendF + 0.15) },
    { step: "Junction congestion builds", risk: clamp(score / 100) },
    { step: "Queue spillback > 500m", risk: clamp(score / 110 + (isPeak ? 0.12 : 0)) },
    { step: "Secondary accident risk", risk: clamp(score / 150 + 0.18) },
    { step: "Emergency route blocked", risk: clamp(score / 160 + (input.planned ? 0 : 0.12)) },
  ];

  const factors = [
    { label: `${input.attendees.toLocaleString()} attendees`, weight: Math.round(wAtt) },
    { label: `${venue.name} base load`, weight: Math.round(wVenue) },
    { label: isPeak ? "Peak-hour window" : "Off-peak window", weight: Math.round(wPeak) },
    { label: `${input.type} profile`, weight: Math.round(wType) },
    { label: input.planned ? "Planned event" : "Unplanned event", weight: Math.round(wUnplanned) },
  ].sort((a, b) => b.weight - a.weight);

  // Similarity search
  const vec = encode(
    input.type,
    input.attendees,
    input.hour,
    isPeak && (input.hour < 12 ? false : true),
    venue.baseLoad,
  );
  const ranked = PAST_EVENTS.map((e) => ({ event: e, match: cosine(vec, e.vec) })).sort(
    (a, b) => b.match - a.match,
  );
  const similar = ranked[0];

  return {
    score,
    delayMin,
    severity,
    radiusKm,
    recoveryHr,
    factors,
    venue,
    resources: {
      officers: officersNeeded,
      barricades,
      towTrucks,
      ambulances,
      allocations,
      deficit,
    },
    junctions,
    diversions,
    emergency,
    chain,
    similar,
    history: historySummary,
  };
}

function clamp(n: number) {
  return Math.max(0.05, Math.min(0.99, n));
}
function pt(v: Venue, dLat: number, dLng: number) {
  return { lat: v.lat + dLat, lng: v.lng + dLng };
}
function pair(v: Venue, dLat: number, dLng: number): [number, number] {
  return [v.lat + dLat, v.lng + dLng];
}

export function severityColor(s: Severity): string {
  switch (s) {
    case "Critical":
      return "var(--critical)";
    case "High":
      return "var(--warning)";
    case "Moderate":
      return "var(--info)";
    default:
      return "var(--success)";
  }
}

export function buildActionPlan(input: PredictionInput, p: Prediction): string {
  const venue = p.venue;
  const lines = [
    `EVENT ACTION PLAN — ${input.type.toUpperCase()}`,
    `Location: ${venue.name} (${venue.area})`,
    `Window: ${fmtHour(input.hour)} for ${input.durationHr}h · ${input.planned ? "Planned" : "Unplanned"}`,
    ``,
    `SEVERITY: ${p.severity.toUpperCase()}  ·  Congestion Score ${p.score}/100`,
    `Predicted delay: ${p.delayMin} min · Affected radius: ${p.radiusKm} km · Recovery: ${p.recoveryHr} h`,
    ``,
    `DEPLOY`,
    `- ${p.resources.officers} officers`,
    `- ${p.resources.barricades} barricades`,
    `- ${p.resources.towTrucks} tow trucks`,
    `- ${p.resources.ambulances} ambulance(s)`,
    ``,
    `OFFICER SOURCING`,
    ...p.resources.allocations.map(
      (a) => `- ${a.officers} from ${a.station} (ETA ${a.responseMin} min)`,
    ),
    p.resources.deficit > 0
      ? `! SHORTAGE: ${p.resources.deficit} officers — request city reserve`
      : `- Demand fully covered`,
    ``,
    `CRITICAL JUNCTIONS`,
    ...p.junctions.slice(0, 3).map((j) => `- ${j.name} (load ${(j.load * 100).toFixed(0)}%)`),
    ``,
    `DIVERSIONS`,
    ...p.diversions.map((d) => `- ${d.name} (saves ~${d.saveMin} min)`),
    ``,
    `EMERGENCY CORRIDOR`,
    `- Reserved ambulance route: ${p.emergency.baselineMin} min → ${p.emergency.optimizedMin} min`,
    ``,
    `PRIOR-EVENT LESSON (${p.similar.event.id}, ${(p.similar.match * 100).toFixed(0)}% match)`,
    `- ${p.similar.event.lesson}`,
  ];
  return lines.join("\n");
}

export function fmtHour(h: number): string {
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}
