import React, { createContext, useContext } from "react";

export const LIGHT = {
  bg: "#F3F4F0", card: "#FFFFFF", text: "#17203A", textMuted: "#8891A0",
  line: "#E4E5DF", accentDark: "#17203A",
};
export const DARK = {
  bg: "#0F1117", card: "#1A1D26", text: "#F0F1F4", textMuted: "#8B93A6",
  line: "#2A2E3A", accentDark: "#090A0E",
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

export const ThemeContext = createContext({ theme: LIGHT, dark: false });
export const useTheme = () => useContext(ThemeContext);
