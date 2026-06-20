export interface UrgencyRequest {
  severity: string;
  closure_probability: number;
}

export interface UrgencyResponse {
  urgency_score: number;
}

export async function fetchIncidentUrgency(req: UrgencyRequest): Promise<UrgencyResponse> {
  const res = await fetch("http://localhost:8000/api/incidents/urgency", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`Incident Urgency API failed with status ${res.status}`);
  }

  return (await res.json()) as UrgencyResponse;
}
