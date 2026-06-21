import { API_BASE } from "@/lib/api";

export async function generateActionPlan(args: { data: { briefing: string } }) {
  const briefing = args.data.briefing;
  const res = await fetch(`${API_BASE}/api/generate-action-plan`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ briefing }),
  });
  
  if (!res.ok) {
    throw new Error(`Action plan generation failed with status ${res.status}`);
  }
  
  return await res.json();
}
