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
