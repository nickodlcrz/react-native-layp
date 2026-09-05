import React, { useEffect, useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet, Animated, Easing } from "react-native";
import { AlertTriangle } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";

// A single, modern confirmation modal used app-wide instead of RN's stock
// Alert.alert -- Alert.alert always renders as the platform's own system
// dialog (the plain gray Android AlertDialog look), which can't be themed
// to match the rest of the app at all. This is a singleton (one host
// mounted once near the app root, see ConfirmModalHost below) with a
// plain imperative API so call sites don't need their own modal state --
// confirmDelete("Delete this task?", "...", onConfirm) reads exactly like
// the old Alert-based helper did.
let showFn = null;

export function confirmAction({ title, message, confirmLabel = "Confirm", destructive = false, onConfirm }) {
  if (showFn) showFn({ title, message, confirmLabel, destructive, onConfirm });
}

// Drop-in replacement for the old utils.js confirmDelete(Alert, title, message, onConfirm)
// -- same call shape minus the now-unnecessary Alert argument.
export function confirmDelete(title, message, onConfirm) {
  confirmAction({ title, message, confirmLabel: "Delete", destructive: true, onConfirm });
}

export function ConfirmModalHost() {
  const { theme, dark } = useTheme();
  const [state, setState] = useState(null);
  const scale = React.useRef(new Animated.Value(0.92)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    showFn = (opts) => setState(opts);
    return () => { showFn = null; };
  }, []);

  useEffect(() => {
    if (!state) return;
    scale.setValue(0.92);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 9, tension: 140, useNativeDriver: true }),
    ]).start();
  }, [state]);

  if (!state) return null;

  function close() {
    setState(null);
  }

  const accent = state.destructive ? ACCENT.ember : ACCENT.gold;

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={close}>
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: theme.card, borderColor: theme.line, opacity, transform: [{ scale }] },
          ]}
        >
          {/* Swallow taps on the card itself so they don't bubble to the
              backdrop Pressable behind it and close the dialog. */}
          <Pressable onPress={() => {}}>
            <View style={[styles.iconWrap, { backgroundColor: dark ? `${accent}26` : `${accent}1a` }]}>
              <AlertTriangle size={20} color={accent} />
            </View>
            <Text style={[styles.title, { color: theme.text }]}>{state.title}</Text>
            {!!state.message && <Text style={[styles.message, { color: theme.textMuted }]}>{state.message}</Text>}
            <View style={styles.row}>
              <Pressable
                onPress={close}
                style={({ pressed }) => [styles.btn, styles.cancelBtn, { borderColor: theme.line, opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.btnText, { color: theme.text }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { close(); state.onConfirm?.(); }}
                style={({ pressed }) => [styles.btn, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.btnText, { color: "#fff" }]}>{state.confirmLabel}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 22,
    // A soft shadow so the card reads as floating above the dimmed
    // backdrop rather than flat -- matches the elevation language the rest
    // of the app already uses on cards.
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontSize: 17, fontWeight: "700", marginBottom: 6 },
  message: { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  row: { flexDirection: "row", gap: 10 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cancelBtn: { backgroundColor: "transparent", borderWidth: 1 },
  btnText: { fontSize: 14, fontWeight: "700" },
});
