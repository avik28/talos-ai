export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

function buildUrl(path: string) {
  const base = SUPABASE_URL.replace(/\/$/, "");
  return `${base}/rest/v1/${path}`;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

async function supabaseFetch<T>(path: string): Promise<T> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables.");
  }
  const url = buildUrl(path);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase request failed ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export interface SupabaseIncident {
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
  resolved_at?: string;
  closed_at?: string;
}

export interface SupabasePoliceStation {
  id: string;
  name: string;
  zone?: string;
  available_officers?: number;
  total_officers?: number;
  latitude?: number;
  longitude?: number;
  created_at?: string;
}

export interface SupabaseEventPlan {
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
  created_at?: string;
  actual_duration_mins?: number;
  actual_personnel_used?: number;
  lessons_learned?: string;
  accuracy_score?: number;
}

export interface HistoricalData {
  incidents: SupabaseIncident[];
  stations: SupabasePoliceStation[];
  plans: SupabaseEventPlan[];
}

export async function fetchSupabaseIncidents() {
  const incidents = await supabaseFetch<SupabaseIncident[]>(
    "incidents?select=*&order=created_at.desc&limit=10000",
  );
  return incidents.map((incident) => ({
    ...incident,
    latitude: parseNumber(incident.latitude),
    longitude: parseNumber(incident.longitude),
    assigned_officers: incident.assigned_officers != null ? Number(incident.assigned_officers) : undefined,
    barricades_deployed: incident.barricades_deployed != null ? Number(incident.barricades_deployed) : undefined,
  }));
}

export async function fetchSupabasePoliceStations() {
  const stations = await supabaseFetch<SupabasePoliceStation[]>("police_stations?select=*");
  return stations.map((station) => ({
    ...station,
    available_officers: station.available_officers != null ? Number(station.available_officers) : undefined,
    total_officers: station.total_officers != null ? Number(station.total_officers) : undefined,
    latitude: parseNumber(station.latitude),
    longitude: parseNumber(station.longitude),
  }));
}

export async function fetchSupabaseEventPlans() {
  return supabaseFetch<SupabaseEventPlan[]>("event_plans?select=*&order=created_at.desc&limit=1000");
}
