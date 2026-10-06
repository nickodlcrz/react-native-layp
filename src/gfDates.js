// GF "important dates" -- pure helpers (no React Native imports).
//
// An entry looks like { id, label, date: "MM-DD", repeat?, kind?, notificationIds }.
//   date   month-day only, no year (a birthday isn't tied to one year). For a
//          monthly entry only the day-of-month matters; the month is just
//          the one it started on.
//   repeat "yearly" (default, also what every entry saved before this field
//          existed means) or "monthly" (e.g. a monthsary).
//   kind   "date" (default) or "anniversary" -- gets its own badge.
// A day that doesn't exist in a given month (31st in April, Feb 29 in a
// common year) lands on that month's last day instead of being skipped.

export const REPEAT_YEARLY = "yearly";
export const REPEAT_MONTHLY = "monthly";
export const KIND_DATE = "date";
export const KIND_ANNIVERSARY = "anniversary";

export const entryRepeat = (e) => (e && e.repeat === REPEAT_MONTHLY ? REPEAT_MONTHLY : REPEAT_YEARLY);
export const entryKind = (e) => (e && e.kind === KIND_ANNIVERSARY ? KIND_ANNIVERSARY : KIND_DATE);

// Small tags shown next to a date: the special Anniversary label, and
// "Every month" for monthly repeats (monthsaries).
export function badgesFor(e) {
  const out = [];
  if (entryKind(e) === KIND_ANNIVERSARY) out.push("Anniversary");
  if (entryRepeat(e) === REPEAT_MONTHLY) out.push("Every month");
  return out;
}

const pad = (n) => String(n).padStart(2, "0");
const isoOf = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const parseISO = (s) => { const [y, m, d] = s.split("-").map(Number); return { y, m0: m - 1, d }; };
const lastDayOf = (y, m0) => new Date(y, m0 + 1, 0).getDate();

export function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  return Math.round((Date.UTC(b.y, b.m0, b.d) - Date.UTC(a.y, a.m0, a.d)) / 86400000);
}

export function addDaysISO(iso, days) {
  const { y, m0, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m0, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

// Every occurrence of the entry from `fromISO` to `toISO`, inclusive, as
// "YYYY-MM-DD" strings in order.
export function occurrencesBetween(entry, fromISO, toISO) {
  if (!entry || !/^\d{2}-\d{2}$/.test(entry.date || "")) return [];
  const [mm, dd] = entry.date.split("-").map(Number);
  const from = parseISO(fromISO), to = parseISO(toISO);
  const out = [];
  if (entryRepeat(entry) === REPEAT_MONTHLY) {
    let y = from.y;
    let m0 = from.m0;
    while (y < to.y || (y === to.y && m0 <= to.m0)) {
      const iso = isoOf(y, m0, Math.min(dd, lastDayOf(y, m0)));
      if (iso >= fromISO && iso <= toISO) out.push(iso);
      m0 += 1;
      if (m0 > 11) { m0 = 0; y += 1; }
    }
  } else {
    for (let y = from.y; y <= to.y; y += 1) {
      const iso = isoOf(y, mm - 1, Math.min(dd, lastDayOf(y, mm - 1)));
      if (iso >= fromISO && iso <= toISO) out.push(iso);
    }
  }
  return out;
}

// The next occurrence on or after `todayISO` (today counts), or null.
export function nextOccurrence(entry, todayISO) {
  const windowDays = entryRepeat(entry) === REPEAT_MONTHLY ? 62 : 400;
  return occurrencesBetween(entry, todayISO, addDaysISO(todayISO, windowDays))[0] || null;
}

export function daysUntilEntry(entry, todayISO) {
  const next = nextOccurrence(entry, todayISO);
  return next ? daysBetween(todayISO, next) : Infinity;
}

// 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 11 -> "11th", 22 -> "22nd"
export function ordinal(n) {
  const v = Math.abs(Number(n)) || 0;
  const mod100 = v % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${v}th`;
  return `${v}${({ 1: "st", 2: "nd", 3: "rd" })[v % 10] || "th"}`;
}
