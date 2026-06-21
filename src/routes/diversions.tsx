import { createFileRoute } from "@tanstack/react-router";
import { UnifiedCommandCenter } from "@/components/UnifiedCommandCenter";

export const Route = createFileRoute("/diversions")({
  head: () => ({
    meta: [
      { title: "Dynamic Diversion Generator — VYUHIQ" },
      {
        name: "description",
        content:
          "AI decision-support system featuring threshold-triggered route rotation, What-If console, and pre-aged routing stacks.",
      },
    ],
  }),
  component: DiversionsRoute,
});

function DiversionsRoute() {
  return <UnifiedCommandCenter defaultTab="sandbox" />;
}
