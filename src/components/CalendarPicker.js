import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { fmtDateLong, todayISO, toLocalISO } from "../utils";

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

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

  function jumpToday() {
    const d = new Date();
    setViewDate(d);
    onChange(toLocalISO(d));
    setOpen(false);
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={[styles.trigger, { backgroundColor: theme.bg, borderColor: open ? ACCENT.gold : "transparent" }]}
        accessibilityLabel={value ? `${label}, ${fmtDateLong(value)}` : `${label}, not set`}
      >
        <View style={[styles.triggerIconWrap, { backgroundColor: ACCENT.gold + "22" }]}>
          <CalendarDays size={12} color={ACCENT.gold} />
        </View>
        <Text style={[styles.triggerText, { color: value ? theme.text : theme.textMuted }]}>
          {value ? fmtDateLong(value) : "Select date"}
        </Text>
      </Pressable>

      {open && (
        <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={styles.navRow}>
            <Pressable
              onPress={() => setViewDate(new Date(year, month - 1, 1))}
              style={[styles.navBtn, { backgroundColor: theme.bg }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Previous month"
            >
              <ChevronLeft size={15} color={theme.text} />
            </Pressable>
            <Pressable onPress={jumpToday} accessibilityLabel="Jump to today">
              <Text style={[styles.monthLabel, { color: theme.text }]}>{monthLabel}</Text>
            </Pressable>
            <Pressable
              onPress={() => setViewDate(new Date(year, month + 1, 1))}
              style={[styles.navBtn, { backgroundColor: theme.bg }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Next month"
            >
              <ChevronRight size={15} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.weekRow}>
            {WEEKDAY_LETTERS.map((d, i) => (
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
                <Pressable
                  key={i}
                  onPress={() => pick(day)}
                  style={styles.cell}
                  accessibilityLabel={`${monthLabel} ${day}${isToday ? ", today" : ""}${isSel ? ", selected" : ""}`}
                >
                  <View style={[
                    styles.cellInner,
                    isSel && { backgroundColor: ACCENT.gold },
                    !isSel && isToday && { borderWidth: 1.5, borderColor: ACCENT.gold },
                  ]}>
                    <Text style={[styles.cellText, { color: isSel ? "#fff" : isToday ? ACCENT.gold : theme.text }]}>{day}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Pressable onPress={jumpToday} style={[styles.todayBtn, { borderTopColor: theme.line }]} accessibilityLabel="Jump to today">
            <Text style={[styles.todayBtnText, { color: ACCENT.gold }]}>Today</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  trigger: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1.5 },
  triggerIconWrap: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  triggerText: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  panel: {
    marginTop: 10, borderRadius: 20, borderWidth: 1, padding: 14,
    shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  navBtn: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  monthLabel: { fontSize: 12, fontWeight: "700" },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekDay: { flex: 1, textAlign: "center", fontSize: 9, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  cellInner: { width: "76%", height: "76%", borderRadius: 999, alignItems: "center", justifyContent: "center" },
  cellText: { fontSize: 12, fontWeight: "600" },
  todayBtn: { alignItems: "center", marginTop: 8, paddingTop: 10, borderTopWidth: 1 },
  todayBtnText: { fontSize: 11, fontWeight: "700" },
});
