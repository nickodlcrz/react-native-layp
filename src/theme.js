import React, { createContext, useContext } from "react";

export const LIGHT = {
  bg: "#F3F4F0", card: "#FFFFFF", text: "#17203A", textMuted: "#8891A0",
  line: "#E4E5DF", accentDark: "#17203A",
};
export const DARK = {
  // A true near-black rather than the previous dark navy-gray -- closer to
  // what most people mean by "dark mode" (OLED-friendly, less of a washed-
  // out charcoal look), with just enough lift on `card` to keep cards and
  // sheets readable as distinct surfaces against the background.
  bg: "#09090B", card: "#151518", text: "#EDEDF0", textMuted: "#94949E",
  // accentDark is used everywhere as a "solid accent surface" -- hero
  // cards, FAB-style round buttons, and active/selected toggle
  // backgrounds, always paired with white icons/text on top. A rich,
  // desaturated indigo keeps that "solid dark surface" language while
  // still popping clearly against the near-black bg/card above.
  line: "#242428", accentDark: "#2E3E72",
};
export const ACCENT = {
  gold: "#D9A441", leaf: "#3E7C59", ember: "#D1573F",
  sky: "#3E63D1", plum: "#8B5FBF", teal: "#2F9E9E",
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
};
export const ADVANCE_REMINDER_OPTIONS = [5, 10, 15, 30, 60];
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
