import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme, ACCENT } from "../theme";
import { peso } from "../utils";
import { SurfaceCard, featureStyles as fs } from "./FeatureUI";
import Chip from "./Chip";
import SegmentedTabs from "./SegmentedTabs";
import { DEFAULT_WIDGET_PREFS, normalizeWidgetPrefs } from "../widgetPrefsLogic";

export default function WidgetCustomization({ prefs, onChange, accounts = [], subjects = [], todos = [], hidden = false }) {
  const { theme } = useTheme(); const [preview, setPreview] = useState("classes"); const p = normalizeWidgetPrefs(prefs);
  const change = (key, value) => onChange({ ...p, [key]: value });
  const selectedSubjects = subjects.filter((s) => p.subjectIds === null || p.subjectIds.includes(s.id));
  const tasks = todos.filter((t) => !t.completed && (!t.subjectId || p.subjectIds === null || p.subjectIds.includes(t.subjectId)));
  const visibleAccounts = accounts.filter((a) => p.accountIds === null || p.accountIds.includes(a.id));
  const text = { color: "#FFF", fontSize: 14 * p.fontScale, fontWeight: "600" };
  function filter(key, choices) {
    const selected = p[key];
    return <View style={{ gap: 8, marginTop: 8 }}><View style={fs.row}><Pressable onPress={() => change(key, null)} accessibilityRole="button"><Text style={{ color: ACCENT.sky, fontWeight: "700" }}>All</Text></Pressable><Pressable onPress={() => change(key, [])} accessibilityRole="button"><Text style={{ color: theme.textMuted }}>None</Text></Pressable></View><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{choices.map((item) => <Chip key={item.id} label={item.label || item.code || item.description} small active={selected === null || selected.includes(item.id)} onPress={() => {
      const ids = selected === null ? choices.map((c) => c.id) : selected;
      change(key, ids.includes(item.id) ? ids.filter((id) => id !== item.id) : [...ids, item.id]);
    }} />)}</View>{choices.length === 0 && <Text style={[fs.caption, { color: theme.textMuted }]}>Add accounts or subjects in the app to choose them here.</Text>}</View>;
  }
  return <>
    <SurfaceCard><Text style={[fs.title, { color: theme.text }]}>Widget appearance</Text><Text style={[fs.caption, { color: theme.textMuted, marginBottom: 12 }]}>One dark transparent theme, adjusted for your wallpaper.</Text>
      <Text style={{ color: theme.text, fontWeight: "600", marginBottom: 8 }}>Text size</Text><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{[[0.9, "Small"], [1, "Standard"], [1.15, "Large"]].map(([value, label]) => <Chip key={value} label={label} active={p.fontScale === value} onPress={() => change("fontScale", value)} />)}</View>
      <Text style={{ color: theme.text, fontWeight: "600", marginTop: 16, marginBottom: 8 }}>Background opacity</Text><View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{[[0.35, "Clear · 35%"], [0.65, "Balanced · 65%"], [0.85, "Readable · 85%"]].map(([value, label]) => <Chip key={value} label={label} active={p.opacity === value} onPress={() => change("opacity", value)} />)}</View>
      <View style={{ marginTop: 18 }}><SegmentedTabs options={[{ key: "classes", label: "Classes" }, { key: "tasks", label: "Tasks" }, { key: "budget", label: "Budget" }]} value={preview} onChange={setPreview} />
        <View style={{ backgroundColor: "#6C7D9C", padding: 16, borderRadius: 20 }}><View style={{ backgroundColor: `rgba(0,0,0,${p.opacity})`, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: "#FFFFFF38", minHeight: 150 }}>
          <Text style={[text, { fontSize: 12 * p.fontScale, marginBottom: 14 }]}>{preview === "classes" ? "Classes today" : preview === "tasks" ? "Tasks" : "Account budget"}</Text>
          {preview === "classes" && <><Text style={[text, { fontSize: 22 * p.fontScale }]}>{selectedSubjects[0]?.code || (subjects.length ? "No subjects selected" : "EE12")}</Text><Text style={[text, { fontSize: 11 * p.fontScale, color: "#FFFFFFCC", marginTop: 10 }]}>{selectedSubjects.length || !subjects.length ? "Sample class · 9:00 AM – 10:30 AM" : "Choose a subject to show its classes"}</Text></>}
          {preview === "tasks" && (tasks.length ? tasks.slice(0, 2) : [{ id: "sample", title: "Sample assignment", subtasks: [{ done: true }, { done: false }] }]).map((t) => <View key={t.id} style={{ marginBottom: 12 }}><Text style={text}>{t.title}</Text>{t.subtasks?.length > 0 && <Text style={[text, { fontSize: 11 * p.fontScale, marginTop: 4, color: "#9CE8CC" }]}>{t.subtasks.filter((s) => s.done).length}/{t.subtasks.length} steps completed</Text>}</View>)}
          {preview === "budget" && (visibleAccounts.length ? visibleAccounts.slice(0, 2) : accounts.length ? [] : [{ id: "sample", label: "Sample account" }]).map((a) => <View key={a.id} style={{ marginBottom: 12 }}><Text style={[text, { fontSize: 11 * p.fontScale }]}>{a.label}</Text><Text style={[text, { fontSize: 20 * p.fontScale, marginTop: 4 }]}>{hidden ? "••••" : a.balance != null ? peso(a.balance) : "₱1,250.00"}</Text></View>)}
          {preview === "budget" && accounts.length > 0 && !visibleAccounts.length && <Text style={text}>No accounts selected</Text>}
        </View></View><Text style={[fs.caption, { color: theme.textMuted, marginTop: 8 }]}>Appearance preview. Class times and sample balances are illustrative; your launcher controls the final size.</Text></View>
    </SurfaceCard>
    <SurfaceCard><Text style={[fs.title, { color: theme.text }]}>Visible accounts</Text><Text style={[fs.caption, { color: theme.textMuted }]}>Choose accounts for the budget widget. Quick logging still offers every account.</Text>{filter("accountIds", accounts)}</SurfaceCard>
    <SurfaceCard><Text style={[fs.title, { color: theme.text }]}>Visible subjects</Text><Text style={[fs.caption, { color: theme.textMuted }]}>Choose subjects for class and school-task widgets. Other tasks and class alarms stay active.</Text>{filter("subjectIds", subjects)}</SurfaceCard>
    <Pressable accessibilityRole="button" onPress={() => onChange({ ...p, fontScale: DEFAULT_WIDGET_PREFS.fontScale, opacity: DEFAULT_WIDGET_PREFS.opacity, accountIds: null, subjectIds: null })} style={{ paddingVertical: 12, marginBottom: 10 }}><Text style={{ color: ACCENT.sky, textAlign: "center", fontWeight: "700" }}>Reset appearance and visibility</Text></Pressable>
  </>;
}
