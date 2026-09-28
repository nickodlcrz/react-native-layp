// Shared logic for two related but distinct "remind me" mechanisms:
//
// 1. Scheduled popups (general Reminders, GF Promises) -- an optional
//    date + a time, or just a time repeating daily until an optional end
//    date. Delivery is either a real OS notification or, in "popup" mode,
//    a due-check run every time the app opens.
// 2. Frequency popups (GF Notes) -- not tied to a clock time at all, just
//    "show this again if it's been at least N hours since it was last
//    shown" (or always, every single open).
//
// Kept here instead of duplicated in App.js/RememberList.js/GFScreen.js so
// the popup collector and each screen's own "is this due" badge can never
// quietly drift apart.

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// --- Scheduled popups (date optional, time-only repeats daily) ---

// True once the item's popup is due to appear -- for a one-time
// (dated) item, due once its moment has passed and it hasn't fired yet;
// for a repeating (date-less) item, due once today's time has passed and
// today's occurrence hasn't been shown yet (and `remindUntil`, if set,
// hasn't passed). Covers remindMode "popup" and "both" (a "both" item
// wants a notification AND this popup, not one or the other). Items
// using scheduleKind "interval" are handled by isIntervalPopupDue below
// instead -- they're not tied to a clock time at all.
export function isScheduledPopupDue(item) {
  if (item.done) return false;
  if (item.remindMode !== "popup" && item.remindMode !== "both") return false;
  if (item.scheduleKind === "interval") return false;
  const today = todayLocalISO();
  if (item.remindDate) {
    if (item.popupFired) return false;
    return new Date(`${item.remindDate}T${item.remindTime || "09:00"}:00`).getTime() <= Date.now();
  }
  if (!item.remindTime) return false;
  if (item.remindUntil && today > item.remindUntil) return false;
  if (item.lastPopupShownDate === today) return false;
  const [h, m] = item.remindTime.split(":").map(Number);
  const scheduledToday = new Date();
  scheduledToday.setHours(h, m, 0, 0);
  return Date.now() >= scheduledToday.getTime();
}

// The update to apply once a scheduled popup has actually been shown --
// spread this into the item so a one-time popup doesn't repeat forever,
// and a repeating one shows at most once per day.
export function markScheduledPopupShown(item) {
  const today = todayLocalISO();
  return item.remindDate ? { popupFired: true } : { lastPopupShownDate: today };
}

// Human-readable summary of a scheduled item's reminder setup, for list
// rows -- e.g. "Sep 25, 2:30 PM", "Daily at 8:00 AM until Oct 1", or
// "Every 3 hours" for an interval-scheduled one.
export function describeSchedule(item) {
  if (item.scheduleKind === "interval") return describeFrequency(item.remindInterval);
  if (!item.remindTime) return null;
  if (item.remindDate) return `${item.remindDate} ${item.remindTime}`;
  return `Daily ${item.remindTime}${item.remindUntil ? ` until ${item.remindUntil}` : ""}`;
}

// --- Frequency popups (GF Notes, and GF Promises/Reminders using
//     scheduleKind "interval") ---
//
// Not tied to a clock time at all -- just "show this again if it's been
// at least N hours since it was last shown" (or always, every single
// open). GF Notes keep their config on `remindPopup` (a note has no
// other reminder concept, so it's the item's only field for this);
// anything using scheduleKind "interval" instead keeps it on
// `remindInterval`, kept as a separate field so it can sit alongside
// remindMode ("popup", "notification", or "both") without the two
// meanings colliding.

function dueByFrequency(config, lastShownAt) {
  if (!config?.enabled && !config?.frequency) return false;
  const hours = hoursForFrequency(config.frequency, config.customHours);
  if (hours <= 0) return true; // "always" -- due every single time, no matter when it last showed
  if (!lastShownAt) return true;
  return Date.now() - lastShownAt >= hours * 3600 * 1000;
}

function describeFrequency(config) {
  if (!config) return null;
  const opt = FREQUENCY_OPTIONS.find((f) => f.key === config.frequency);
  if (config.frequency === "custom") return `Every ${config.customHours}h`;
  return opt?.label || null;
}

export function hoursForFrequency(frequency, customHours) {
  if (frequency === "1h") return 1;
  if (frequency === "3h") return 3;
  if (frequency === "custom") return Math.max(1 / 60, Number(customHours) || 1);
  return 0; // "always"
}

export function isFrequencyPopupDue(item) {
  if (item.done) return false;
  if (!item.remindPopup?.enabled) return false;
  return dueByFrequency(item.remindPopup, item.lastPopupShownAt);
}

// Same math as isFrequencyPopupDue, for a GF Promise (or other
// remindMode-based item) using scheduleKind "interval" instead of a
// specific date/time. "Always" isn't offered for these in the UI when
// remindMode also includes a notification (an OS notification needs an
// actual interval to schedule against), but the popup side of a
// popup-only interval item can still use it.
export function isIntervalPopupDue(item) {
  if (item.done) return false;
  if (item.remindMode !== "popup" && item.remindMode !== "both") return false;
  if (item.scheduleKind !== "interval") return false;
  return dueByFrequency(item.remindInterval, item.lastPopupShownAt);
}

// The update to apply once a frequency-based popup (Notes, or an
// interval-scheduled Promise) has actually been shown -- keyed to a
// timestamp instead of "today" since these can repeat several times a
// day (every hour, every 3 hours).
export function markFrequencyPopupShown() {
  return { lastPopupShownAt: Date.now() };
}

export const FREQUENCY_OPTIONS = [
  { key: "always", label: "Always" },
  { key: "1h", label: "Every hour" },
  { key: "3h", label: "Every 3 hours" },
  { key: "custom", label: "Custom" },
];
