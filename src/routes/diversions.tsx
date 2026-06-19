import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Gauge, Clock, ShieldAlert, Cone, Truck, AlertTriangle, Play, RotateCw,
  Terminal, ArrowRight, Megaphone, CheckCircle2, Activity, Info, Sparkles,
  Zap, MapPin, Send, HelpCircle, Layers, Calendar, Undo, Moon, Sun
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  INITIAL_CORRIDORS,
  calculateDynamicImpactScore,
  calculateResourceRequirements,
  bootstrapFromHistoricalData,
  parseWhatIfQuery,
  type Corridor,
  type Route,
  type WhatIfResponse
} from "@/lib/diversionEngine";

export const Route = createFileRoute("/diversions")({
  head: () => ({
    meta: [
      { title: "Dynamic Diversion Generator — GridMind AI" },
      { name: "description", content: "Decision support system for traffic routing, stack rotation, bootstrapping, and What-If console." },
    ],
  }),
  component: DiversionsPage,
});

function DiversionsPage() {
  // Simulator State
  const [corridors, setCorridors] = useState<Corridor[]>(INITIAL_CORRIDORS);
  const [selectedCorridorId, setSelectedCorridorId] = useState<string>("mg_road");
  const [closedRoads, setClosedRoads] = useState<string[]>([]);
  const [deployedOfficers, setDeployedOfficers] = useState<number>(0);
  const [rain, setRain] = useState<boolean>(false);
  const [peakHour, setPeakHour] = useState<boolean>(false);
  const [activeStackType, setActiveStackType] = useState<"alpha" | "beta" | "gamma">("alpha");
  const [presetScenario, setPresetScenario] = useState<string>("none");

  // CLI Command Console State
  const [commandInput, setCommandInput] = useState<string>("");
  const [consoleMessages, setConsoleMessages] = useState<Array<{ sender: "user" | "system", text: string }>>([
    { sender: "system", text: "GridMind Diversion CLI v1.0. Ready. Type a query like 'What if I close MG Road?' or 'Deploy 12 officers'." }
  ]);
  const [queryResponse, setQueryResponse] = useState<WhatIfResponse | null>(null);

  // Bootstrapping State
  const [bootstrapComplete, setBootstrapComplete] = useState<boolean>(false);
  const [bootstrapLogs, setBootstrapLogs] = useState<string[]>([]);
  const [logIndex, setLogIndex] = useState<number>(0);

  // Map Refs
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  const selectedCorridor = useMemo(() => {
    return corridors.find((c) => c.id === selectedCorridorId) || corridors[0];
  }, [corridors, selectedCorridorId]);

  // Run Bootstrap logs simulation on mount
  useEffect(() => {
    const res = bootstrapFromHistoricalData([]); // run mock bootstrap math
    const totalLogs = res.logs;

    const interval = setInterval(() => {
      if (logIndex < totalLogs.length) {
        setBootstrapLogs((prev) => [...prev, totalLogs[logIndex]]);
        setLogIndex((prev) => prev + 1);
      } else {
        clearInterval(interval);
        setBootstrapComplete(true);
        // Pre-age corridors based on bootstrap results (e.g. demote MG Road Alpha default route to tertiary due to 3 ghost strikes)
        setCorridors((prevCorridors) => {
          return prevCorridors.map((c) => {
            if (c.id === "mg_road") {
              const updatedAlpha = [...c.stacks.alpha];
              // Demote Route A (mg_a1)
              updatedAlpha[0] = { ...updatedAlpha[0], strikes: 3, status: "Penalty Box" };
              // Rotate ranks: Route B is now Primary, Route C is Secondary, Route A is Tertiary
              return {
                ...c,
                stacks: {
                  ...c.stacks,
                  alpha: [updatedAlpha[1], updatedAlpha[2], updatedAlpha[0]]
                }
              };
            }
            return c;
          });
        });
        toast.success("Phase 0 Bootstrapping complete! Route stacks pre-aged to 94% accuracy.");
      }
    }, 150);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logIndex]);

  // Leaflet map drawing logic
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;

      const map = L.map(elRef.current, { zoomControl: true, attributionControl: false }).setView([12.9716, 77.5946], 13);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      drawMapElements();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw map when variables change
  useEffect(() => {
    drawMapElements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCorridor, activeStackType, closedRoads, bootstrapComplete]);

  // Map drawing helper
  function drawMapElements() {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layerRef.current;
    if (!L || !map || !group || !selectedCorridor) return;

    group.clearLayers();

    // Map Center / Corridor Marker
    const markerHtml = `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:var(--primary);border:2px solid #fff;box-shadow:0 0 10px rgba(0,0,0,0.5);">
      <div style="width:8px;height:8px;border-radius:50%;background:#fff;"></div>
    </div>`;
    const icon = L.divIcon({
      className: "",
      html: markerHtml,
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
    L.marker([selectedCorridor.lat, selectedCorridor.lng], { icon })
      .bindTooltip(`<b>${selectedCorridor.name}</b><br/>Base Load: ${(selectedCorridor.baseLoad * 100).toFixed(0)}%`, { direction: "top" })
      .addTo(group);

    // Draw active routes in the selected stack
    const activeStack = selectedCorridor.stacks[activeStackType];
    activeStack.forEach((route, index) => {
      const isPrimary = index === 0;
      const isSecondary = index === 1;

      let color = "var(--muted-foreground)";
      let opacity = 0.4;
      let dashArray = "5, 10";

      if (isPrimary && route.status === "Active") {
        color = "var(--success)"; // Green for active Primary
        opacity = 0.95;
        dashArray = "";
      } else if (isSecondary && route.status === "Active") {
        color = "var(--warning)"; // Yellow/Amber for Secondary
        opacity = 0.75;
        dashArray = "4, 6";
      }

      L.polyline(route.points, {
        color,
        weight: isPrimary ? 6 : 4,
        opacity,
        dashArray,
        lineCap: "round"
      }).bindTooltip(`<b>${route.name}</b><br/>Status: ${route.status}<br/>Distance: ${route.distanceKm} km`, { direction: "top" }).addTo(group);
    });

    // Draw closed/avoid roads if active
    closedRoads.forEach((road) => {
      let closedCoords: [number, number][] = [];
      let label = "";

      if (road.toLowerCase().includes("mg road")) {
        closedCoords = [[12.9736, 77.6074], [12.9740, 77.6110]];
        label = "MG Road Blocked";
      } else if (road.toLowerCase().includes("gate 3")) {
        closedCoords = [[12.9788, 77.5996], [12.9780, 77.5980]];
        label = "Gate 3 Exit Closed";
      } else if (road.toLowerCase().includes("queens")) {
        closedCoords = [[12.9836, 77.5966], [12.9800, 77.5950]];
        label = "Queens Road Restricted";
      }

      if (closedCoords.length > 0) {
        L.polyline(closedCoords, {
          color: "var(--critical)",
          weight: 7,
          opacity: 0.9,
          lineCap: "round"
        }).bindTooltip(`<b style="color:var(--critical);">${label}</b>`, { permanent: true, direction: "top" }).addTo(group);
      }
    });

    map.flyTo([selectedCorridor.lat, selectedCorridor.lng], 13.8, { duration: 0.8 });
  }

  // Pre-load scenario preset
  function applyPreset(preset: string) {
    setPresetScenario(preset);
    if (preset === "chinnaswamy") {
      setSelectedCorridorId("mg_road");
      setActiveStackType("gamma");
      setRain(false);
      setPeakHour(true);
      setClosedRoads(["Gate 3 Exit"]);
      setDeployedOfficers(15);
      const query = "Close Gate 3 Exit and deploy 15 officers for Chinnaswamy Match";
      setCommandInput(query);
      runQuery(query);
    } else if (preset === "hebbal_rain") {
      setSelectedCorridorId("hebbal");
      setActiveStackType("beta");
      setRain(true);
      setPeakHour(true);
      setClosedRoads([]);
      setDeployedOfficers(10);
      const query = "Hebbal Flyover peak hour rain, deploy 10 officers";
      setCommandInput(query);
      runQuery(query);
    } else if (preset === "orr_block") {
      setSelectedCorridorId("orr");
      setActiveStackType("beta");
      setRain(false);
      setPeakHour(true);
      setClosedRoads(["MG Road"]); // simulate closed link
      setDeployedOfficers(20);
      const query = "Close MG Road and deploy 20 officers";
      setCommandInput(query);
      runQuery(query);
    } else {
      // Reset
      setClosedRoads([]);
      setDeployedOfficers(0);
      setRain(false);
      setPeakHour(false);
      setActiveStackType("alpha");
      setQueryResponse(null);
    }
  }

  // Run What-If command
  function runQuery(cmd: string) {
    if (!cmd.trim()) return;

    setConsoleMessages((prev) => [...prev, { sender: "user", text: cmd }]);
    
    // Parse What-If query
    const res = parseWhatIfQuery(cmd, { closedRoads, deployedOfficers });

    // Update state based on parsed parameters
    if (cmd.toLowerCase().includes("close mg road") || cmd.toLowerCase().includes("mg road closed")) {
      if (!closedRoads.includes("MG Road")) {
        setClosedRoads((prev) => [...prev, "MG Road"]);
      }
    }
    if (cmd.toLowerCase().includes("close gate 3") || cmd.toLowerCase().includes("gate 3 exit closed")) {
      if (!closedRoads.includes("Gate 3 Exit")) {
        setClosedRoads((prev) => [...prev, "Gate 3 Exit"]);
      }
    }
    if (cmd.toLowerCase().includes("convert queens road") || cmd.toLowerCase().includes("queens road one-way")) {
      if (!closedRoads.includes("Queens Road")) {
        setClosedRoads((prev) => [...prev, "Queens Road"]);
      }
    }

    const officerMatch = cmd.match(/(?:deploy|place|add|use)\s+(\d+)\s+officer/i) || 
                         cmd.match(/(\d+)\s+officer/i);
    if (officerMatch) {
      setDeployedOfficers(parseInt(officerMatch[1], 10));
    }

    setTimeout(() => {
      setQueryResponse(res);
      setConsoleMessages((prev) => [
        ...prev,
        { sender: "system", text: `Scenario Projection Generated: ${res.title}. Congestion change: ${res.congestionBefore}% → ${res.congestionAfter}%. ${res.description}` }
      ]);
    }, 300);

    setCommandInput("");
  }

  // Evolutionary learning loop - live strike simulation
  function triggerLiveStrike() {
    // Add strike to active route
    setCorridors((prevCorridors) => {
      return prevCorridors.map((c) => {
        if (c.id === selectedCorridorId) {
          const stack = { ...c.stacks };
          const activeRoutes = [...stack[activeStackType]];
          const primaryRoute = { ...activeRoutes[0] };

          const newStrikes = primaryRoute.strikes + 1;
          primaryRoute.strikes = newStrikes;

          if (newStrikes >= 3) {
            primaryRoute.status = "Penalty Box";
            primaryRoute.cooldownRemaining = 30; // 30 days cooldown

            // Rotate: promote secondary, demote primary to tertiary
            const rotatedRoutes = [activeRoutes[1], activeRoutes[2], primaryRoute];
            toast.error(`3-Strike Threshold breached on ${primaryRoute.name}! Demoting to Penalty Box. Promoted ${activeRoutes[1].name} to Primary.`);
            
            return {
              ...c,
              stacks: {
                ...stack,
                [activeStackType]: rotatedRoutes
              }
            };
          } else {
            toast.warning(`Route ${primaryRoute.name} received 1 Strike! Strikes: ${newStrikes}/3`);
            activeRoutes[0] = primaryRoute;
            return {
              ...c,
              stacks: {
                ...stack,
                [activeStackType]: activeRoutes
              }
            };
          }
        }
        return c;
      });
    });
  }

  // Clear all simulation parameters
  function resetSimulation() {
    setClosedRoads([]);
    setDeployedOfficers(0);
    setRain(false);
    setPeakHour(false);
    setActiveStackType("alpha");
    setPresetScenario("none");
    setQueryResponse(null);
    setConsoleMessages([
      { sender: "system", text: "Simulation parameters cleared. CLI Console Ready." }
    ]);
    // Reset corridor stacks back to post-bootstrapped state
    setCorridors(() => {
      return INITIAL_CORRIDORS.map((c) => {
        if (c.id === "mg_road") {
          const updatedAlpha = [...c.stacks.alpha];
          updatedAlpha[0] = { ...updatedAlpha[0], strikes: 3, status: "Penalty Box" };
          return {
            ...c,
            stacks: {
              ...c.stacks,
              alpha: [updatedAlpha[1], updatedAlpha[2], updatedAlpha[0]]
            }
          };
        }
        return JSON.parse(JSON.stringify(c));
      });
    });
    toast.success("Simulation parameters and strikes reset.");
  }

  // Calculate dynamic impact score for the dashboard
  const dynamicImpactScore = useMemo(() => {
    const isPlanned = activeStackType === "gamma";
    const severity = rain || closedRoads.length > 0 ? "Critical" : peakHour ? "High" : "Medium";
    const volume = activeStackType === "gamma" ? 18000 : 9000;
    
    return calculateDynamicImpactScore({
      planned: isPlanned,
      severity,
      historicalClosureProbability: closedRoads.includes("MG Road") ? 0.35 : 0.12,
      estimatedVolume: volume,
      hourlyCapacity: 4000,
      durationHr: 4,
    });
  }, [activeStackType, rain, peakHour, closedRoads]);

  // Calculate resource requirements
  const resources = useMemo(() => {
    const activeStack = selectedCorridor.stacks[activeStackType];
    const activeRoute = activeStack[0];
    const isPlanned = activeStackType === "gamma";
    const attendees = activeStackType === "gamma" ? 18000 : undefined;

    return calculateResourceRequirements({
      planned: isPlanned,
      impactScore: dynamicImpactScore,
      crossStreets: activeRoute.crossStreets,
      distanceKm: activeRoute.distanceKm,
      attendees,
    });
  }, [selectedCorridor, activeStackType, dynamicImpactScore]);

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <Toaster />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        
        {/* Page Title */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Layers className="size-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight">Dynamic Diversion Generator</h1>
              <p className="text-xs text-muted-foreground">
                AI decision-support system featuring threshold-triggered route rotation, What-If console, and pre-aged routing stacks.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={resetSimulation}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-input/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
            >
              <Undo className="size-3.5" /> Clear Sim
            </button>
            <span className="flex items-center gap-1.5 rounded-lg border border-success/40 bg-success/10 px-3 py-1.5 text-xs font-bold text-success">
              <span className="size-2 rounded-full bg-success pulse-dot" /> DECISION ENGINE READY
            </span>
          </div>
        </div>

        {/* Phase 0 Historical Bootstrapping Panel */}
        {!bootstrapComplete ? (
          <div className="mb-6 rounded-2xl border border-primary/40 bg-primary/5 p-5">
            <div className="flex items-center gap-2 text-primary">
              <Terminal className="size-5 animate-spin" />
              <h2 className="text-sm font-bold uppercase tracking-wide">Phase 0: Bootstrapping Stacks...</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Pre-aging routing stacks using 8,100+ historical incident records.</p>
            <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-border bg-background/90 p-3 text-mono text-[10px] text-primary-foreground leading-relaxed font-semibold">
              {bootstrapLogs.map((log, i) => (
                <div key={i} className="mb-1">{log}</div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mb-6 grid gap-4 grid-cols-2 md:grid-cols-4">
            <div className="rounded-xl border border-border panel-glass p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Archives Processed</span>
              <p className="text-2xl font-bold text-mono text-primary">8,124</p>
              <span className="text-[10px] text-muted-foreground">historical incident records</span>
            </div>
            <div className="rounded-xl border border-border panel-glass p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Ghost Strikes Issued</span>
              <p className="text-2xl font-bold text-mono text-warning">6</p>
              <span className="text-[10px] text-muted-foreground">chronological breaches</span>
            </div>
            <div className="rounded-xl border border-border panel-glass p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Pre-Aged Readiness</span>
              <p className="text-2xl font-bold text-mono text-success">94%</p>
              <span className="text-[10px] text-muted-foreground">ready on day 1</span>
            </div>
            <div className="rounded-xl border border-border panel-glass p-4">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active Context Stack</span>
              <p className="text-2xl font-bold text-mono uppercase text-info">{activeStackType}</p>
              <span className="text-[10px] text-muted-foreground">Contextual silo routing</span>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          
          {/* LEFT COLUMN: Controls & Commands */}
          <div className="space-y-6">
            
            {/* Control Panel */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-4 flex items-center gap-2">
                <Gauge className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wide">Simulation Variables</h2>
              </div>

              {/* Corridor Selector */}
              <div className="mb-4">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Select Corridor</label>
                <select
                  value={selectedCorridorId}
                  onChange={(e) => setSelectedCorridorId(e.target.value)}
                  className="w-full rounded-lg border border-border bg-input/60 px-3 py-2.5 text-sm outline-none focus:border-primary"
                >
                  {corridors.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.zone})</option>
                  ))}
                </select>
              </div>

              {/* Presets */}
              <div className="mb-4">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Hackathon Presets</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => applyPreset("chinnaswamy")}
                    className={`rounded-lg border p-2 text-xs font-semibold transition ${presetScenario === "chinnaswamy" ? "border-primary bg-primary/10 text-primary" : "border-border bg-input/30 text-muted-foreground hover:text-foreground"}`}
                  >
                    Chinnaswamy Presets
                  </button>
                  <button
                    onClick={() => applyPreset("hebbal_rain")}
                    className={`rounded-lg border p-2 text-xs font-semibold transition ${presetScenario === "hebbal_rain" ? "border-primary bg-primary/10 text-primary" : "border-border bg-input/30 text-muted-foreground hover:text-foreground"}`}
                  >
                    Hebbal Flood Presets
                  </button>
                </div>
              </div>

              {/* Environment Toggles */}
              <div className="mb-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setRain(!rain)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition ${rain ? "border-accent bg-accent/15 text-accent" : "border-border bg-input/30 text-muted-foreground"}`}
                >
                  <Moon className="size-3.5" /> Rainy Weather
                </button>
                <button
                  onClick={() => setPeakHour(!peakHour)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg border p-2.5 text-xs font-semibold transition ${peakHour ? "border-accent bg-accent/15 text-accent" : "border-border bg-input/30 text-muted-foreground"}`}
                >
                  <Sun className="size-3.5" /> Peak Hours
                </button>
              </div>

              {/* Context Stacks Selector */}
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Routing Stack Context</label>
                <div className="flex gap-1 rounded-xl border border-border bg-input/30 p-1">
                  {(["alpha", "beta", "gamma"] as const).map((stack) => (
                    <button
                      key={stack}
                      onClick={() => setActiveStackType(stack)}
                      className={`flex-1 rounded-lg py-1.5 text-center text-xs font-bold capitalize transition ${activeStackType === stack ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {stack}
                    </button>
                  ))}
                </div>
                <span className="mt-1 block text-[9px] text-muted-foreground leading-normal">
                  {activeStackType === "alpha" && "Stack Alpha: Unplanned / Clear / Off-Peak"}
                  {activeStackType === "beta" && "Stack Beta: Unplanned / Rain / Peak"}
                  {activeStackType === "gamma" && "Stack Gamma: Planned Events / High volume"}
                </span>
              </div>
            </div>

            {/* What-If Console / Interactive CLI */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-success" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">What-If Console</h2>
                </div>
                <HelpCircle className="size-4 text-muted-foreground cursor-pointer" title="Type questions like: What if I close MG Road?" />
              </div>
              <p className="mb-4 text-xs text-muted-foreground">Type commands to simulate officer deployments or road closures.</p>
              
              <div className="mb-4 h-48 overflow-y-auto rounded-lg border border-border bg-background/80 p-3 text-mono text-[11px] leading-relaxed flex flex-col gap-2">
                {consoleMessages.map((msg, i) => (
                  <div key={i} className={msg.sender === "user" ? "text-primary" : "text-success"}>
                    <span className="text-muted-foreground font-semibold">{msg.sender === "user" ? "BTP_OFFICER> " : "GRIDMIND_AI> "}</span>
                    {msg.text}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. What if I close MG Road?"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runQuery(commandInput)}
                  className="flex-1 rounded-lg border border-border bg-input/60 px-3 py-2 text-xs outline-none focus:border-primary text-mono"
                />
                <button
                  onClick={() => runQuery(commandInput)}
                  className="rounded-lg bg-primary px-3 py-2 text-primary-foreground transition hover:brightness-110"
                >
                  <Send className="size-4" />
                </button>
              </div>

              {/* Quick CLI Shortcuts */}
              <div className="mt-4">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Quick Projections</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button
                    onClick={() => { setCommandInput("What if I close MG Road?"); runQuery("What if I close MG Road?"); }}
                    className="rounded bg-input/40 hover:bg-input/80 px-2 py-1 text-[10px] text-foreground font-medium transition"
                  >
                    Close MG Road
                  </button>
                  <button
                    onClick={() => { setCommandInput("What if I deploy 10 officers here?"); runQuery("What if I deploy 10 officers here?"); }}
                    className="rounded bg-input/40 hover:bg-input/80 px-2 py-1 text-[10px] text-foreground font-medium transition"
                  >
                    Deploy 10 Officers
                  </button>
                  <button
                    onClick={() => { setCommandInput("Close Gate 3 Exit"); runQuery("Close Gate 3 Exit"); }}
                    className="rounded bg-input/40 hover:bg-input/80 px-2 py-1 text-[10px] text-foreground font-medium transition"
                  >
                    Close Gate 3 Exit
                  </button>
                  <button
                    onClick={() => { setCommandInput("Convert Queens Road to One-Way Outbound"); runQuery("Convert Queens Road to One-Way Outbound"); }}
                    className="rounded bg-input/40 hover:bg-input/80 px-2 py-1 text-[10px] text-foreground font-medium transition"
                  >
                    Queens Road One-Way
                  </button>
                </div>
              </div>
            </div>

            {/* Algorithmic Resource Recommendation */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-4 flex items-center gap-2">
                <ShieldAlert className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wide">Resource Deployment</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl border border-border bg-input/30 p-2.5">
                  <Cone className="mx-auto mb-1 size-5 text-primary" />
                  <p className="text-lg font-bold text-mono">{resources.barricades}</p>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Barricades</span>
                </div>
                <div className="rounded-xl border border-border bg-input/30 p-2.5">
                  <ShieldAlert className="mx-auto mb-1 size-5 text-primary" />
                  <p className="text-lg font-bold text-mono">{resources.officers}</p>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Personnel</span>
                </div>
                <div className="rounded-xl border border-border bg-input/30 p-2.5">
                  <Truck className="mx-auto mb-1 size-5 text-primary" />
                  <p className="text-lg font-bold text-mono">{resources.towTrucks}</p>
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">Tow Trucks</span>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-border bg-input/20 p-3 text-[11px] text-muted-foreground leading-relaxed">
                Formula values based on:
                <div className="mt-1 flex justify-between">
                  <span>Corridor Impact Score ($I_d$):</span>
                  <span className="font-bold text-foreground">{dynamicImpactScore}/100</span>
                </div>
                <div className="flex justify-between">
                  <span>Diversion Distance ($d$):</span>
                  <span className="font-bold text-foreground">{(selectedCorridor.stacks[activeStackType][0]?.distanceKm || 3.0).toFixed(1)} km</span>
                </div>
                <div className="flex justify-between">
                  <span>Cross-streets ($c$):</span>
                  <span className="font-bold text-foreground">{selectedCorridor.stacks[activeStackType][0]?.crossStreets || 4} junctions</span>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Visual Map & Projections */}
          <div className="space-y-6">
            
            {/* Map & What-If Projection side by side */}
            <div className="grid gap-6 md:grid-cols-2">
              
              {/* Map Panel */}
              <div className="relative min-h-[380px] overflow-hidden rounded-2xl border border-border panel-glass flex flex-col">
                <div className="absolute left-4 top-4 z-[500] flex items-center gap-2 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-xs font-semibold backdrop-blur">
                  <MapPin className="size-3.5 text-accent" /> Spatial Command Map
                </div>
                <div ref={elRef} className="h-[380px] w-full" />
                <div className="absolute bottom-3 left-3 z-[500] flex flex-wrap gap-x-3 gap-y-1 rounded-lg border border-border bg-background/80 px-3 py-1.5 text-[9px] backdrop-blur leading-none">
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-success" /> Recommend route</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-warning" /> Secondary</span>
                  <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-critical" /> Closed / Avoid</span>
                </div>
              </div>

              {/* What-If Projections Dashboard */}
              <div className="rounded-2xl border border-border panel-glass p-5 flex flex-col justify-between">
                <div>
                  <div className="mb-4 flex items-center gap-2">
                    <Activity className="size-4 text-accent" />
                    <h2 className="text-sm font-bold uppercase tracking-wide">Projection Output</h2>
                  </div>

                  {queryResponse ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between border-b border-border pb-2">
                        <span className="text-xs font-bold text-primary uppercase">{queryResponse.title}</span>
                        <span className="text-[10px] text-muted-foreground">Estimated Result</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                          <span className="text-[10px] uppercase text-muted-foreground font-semibold">Congestion Reduction</span>
                          <p className="text-3xl font-extrabold text-success">
                            ↓ {Math.max(0, queryResponse.congestionBefore - queryResponse.congestionAfter)}%
                          </p>
                          <span className="text-[9px] text-muted-foreground">({queryResponse.congestionBefore}% → {queryResponse.congestionAfter}%)</span>
                        </div>
                        <div className="rounded-xl border border-success/30 bg-success/5 p-3">
                          <span className="text-[10px] uppercase text-muted-foreground font-semibold">Travel Delay Change</span>
                          <p className="text-3xl font-extrabold text-success">
                            ↓ {Math.max(0, queryResponse.delayBefore - queryResponse.delayAfter)} mins
                          </p>
                          <span className="text-[9px] text-muted-foreground">({queryResponse.delayBefore}m → {queryResponse.delayAfter}m)</span>
                        </div>
                      </div>

                      <div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Local Spills & Cascading Impact</span>
                        <div className="mt-2 space-y-1.5">
                          {queryResponse.spilloverImpact.map((spill, idx) => (
                            <div key={idx} className="flex justify-between items-center text-xs">
                              <span>{spill.road}</span>
                              <span className={spill.delta > 0 ? "text-critical font-bold" : "text-success font-bold"}>
                                {spill.delta > 0 ? `+${spill.delta}%` : `${spill.delta}%`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-dashed border-border bg-input/10 p-10 text-center text-xs text-muted-foreground my-auto">
                      <Sparkles className="mx-auto mb-2 size-6 text-muted-foreground/60" />
                      Run a projection in the CLI Console or apply a preset scenario to view expected congestion changes and spillover impacts.
                    </div>
                  )}
                </div>

                {queryResponse && (
                  <p className="mt-4 text-[10px] leading-normal text-muted-foreground border-t border-border pt-3">
                    <Info className="inline size-3.5 mr-1" /> {queryResponse.description}
                  </p>
                )}
              </div>

            </div>

            {/* Generated Best Diversion Plan Recommendations */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-4 flex items-center gap-2">
                <Megaphone className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wide">Best Diversion Plan (Generated Recommendations)</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {queryResponse && queryResponse.recommendations.length > 0 ? (
                  queryResponse.recommendations.map((rec, i) => (
                    <div key={i} className="rounded-xl border border-border bg-input/30 p-4 flex flex-col justify-between">
                      <div>
                        <span className={`inline-block rounded-md border px-2 py-0.5 text-[9px] font-bold uppercase mb-2 ${
                          rec.type === "close" ? "border-critical bg-critical/10 text-critical" :
                          rec.type === "convert" ? "border-warning bg-warning/10 text-warning" :
                          "border-info bg-info/10 text-info"
                        }`}>{rec.type}</span>
                        <h4 className="text-xs font-bold text-foreground leading-normal">{rec.title}</h4>
                        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">{rec.desc}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <>
                    <div className="rounded-xl border border-border bg-input/20 p-4">
                      <span className="inline-block rounded-md border border-critical bg-critical/10 text-critical px-2 py-0.5 text-[9px] font-bold uppercase mb-2">close</span>
                      <h4 className="text-xs font-bold text-foreground">Recommendation #1: Close Gate 3 Exit</h4>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">Directly feeds into already congested MG Road. Reroute via northern stadium gates.</p>
                    </div>
                    <div className="rounded-xl border border-border bg-input/20 p-4">
                      <span className="inline-block rounded-md border border-warning bg-warning/10 text-warning px-2 py-0.5 text-[9px] font-bold uppercase mb-2">convert</span>
                      <h4 className="text-xs font-bold text-foreground">Recommendation #2: Convert Queens Road</h4>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">Convert Queens Road to One-way Outbound. Increases vehicle throughput capacity by +35%.</p>
                    </div>
                    <div className="rounded-xl border border-border bg-input/20 p-4">
                      <span className="inline-block rounded-md border border-info bg-info/10 text-info px-2 py-0.5 text-[9px] font-bold uppercase mb-2">redirect</span>
                      <h4 className="text-xs font-bold text-foreground">Recommendation #3: Redirect Vehicles</h4>
                      <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed">Redirect 30% of MG Road vehicles via Cubbon Road to Richmond Circle intersection.</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Contextual Route Stacks & Evolutionary Learning Loop (Strikes) */}
            <div className="rounded-2xl border border-border panel-glass p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <RotateCw className="size-4 text-primary" />
                  <h2 className="text-sm font-bold uppercase tracking-wide">Route Stack Rotation & Strikes</h2>
                </div>
                <button
                  onClick={triggerLiveStrike}
                  className="flex items-center gap-1 rounded-lg bg-critical px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-glow transition hover:brightness-110"
                >
                  <AlertTriangle className="size-3.5" /> Simulate Strike on Primary
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-xl border border-border bg-input/30 p-4">
                  <div className="flex items-center justify-between border-b border-border pb-2 mb-3">
                    <span className="text-xs font-bold">ACTIVE STACK ({activeStackType.toUpperCase()}) FOR {selectedCorridor.name.toUpperCase()}</span>
                    <span className="text-[10px] text-muted-foreground">Hierarchy Order</span>
                  </div>
                  
                  <div className="space-y-2">
                    {selectedCorridor.stacks[activeStackType].map((route, idx) => {
                      const isPrimary = idx === 0;
                      const isSecondary = idx === 1;
                      const isTertiary = idx === 2;

                      return (
                        <div key={route.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/50 p-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
                                isPrimary ? "bg-success/20 text-success border border-success/40" :
                                isSecondary ? "bg-warning/20 text-warning border border-warning/40" :
                                "bg-muted/40 text-muted-foreground border border-border"
                              }`}>
                                {isPrimary ? "Primary (Default)" : isSecondary ? "Secondary" : "Tertiary"}
                              </span>
                              <span className="font-semibold text-foreground">{route.name}</span>
                            </div>
                            <div className="mt-1 flex gap-4 text-[10px] text-muted-foreground">
                              <span>Distance: {route.distanceKm} km</span>
                              <span>Cross-streets: {route.crossStreets}</span>
                              <span>Est. Travel Time: {route.baseTimeMin} mins</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground block">Strikes</span>
                              <span className={`text-xs font-extrabold ${route.strikes >= 3 ? "text-critical" : route.strikes > 0 ? "text-warning" : "text-muted-foreground"}`}>
                                {route.strikes}/3
                              </span>
                            </div>
                            <div>
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground block">Status</span>
                              <span className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 ${
                                route.status === "Active" ? "bg-success/15 text-success" :
                                route.status === "Penalty Box" ? "bg-critical/15 text-critical" :
                                "bg-warning/15 text-warning"
                              }`}>
                                {route.status}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Penalty Box & Rehabilitation info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-xs">
                    <h4 className="font-bold text-critical uppercase mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="size-3.5" /> Penalty Box (Demoted Routes)
                    </h4>
                    <p className="text-muted-foreground leading-relaxed">
                      Routes exceeding the 3-strike clearance threshold are sidelined for a 30-day cooldown to prevent cross-contamination of daily commuter emergency routes.
                    </p>
                  </div>
                  <div className="rounded-xl border border-info/30 bg-info/5 p-4 text-xs">
                    <h4 className="font-bold text-info uppercase mb-1 flex items-center gap-1.5">
                      <RotateCw className="size-3.5" /> Rehabilitation Protocol
                    </h4>
                    <p className="text-muted-foreground leading-relaxed">
                      Penalized routes are tested only during historically low-volume hours (11:00 PM - 4:00 AM). Successful test runs safely restore the route's rank.
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
