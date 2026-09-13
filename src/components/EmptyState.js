import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Inbox } from "lucide-react-native";
import { useTheme } from "../theme";

// A small icon-in-a-circle "illustration" above the message instead of
// plain text alone -- every call site can pass a fitting lucide icon
// (Receipt for bills, HandCoins for borrowing, PiggyBank for goals, etc.);
// falls back to a generic inbox glyph if none is given.
export default function EmptyState({ text, icon: Icon = Inbox }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <View style={[styles.iconWrap, { backgroundColor: theme.bg }]}>
        <Icon size={20} color={theme.textMuted} />
      </View>
      <Text style={[styles.text, { color: theme.textMuted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 16, paddingVertical: 28, paddingHorizontal: 20, alignItems: "center", borderWidth: 1, borderStyle: "dashed" },
  iconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  text: { fontSize: 12, textAlign: "center" },
});
