import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  CalendarClock, Plus, Trash2, MapPin, Clock, Users, Activity, Brain,
  CheckCircle2, PlayCircle, ClipboardCheck, TrendingUp, ArrowRight,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EVENT_TYPES, predict, fmtHour, type EventType, type Venue } from "@/lib/gridmind";
import { DEFAULT_PLACE } from "@/lib/locations";
import { LocationSearch } from "@/components/LocationSearch";
import { useEvents, uid, type PlannedEvent } from "@/lib/store";

export const Route = createFileRoute("/planner")({
  head: () => ({
    meta: [
      { title: "Event Planner — VYUHIQ" },
      { name: "description", content: "Schedule major events, track operational status, and capture post-event feedback to improve future VYUHIQ predictions." },
    ],
  }),
  component: PlannerPage,
});

const statusStyle = {
  Scheduled: "border-info/40 bg-info/10 text-info",
  Active: "border-warning/40 bg-warning/10 text-warning",
  Completed: "border-success/40 bg-success/10 text-success",
} as const;

function PlannerPage() {
  const { events, addEvent, updateEvent, removeEvent } = useEvents();
  const [feedbackFor, setFeedbackFor] = useState<string | null>(null);

  const completed = events.filter((e) => e.status === "Completed" && e.outcome);
  const accuracy = completed.length
    ? Math.round(
      completed.reduce((acc, e) => {
        const pred = predict(e).delayMin;
        const actual = e.actualDelayMin ?? pred;
        const err = Math.abs(pred - actual) / Math.max(actual, 1);
        return acc + Math.max(0, 1 - err);
      }, 0) / completed.length * 100,
    )
    : null;

  return (
    <div className="min-h-screen grid-bg">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 md:px-6">
        <PageTitle
          icon={<CalendarClock className="size-5" />}
          title="Event Planner"
          subtitle="Schedule events, track live operational status, and feed real outcomes back into the model."
        />

        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Metric label="Scheduled" value={events.filter((e) => e.status !== "Completed").length} icon={<CalendarClock className="size-4" />} />
          <Metric label="Completed" value={completed.length} icon={<CheckCircle2 className="size-4" />} />
          <Metric label="Model accuracy" value={accuracy === null ? "—" : `${accuracy}%`} icon={<TrendingUp className="size-4" />} hint="from feedback" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <NewEventForm onAdd={addEvent} />

          <div className="space-y-3">
            {events.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border panel-glass p-10 text-center text-sm text-muted-foreground">
                No events scheduled yet. Add one here, or run an assessment on the{" "}
                <Link to="/" className="text-primary underline">Command</Link> page and schedule it.
              </div>
            )}
            {events.map((e) => (
              <EventRow
                key={e.id}
                e={e}
                onStatus={(status) => updateEvent(e.id, { status })}
                onRemove={() => removeEvent(e.id)}
                onFeedback={() => setFeedbackFor(feedbackFor === e.id ? null : e.id)}
                feedbackOpen={feedbackFor === e.id}
                onSaveFeedback={(patch) => {
                  updateEvent(e.id, { ...patch, status: "Completed" });
                  setFeedbackFor(null);
                }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function NewEventForm({ onAdd }: { onAdd: (e: PlannedEvent) => void }) {
  const [type, setType] = useState<EventType>("Concert");
  const [location, setLocation] = useState<Venue>(DEFAULT_PLACE);
  const [attendees, setAttendees] = useState(20000);
  const [hour, setHour] = useState(18);
  const [durationHr, setDurationHr] = useState(4);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  function submit() {
    onAdd({
      id: uid("EVT"),
      type, venueId: location.id, location, attendees, hour, durationHr, planned: true, date,
      title: `${type} · ${location.name}`,
      status: "Scheduled",
      createdAt: Date.now(),
    });
  }

  return (
    <div className="h-fit rounded-2xl border border-border panel-glass p-5">
      <div className="mb-4 flex items-center gap-2">
        <Plus className="size-4 text-primary" />
        <h2 className="text-sm font-bold uppercase tracking-wide">Schedule new event</h2>
      </div>

      <FieldLabel label="Event type">
        <select value={type} onChange={(e) => setType(e.target.value as EventType)} className={inputCls}>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </FieldLabel>
      <FieldLabel label="Location · Bengaluru">
        <LocationSearch value={location} onChange={setLocation} />
      </FieldLabel>
      <FieldLabel label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
      </FieldLabel>
      <FieldLabel label={`Attendees · ${attendees.toLocaleString()}`}>
        <input type="range" min={1000} max={50000} step={1000} value={attendees} onChange={(e) => setAttendees(+e.target.value)} className="w-full accent-[var(--primary)]" />
      </FieldLabel>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label={`Start · ${fmtHour(hour)}`}>
          <input type="range" min={0} max={23} value={hour} onChange={(e) => setHour(+e.target.value)} className="w-full accent-[var(--primary)]" />
        </FieldLabel>
        <FieldLabel label={`Duration · ${durationHr}h`}>
          <input type="range" min={1} max={8} value={durationHr} onChange={(e) => setDurationHr(+e.target.value)} className="w-full accent-[var(--primary)]" />
        </FieldLabel>
      </div>

      <button onClick={submit} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110">
        <Plus className="size-4" /> Add to calendar
      </button>
    </div>
  );
}

function EventRow({
  e, onStatus, onRemove, onFeedback, feedbackOpen, onSaveFeedback,
}: {
  e: PlannedEvent;
  onStatus: (s: PlannedEvent["status"]) => void;
  onRemove: () => void;
  onFeedback: () => void;
  feedbackOpen: boolean;
  onSaveFeedback: (patch: Partial<PlannedEvent>) => void;
}) {
  const p = predict(e);
  return (
    <div className="rounded-2xl border border-border panel-glass p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-mono text-[11px] text-muted-foreground">{e.id}</span>
            <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusStyle[e.status]}`}>{e.status}</span>
          </div>
          <h3 className="mt-1 text-sm font-bold">{e.title}</h3>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><MapPin className="size-3" /> {e.date}</span>
            <span className="flex items-center gap-1"><Clock className="size-3" /> {fmtHour(e.hour)} · {e.durationHr}h</span>
            <span className="flex items-center gap-1"><Users className="size-3" /> {e.attendees.toLocaleString()}</span>
            <span className="flex items-center gap-1"><Activity className="size-3" /> Predicted {p.delayMin} min · {p.severity}</span>
          </div>
        </div>
        <button onClick={onRemove} className="rounded-lg border border-border p-2 text-muted-foreground transition hover:border-critical/40 hover:text-critical">
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Action active={e.status === "Scheduled"} onClick={() => onStatus("Scheduled")} icon={<CalendarClock className="size-3.5" />}>Scheduled</Action>
        <Action active={e.status === "Active"} onClick={() => onStatus("Active")} icon={<PlayCircle className="size-3.5" />}>Go Active</Action>
        <Action active={feedbackOpen || e.status === "Completed"} onClick={onFeedback} icon={<ClipboardCheck className="size-3.5" />}>Post-event feedback</Action>
      </div>

      {e.outcome && !feedbackOpen && (
        <div className="mt-3 rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
            <span>Actual delay <strong className="text-foreground">{e.actualDelayMin} min</strong></span>
            <span className="flex items-center gap-1">Predicted {p.delayMin} <ArrowRight className="size-3" /> Actual {e.actualDelayMin}</span>
            <span>Outcome <strong className="text-foreground">{e.outcome}</strong></span>
          </div>
          {e.lesson && <p className="mt-2 flex items-start gap-1.5 text-muted-foreground"><Brain className="mt-0.5 size-3.5 text-primary" /> {e.lesson}</p>}
        </div>
      )}

      {feedbackOpen && <FeedbackForm e={e} predicted={p.delayMin} onSave={onSaveFeedback} />}
    </div>
  );
}

function FeedbackForm({ e, predicted, onSave }: { e: PlannedEvent; predicted: number; onSave: (patch: Partial<PlannedEvent>) => void }) {
  const [delay, setDelay] = useState(e.actualDelayMin ?? predicted);
  const [officers, setOfficers] = useState(e.actualOfficers ?? predict(e).resources.officers);
  const [outcome, setOutcome] = useState<NonNullable<PlannedEvent["outcome"]>>(e.outcome ?? "Successful");
  const [lesson, setLesson] = useState(e.lesson ?? "");

  return (
    <div className="mt-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="mb-3 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-primary">
        <ClipboardCheck className="size-3.5" /> Record actual outcome — improves future predictions
      </p>
      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label={`Actual delay · ${delay} min`}>
          <input type="range" min={0} max={120} value={delay} onChange={(ev) => setDelay(+ev.target.value)} className="w-full accent-[var(--primary)]" />
        </FieldLabel>
        <FieldLabel label={`Officers used · ${officers}`}>
          <input type="range" min={0} max={60} value={officers} onChange={(ev) => setOfficers(+ev.target.value)} className="w-full accent-[var(--primary)]" />
        </FieldLabel>
      </div>
      <FieldLabel label="Outcome">
        <div className="flex gap-2">
          {(["Successful", "Partial", "Strained"] as const).map((o) => (
            <button key={o} onClick={() => setOutcome(o)} className={`flex-1 rounded-lg border px-2 py-2 text-xs font-semibold transition ${outcome === o ? "border-primary bg-primary/15 text-primary" : "border-border bg-input/40 text-muted-foreground"}`}>{o}</button>
          ))}
        </div>
      </FieldLabel>
      <FieldLabel label="Lesson learned">
        <textarea value={lesson} onChange={(ev) => setLesson(ev.target.value)} rows={2} placeholder="e.g. Pre-position 2 tow trucks near Gate 3 next time." className={inputCls} />
      </FieldLabel>
      <button
        onClick={() => onSave({ actualDelayMin: delay, actualOfficers: officers, outcome, lesson })}
        className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-glow transition hover:brightness-110"
      >
        <CheckCircle2 className="size-4" /> Save feedback & complete
      </button>
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-input/60 px-3 py-2.5 text-sm outline-none focus:border-primary";

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Action({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${active ? "border-primary bg-primary/15 text-primary" : "border-border bg-input/30 text-muted-foreground hover:text-foreground"}`}>
      {icon}{children}
    </button>
  );
}

function Metric({ label, value, icon, hint }: { label: string; value: string | number; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-border panel-glass p-4">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">{icon}<span className="text-[10px] uppercase tracking-wide">{label}</span></div>
      <p className="text-mono text-2xl font-bold">{value}{hint && <span className="ml-1 text-[10px] font-normal text-muted-foreground">{hint}</span>}</p>
    </div>
  );
}

function PageTitle({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary">{icon}</div>
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
