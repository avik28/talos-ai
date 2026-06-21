import { Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "../components/Sidebar";

export function RootLayout() {
  const [sidebarExpanded, setSidebarExpanded] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar_expanded") !== "false";
    }
    return true;
  });

  useEffect(() => {
    localStorage.setItem("sidebar_expanded", String(sidebarExpanded));
  }, [sidebarExpanded]);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded(!sidebarExpanded)} />
      <div className="flex-1 min-w-0 min-h-screen flex flex-col">
        <Outlet />
      </div>
      <Toaster />
    </div>
  );
}
