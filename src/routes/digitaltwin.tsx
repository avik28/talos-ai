import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/digitaltwin")({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/digitaltwin"!</div>;
}
