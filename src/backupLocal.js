import * as FileSystem from "expo-file-system";
import { selectBackupsToDelete, KEEP_LOCAL_BACKUPS } from "./backupSchedule";

// Backup files on this device. Two places:
//  - the app's private folder (always works, but only LAYP can see it), or
//  - a folder the person picked once (Android's folder picker), e.g.
//    Downloads/LAYP, where they can see and copy the files themselves.
// If the picked folder stops working (removed, permission revoked), the
// private folder is used instead so a backup is never skipped.
const privateDir = () => `${FileSystem.documentDirectory}backups/`;

const nameFromUri = (uri) => decodeURIComponent(uri).split("/").pop();

async function writeToPrivateFolder(name, content) {
  try { await FileSystem.makeDirectoryAsync(privateDir(), { intermediates: true }); } catch (e) { /* exists */ }
  const uri = privateDir() + name;
  await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
  try {
    const names = await FileSystem.readDirectoryAsync(privateDir());
    for (const old of selectBackupsToDelete(names, KEEP_LOCAL_BACKUPS)) {
      await FileSystem.deleteAsync(privateDir() + old, { idempotent: true });
    }
  } catch (e) { /* pruning is best-effort */ }
  return { uri, where: "private" };
}

async function writeToPickedFolder(folderUri, name, content) {
  const SAF = FileSystem.StorageAccessFramework;
  const existing = await SAF.readDirectoryAsync(folderUri);
  // Same-day file already there (a manual backup earlier today): replace it
  // instead of ending up with "name (1).json".
  for (const uri of existing) {
    if (nameFromUri(uri) === name) { try { await SAF.deleteAsync(uri, { idempotent: true }); } catch (e) { /* ignore */ } }
  }
  // The provider adds the .json extension itself, so it's left off here.
  const created = await SAF.createFileAsync(folderUri, name.replace(/\.json$/, ""), "application/json");
  await FileSystem.writeAsStringAsync(created, content, { encoding: FileSystem.EncodingType.UTF8 });
  try {
    const after = await SAF.readDirectoryAsync(folderUri);
    const byName = new Map(after.map((u) => [nameFromUri(u), u]));
    for (const old of selectBackupsToDelete([...byName.keys()], KEEP_LOCAL_BACKUPS)) {
      try { await SAF.deleteAsync(byName.get(old), { idempotent: true }); } catch (e) { /* ignore */ }
    }
  } catch (e) { /* pruning is best-effort */ }
  return { uri: created, where: "folder" };
}

export async function writeLocalBackup(name, content, folderUri) {
  if (folderUri) {
    try { return await writeToPickedFolder(folderUri, name, content); } catch (e) { /* fall back below */ }
  }
  return writeToPrivateFolder(name, content);
}

// Lets the person pick a folder once. Resolves { uri, label } or null.
export async function pickBackupFolder() {
  const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  const label = decodeURIComponent(perm.directoryUri).split("/document/").pop().replace(/^primary:/, "").split(":").pop() || "Chosen folder";
  return { uri: perm.directoryUri, label };
}
