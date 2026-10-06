// Pure defaults and validation for the backup settings (stored by
// backupSettings.js). Free of storage imports so they can be unit tested.

export const DEFAULT_BACKUP_SETTINGS = {
  autoEnabled: true,      // back up automatically every 7 days
  driveEnabled: true,     // include Google Drive (when connected)
  folderUri: null,        // optional visible folder on the phone (Android SAF); null = the app's private folder
  folderLabel: null,
  driveEmail: null,       // the connected Google account, for display
  lastSuccessAt: null,    // last run that fully succeeded
  lastAttemptAt: null,    // last run of any outcome
  lastLocalAt: null,
  lastDriveAt: null,
  lastError: null,
};

export function normalizeBackupSettings(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v) => (typeof v === "string" && v ? v : null);
  return {
    autoEnabled: typeof r.autoEnabled === "boolean" ? r.autoEnabled : DEFAULT_BACKUP_SETTINGS.autoEnabled,
    driveEnabled: typeof r.driveEnabled === "boolean" ? r.driveEnabled : DEFAULT_BACKUP_SETTINGS.driveEnabled,
    folderUri: str(r.folderUri),
    folderLabel: str(r.folderLabel),
    driveEmail: str(r.driveEmail),
    lastSuccessAt: num(r.lastSuccessAt),
    lastAttemptAt: num(r.lastAttemptAt),
    lastLocalAt: num(r.lastLocalAt),
    lastDriveAt: num(r.lastDriveAt),
    lastError: str(r.lastError),
  };
}
