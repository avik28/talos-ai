import { createFileRoute } from "@tanstack/react-router";
import { UnifiedCommandCenter } from "@/components/UnifiedCommandCenter";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command & Diversion Center — GridMind AI" },
      {
        name: "description",
        content:
          "Predict event congestion, recommend police resources, generate diversions, and learn from past events across Bengaluru.",
      },
    ],
  }),
  component: CommandCenterRoute,
});

function CommandCenterRoute() {
  return <UnifiedCommandCenter defaultTab="briefing" />;
}
