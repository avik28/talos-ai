import { UnifiedCommandCenter } from "@/components/UnifiedCommandCenter";
import { useEffect } from "react";

export default function DiversionsRoute() {
  useEffect(() => {
    document.title = "Dynamic Diversion Generator — TalosAI";
  }, []);
  
  return <UnifiedCommandCenter defaultTab="sandbox" />;
}
