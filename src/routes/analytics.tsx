import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { BarChart2, ShieldAlert, CheckCircle2, TrendingUp, Calendar } from "lucide-react";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Traffic Analytics — GridMind AI" },
      {
        name: "description",
        content: "Analyze historical incidents, clearance averages, and diversion effectiveness.",
      },
    ],
  }),
  component: AnalyticsPage,
});

const dataCause = [
  { name: "Breakdown", value: 924 },
  { name: "Accident", value: 652 },
  { name: "Waterlogging", value: 341 },
  { name: "Potholes", value: 290 },
  { name: "Construction", value: 421 },
  { name: "Others", value: 150 },
];

const dataZone = [
  { name: "Central", load: 82 },
  { name: "North", load: 74 },
  { name: "East", load: 78 },
  { name: "West", load: 68 },
  { name: "South", load: 70 },
];

const COLORS = ["#3b82f6", "#ef4444", "#eab308", "#10b981", "#8b5cf6", "#6b7280"];

function AnalyticsPage() {
  return (
    <div className="min-h-screen grid-bg text-slate-900">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        {/* Header Section */}
        <div className="mb-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl flex items-center gap-2">
              <BarChart2 className="h-7 w-7 text-primary" /> System Performance & Analytics
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Historical archives overview based on 8,124 records compiled across the Bengaluru
              police network.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold rounded-xl bg-input/40 px-3 py-2 border border-border">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Archive Period: Jan 2023 - Mar 2024</span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Total Logs Analyzed
            </p>
            <p className="text-3xl font-black mt-2">8,124</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Grounded in local incident registries
            </p>
          </div>
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Avg. Clearance Time
            </p>
            <p className="text-3xl font-black mt-2">48.4m</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              From initial report to resolution
            </p>
          </div>
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Diversion Success Rate
            </p>
            <p className="text-3xl font-black mt-2 text-green-600">91.2%</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Percentage of smooth traffic reroutes
            </p>
          </div>
          <div className="rounded-2xl border border-border panel-glass p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Active Stations Connected
            </p>
            <p className="text-3xl font-black mt-2">7</p>
            <p className="text-[10px] text-muted-foreground mt-1">BTP local division feeds</p>
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Bar Chart */}
          <div className="rounded-2xl border border-border panel-glass p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Average Road Congestion Level by Zone
              (%)
            </h2>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataZone} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip cursor={{ fill: "transparent" }} />
                  <Bar dataKey="load" fill="#4f46e5" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Pie Chart */}
          <div className="rounded-2xl border border-border panel-glass p-6 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-6 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-500" /> Incident Distribution by Cause
            </h2>
            <div className="h-64 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dataCause}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {dataCause.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
              {dataCause.map((c, idx) => (
                <div key={c.name} className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: COLORS[idx] }}
                  ></span>
                  <span className="text-muted-foreground">
                    {c.name}: {c.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
