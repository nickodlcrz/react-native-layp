import AsyncStorage from "@react-native-async-storage/async-storage";

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
  "cancelledClasses",
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
  for (const [key, raw] of pairs) {
    if (raw == null) continue;
    const name = key.slice(PREFIX.length);
    try {
      state[name] = JSON.parse(raw);
    } catch (e) {
      // One bad key shouldn't take down the whole app -- skip it and let
      // the caller's own defaulting (e.g. `s.todos || []`) fill the gap.
      console.error(`Failed to parse stored value for "${name}"`, e);
    }
  }
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

  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (!raw) {
      // Fresh install -- nothing to migrate, just stamp the current version.
      await AsyncStorage.setItem(META_KEY, JSON.stringify({ version: SCHEMA_VERSION }));
      return null;
    }
    const legacyState = JSON.parse(raw);
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
    if (migrated) return migrated;
    const state = await loadSplitState();
    return Object.keys(state).length ? state : null;
  } catch (e) {
    console.error("loadState failed", e);
    return null;
  }
}

export async function saveState(state) {
  try {
    const pairs = DOMAIN_KEYS
      .filter((name) => state[name] !== undefined)
      .map((name) => [domainKey(name), JSON.stringify(state[name])]);
    await AsyncStorage.multiSet(pairs);
  } catch (e) {
    console.error("saveState failed", e);
  }
}
