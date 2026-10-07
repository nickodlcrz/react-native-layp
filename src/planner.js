import { getActivePeriod, subjectsForPeriod, blocksForWeekday } from "./school";

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDate(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function weekStart(iso) {
  return shiftDate(iso, -((new Date(`${iso}T12:00:00`).getDay() + 6) % 7));
}
export function freeClassTime(items, start = 480, end = 1200) {
  const busy = items.filter((i) => i.kind === "class" && !i.cancelled)
    .map((i) => [Math.max(start, i.startMin), Math.min(end, i.endMin)])
    .filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const gaps = []; let cursor = start;
  for (const [a, b] of busy) {
    if (a - cursor >= 30) gaps.push({ startMin: cursor, endMin: a });
    cursor = Math.max(cursor, b);
  }
  if (end - cursor >= 30) gaps.push({ startMin: cursor, endMin: end });
  return gaps;
}
export function buildWeekPlan({ start, periods = [], subjects = [], entries = [], cancelledClasses = [], todos = [], reminders = [] }) {
  const period = getActivePeriod(periods);
  const active = period ? subjectsForPeriod(subjects, period.id) : [];
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftDate(start, index);
    const items = blocksForWeekday(active, entries, new Date(`${date}T12:00:00`).getDay() + 1).map((b) => ({
      id: `class:${b.entry.id}:${date}`, kind: "class", title: b.subject.code || b.subject.description || "Class", detail: b.subject.room || b.subject.description || "",
      startMin: b.startMin, endMin: b.endMin, time: b.entry.startTime, endTime: b.entry.endTime,
      cancelled: cancelledClasses.some((c) => c.entryId === b.entry.id && c.date === date),
    }));
    for (const t of todos.filter((t) => !t.completed && t.dueDate === date)) {
      items.push({ id: `task:${t.id}`, kind: "task", title: t.title, detail: subjects.find((s) => s.id === t.subjectId)?.code || "Task deadline", time: t.dueTime || null });
    }
    for (const r of reminders.filter((r) => !r.done && r.scheduleKind !== "interval")) {
      if (r.remindDate === date || (!r.remindDate && r.remindTime && (!r.remindUntil || date <= r.remindUntil) && (!r.createdAt || date >= localDate(new Date(r.createdAt))))) {
        items.push({ id: `reminder:${r.id}:${date}`, kind: "reminder", title: r.text || "Reminder", detail: r.remindDate ? "Reminder" : "Daily reminder", time: r.remindTime || null });
      }
    }
    items.sort((a, b) => (a.time || "00:00").localeCompare(b.time || "00:00") || a.id.localeCompare(b.id));
    const classes = items.filter((i) => i.kind === "class" && !i.cancelled);
    const conflicts = classes.filter((c, i) => classes.some((other, j) => j !== i && c.startMin < other.endMin && other.startMin < c.endMin)).map((c) => c.id);
    return { date, items, free: freeClassTime(items), conflicts };
  });
}
