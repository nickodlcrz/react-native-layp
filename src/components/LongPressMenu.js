import React from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Pencil, Trash2 } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";

// The Edit / Delete menu that opens when a list item is long-pressed (the
// Remember list uses this in place of inline Edit/Delete buttons).
// `menu` is { title, onEdit?, onDelete } or null when closed.
//
// The chosen action runs slightly after the menu starts closing rather than
// immediately: Edit opens an edit sheet and Delete opens the confirm dialog,
// both of which are their own modals, and iOS can refuse to present one
// while another is still on its way out.
const ACTION_DELAY_MS = 300;

export default function LongPressMenu({ menu, onClose }) {
  const { theme } = useTheme();
  if (!menu) return null;

  function pick(fn) {
    onClose();
    if (fn) setTimeout(fn, ACTION_DELAY_MS);
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable onPress={() => {}} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text numberOfLines={2} style={[styles.title, { color: theme.textMuted }]}>{menu.title}</Text>
          {menu.onEdit && (
            <Pressable onPress={() => pick(menu.onEdit)} style={[styles.btn, { backgroundColor: theme.bg }]} accessibilityLabel="Edit">
              <Pencil size={15} color={theme.text} />
              <Text style={[styles.btnText, { color: theme.text }]}>Edit</Text>
            </Pressable>
          )}
          <Pressable onPress={() => pick(menu.onDelete)} style={[styles.btn, { backgroundColor: ACCENT.ember + "1a" }]} accessibilityLabel="Delete">
            <Trash2 size={15} color={ACCENT.ember} />
            <Text style={[styles.btnText, { color: ACCENT.ember }]}>Delete</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.cancel} accessibilityLabel="Cancel">
            <Text style={[styles.btnText, { color: theme.textMuted }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 28 },
  card: { width: "100%", maxWidth: 320, borderWidth: 1, borderRadius: 22, padding: 16, gap: 8 },
  title: { fontSize: 12, fontWeight: "600", marginBottom: 4, textAlign: "center" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 14 },
  btnText: { fontSize: 14, fontWeight: "700" },
  cancel: { alignItems: "center", paddingVertical: 10 },
});
