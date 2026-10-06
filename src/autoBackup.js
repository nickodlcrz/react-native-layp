import { todayISO } from "./utils";
import { runBackup } from "./backupService";
import { isBackupDue, KEEP_DRIVE_BACKUPS } from "./backupSchedule";
import { loadBackupSettings, updateBackupSettings } from "./backupSettings";
import { writeLocalBackup } from "./backupLocal";
import { googleDriveStatus, uploadToDrive } from "./googleAuth";
import { markBackupExported } from "./backupReminder";

// One backup run: to this device, and to Google Drive when it's connected and
// switched on. Used by "Back up now" and by the automatic weekly backup.
// Resolves { result, settings } -- result is runBackup's report, settings the
// updated saved settings.
export async function performBackup({ data }) {
  const settings = await loadBackupSettings();
  const result = await runBackup({
    data,
    todayISO: todayISO(),
    settings,
    driveConnected: googleDriveStatus() === "ready" && !!settings.driveEmail,
    deps: {
      writeLocal: (name, content) => writeLocalBackup(name, content, settings.folderUri),
      uploadDrive: (name, content) => uploadToDrive(name, content, KEEP_DRIVE_BACKUPS),
      markExported: markBackupExported,
    },
  });
  const next = await updateBackupSettings(result.settingsPatch);
  return { result, settings: next };
}

// Called when the app opens and whenever it returns to the foreground: runs a
// backup if automatic backup is on and a week has passed since the last good
// one. Returns the run's report, or null when nothing was due. (A phone can't
// run LAYP's JavaScript while the app is closed, so the "every 7 days" is
// checked the next time the app is opened.)
export async function maybeAutoBackup(data) {
  const settings = await loadBackupSettings();
  if (!settings.autoEnabled) return null;
  if (!isBackupDue({ lastSuccessAt: settings.lastSuccessAt, lastAttemptAt: settings.lastAttemptAt, now: Date.now() })) return null;
  return performBackup({ data });
}
