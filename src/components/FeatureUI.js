import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useTheme, ACCENT } from "../theme";

export function SurfaceCard({ children, style }) {
  const { theme } = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }, style]}>{children}</View>;
}
export function ActionButton({ label, onPress, disabled, secondary, style, accessibilityLabel }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, { backgroundColor: secondary ? theme.text + "0D" : ACCENT.sky, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }, style]}>
    <Text style={[styles.buttonText, { color: secondary ? theme.text : "#FFFFFF" }]}>{label}</Text>
  </Pressable>;
}
export const featureStyles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  caption: { fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
});
const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 20, padding: 16, marginBottom: 14 },
  button: { minHeight: 40, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: "center", justifyContent: "center" },
  buttonText: { fontSize: 12, fontWeight: "700", textAlign: "center" },
});
