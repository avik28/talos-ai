import { useEffect, useRef } from "react";
import type { Prediction } from "@/lib/ai/gridmind";
import { STATIONS, severityColor } from "@/lib/ai/gridmind";

// Resolve a CSS var token to an actual color string for Leaflet/SVG.
function resolveVar(token: string): string {
  if (typeof window === "undefined") return "#f5a623";
  const m = token.match(/var\((--[\w-]+)\)/);
  if (!m) return token;
  const val = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return val || "#f5a623";
}

export function CommandMap({ prediction }: { prediction: Prediction | null }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView(
        [12.9716, 77.5946],
        12,
      );
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      draw();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    draw(); /* eslint-disable-next-line */
  }, [prediction]);

  function draw() {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layerRef.current;
    if (!L || !map || !group) return;
    group.clearLayers();

    // Stations
    STATIONS.forEach((s) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:3px;background:#7c87a0;border:2px solid #cfd6e6;box-shadow:0 0 6px rgba(0,0,0,.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([s.lat, s.lng], { icon })
        .bindTooltip(`${s.name} · ${s.officersAvailable} avail`, { direction: "top" })
        .addTo(group);
    });

    if (!prediction) return;
    const p = prediction;
    const sev = resolveVar(severityColor(p.severity));

    // Impact radius
    L.circle([p.venue.lat, p.venue.lng], {
      radius: p.radiusKm * 1000,
      color: sev,
      weight: 2,
      fillColor: sev,
      fillOpacity: 0.14,
    }).addTo(group);

    // Junctions
    p.junctions.forEach((j) => {
      const col =
        j.load > 0.7
          ? resolveVar("var(--critical)")
          : j.load > 0.45
            ? resolveVar("var(--warning)")
            : resolveVar("var(--success)");
      L.circleMarker([j.lat, j.lng], {
        radius: 7,
        color: col,
        fillColor: col,
        fillOpacity: 0.85,
        weight: 1,
      })
        .bindTooltip(`${j.name} · ${(j.load * 100).toFixed(0)}%`, { direction: "top" })
        .addTo(group);
    });

    // Diversions
    p.diversions.forEach((d) => {
      const col = resolveVar(d.color);
      L.polyline(d.points, {
        color: col,
        weight: 4,
        opacity: 0.9,
        dashArray: "2 8",
        lineCap: "round",
      })
        .bindTooltip(`${d.name} · saves ~${d.saveMin} min`)
        .addTo(group);
    });

    // Venue marker
    const vIcon = L.divIcon({
      className: "",
      html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${sev};box-shadow:0 0 0 6px ${sev}33,0 0 16px ${sev}aa;color:#10131f;font-weight:800;font-size:13px;">${p.score}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([p.venue.lat, p.venue.lng], { icon: vIcon })
      .bindTooltip(`${p.venue.name} · ${p.severity}`, { direction: "top", offset: [0, -14] })
      .addTo(group);

    map.flyTo([p.venue.lat, p.venue.lng], 13.2, { duration: 0.8 });
  }

  return <div ref={elRef} className="h-full w-full" />;
}
import { useEffect, useRef } from "react";
import type { Prediction } from "@/lib/gridmind";
import { STATIONS, severityColor } from "@/lib/gridmind";

// Resolve a CSS var token to an actual color string for Leaflet/SVG.
function resolveVar(token: string): string {
  if (typeof window === "undefined") return "#f5a623";
  const m = token.match(/var\((--[\w-]+)\)/);
  if (!m) return token;
  const val = getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
  return val || "#f5a623";
}

export function CommandMap({ prediction }: { prediction: Prediction | null }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: true }).setView([12.9716, 77.5946], 12);
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: "&copy; OpenStreetMap &copy; CARTO",
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      draw();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { draw(); /* eslint-disable-next-line */ }, [prediction]);

  function draw() {
    const L = LRef.current;
    const map = mapRef.current;
    const group = layerRef.current;
    if (!L || !map || !group) return;
    group.clearLayers();

    // Stations
    STATIONS.forEach((s) => {
      const icon = L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:3px;background:#7c87a0;border:2px solid #cfd6e6;box-shadow:0 0 6px rgba(0,0,0,.5)"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      L.marker([s.lat, s.lng], { icon }).bindTooltip(`${s.name} · ${s.officersAvailable} avail`, { direction: "top" }).addTo(group);
    });

    if (!prediction) return;
    const p = prediction;
    const sev = resolveVar(severityColor(p.severity));

    // Impact radius
    L.circle([p.venue.lat, p.venue.lng], {
      radius: p.radiusKm * 1000,
      color: sev,
      weight: 2,
      fillColor: sev,
      fillOpacity: 0.14,
    }).addTo(group);

    // Junctions
    p.junctions.forEach((j) => {
      const col = j.load > 0.7 ? resolveVar("var(--critical)") : j.load > 0.45 ? resolveVar("var(--warning)") : resolveVar("var(--success)");
      L.circleMarker([j.lat, j.lng], { radius: 7, color: col, fillColor: col, fillOpacity: 0.85, weight: 1 })
        .bindTooltip(`${j.name} · ${(j.load * 100).toFixed(0)}%`, { direction: "top" })
        .addTo(group);
    });

    // Diversions
    p.diversions.forEach((d) => {
      const col = resolveVar(d.color);
      L.polyline(d.points, { color: col, weight: 4, opacity: 0.9, dashArray: "2 8", lineCap: "round" })
        .bindTooltip(`${d.name} · saves ~${d.saveMin} min`)
        .addTo(group);
    });

    // Venue marker
    const vIcon = L.divIcon({
      className: "",
      html: `<div style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:${sev};box-shadow:0 0 0 6px ${sev}33,0 0 16px ${sev}aa;color:#10131f;font-weight:800;font-size:13px;">${p.score}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
    L.marker([p.venue.lat, p.venue.lng], { icon: vIcon }).bindTooltip(`${p.venue.name} · ${p.severity}`, { direction: "top", offset: [0, -14] }).addTo(group);

    map.flyTo([p.venue.lat, p.venue.lng], 13.2, { duration: 0.8 });
  }

  return <div ref={elRef} className="h-full w-full" />;
}
