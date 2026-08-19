import React from "react";
import { Pressable, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme";

export default function Chip({ label, color, active, onPress, small }) {
  const { theme } = useTheme();
  // When no explicit accent color is passed (status filters like
  // Active/Finished/All/Unpaid/Paid/Settled), the border and inactive-state
  // text need to stay theme-aware (theme.text) so they're visible against
  // theme.card in both modes -- but the active-state *background* needs to
  // stay a guaranteed-dark color (theme.accentDark) regardless of theme,
  // since the active-state text is hardcoded white below. Using theme.text
  // for both would make the active background white in dark mode, which
  // combined with white text is invisible.
  const borderTextColor = color || theme.text;
  const activeBgColor = color || theme.accentDark;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        small ? styles.small : styles.regular,
        { borderColor: borderTextColor, backgroundColor: active ? activeBgColor : "transparent" },
      ]}
    >
      <Text style={[styles.label, small && styles.labelSmall, { color: active ? "#fff" : borderTextColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: 999, borderWidth: 1.5, marginRight: 8 },
  regular: { paddingHorizontal: 12, paddingVertical: 6 },
  small: { paddingHorizontal: 10, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: "600" },
  labelSmall: { fontSize: 10 },
});
