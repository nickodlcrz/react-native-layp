import React from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { Bell, Heart } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";

// A flat, scrollable "everything that's due right now" list -- general
// Reminders in popup mode, GF Notes with a popup frequency set, and GF
// Promises in popup mode all feed into this one collector (see App.js),
// so the popup itself just renders whatever it's handed rather than
// knowing about any one source. Each item is tagged with a small heart
// icon when it came from the GF module, so it's still clear at a glance
// where a "call her tonight" came from even mixed in with a plain note.
export default function RemindPopup({ visible, items, onDismiss }) {
  const { theme } = useTheme();
  if (!items?.length) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={styles.header}>
            <Bell size={16} color={ACCENT.gold} />
            <Text style={[styles.title, { color: theme.text }]}>Don't forget</Text>
          </View>
          <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 4 }}>
            {items.map((it) => (
              <View key={it.id} style={[styles.itemRow, { borderColor: theme.line }]}>
                {it.gf && <Heart size={11} color={ACCENT.rose} fill={ACCENT.rose} />}
                <Text style={[styles.itemText, { color: theme.text, flex: 1 }]}>{it.text}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable onPress={onDismiss} style={[styles.dismissBtn, { backgroundColor: ACCENT.gold }]}>
            <Text style={styles.dismissBtnText}>Got it</Text>
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
  itemRow: { flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1, paddingVertical: 8 },
  itemText: { fontSize: 13, fontWeight: "500" },
  dismissBtn: { marginTop: 12, borderRadius: 12, alignItems: "center", paddingVertical: 11 },
  dismissBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
