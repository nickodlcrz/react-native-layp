import { uid } from "./utils";
import { WEEKDAYS, DEFAULT_SCHOOL_DEFAULTS } from "./theme";

// --- Data shape reference ---
// AcademicPeriod: { id, label, status: "active" | "upcoming" | "archived", createdAt }
// Subject:        { id, periodId, code, description, room, professor, notes,
//                   classReminderEnabled, advanceReminderEnabled, advanceReminderMinutes,
//                   notificationIds: { class: [...ids], advance: [...ids] } | null }
// ScheduleEntry:  { id, subjectId, days: [expoWeekdayId...], startTime: "HH:MM", endTime: "HH:MM" }
//
// Every display (day tabs, weekly table, list, Home widget, Subject Detail)
// reads from the same subjects + scheduleEntries arrays -- none of them own
// or duplicate the schedule data themselves.

export function newAcademicPeriod(label) {
  return { id: uid(), label: label.trim() || "New schedule", status: "active", createdAt: Date.now() };
}

// Only one period is ever "active" at a time -- that's the one that drives
// Home's Today's Classes widget and real class reminders (per the "only the
// active academic period should normally be used for current class
// reminders" requirement). Making a period active demotes whichever period
// was previously active to "archived" (a finished term), never deleting it.
export function makePeriodActive(periods, id) {
  return periods.map((p) => {
    if (p.id === id) return { ...p, status: "active" };
    if (p.status === "active") return { ...p, status: "archived" };
    return p;
  });
}

export function getActivePeriod(periods) {
  return periods.find((p) => p.status === "active") || null;
}

export function newSubject(periodId, defaults = DEFAULT_SCHOOL_DEFAULTS) {
  return {
    id: uid(),
    periodId,
    code: "",
    description: "",
    room: "",
    professor: "",
    notes: "",
    classReminderEnabled: defaults.classReminderEnabled,
    advanceReminderEnabled: defaults.advanceReminderEnabled,
    advanceReminderMinutes: defaults.advanceReminderMinutes,
    notificationIds: null,
  };
}

export function newScheduleEntry(subjectId) {
  return { id: uid(), subjectId, days: [], startTime: "08:00", endTime: "09:00" };
}

// Duplicates every subject + schedule entry from one academic period into
// another, remapping ids so the two periods never share references. The
// source period is left completely untouched.
export function copyPeriodSchedule(subjects, entries, fromPeriodId, toPeriodId) {
  const idMap = {};
  const newSubjects = subjects
    .filter((s) => s.periodId === fromPeriodId)
    .map((s) => {
      const id = uid();
      idMap[s.id] = id;
      return { ...s, id, periodId: toPeriodId, notificationIds: null };
    });
  const newEntries = entries
    .filter((e) => idMap[e.subjectId])
    .map((e) => ({ ...e, id: uid(), subjectId: idMap[e.subjectId] }));
  return { newSubjects, newEntries };
}

export function subjectsForPeriod(subjects, periodId) {
  return subjects.filter((s) => s.periodId === periodId);
}
export function entriesForSubject(entries, subjectId) {
  return entries.filter((e) => e.subjectId === subjectId);
}

// --- Time math ---
// JS Date#getDay() is 0=Sun...6=Sat. Expo's weekday trigger (and this app's
// existing WEEKDAYS convention in theme.js) is 1=Sun...7=Sat, so converting
// is always just +1.
export function todayExpoWeekday() {
  return new Date().getDay() + 1;
}
export function minutesSinceMidnight(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return h * 60 + m;
}
export function weekdayLabel(id) {
  return WEEKDAYS.find((w) => w.id === id)?.label || "";
}

// Every (subject, entry) pair that meets on a given weekday id, sorted by
// start time -- the shared building block behind Day view, Today's Classes,
// and current/next-class logic.
export function blocksForWeekday(subjects, entries, weekdayId) {
  return entries
    .filter((e) => e.days.includes(weekdayId))
    .map((e) => {
      const subject = subjects.find((s) => s.id === e.subjectId);
      if (!subject) return null;
      return { subject, entry: e, startMin: minutesSinceMidnight(e.startTime), endMin: minutesSinceMidnight(e.endTime) };
    })
    .filter(Boolean)
    .sort((a, b) => a.startMin - b.startMin);
}

// Compares the current moment against today's blocks (active period only,
// pass in already-filtered subjects/entries): what's happening now, and
// what's next -- today if anything remains, otherwise the next meeting up
// to a week out.
export function getCurrentAndNextClass(subjects, entries) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayId = todayExpoWeekday();

  const todaysBlocks = blocksForWeekday(subjects, entries, todayId);
  const current = todaysBlocks.find((b) => nowMin >= b.startMin && nowMin < b.endMin) || null;
  const laterToday = todaysBlocks.filter((b) => b.startMin > nowMin);
  if (laterToday.length) {
    return { current, next: laterToday[0], nextDaysAhead: 0 };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const checkId = ((todayId - 1 + offset) % 7) + 1;
    const blocks = blocksForWeekday(subjects, entries, checkId);
    if (blocks.length) return { current, next: blocks[0], nextDaysAhead: offset };
  }
  return { current, next: null, nextDaysAhead: null };
}

export function minutesRemaining(block) {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return Math.max(0, block.endMin - nowMin);
}
