import { EVENT_KINDS } from "./widgetEvents";

// Pure rules for the date-widget preferences (see widgetPrefs.js for where
// they're stored). Free of storage imports so they can be unit tested.
export const ALL_EVENT_KINDS = EVENT_KINDS.map((k) => k.id);
export const DEFAULT_WIDGET_PREFS = { calendarKinds: [...ALL_EVENT_KINDS], upcomingKinds: [...ALL_EVENT_KINDS], fontScale: 1, opacity: 0.65, accountIds: null, subjectIds: null };

// Keeps only known kinds, in a stable order; anything missing or malformed
// falls back to "show everything".
export function normalizeWidgetPrefs(raw) {
  const clean = (list) => (Array.isArray(list) ? ALL_EVENT_KINDS.filter((id) => list.includes(id)) : [...ALL_EVENT_KINDS]);
  const ids = (list) => Array.isArray(list) ? [...new Set(list.filter((id) => typeof id === "string" && id.length > 0))] : null;
  return { calendarKinds: clean(raw?.calendarKinds), upcomingKinds: clean(raw?.upcomingKinds),
    fontScale: [0.9, 1, 1.15].includes(raw?.fontScale) ? raw.fontScale : 1,
    opacity: [0.35, 0.65, 0.85].includes(raw?.opacity) ? raw.opacity : 0.65,
    accountIds: ids(raw?.accountIds), subjectIds: ids(raw?.subjectIds) };
}

// Adds the kind if it's off, removes it if it's on.
export function toggleKind(list, id) {
  return ALL_EVENT_KINDS.filter((k) => (k === id ? !list.includes(k) : list.includes(k)));
}
