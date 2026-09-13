import React, { createContext, useContext } from "react";

export const LIGHT = {
  bg: "#F3F4F0", card: "#FFFFFF", text: "#17203A", textMuted: "#8891A0",
  line: "#E4E5DF", accentDark: "#17203A",
  // A dark-gray "solid surface" for toggles/segmented active states that
  // aren't primary CTAs or money totals -- see accentDark's note below on
  // why those two get to keep the indigo and everything else doesn't.
  neutralDark: "#4B5160",
};
export const DARK = {
  // A dark blue-gray rather than a true near-black -- keeps the
  // OLED-friendly, low-glare feel of a dark background without tipping
  // into the "everything is pure #000" look, and reads a little warmer
  // next to `card` than a flat black would.
  bg: "#12121A", card: "#151518", text: "#EDEDF0",
  // Brightened from a dimmer #94949E so secondary text (dates, muted
  // labels, timestamps) stays comfortably readable at a glance instead of
  // disappearing into the background.
  textMuted: "#A8A8B0",
  // accentDark is used everywhere as a "solid accent surface" -- hero
  // cards, FAB-style round buttons, and active/selected toggle
  // backgrounds, always paired with white icons/text on top. A rich,
  // desaturated indigo keeps that "solid dark surface" language while
  // still popping clearly against the near-black bg/card above.
  //
  // Reserved for primary actions and money totals only (hero cards, the
  // main "+" / submit buttons) -- everywhere else that used to reach for
  // this same indigo (filter chips, view toggles, day pickers) now uses
  // neutralDark below instead, so indigo stays a meaningful signal
  // ("this is the primary thing" / "this is money") instead of just being
  // the app's all-purpose accent.
  line: "#242428", accentDark: "#2E3E72",
  // Dark gray "solid surface" for the same toggle/segmented active states
  // as LIGHT.neutralDark above -- distinct from both `card` (too close to
  // the resting surface to read as "selected") and `accentDark` (now
  // reserved for CTAs/totals).
  neutralDark: "#3A3A42",
};
export const ACCENT = {
  gold: "#D9A441", leaf: "#3E7C59", ember: "#D1573F",
  sky: "#3E63D1", plum: "#8B5FBF", teal: "#2F9E9E",
  // Added so every category/label swatch in the app can be visually
  // distinct -- see SPENDING_LABELS below, which previously reused plum
  // and ember twice each (School/Other both plum, Bills/Health both
  // ember), making those categories indistinguishable in the pie charts.
  rose: "#D1477F", slate: "#5C6B8A",
};
export const PALETTE = [ACCENT.gold, ACCENT.leaf, ACCENT.ember, ACCENT.sky, ACCENT.plum, ACCENT.teal];

// Expo's weekday trigger uses 1=Sunday...7=Saturday (same convention on
// both Android and iOS), so ids follow that rather than JS's Date.getDay().
export const WEEKDAYS = [
  { id: 2, label: "Mon" },
  { id: 3, label: "Tue" },
  { id: 4, label: "Wed" },
  { id: 5, label: "Thu" },
  { id: 6, label: "Fri" },
  { id: 7, label: "Sat" },
  { id: 1, label: "Sun" },
];

// Seed data only -- the live account list is now user-managed state
// (add/rename/remove named accounts like GCash, Maya, Wallet), stored and
// passed down from App.js, same pattern as budget splits.
export const DEFAULT_ACCOUNTS = [
  { id: "ecash", label: "E-cash", color: ACCENT.sky },
  { id: "physical", label: "Physical", color: ACCENT.gold },
];

export const CATEGORIES = [
  { id: "school", label: "School", color: ACCENT.sky },
  { id: "errands", label: "Errands", color: ACCENT.leaf },
  { id: "shopping", label: "Shopping", color: ACCENT.gold },
  { id: "other", label: "Other", color: ACCENT.plum },
];

export const INCOME_CATEGORIES = [
  { id: "allowance", label: "Allowance", color: ACCENT.leaf },
  { id: "salary", label: "Salary", color: ACCENT.sky },
  { id: "gift", label: "Gift", color: ACCENT.gold },
  { id: "refund", label: "Refund", color: ACCENT.teal },
  { id: "other", label: "Other", color: ACCENT.plum },
];

// Quick-pick categories for what an expense was actually *for* (food,
// transportation, etc.) -- distinct from the budget split it's charged
// against (Needs/Wants/Savings). A split says which bucket of your income
// paid for something; this says what it was. Stored in the same free-text
// `expense.label` field ExpenseForm already had, so picking one of these
// just fills that field instead of requiring the user to type it --
// custom labels typed by hand still work exactly as before.
export const SPENDING_LABELS = [
  { id: "food", label: "Food", color: ACCENT.gold },
  { id: "transportation", label: "Transportation", color: ACCENT.sky },
  { id: "school", label: "School", color: ACCENT.rose },
  { id: "bills", label: "Bills", color: ACCENT.ember },
  { id: "shopping", label: "Shopping", color: ACCENT.teal },
  { id: "entertainment", label: "Entertainment", color: ACCENT.leaf },
  { id: "health", label: "Health", color: ACCENT.slate },
  { id: "other", label: "Other", color: ACCENT.plum },
];

export const DEFAULT_SPLITS = {
  "50-30-20": [
    { id: "s0", label: "Needs", percent: 50, color: ACCENT.sky },
    { id: "s1", label: "Wants", percent: 30, color: ACCENT.gold },
    { id: "s2", label: "Savings", percent: 20, color: ACCENT.leaf },
  ],
  "70-20-10": [
    { id: "s0", label: "Needs", percent: 70, color: ACCENT.sky },
    { id: "s1", label: "Wants", percent: 20, color: ACCENT.gold },
    { id: "s2", label: "Savings", percent: 10, color: ACCENT.leaf },
  ],
};

// Daily Budget Review defaults -- notification on, review at 10 PM, same
// spirit as the spec's example default.
export const DEFAULT_DAILY_BUDGET_SETTINGS = { enabled: true, time: "22:00" };

// School feature -- applied to newly created subjects unless the user
// overrides them per-subject in the Add/Edit Subject form.
export const DEFAULT_SCHOOL_DEFAULTS = {
  classReminderEnabled: true,
  advanceReminderEnabled: true,
  advanceReminderMinutes: 10,
  classCheckInEnabled: true,
  classCheckInMinutes: 60,
};
export const ADVANCE_REMINDER_OPTIONS = [5, 10, 15, 30, 60];
// Options for "Do you have class today?" -- how long before the class
// itself this lighter heads-up fires. Was previously a fixed 60 minutes;
// now configurable per subject the same way advance-reminder minutes are.
export const CHECKIN_REMINDER_OPTIONS = [30, 45, 60, 90, 120];
export const EVENT_TYPES = [
  { id: "assignment", label: "Assignment" },
  { id: "quiz", label: "Quiz" },
  { id: "exam", label: "Exam" },
  { id: "lab", label: "Laboratory" },
  { id: "project", label: "Project" },
  { id: "presentation", label: "Presentation" },
  { id: "other", label: "Other" },
];

export const ThemeContext = createContext({ theme: LIGHT, dark: false });
export const useTheme = () => useContext(ThemeContext);
