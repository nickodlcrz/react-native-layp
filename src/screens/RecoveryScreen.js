import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import { AlertTriangle, FileUp, SkipForward } from "lucide-react-native";
import { ACCENT } from "../theme";
import { validateBackup } from "../backupSchema";

// Shown once, on launch, only when storage.js reports the stored data
// couldn't be read at all (loadState() returned __totalCorruption) --
// e.g. a bad write left the single legacy blob as invalid JSON. Rather
// than the app just quietly continuing with empty defaults and the
// person discovering days later that their whole budget/task history is
// gone with no explanation, this stops and offers the one real recovery
// path available: importing a backup file they exported earlier. There's
// no backup LAYP keeps automatically -- "restore last backup" here means
// the last one the person themselves saved via Settings -> Export.
export default function RecoveryScreen({ theme, onRestore, onSkip }) {
  const [busy, setBusy] = useState(false);

  async function pickAndRestore() {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      setBusy(true);
      const raw = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      const parsed = validateBackup(raw);
      setBusy(false);
      if (!parsed.ok) {
        Alert.alert("Backup not recognized", parsed.error);
        return;
      }
      onRestore(parsed.data);
    } catch (e) {
      setBusy(false);
      Alert.alert("Restore failed", "Couldn't read that file.");
    }
  }

  function confirmSkip() {
    Alert.alert(
      "Start fresh?",
      "This clears the unreadable data and starts LAYP over with nothing filled in. If you have a backup file, restoring it is the only way to get your data back after this.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Start fresh", style: "destructive", onPress: onSkip },
      ]
    );
  }

  return (
    <View style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.center}>
        <View style={[styles.iconWrap, { backgroundColor: ACCENT.ember + "22" }]}>
          <AlertTriangle size={28} color={ACCENT.ember} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Your saved data couldn't be read</Text>
        <Text style={[styles.body, { color: theme.textMuted }]}>
          LAYP's stored data on this device came back unreadable on launch -- most likely an interrupted write. Nothing has been deleted yet. If you've exported a backup before, restoring it now is the safest way to get everything back.
        </Text>

        <Pressable onPress={pickAndRestore} disabled={busy} style={[styles.primaryBtn, { backgroundColor: ACCENT.sky, opacity: busy ? 0.6 : 1 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : (
            <>
              <FileUp size={16} color="#fff" />
              <Text style={styles.primaryBtnText}>Restore from backup file</Text>
            </>
          )}
        </Pressable>

        <Pressable onPress={confirmSkip} disabled={busy} style={styles.skipBtn}>
          <SkipForward size={14} color={theme.textMuted} />
          <Text style={[styles.skipBtnText, { color: theme.textMuted }]}>Start fresh instead</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  iconWrap: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 17, fontWeight: "800", textAlign: "center", marginBottom: 8 },
  body: { fontSize: 12.5, lineHeight: 18, textAlign: "center", marginBottom: 24 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, width: "100%" },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  skipBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, padding: 8 },
  skipBtnText: { fontSize: 12.5, fontWeight: "600" },
});
