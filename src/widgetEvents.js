// Builds the "upcoming events" list the calendar widget shows: task
// deadlines, bill payment days, loans coming due, reminders, and the GF's
// important dates (birthdays, anniversaries, monthsaries). Pure -- no React
// Native imports.
import { occurrencesBetween, addDaysISO, entryKind, entryRepeat, KIND_ANNIVERSARY, REPEAT_MONTHLY } from "./gfDates";

export const EVENT_HORIZON_DAYS = 120;
export const MAX_WIDGET_EVENTS = 150;

// Every kind of event the widgets can show, in the order the settings screen
// lists them. `id` is the `kind` on each event below.
export const EVENT_KINDS = [
  { id: "school", label: "School tasks" },
  { id: "task", label: "Other tasks" },
  { id: "bill", label: "Payments" },
  { id: "loan", label: "Loans" },
  { id: "reminder", label: "Reminders" },
  { id: "date", label: "Dates" },
  { id: "anniversary", label: "Anniversaries" },
  { id: "monthsary", label: "Monthsaries" },
];

// How ties on the same day are ordered (lower first).
const KIND_ORDER = { school: 0, task: 1, bill: 2, loan: 3, reminder: 4, anniversary: 5, monthsary: 6, date: 7 };

// Each event: { date: "YYYY-MM-DD", title, kind, amount? }.
// `kinds` (optional) limits the result to those event kinds -- what the person
// chose to show on that widget in Settings; null/undefined means everything.
export function buildWidgetEvents({ todos = [], bills = [], loans = [], reminders = [], gfDates = [], today, horizonDays = EVENT_HORIZON_DAYS, limit = MAX_WIDGET_EVENTS, kinds = null }) {
  const end = addDaysISO(today, horizonDays);
  const inRange = (d) => typeof d === "string" && d >= today && d <= end;
  const events = [];

  for (const t of todos) {
    if (t.completed || !inRange(t.dueDate)) continue;
    events.push({ date: t.dueDate, title: t.title || "Task", kind: t.category === "school" ? "school" : "task" });
  }
  for (const b of bills) {
    if (b.paid || !inRange(b.dueDate)) continue;
    events.push({ date: b.dueDate, title: b.name || "Bill", kind: "bill", amount: Number(b.amount) || 0 });
  }
  for (const l of loans) {
    if (l.settled || !inRange(l.dueDate)) continue;
    events.push({ date: l.dueDate, title: `${l.type === "lent" ? "Collect from" : "Pay"} ${l.person || "someone"}`, kind: "loan" });
  }
  for (const r of reminders) {
    if (r.done || !inRange(r.remindDate)) continue;
    events.push({ date: r.remindDate, title: r.text || "Reminder", kind: "reminder" });
  }
  for (const g of gfDates) {
    const kind = entryKind(g) === KIND_ANNIVERSARY ? "anniversary" : entryRepeat(g) === REPEAT_MONTHLY ? "monthsary" : "date";
    for (const date of occurrencesBetween(g, today, end)) {
      events.push({ date, title: g.label || "Special day", kind });
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
  const wanted = Array.isArray(kinds) ? events.filter((e) => kinds.includes(e.kind)) : events;
  return wanted.slice(0, limit);
}
