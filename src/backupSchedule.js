// Pure scheduling/naming rules for automatic backups (no React Native or
// Expo imports, so they're unit tested on their own).

export const BACKUP_INTERVAL_DAYS = 7;
// After a failed run (no internet, signed out of Google...), wait this long
// before trying again instead of retrying every time the app is opened.
export const BACKUP_RETRY_HOURS = 6;
export const KEEP_LOCAL_BACKUPS = 8;
export const KEEP_DRIVE_BACKUPS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// Is an automatic backup due now?
//  - never backed up successfully -> due (first run)
//  - 7+ days since the last success -> due
//  - but not if a try already happened within the retry window, so a
//    failing backup can't loop on every foreground
// Times are epoch milliseconds (or null).
export function isBackupDue({ lastSuccessAt, lastAttemptAt, now, intervalDays = BACKUP_INTERVAL_DAYS, retryHours = BACKUP_RETRY_HOURS }) {
  const overdue = !lastSuccessAt || now - lastSuccessAt >= intervalDays * DAY_MS;
  if (!overdue) return false;
  if (lastAttemptAt && now - lastAttemptAt < retryHours * HOUR_MS && (!lastSuccessAt || lastAttemptAt > lastSuccessAt)) return false;
  return true;
}

// When the next automatic backup will be due (a Date), or null if there has
// never been one (it runs the next time the app opens).
export function nextBackupAt(lastSuccessAt, intervalDays = BACKUP_INTERVAL_DAYS) {
  return lastSuccessAt ? new Date(lastSuccessAt + intervalDays * DAY_MS) : null;
}

export function backupFileName(isoDate) {
  return `layp-backup-${isoDate}.json`;
}

const FILE_PATTERN = /^layp-backup-(\d{4}-\d{2}-\d{2})\.json$/;

export function parseBackupFileDate(name) {
  const m = FILE_PATTERN.exec(name || "");
  return m ? m[1] : null;
}

// Of the given file names, which to delete so only the newest `keep` backups
// remain. Names that aren't LAYP backups are never touched.
export function selectBackupsToDelete(names, keep) {
  const backups = names
    .map((name) => ({ name, date: parseBackupFileDate(name) }))
    .filter((b) => b.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return backups.slice(Math.max(0, keep)).map((b) => b.name);
}
