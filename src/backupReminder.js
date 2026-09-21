import AsyncStorage from "@react-native-async-storage/async-storage";

// Everything here lives in AsyncStorage on its own, tiny keys -- not part
// of the main domain-keyed app state in storage.js, since it's purely a
// "when did the person last do X" reminder concern, not app data.
const LAST_EXPORT_KEY = "layp:lastBackupExportAt";
const FIRST_USE_KEY = "layp:firstUseAt";
const DISMISSED_KEY = "layp:backupReminderDismissedAt";

const REMINDER_INTERVAL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

// Call this whenever the person actually produces a backup -- the file
// export and the "copy full backup" clipboard path in SummaryScreen both
// count, since either means their data exists somewhere outside this one
// device now.
export async function markBackupExported() {
  await AsyncStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
}

async function getOrCreateFirstUseAt() {
  const raw = await AsyncStorage.getItem(FIRST_USE_KEY);
  if (raw) return Number(raw) || Date.now();
  const now = Date.now();
  await AsyncStorage.setItem(FIRST_USE_KEY, String(now));
  return now;
}

export async function dismissBackupReminder() {
  await AsyncStorage.setItem(DISMISSED_KEY, String(Date.now()));
}

// Whether the Home-tab backup banner should show right now: it's been
// 14+ days since the last export (or, if there's never been one, 14+
// days since this device's first-ever use of this feature -- rather
// than nagging a brand-new install on day one), AND the person hasn't
// dismissed the banner within the last 14 days either. Dismissing
// doesn't mean "never again", just "not for another two weeks".
export async function shouldShowBackupReminder() {
  const [lastExportRaw, dismissedRaw, firstUseAt] = await Promise.all([
    AsyncStorage.getItem(LAST_EXPORT_KEY),
    AsyncStorage.getItem(DISMISSED_KEY),
    getOrCreateFirstUseAt(),
  ]);
  const now = Date.now();
  const since = lastExportRaw ? Number(lastExportRaw) : firstUseAt;
  const overdue = now - since >= REMINDER_INTERVAL_MS;
  if (!overdue) return false;
  const dismissedAt = dismissedRaw ? Number(dismissedRaw) : 0;
  return now - dismissedAt >= REMINDER_INTERVAL_MS;
}
