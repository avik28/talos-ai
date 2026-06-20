export interface ResourceRequest {
  planned: boolean;
  impact_score: number;
  cross_streets: number;
  distance_km: number;
  attendees: number;
}

export interface ResourceResponse {
  barricades: number;
  officers: number;
  towTrucks: number;
  ambulances: number;
}

export async function fetchResourceRecommendation(req: ResourceRequest): Promise<ResourceResponse> {
  const res = await fetch("http://localhost:8000/api/resources/recommend", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(req),
  });

  if (!res.ok) {
    throw new Error(`Resource Recommendation API failed with status ${res.status}`);
  }

  return (await res.json()) as ResourceResponse;
}
