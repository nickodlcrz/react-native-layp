import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { fmtDateLong, todayISO, toLocalISO } from "../utils";

export default function CalendarPicker({ value, onChange, label }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date((value || todayISO()) + "T00:00:00"));

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = viewDate.toLocaleDateString("en-PH", { month: "long", year: "numeric" });

  function pick(day) {
    const d = new Date(year, month, day);
    onChange(toLocalISO(d));
    setOpen(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Pressable onPress={() => setOpen((o) => !o)} style={[styles.trigger, { backgroundColor: theme.bg }]}>
        <CalendarDays size={12} color={theme.textMuted} />
        <Text style={[styles.triggerText, { color: theme.text }]}>{value ? fmtDateLong(value) : "Select date"}</Text>
      </Pressable>
      {open && (
        <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={styles.navRow}>
            <Pressable onPress={() => setViewDate(new Date(year, month - 1, 1))}><ChevronLeft size={15} color={theme.textMuted} /></Pressable>
            <Text style={[styles.monthLabel, { color: theme.text }]}>{monthLabel}</Text>
            <Pressable onPress={() => setViewDate(new Date(year, month + 1, 1))}><ChevronRight size={15} color={theme.textMuted} /></Pressable>
          </View>
          <View style={styles.weekRow}>
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <Text key={i} style={[styles.weekDay, { color: theme.textMuted }]}>{d}</Text>
            ))}
          </View>
          <View style={styles.grid}>
            {cells.map((day, i) => {
              if (!day) return <View key={i} style={styles.cell} />;
              const dStr = toLocalISO(new Date(year, month, day));
              const isSel = dStr === value;
              const isToday = dStr === todayISO();
              return (
                <Pressable key={i} onPress={() => pick(day)} style={[styles.cell, isSel && { backgroundColor: ACCENT.gold, borderRadius: 8 }]}>
                  <Text style={[styles.cellText, { color: isSel ? "#fff" : isToday ? ACCENT.gold : theme.text }]}>{day}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  trigger: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  triggerText: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  panel: { marginTop: 8, borderRadius: 16, borderWidth: 1, padding: 12 },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  monthLabel: { fontSize: 11, fontWeight: "600" },
  weekRow: { flexDirection: "row", marginBottom: 4 },
  weekDay: { flex: 1, textAlign: "center", fontSize: 8, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  cellText: { fontSize: 11, fontWeight: "600" },
});
