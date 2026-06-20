import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const PlanInput = z.object({
  briefing: z.string().min(1).max(8000),
});

// Generates a richer, narrative AI Action Plan from a structured briefing
// produced on the client. Falls back are handled by the caller.
export const generateActionPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => PlanInput.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);

    const system = [
      "You are GridMind AI, a senior traffic-operations commander for the Bengaluru City Traffic Police.",
      "Write a concise, decisive, field-ready EVENT ACTION PLAN that an officer can execute immediately.",
      "Use plain text only (no markdown symbols like # or *). Use UPPERCASE section headers and short dash bullets.",
      "Include these sections in order: SITUATION, OBJECTIVE, DEPLOYMENT, TRAFFIC CONTROL, DIVERSIONS, EMERGENCY CORRIDOR, ESCALATION TRIGGERS, COMMS & PUBLIC ADVISORY, and PRIOR-EVENT LESSON.",
      "Be specific and operational. Keep the whole plan under 350 words.",
    ].join(" ");

    try {
      const { text } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        system,
        prompt: `Generate the action plan from this structured briefing:\n\n${data.briefing}`,
      });
      return { plan: text.trim(), source: "ai" as const };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Surface rate-limit / credit errors clearly to the UI.
      const status = (err as { statusCode?: number })?.statusCode;
      return { plan: "", source: "error" as const, error: message, status };
    }
  });
