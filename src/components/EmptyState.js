import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme";

export default function EmptyState({ text }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.text, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, paddingVertical: 32, alignItems: "center", borderWidth: 1, borderStyle: "dashed" },
  text: { fontSize: 12 },
});
