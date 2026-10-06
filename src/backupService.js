import { backupFileName } from "./backupSchedule";

// Runs one backup: write it to this device, then upload it to Google Drive if
// that's connected. The device and network parts are injected (`deps`) so the
// orchestration -- which one failing never stops the other, and what counts
// as a successful run -- is unit tested without a phone.
//
// deps:
//   writeLocal(name, content)  -> { uri }        throws on failure
//   uploadDrive(name, content) -> { id, name }   throws on failure
//   markExported()                               resets the "back up soon" reminder
// settings: { driveEnabled } plus the connection state `driveConnected`.
//
// Returns { local, drive, success, settingsPatch }.
//  - success: the data is safe where the person asked for it -- on the device,
//    and on Drive too when Drive is switched on and connected. If Drive is
//    switched on but fails, the run is NOT a success, so it's retried
//    (after the retry window) rather than silently skipped for a week.
//  - settingsPatch: what to merge into the saved backup settings.
export async function runBackup({ data, todayISO, now = Date.now(), settings, driveConnected, deps }) {
  const name = backupFileName(todayISO);
  const content = JSON.stringify(data);
  const wantsDrive = !!settings.driveEnabled && !!driveConnected;

  const result = { local: { ok: false }, drive: { ok: false, skipped: !wantsDrive }, success: false, settingsPatch: { lastAttemptAt: now } };

  try {
    const { uri } = await deps.writeLocal(name, content);
    result.local = { ok: true, uri };
    result.settingsPatch.lastLocalAt = now;
  } catch (e) {
    result.local = { ok: false, error: describeError(e) };
  }

  if (wantsDrive) {
    try {
      const file = await deps.uploadDrive(name, content);
      result.drive = { ok: true, skipped: false, id: file?.id };
      result.settingsPatch.lastDriveAt = now;
    } catch (e) {
      result.drive = { ok: false, skipped: false, error: describeError(e) };
    }
  }

  result.success = result.local.ok && (!wantsDrive || result.drive.ok);
  if (result.local.ok || result.drive.ok) {
    try { await deps.markExported(); } catch (e) { /* the reminder is a nicety */ }
  }
  if (result.success) {
    result.settingsPatch.lastSuccessAt = now;
    result.settingsPatch.lastError = null;
  } else {
    result.settingsPatch.lastError = [result.local.error && `Device: ${result.local.error}`, result.drive.error && `Google Drive: ${result.drive.error}`].filter(Boolean).join(" | ") || "Backup didn't finish";
  }
  return result;
}

function describeError(e) {
  return (e && e.message ? e.message : String(e)).slice(0, 160);
}
