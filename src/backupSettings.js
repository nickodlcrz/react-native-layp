import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeBackupSettings } from "./backupSettingsLogic";

export { DEFAULT_BACKUP_SETTINGS, normalizeBackupSettings } from "./backupSettingsLogic";

// Backup preferences and "when did it last work" bookkeeping, in their own
// AsyncStorage key -- device-level settings, not app data, so they are not
// part of a backup and don't need the PIN to read.
const KEY = "layp:backupSettings";

export async function loadBackupSettings() {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return normalizeBackupSettings(raw ? JSON.parse(raw) : null);
  } catch (e) {
    return normalizeBackupSettings(null);
  }
}

// Merges `patch` into what's saved and returns the result.
export async function updateBackupSettings(patch) {
  const next = normalizeBackupSettings({ ...(await loadBackupSettings()), ...patch });
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.error("updateBackupSettings failed", e);
  }
  return next;
}
