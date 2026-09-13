import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useTheme } from "../theme";

// Two distinct looks live in this one component, chosen by whether a
// `color` was passed in:
//
// - Category/account/split selectors (color passed) -- a neutral
//   border+background with a small colored dot ahead of the label, so a
//   row of these reads as one calm set of pills instead of a wall of
//   competing colored outlines. The color still carries the meaning, just
//   moved from the whole chip's border onto a small swatch.
// - Plain status filters (no color -- Active/Unpaid/Paid/All/etc.) --
//   unchanged pill shape, but the active-state fill is now
//   theme.neutralDark (a dark gray) instead of theme.accentDark (indigo),
//   so indigo stays reserved for primary buttons and money totals rather
//   than every selected filter in the app.
export default function Chip({ label, color, active, onPress, small }) {
  const { theme } = useTheme();

  if (color) {
    return (
      <Pressable
        onPress={onPress}
        style={[
          styles.base,
          small ? styles.small : styles.regular,
          {
            borderColor: active ? theme.text : theme.line,
            backgroundColor: active ? theme.card : "transparent",
          },
        ]}
      >
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={[styles.label, small && styles.labelSmall, { color: theme.text, fontWeight: active ? "700" : "600" }]}>{label}</Text>
      </Pressable>
    );
  }

  const activeBgColor = theme.neutralDark;
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.base,
        small ? styles.small : styles.regular,
        { borderColor: theme.text, backgroundColor: active ? activeBgColor : "transparent" },
      ]}
    >
      <Text style={[styles.label, small && styles.labelSmall, { color: active ? "#fff" : theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", borderRadius: 999, borderWidth: 1.5, marginRight: 8 },
  regular: { paddingHorizontal: 12, paddingVertical: 6 },
  small: { paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 6 },
  label: { fontSize: 11, fontWeight: "600" },
  labelSmall: { fontSize: 10 },
});
