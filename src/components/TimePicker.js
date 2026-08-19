import React, { useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Bell } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { fmtTime12 } from "../utils";

const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function TimePicker({ value, onChange, label }) {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [h24, m] = (value || "08:00").split(":").map(Number);
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const ap = h24 >= 12 ? "PM" : "AM";

  function set(newH12, newM, newAp) {
    let h = newH12 % 12;
    if (newAp === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${String(newM).padStart(2, "0")}`);
  }

  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <Pressable onPress={() => setOpen((o) => !o)} style={[styles.trigger, { backgroundColor: theme.bg }]}>
        <Bell size={12} color={theme.textMuted} />
        <Text style={[styles.triggerText, { color: theme.text }]}>{fmtTime12(value)}</Text>
      </Pressable>
      {open && (
        <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.sub, { color: theme.textMuted }]}>Hour</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {HOURS.map((hh) => (
              <Pressable key={hh} onPress={() => set(hh, m, ap)} style={[styles.chip, { backgroundColor: hh === h12 ? ACCENT.gold : theme.bg }]}>
                <Text style={[styles.chipText, { color: hh === h12 ? "#fff" : theme.text }]}>{hh}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Text style={[styles.sub, { color: theme.textMuted }]}>Minute</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
            {MINUTES.map((mm) => (
              <Pressable key={mm} onPress={() => set(h12, mm, ap)} style={[styles.chip, { backgroundColor: mm === m ? ACCENT.gold : theme.bg }]}>
                <Text style={[styles.chipText, { color: mm === m ? "#fff" : theme.text }]}>{String(mm).padStart(2, "0")}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
            {["AM", "PM"].map((a) => (
              <Pressable key={a} onPress={() => set(h12, m, a)} style={[styles.apBtn, { backgroundColor: a === ap ? theme.accentDark : theme.bg }]}>
                <Text style={[styles.apText, { color: a === ap ? "#fff" : theme.text }]}>{a}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={() => setOpen(false)} style={styles.doneBtn}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
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
  sub: { fontSize: 8, fontWeight: "700", textTransform: "uppercase", marginBottom: 6 },
  chip: { width: 34, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 6 },
  chipText: { fontSize: 11, fontWeight: "600" },
  apBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center" },
  apText: { fontSize: 11, fontWeight: "700" },
  doneBtn: { paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: "#3E7C59" },
  doneText: { fontSize: 11, fontWeight: "700", color: "#fff" },
});
