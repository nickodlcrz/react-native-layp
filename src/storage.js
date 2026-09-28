import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState } from "react-native";

// --- Storage layout ---
//
// Historically the entire app state lived under one AsyncStorage key as a
// single JSON blob. That meant: (a) one corrupted write could take out
// every domain at once, (b) every save re-serialized and re-wrote data that
// hadn't even changed, and (c) there was no way to version the shape of the
// data going forward.
//
// This splits storage into one key per domain (todos, expenses, accounts,
// etc.) under a common prefix, plus a small "meta" record that carries a
// schema version. loadState()/saveState() keep the exact same external
// shape the rest of the app already expects, so nothing else needs to
// change -- only how it's stored on disk.

const PREFIX = "@layp/";
const META_KEY = `${PREFIX}meta`;
const LEGACY_KEY = "layp-app-state"; // the old single-blob key
const SCHEMA_VERSION = 2;

// Every domain this app persists, and the key it lives under. Keeping this
// as an explicit list (rather than spreading an arbitrary object) is what
// makes future migrations tractable -- adding a field just means adding a
// line here, not reshaping a blob.
const DOMAIN_KEYS = [
  "todos", "bills", "expenses", "moneyLog", "weeklySummaries", "savingsLog",
  "goals", "loans", "splits", "accounts", "transfers", "dark",
  "dailyBudgetSettings", "dailyBudgetLog", "dailyBudgetNotifId",
  "academicPeriods", "subjects", "scheduleEntries", "schoolDefaults",
  "cancelledClasses", "recurringIncome", "spendingLimits",
  "savingsAccounts", "interestLog",
  "reminders",
  "gfName", "gfLikes", "gfDislikes", "gfDates", "gfNotes", "gfGiftIdeas", "gfPromises",
];

function domainKey(name) {
  return `${PREFIX}${name}`;
}

async function readMeta() {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("readMeta failed", e);
    return null;
  }
}

async function loadSplitState() {
  const pairs = await AsyncStorage.multiGet(DOMAIN_KEYS.map(domainKey));
  const state = {};
  const corruptedKeys = [];
  for (const [key, raw] of pairs) {
    if (raw == null) continue;
    const name = key.slice(PREFIX.length);
    try {
      state[name] = JSON.parse(raw);
    } catch (e) {
      // One bad key shouldn't take down the whole app -- skip it and let
      // the caller's own defaulting (e.g. `s.todos || []`) fill the gap.
      console.error(`Failed to parse stored value for "${name}"`, e);
      corruptedKeys.push(name);
    }
  }
  // Smuggled onto the same object rather than changing loadState()'s
  // return shape -- every call site does `s.todos || []` etc. directly
  // off what loadState() returns, and no real domain is ever named
  // `__corruptedKeys`, so this rides along for free without touching
  // every one of those call sites.
  if (corruptedKeys.length) state.__corruptedKeys = corruptedKeys;
  return state;
}

// One-time migration from the legacy single-blob key into the split,
// versioned keys. Safe to call repeatedly: it's a no-op once the meta key
// exists. The legacy key is left in place until the split write succeeds,
// so a crash mid-migration just means it's retried on next launch instead
// of losing data.
async function migrateFromLegacyIfNeeded() {
  const meta = await readMeta();
  if (meta?.version) return null; // already migrated

  let raw;
  try {
    raw = await AsyncStorage.getItem(LEGACY_KEY);
  } catch (e) {
    console.error("Reading legacy storage key failed", e);
    return null;
  }
  if (!raw) {
    // Fresh install -- nothing to migrate, just stamp the current version.
    await AsyncStorage.setItem(META_KEY, JSON.stringify({ version: SCHEMA_VERSION }));
    return null;
  }

  let legacyState;
  try {
    legacyState = JSON.parse(raw);
  } catch (e) {
    // The whole single-blob record is unreadable -- this used to fall
    // through to the catch below, log it, and return null, which
    // loadState() then treats exactly like "nothing stored yet": the app
    // just quietly starts over with empty defaults, with zero indication
    // that there was actually a full budget/task history sitting right
    // there in storage. LEGACY_KEY and META_KEY are deliberately left
    // untouched here (unlike the success path below) so nothing is lost
    // and this is retried on next launch too -- the caller surfaces a
    // recovery screen instead of silently discarding it.
    console.error("Legacy backup blob is corrupted -- cannot migrate", e);
    return { __totalCorruption: true };
  }

  try {
    const pairs = DOMAIN_KEYS
      .filter((name) => legacyState[name] !== undefined)
      .map((name) => [domainKey(name), JSON.stringify(legacyState[name])]);
    await AsyncStorage.multiSet(pairs);
    await AsyncStorage.setItem(META_KEY, JSON.stringify({ version: SCHEMA_VERSION }));
    await AsyncStorage.removeItem(LEGACY_KEY);
    return legacyState;
  } catch (e) {
    console.error("Migration from legacy storage failed, will retry next launch", e);
    return null;
  }
}

export async function loadState() {
  try {
    const migrated = await migrateFromLegacyIfNeeded();
    if (migrated) return migrated; // includes the __totalCorruption case
    const state = await loadSplitState();
    return Object.keys(state).length ? state : null;
  } catch (e) {
    console.error("loadState failed", e);
    return null;
  }
}

// Called only from the "Start fresh" escape hatch on RecoveryScreen, after
// a total-corruption load -- removes the unreadable legacy blob and stamps
// the current schema version so the next launch doesn't hit the same
// __totalCorruption path again and get stuck re-prompting forever.
export async function clearUnreadableLegacyState() {
  try {
    await AsyncStorage.removeItem(LEGACY_KEY);
    await AsyncStorage.setItem(META_KEY, JSON.stringify({ version: SCHEMA_VERSION }));
  } catch (e) {
    console.error("clearUnreadableLegacyState failed", e);
  }
}

export async function writeStateNow(state) {
  try {
    const pairs = DOMAIN_KEYS
      .filter((name) => state[name] !== undefined)
      .map((name) => [domainKey(name), JSON.stringify(state[name])]);
    await AsyncStorage.multiSet(pairs);
  } catch (e) {
    console.error("saveState failed", e);
  }
}

// LAYP's save effect in App.js fires on every relevant state change, which
// without debouncing meant one AsyncStorage.multiSet call per keystroke
// while editing an amount field, per subtask checkbox tap, etc. Callers
// that change several fields in quick succession (typing, dragging a
// slider) now collapse into a single write ~800ms after things settle,
// instead of re-serializing and re-writing the same domains over and over.
const SAVE_DEBOUNCE_MS = 800;
let pendingState = null;
let saveTimer = null;

async function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!pendingState) return;
  const state = pendingState;
  pendingState = null;
  await writeStateNow(state);
}

// If the app gets backgrounded (or killed) while a save is still debouncing,
// waiting out the rest of the debounce window risks losing whatever changed
// in the last ~800ms. Flushing immediately on any non-"active" AppState
// transition means the debounce only ever delays writes while the user is
// actively still in the app, never across a backgrounding.
AppState.addEventListener("change", (next) => {
  if (next !== "active") flushPendingSave();
});

export function saveState(state) {
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushPendingSave, SAVE_DEBOUNCE_MS);
}

// For call sites that need the write to have actually landed before moving
// on (there are none yet, but this is here so that need doesn't require
// touching the debounce internals above).
export async function flushSaveState() {
  await flushPendingSave();
}
