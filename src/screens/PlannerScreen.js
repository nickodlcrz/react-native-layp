import React, { useMemo, useState, useEffect } from "react";
import { Modal, View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { ChevronLeft, ChevronRight, X, CalendarDays, Clock } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, ACCENT } from "../theme";
import { buildWeekPlan, localDate, shiftDate, weekStart } from "../planner";
import { fmtTime12, fmtDay } from "../utils";
import { SurfaceCard, ActionButton, featureStyles as fs } from "../components/FeatureUI";
import useClock from "../hooks/useClock";
import { describeSchedule } from "../reminderLogic";

const time = (min) => fmtTime12(`${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);
export default function PlannerScreen({ visible, onClose, onViewTasks, ...data }) {
  const { theme } = useTheme(); const insets = useSafeAreaInsets(); const now = useClock();
  const today = localDate(now); const [start, setStart] = useState(() => weekStart(today)); const [selected, setSelected] = useState(today);
  useEffect(() => { if (visible) { setStart(weekStart(today)); setSelected(today); } }, [visible]);
  const week = useMemo(() => buildWeekPlan({ ...data, start }), [start, data.periods, data.subjects, data.entries, data.cancelledClasses, data.todos, data.reminders]);
  const day = week.find((d) => d.date === selected) || week[0];
  const move = (n) => { setStart(shiftDate(start, n)); setSelected(shiftDate(day.date, n)); };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top + 12, paddingHorizontal: 16 }}>
      <View style={[fs.row, { marginBottom: 16 }]}><View><Text style={[fs.title, { color: theme.text, fontSize: 24 }]}>Weekly planner</Text><Text style={[fs.caption, { color: theme.textMuted }]}>Classes, deadlines, and reminders together</Text></View><Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close planner"><X size={20} color={theme.textMuted} /></Pressable></View>
      <View style={[fs.row, { marginBottom: 12 }]}><Pressable onPress={() => move(-7)} hitSlop={12} accessibilityLabel="Previous week"><ChevronLeft size={20} color={theme.text} /></Pressable><Text style={{ color: theme.text, fontWeight: "700" }}>{fmtDay(start)} – {fmtDay(shiftDate(start, 6))}</Text><Pressable onPress={() => move(7)} hitSlop={12} accessibilityLabel="Next week"><ChevronRight size={20} color={theme.text} /></Pressable></View>
      <View style={styles.days}>{week.map((d) => <Pressable key={d.date} onPress={() => setSelected(d.date)} accessibilityRole="button" accessibilityLabel={`${d.date}, ${d.items.length} items`} accessibilityState={{ selected: d.date === day.date }} style={[styles.day, { backgroundColor: d.date === day.date ? ACCENT.sky : theme.card, borderColor: d.date === today ? ACCENT.sky : theme.line }]}><Text style={{ color: d.date === day.date ? "#FFF" : theme.textMuted, fontSize: 10 }}>{new Date(`${d.date}T12:00:00`).toLocaleDateString("en", { weekday: "short" })}</Text><Text style={{ color: d.date === day.date ? "#FFF" : theme.text, fontSize: 16, fontWeight: "700", marginVertical: 5 }}>{Number(d.date.slice(-2))}</Text><View style={{ height: 4, width: 4, borderRadius: 2, backgroundColor: d.items.some((i) => !i.cancelled) ? (d.date === day.date ? "#FFF" : ACCENT.sky) : "transparent" }} /></Pressable>)}</View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        <View style={[fs.row, { marginVertical: 14 }]}><Text style={[fs.title, { color: theme.text, marginBottom: 0 }]}>{day.date === today ? "Today" : fmtDay(day.date)}</Text><Pressable onPress={() => { setStart(weekStart(today)); setSelected(today); }} accessibilityRole="button"><Text style={{ color: ACCENT.sky, fontWeight: "700" }}>This week</Text></Pressable></View>
        {day.conflicts.length > 0 && <SurfaceCard><Text style={[fs.caption, { color: ACCENT.ember }]}>Some classes overlap. Check their times in School.</Text></SurfaceCard>}
        {day.items.length === 0 && <SurfaceCard><CalendarDays size={22} color={ACCENT.sky} /><Text style={[fs.title, { color: theme.text, marginTop: 10 }]}>A clear day</Text><Text style={[fs.caption, { color: theme.textMuted }]}>No scheduled classes, deadlines, or reminders.</Text></SurfaceCard>}
        {day.items.map((item) => <SurfaceCard key={item.id} style={{ opacity: item.cancelled ? 0.55 : 1, borderLeftWidth: 3, borderLeftColor: item.kind === "class" ? ACCENT.sky : item.kind === "task" ? ACCENT.gold : ACCENT.leaf }}>
          <Text style={{ color: theme.textMuted, fontSize: 11, marginBottom: 6 }}>{item.cancelled ? "Cancelled" : item.kind === "class" ? "Class" : item.kind === "task" ? "Deadline" : "Reminder"} · {item.time ? `${fmtTime12(item.time)}${item.endTime ? ` – ${fmtTime12(item.endTime)}` : ""}` : item.kind === "task" ? "By end of day" : "Any time"}</Text><Text style={[fs.title, { color: theme.text, textDecorationLine: item.cancelled ? "line-through" : "none" }]}>{item.title}</Text><Text style={[fs.caption, { color: theme.textMuted }]}>{item.detail}</Text>
        </SurfaceCard>)}
        <SurfaceCard><View style={[fs.row, { justifyContent: "flex-start", marginBottom: 8 }]}><Clock size={16} color={ACCENT.sky} /><Text style={[fs.title, { color: theme.text, marginBottom: 0 }]}>Time for studying</Text></View><Text style={[fs.caption, { color: theme.textMuted, marginBottom: 12 }]}>Open time between classes, 8 AM–8 PM. Your other commitments may use these gaps.</Text>{day.free.length ? day.free.map((gap) => <Text key={gap.startMin} style={{ color: theme.text, fontSize: 13, marginBottom: 8 }}>{time(gap.startMin)} – {time(gap.endMin)} · {Math.floor((gap.endMin - gap.startMin) / 60)}h {(gap.endMin - gap.startMin) % 60}m</Text>) : <Text style={[fs.caption, { color: theme.textMuted }]}>No gaps of at least 30 minutes.</Text>}</SurfaceCard>
        {data.reminders?.some((r) => !r.done && (r.scheduleKind === "interval" || (!r.remindDate && !r.remindTime))) && <SurfaceCard><Text style={[fs.title, { color: theme.text }]}>Flexible reminders</Text>{data.reminders.filter((r) => !r.done && (r.scheduleKind === "interval" || (!r.remindDate && !r.remindTime))).map((r) => <View key={r.id} style={{ marginTop: 8 }}><Text style={{ color: theme.text, fontWeight: "600" }}>{r.text}</Text><Text style={[fs.caption, { color: theme.textMuted }]}>{describeSchedule(r) || "No fixed time"}</Text></View>)}</SurfaceCard>}
        <ActionButton label="Open tasks & reminders" onPress={() => { onClose(); onViewTasks(); }} />
      </ScrollView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({ days: { flexDirection: "row", gap: 5 }, day: { flex: 1, borderWidth: 1, borderRadius: 14, alignItems: "center", paddingVertical: 10 } });
