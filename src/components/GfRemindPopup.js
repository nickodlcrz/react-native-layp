import React from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { Heart, X } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";

// A flat, scrollable "everything you flagged to remember" list -- notes
// she mentioned and no-fixed-time promises both use the same
// `remindNextOpen` flag (set from GFScreen), so this just merges both
// kinds into one popup rather than needing separate ones per type.
export default function GfRemindPopup({ visible, items, onClose, onOpenGF }) {
  const { theme } = useTheme();
  if (!items?.length) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={styles.header}>
            <Heart size={16} color={ACCENT.rose} fill={ACCENT.rose} />
            <Text style={[styles.title, { color: theme.text }]}>Don't forget</Text>
            <Pressable onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}><X size={16} color={theme.textMuted} /></Pressable>
          </View>
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {items.map((it) => (
              <View key={it.id} style={[styles.itemRow, { borderColor: theme.line }]}>
                <Text style={[styles.itemText, { color: theme.text }]}>{it.text}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={onOpenGF} style={[styles.openBtn, { backgroundColor: ACCENT.rose }]}>
            <Text style={styles.openBtnText}>Open</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "#00000066", alignItems: "center", justifyContent: "center", padding: 24 },
  card: { width: "100%", maxWidth: 360, borderWidth: 1, borderRadius: 18, padding: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  title: { fontSize: 15, fontWeight: "800", flex: 1 },
  itemRow: { borderBottomWidth: 1, paddingVertical: 8 },
  itemText: { fontSize: 13, fontWeight: "500" },
  openBtn: { marginTop: 12, borderRadius: 12, alignItems: "center", paddingVertical: 11 },
  openBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
