import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, Pressable, StyleSheet } from "react-native";
import { Info, AlertTriangle, XCircle } from "lucide-react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme, ACCENT } from "../theme";
import { hapticImpact, hapticSuccess } from "../haptics";

let present = null;

export function showAppDialog(title, message = "", buttons = [{ text: "OK", style: "default" }]) {
  present?.({ title, message, buttons: buttons?.length ? buttons : [{ text: "OK", style: "default" }] });
}

function iconFor(buttons) {
  if (buttons?.some((b) => b.style === "destructive")) return { Icon: XCircle, color: ACCENT.ember };
  if (buttons?.length > 1) return { Icon: AlertTriangle, color: ACCENT.gold };
  return { Icon: Info, color: ACCENT.sky };
}

export default function AppDialogHost() {
  const { theme, dark } = useTheme();
  const [state, setState] = useState(null);
  const progress = useSharedValue(0);
  const busy = useRef(false);

  useEffect(() => {
    present = setState;
    return () => { present = null; };
  }, []);

  useEffect(() => {
    if (!state) return;
    busy.current = false;
    progress.value = 0;
    progress.value = withTiming(1, { duration: 170, easing: Easing.out(Easing.cubic) });
  }, [state]);

  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 18 }, { scale: 0.97 + 0.03 * progress.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  function close() {
    progress.value = withTiming(0, { duration: 120 });
    setTimeout(() => setState(null), 120);
  }

  if (!state) return null;
  const { Icon, color } = iconFor(state.buttons);
  const primary = state.buttons[state.buttons.length - 1];

  const run = (button) => {
    if (busy.current) return;
    busy.current = true;
    if (button.style === "destructive") hapticImpact(); else hapticSuccess();
    close();
    setTimeout(() => { busy.current = false; button.onPress?.(); }, 120);
  };

  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={close}>
      <Animated.View style={[StyleSheet.absoluteFillObject, styles.backdrop, backdropStyle]} />
      <Pressable style={styles.dismissLayer} onPress={close} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }, panelStyle]}>
          <View style={styles.topRow}>
            <View style={[styles.iconWrap, { backgroundColor: `${color}18` }]}>
              <Icon size={19} color={color} strokeWidth={2.2} />
            </View>
            <Pressable onPress={close} hitSlop={10} accessibilityLabel="Close dialog" style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: theme.textMuted }]}>×</Text>
            </Pressable>
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{state.title}</Text>
          {!!state.message && <Text style={[styles.message, { color: theme.textMuted }]}>{state.message}</Text>}
          <View style={styles.actions}>
            {state.buttons.slice(0, -1).map((b, i) => (
              <Pressable key={`${b.text}-${i}`} onPress={() => b.style === "cancel" ? close() : run(b)} style={({ pressed }) => [styles.secondary, { borderColor: theme.line, backgroundColor: theme.bg, opacity: pressed ? 0.72 : 1 }]}>
                <Text style={[styles.actionText, { color: theme.text }]}>{b.text}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => run(primary)} style={({ pressed }) => [styles.primary, { backgroundColor: primary.style === "destructive" ? ACCENT.ember : theme.accentDark, opacity: pressed ? 0.84 : 1 }]}>
              <Text style={[styles.primaryText, { color: "#FFFFFF" }]}>{primary.text}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(0,0,0,0.62)" },
  dismissLayer: { ...StyleSheet.absoluteFillObject },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  card: { width: "100%", maxWidth: 380, borderRadius: 22, borderWidth: 1, padding: 18, shadowColor: "#000", shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.3, shadowRadius: 28, elevation: 12 },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  iconWrap: { width: 40, height: 40, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  closeBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 26, lineHeight: 28, fontWeight: "300" },
  title: { marginTop: 15, fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  message: { marginTop: 7, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  secondary: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  primary: { flex: 1, minHeight: 46, borderRadius: 15, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  actionText: { fontSize: 13, fontWeight: "700" },
  primaryText: { fontSize: 13, fontWeight: "800" },
});
