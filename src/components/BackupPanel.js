import React, { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, Switch, StyleSheet, ActivityIndicator } from "react-native";
import { CloudUpload, Smartphone, FolderOpen, Cloud } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { loadBackupSettings, updateBackupSettings } from "../backupSettings";
import { performBackup } from "../autoBackup";
import { nextBackupAt, BACKUP_INTERVAL_DAYS } from "../backupSchedule";
import { googleDriveStatus, connectGoogle, disconnectGoogle } from "../googleAuth";
import { pickBackupFolder } from "../backupLocal";
import { showAppDialog } from "./AppDialog";

function fmtWhen(ms) {
  if (!ms) return "never";
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

// Backups in one place: where they go (this phone, and Google Drive when the
// account is connected), whether they run by themselves every 7 days, and a
// "Back up now" button. The scheduling and Drive logic live in
// src/backupSchedule.js, src/googleDrive.js and src/backupService.js.
export default function BackupPanel({ backup }) {
  const { theme } = useTheme();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(null); // "backup" | "connect" | null
  const drive = googleDriveStatus();

  const change = useCallback(async (patch) => { setS(await updateBackupSettings(patch)); }, []);
  useEffect(() => { loadBackupSettings().then(setS); }, []);
  if (!s) return null;

  async function backUpNow() {
    setBusy("backup");
    try {
      const { result, settings } = await performBackup({ data: backup });
      setS(settings);
      const lines = [
        result.local.ok ? "Saved on this phone." : `Couldn't save on this phone: ${result.local.error}`,
        result.drive.skipped ? null : result.drive.ok ? "Uploaded to Google Drive." : `Google Drive upload failed: ${result.drive.error}`,
      ].filter(Boolean);
      showAppDialog(result.success ? "Backup done" : "Backup finished with a problem", lines.join("\n"));
    } catch (e) {
      showAppDialog("Backup failed", e?.message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function connect() {
    setBusy("connect");
    try {
      const r = await connectGoogle();
      if (r.ok) await change({ driveEmail: r.email, driveEnabled: true });
    } catch (e) {
      showAppDialog("Couldn't connect Google", e?.message || "Sign-in failed. Check docs/GOOGLE_DRIVE_SETUP.md.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    await disconnectGoogle();
    await change({ driveEmail: null });
  }

  async function chooseFolder() {
    try {
      const picked = await pickBackupFolder();
      if (picked) await change({ folderUri: picked.uri, folderLabel: picked.label });
    } catch (e) {
      showAppDialog("Couldn't use that folder", "Pick another folder, or keep using the private app folder.");
    }
  }

  const next = nextBackupAt(s.lastSuccessAt);
  const row = { flexDirection: "row", alignItems: "center", gap: 10 };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <View style={row}>
        <CloudUpload size={15} color={theme.textMuted} />
        <Text style={[styles.title, { color: theme.text }]}>Backup</Text>
      </View>

      <Text style={[styles.status, { color: theme.textMuted }]}>
        Last backup: {fmtWhen(s.lastSuccessAt)}
        {s.autoEnabled ? `\nNext automatic backup: ${next ? fmtWhen(next.getTime()) : "the next time you open LAYP"}` : "\nAutomatic backup is off."}
      </Text>
      {!!s.lastError && <Text style={[styles.error, { color: ACCENT.ember }]}>Last problem: {s.lastError}</Text>}

      <View style={[row, styles.switchRow]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.text }]}>Automatic backup</Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>Every {BACKUP_INTERVAL_DAYS} days, checked when LAYP opens.</Text>
        </View>
        <Switch value={s.autoEnabled} onValueChange={(v) => change({ autoEnabled: v })} trackColor={{ true: ACCENT.leaf }} />
      </View>

      <View style={[styles.sectionRow, { borderTopColor: theme.line }]}>
        <View style={row}>
          <Smartphone size={14} color={theme.textMuted} />
          <Text style={[styles.label, { color: theme.text }]}>On this phone</Text>
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {s.folderUri ? `Saved in: ${s.folderLabel || "your chosen folder"}` : "Saved in LAYP's private folder (only LAYP can see it). Pick a folder if you want to see the files yourself."}
        </Text>
        <View style={styles.btnRow}>
          <Pressable onPress={chooseFolder} style={[styles.smallBtn, { borderColor: theme.line }]}>
            <FolderOpen size={12} color={theme.text} />
            <Text style={[styles.smallBtnText, { color: theme.text }]}>{s.folderUri ? "Change folder" : "Choose folder"}</Text>
          </Pressable>
          {!!s.folderUri && (
            <Pressable onPress={() => change({ folderUri: null, folderLabel: null })} style={[styles.smallBtn, { borderColor: theme.line }]}>
              <Text style={[styles.smallBtnText, { color: theme.text }]}>Use private folder</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.sectionRow, { borderTopColor: theme.line }]}>
        <View style={row}>
          <Cloud size={14} color={theme.textMuted} />
          <Text style={[styles.label, { color: theme.text }]}>Google Drive</Text>
        </View>
        {drive === "unavailable" && (
          <Text style={[styles.hint, { color: theme.textMuted }]}>Google sign-in isn't part of this build yet. Make a fresh build after running npm install (see docs/GOOGLE_DRIVE_SETUP.md).</Text>
        )}
        {drive === "not_configured" && (
          <Text style={[styles.hint, { color: theme.textMuted }]}>One-time setup needed: add your Google client ID to src/googleConfig.js. Steps are in docs/GOOGLE_DRIVE_SETUP.md.</Text>
        )}
        {drive === "ready" && !s.driveEmail && (
          <>
            <Text style={[styles.hint, { color: theme.textMuted }]}>Connect your Google account to also keep each backup in your Drive (in a "LAYP Backups" folder).</Text>
            <View style={styles.btnRow}>
              <Pressable onPress={connect} disabled={busy === "connect"} style={[styles.smallBtn, { backgroundColor: theme.accentDark, borderColor: theme.accentDark }]}>
                {busy === "connect" ? <ActivityIndicator size="small" color="#fff" /> : <Text style={[styles.smallBtnText, { color: "#fff" }]}>Connect Google account</Text>}
              </Pressable>
            </View>
          </>
        )}
        {drive === "ready" && !!s.driveEmail && (
          <>
            <Text style={[styles.hint, { color: theme.textMuted }]}>Connected as {s.driveEmail}{s.lastDriveAt ? `\nLast uploaded: ${fmtWhen(s.lastDriveAt)}` : ""}</Text>
            <View style={[row, styles.switchRow, { marginTop: 4 }]}>
              <Text style={[styles.label, { color: theme.text, flex: 1 }]}>Also upload to Google Drive</Text>
              <Switch value={s.driveEnabled} onValueChange={(v) => change({ driveEnabled: v })} trackColor={{ true: ACCENT.leaf }} />
            </View>
            <View style={styles.btnRow}>
              <Pressable onPress={disconnect} style={[styles.smallBtn, { borderColor: theme.line }]}>
                <Text style={[styles.smallBtnText, { color: theme.text }]}>Disconnect</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Pressable onPress={backUpNow} disabled={busy === "backup"} style={[styles.nowBtn, { backgroundColor: theme.accentDark, opacity: busy === "backup" ? 0.7 : 1 }]}>
        {busy === "backup" ? <ActivityIndicator size="small" color="#fff" /> : <CloudUpload size={15} color={ACCENT.gold} />}
        <Text style={styles.nowBtnText}>{busy === "backup" ? "Backing up..." : "Back up now"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  title: { fontSize: 14, fontWeight: "700" },
  status: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  error: { fontSize: 11, marginTop: 6, fontWeight: "600" },
  switchRow: { marginTop: 12 },
  label: { fontSize: 13, fontWeight: "600" },
  hint: { fontSize: 11.5, lineHeight: 17, marginTop: 3 },
  sectionRow: { marginTop: 12, paddingTop: 12, borderTopWidth: 1 },
  btnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  smallBtn: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  smallBtnText: { fontSize: 12, fontWeight: "700" },
  nowBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, marginTop: 14 },
  nowBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
