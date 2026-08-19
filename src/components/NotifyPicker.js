import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { useTheme, ACCENT, WEEKDAYS } from "../theme";
import { fmtTime12 } from "../utils";
import Chip from "./Chip";
import TimePicker from "./TimePicker";

const TYPES = [
  { id: "once", label: "Once" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "interval", label: "Interval" },
  { id: "custom", label: "Custom" },
];
const WEEKDAY_PRESETS = [
  { label: "Weekdays", ids: [2, 3, 4, 5, 6] },
  { label: "Weekends", ids: [7, 1] },
  { label: "Every day", ids: [2, 3, 4, 5, 6, 7, 1] },
];
const INTERVAL_OPTIONS = [1, 2, 3, 4, 6, 8, 12];

export default function NotifyPicker({ notify, setNotify, allowOnce = true }) {
  const { theme } = useTheme();
  const type = notify.type || "daily";
  const visibleTypes = allowOnce ? TYPES : TYPES.filter((t) => t.id !== "once");

  function updateTimesList(newTimes) { setNotify({ ...notify, times: newTimes }); }

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[styles.label, { color: theme.textMuted }]}>Remind me</Text>
      <View style={styles.row}>
        {visibleTypes.map((o) => (
          <Chip key={o.id} label={o.label} color={ACCENT.sky} active={type === o.id} onPress={() => setNotify({ ...notify, type: o.id })} small />
        ))}
      </View>

      {(type === "once" || type === "daily") && (
        <TimePicker value={notify.time || "08:00"} onChange={(t) => setNotify({ ...notify, time: t })} label={type === "once" ? "Notify at" : "Notify daily at"} />
      )}

      {type === "weekly" && (
        <View>
          <Text style={[styles.label, { color: theme.textMuted }]}>Which days</Text>
          <View style={[styles.row, { marginBottom: 6 }]}>
            {WEEKDAY_PRESETS.map((p) => (
              <Chip key={p.label} label={p.label} color={ACCENT.sky}
                active={JSON.stringify([...(notify.weekdays || [])].sort()) === JSON.stringify([...p.ids].sort())}
                onPress={() => setNotify({ ...notify, weekdays: p.ids })} small />
            ))}
          </View>
          <View style={styles.row}>
            {WEEKDAYS.map((d) => {
              const active = (notify.weekdays || []).includes(d.id);
              return (
                <Pressable key={d.id}
                  onPress={() => {
                    const cur = notify.weekdays || [];
                    const next = active ? cur.filter((x) => x !== d.id) : [...cur, d.id];
                    setNotify({ ...notify, weekdays: next });
                  }}
                  style={[styles.dayCircle, { backgroundColor: active ? ACCENT.sky : theme.bg }]}
                >
                  <Text style={[styles.dayCircleText, { color: active ? "#fff" : theme.text }]}>{d.label[0]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>Tap days to customize, or use a preset above.</Text>
          <View style={{ marginTop: 10 }}>
            <TimePicker value={notify.time || "08:00"} onChange={(t) => setNotify({ ...notify, time: t })} label="Notify at" />
          </View>
        </View>
      )}

      {type === "interval" && (
        <View>
          <Text style={[styles.label, { color: theme.textMuted }]}>Every how many hours</Text>
          <View style={styles.row}>
            {INTERVAL_OPTIONS.map((hr) => (
              <Chip key={hr} label={`${hr}h`} color={ACCENT.sky} active={Number(notify.intervalHours) === hr} onPress={() => setNotify({ ...notify, intervalHours: hr })} small />
            ))}
          </View>
        </View>
      )}

      {type === "custom" && (
        <View>
          <Text style={[styles.label, { color: theme.textMuted }]}>Times</Text>
          <View style={[styles.row, { marginBottom: 8 }]}>
            {(notify.times || []).map((t) => (
              <View key={t} style={[styles.timeTag, { backgroundColor: theme.bg }]}>
                <Text style={[styles.timeTagText, { color: theme.text }]}>{fmtTime12(t)}</Text>
                <Pressable onPress={() => updateTimesList((notify.times || []).filter((x) => x !== t))}>
                  <X size={10} color={theme.textMuted} />
                </Pressable>
              </View>
            ))}
          </View>
          <TimePicker value={notify.draftTime || "08:00"} onChange={(t) => setNotify({ ...notify, draftTime: t })} label="Pick a time to add" />
          <Pressable
            onPress={() => { const t = notify.draftTime || "08:00"; if (!(notify.times || []).includes(t)) updateTimesList([...(notify.times || []), t]); }}
            style={[styles.addBtn, { backgroundColor: theme.bg }]}
          >
            <Text style={[styles.addBtnText, { color: theme.text }]}>+ Add this time</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  timeTag: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  timeTagText: { fontSize: 10, fontFamily: "monospace" },
  addBtn: { marginTop: 8, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  addBtnText: { fontSize: 11, fontWeight: "700" },
  dayCircle: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  dayCircleText: { fontSize: 11, fontWeight: "700" },
  hint: { fontSize: 9, marginTop: 6 },
});
