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
    let errMsg = `Action plan generation failed with status ${res.status}`;
    try {
      const errData = await res.json();
      if (errData && errData.detail) {
        errMsg = errData.detail;
      }
    } catch (e) {
      // ignore
    }
    throw new Error(errMsg);
  }
  
  return await res.json();
}
