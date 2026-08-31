import AsyncStorage from "@react-native-async-storage/async-storage";

// Same reasoning as themePreference.js: App.js needs this *before* the PIN
// is entered (to decide whether backgrounding-then-returning should force
// a re-lock), so it lives in its own small, always-readable key rather
// than inside the PIN-gated app state blob.
const KEY = "layp-auto-lock-minutes";

// 0 = lock immediately on backgrounding (the old, only behavior).
// null = never auto-lock from backgrounding alone (PIN still required on
// a full app relaunch, since `unlocked` always starts false).
export const AUTO_LOCK_OPTIONS = [
  { label: "Immediately", minutes: 0 },
  { label: "After 1 minute", minutes: 1 },
  { label: "After 5 minutes", minutes: 5 },
  { label: "After 15 minutes", minutes: 15 },
  { label: "After 30 minutes", minutes: 30 },
  { label: "Never", minutes: null },
];

export const DEFAULT_AUTO_LOCK_MINUTES = 5;

export async function getAutoLockMinutes() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === null) return DEFAULT_AUTO_LOCK_MINUTES;
    if (raw === "null") return null;
    return Number(raw);
  } catch (e) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
}

export async function setAutoLockMinutes(minutes) {
  try {
    await AsyncStorage.setItem(KEY, minutes === null ? "null" : String(minutes));
  } catch (e) {
    console.error("setAutoLockMinutes failed", e);
  }
}
