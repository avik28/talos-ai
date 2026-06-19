import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Search, X, Crosshair } from "lucide-react";
import { searchPlaces, type Place } from "@/lib/locations";

interface Props {
  value: Place;
  onChange: (p: Place) => void;
  placeholder?: string;
}

// Google-Maps-style search box for any Bengaluru area.
export function LocationSearch({ value, onChange, placeholder = "Search any Bengaluru area…" }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => searchPlaces(query), [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function select(p: Place) {
    onChange(p);
    setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-border bg-input/60 px-3 py-2.5 focus-within:border-primary">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        {open ? (
          <input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter" && results[active]) { e.preventDefault(); select(results[active]); }
              else if (e.key === "Escape") setOpen(false);
            }}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        ) : (
          <button
            type="button"
            onClick={() => { setOpen(true); setActive(0); }}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="truncate text-sm font-medium text-foreground">{value.name}</span>
            <span className="ml-auto shrink-0 truncate text-[11px] text-muted-foreground">{value.area}</span>
          </button>
        )}
        {open && query && (
          <button type="button" onClick={() => setQuery("")} className="shrink-0 text-muted-foreground hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-30 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-border bg-popover shadow-xl">
          {results.length === 0 && (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">No matching area in Bengaluru.</div>
          )}
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => select(p)}
              className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                i === active ? "bg-primary/15" : "hover:bg-muted/60"
              }`}
            >
              <MapPin className={`size-4 shrink-0 ${i === active ? "text-primary" : "text-muted-foreground"}`} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{p.area} · Bengaluru</span>
              </span>
              <span className="ml-auto flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                <Crosshair className="size-3" />
                {(p.baseLoad * 100).toFixed(0)}%
              </span>
            </button>
          ))}
          <div className="border-t border-border px-3 py-1.5 text-[10px] text-muted-foreground">
            Type to search {/* keep simple */}any locality across Bengaluru
          </div>
        </div>
      )}
    </div>
  );
}
