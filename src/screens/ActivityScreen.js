import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useTheme, ACCENT } from "../theme";
import { peso } from "../utils";
import { categoryBreakdown, monthlyTrend } from "../selectors";
import PieChart from "../components/PieChart";
import BarChart from "../components/BarChart";
import EmptyState from "../components/EmptyState";

export default function ActivityScreen({ expenses, moneyLog, splits }) {
  const { theme } = useTheme();
  const now = new Date();

  const categories = categoryBreakdown(expenses, splits, now);
  const monthTotal = categories.reduce((s, c) => s + c.amount, 0);
  const trend = monthlyTrend({ moneyLog, expenses }, 6, now);
  const trendMax = Math.max(1, ...trend.map((t) => Math.max(t.income, t.spent)));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={[styles.h1, { color: theme.text }]}>Activity</Text>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.h2, { color: theme.text }]}>This month by category</Text>
        {categories.length === 0 ? (
          <EmptyState text="Add an expense to see your category breakdown." />
        ) : (
          <>
            <PieChart
              data={categories.map((c) => ({ label: c.label, value: c.amount, color: c.color }))}
              centerValue={peso(monthTotal)}
              centerLabel="spent"
              theme={theme}
            />
            <View style={{ marginTop: 14, gap: 8 }}>
              {categories.map((c) => {
                const share = monthTotal ? (c.amount / monthTotal) * 100 : 0;
                return (
                  <View key={c.id} style={styles.legendRow}>
                    <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                    <Text style={[styles.legendLabel, { color: theme.text }]}>{c.label}</Text>
                    <Text style={[styles.legendValue, { color: theme.textMuted }]}>{peso(c.amount)} · {share.toFixed(0)}%</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.h2, { color: theme.text }]}>Income vs. spending -- last 6 months</Text>
        <View style={styles.legendInline}>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: ACCENT.leaf }]} />
            <Text style={[styles.legendLabel, { color: theme.textMuted }]}>Income</Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: ACCENT.ember }]} />
            <Text style={[styles.legendLabel, { color: theme.textMuted }]}>Spent</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <BarChart
            data={trend.map((t) => ({ label: t.label, value: t.income, color: ACCENT.leaf }))}
            theme={theme}
          />
        </View>
        <View style={{ marginTop: -8 }}>
          <BarChart
            data={trend.map((t) => ({ label: t.label, value: t.spent, color: ACCENT.ember }))}
            theme={theme}
          />
        </View>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          Bars share a scale of {peso(trendMax)} per month, income above and spending below, so you can compare month to month at a glance.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "800", marginBottom: 12 },
  h2: { fontSize: 13, fontWeight: "700", marginBottom: 12 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 14 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { fontSize: 11.5, fontWeight: "600", flex: 1 },
  legendValue: { fontSize: 11, fontFamily: "monospace" },
  legendInline: { flexDirection: "row", gap: 16, marginBottom: 10 },
  hint: { fontSize: 10, lineHeight: 14, marginTop: 8 },
});
