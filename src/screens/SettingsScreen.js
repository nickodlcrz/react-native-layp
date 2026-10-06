import React, { useState, useEffect } from "react";
import { View, Text, Pressable, Modal, ScrollView, StyleSheet } from "react-native";
import { X, Sun, Moon, Lock, Check, Heart, Info } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, ACCENT } from "../theme";
import { AUTO_LOCK_OPTIONS } from "../autoLockPreference";
import { EVENT_KINDS } from "../widgetEvents";
import { ALL_EVENT_KINDS, toggleKind } from "../widgetPrefsLogic";
import SegmentedTabs from "../components/SegmentedTabs";
import Chip from "../components/Chip";
import SummaryScreen from "./SummaryScreen";
import { showAppDialog } from "../components/AppDialog";

const TABS = [
  { key: "general", label: "General" },
  { key: "widgets", label: "Widgets" },
  { key: "summary", label: "Summary" },
];

// Everything that used to be scattered -- the Summary screen, the light/dark
// button, the app-lock timeout -- plus the new widget options, behind the one
// gear button in the header.
export default function SettingsScreen({
  visible, onClose, initialTab = "general",
  dark, setDark,
  autoLockMinutes, onChangeAutoLockMinutes,
  widgetPrefs, onChangeWidgetPrefs,
  gfScreenEnabled, onChangeGfScreenEnabled,
  summaryProps,
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState(initialTab);
  useEffect(() => { if (visible) setTab(initialTab); }, [visible, initialTab]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top + 8 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.h1, { color: theme.text }]}>Settings</Text>
          <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close settings">
            <X size={20} color={theme.textMuted} />
          </Pressable>
        </View>
        <SegmentedTabs options={TABS} value={tab} onChange={setTab} style={{ marginHorizontal: 16, marginBottom: 12 }} />

        {tab === "general" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
            <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>Appearance</Text>
            <View style={styles.themeRow}>
              {[{ id: false, label: "Light", Icon: Sun }, { id: true, label: "Dark", Icon: Moon }].map(({ id, label, Icon }) => {
                const active = dark === id;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setDark(id)}
                    style={[styles.themeCard, { backgroundColor: active ? theme.accentDark : theme.card, borderColor: active ? theme.accentDark : theme.line }]}
                    accessibilityLabel={`${label} mode`}
                    accessibilityState={{ selected: active }}
                  >
                    <Icon size={18} color={active ? ACCENT.gold : theme.textMuted} />
                    <Text style={[styles.themeLabel, { color: active ? "#fff" : theme.text }]}>{label}</Text>
                    {active && <Check size={14} color="#fff" />}
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 22 }]}>Lock screen timeout</Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <View style={styles.cardHead}>
                <Lock size={13} color={theme.textMuted} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>Ask for the PIN again</Text>
              </View>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                How long LAYP can stay open in the background before it needs your PIN again.
              </Text>
              <View style={styles.chipWrap}>
                {AUTO_LOCK_OPTIONS.map((opt) => (
                  <Chip key={opt.label} label={opt.label} small active={autoLockMinutes === opt.minutes} onPress={() => onChangeAutoLockMinutes(opt.minutes)} />
                ))}
              </View>
            </View>

            <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 22 }]}>Private features</Text>
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <View style={styles.cardHead}>
                <Heart size={14} color={ACCENT.rose} />
                <Text style={[styles.cardTitle, { color: theme.text, flex: 1 }]}>GF Screen</Text>
                <Pressable
                  onPress={() => showAppDialog(
                    "GF Screen",
                    "A private space for relationship notes, likes, dates, gift ideas, and promises. Turning this off only hides the GF screen and its heart button; your saved GF data is kept."
                  )}
                  hitSlop={10}
                  accessibilityLabel="GF Screen details"
                >
                  <Info size={16} color={theme.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.hint, { color: theme.textMuted }]}>
                Show the private GF space and the heart shortcut in the LAYP header.
              </Text>
              <Pressable
                onPress={() => onChangeGfScreenEnabled(!gfScreenEnabled)}
                style={[styles.toggleRow, { marginTop: 12 }]}
                accessibilityLabel={gfScreenEnabled ? "Turn off GF Screen" : "Turn on GF Screen"}
                accessibilityRole="switch"
                accessibilityState={{ checked: gfScreenEnabled }}
              >
                <Text style={[styles.toggleLabel, { color: theme.text }]}>{gfScreenEnabled ? "On" : "Off"}</Text>
                <View style={[styles.toggleTrack, { backgroundColor: gfScreenEnabled ? ACCENT.rose : theme.line }]}>
                  <View style={[styles.toggleThumb, { backgroundColor: "#fff", transform: [{ translateX: gfScreenEnabled ? 18 : 2 }] }]} />
                </View>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {tab === "widgets" && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}>
            <KindPicker
              title="Calendar widget"
              hint="Which events get a mark (heart, pencil, dot...) on the month."
              selected={widgetPrefs.calendarKinds}
              onChange={(calendarKinds) => onChangeWidgetPrefs({ ...widgetPrefs, calendarKinds })}
            />
            <KindPicker
              title="Upcoming events widget"
              hint="Which events are listed. It always covers the next 7 days, today included."
              selected={widgetPrefs.upcomingKinds}
              onChange={(upcomingKinds) => onChangeWidgetPrefs({ ...widgetPrefs, upcomingKinds })}
            />
            <Text style={[styles.footnote, { color: theme.textMuted }]}>
              Changes reach your home screen within a second or so. Dates from the GF screen show up under Dates, Anniversaries and Monthsaries -- switch those off to keep them off your home screen.
            </Text>
          </ScrollView>
        )}

        {tab === "summary" && (
          <View style={{ flex: 1, paddingHorizontal: 16 }}>
            <SummaryScreen {...summaryProps} />
          </View>
        )}
      </View>
    </Modal>
  );
}

// A card of toggle chips, one per event kind, with All / None shortcuts.
function KindPicker({ title, hint, selected, onChange }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line, marginBottom: 14 }]}>
      <View style={[styles.cardHead, { justifyContent: "space-between" }]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
        <View style={{ flexDirection: "row", gap: 14 }}>
          <Pressable onPress={() => onChange([...ALL_EVENT_KINDS])} hitSlop={8}><Text style={[styles.link, { color: theme.textMuted }]}>All</Text></Pressable>
          <Pressable onPress={() => onChange([])} hitSlop={8}><Text style={[styles.link, { color: theme.textMuted }]}>None</Text></Pressable>
        </View>
      </View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
      <View style={styles.chipWrap}>
        {EVENT_KINDS.map((k) => (
          <Chip key={k.id} label={k.label} small active={selected.includes(k.id)} onPress={() => onChange(toggleKind(selected, k.id))} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  h1: { fontSize: 22, fontWeight: "700" },
  sectionLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
  themeRow: { flexDirection: "row", gap: 10 },
  themeCard: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 20, paddingVertical: 16 },
  themeLabel: { fontSize: 13, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 22, padding: 15, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 15, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  cardTitle: { fontSize: 13, fontWeight: "700" },
  hint: { fontSize: 11.5, lineHeight: 17 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  link: { fontSize: 12, fontWeight: "700" },
  toggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  toggleLabel: { fontSize: 12, fontWeight: "700" },
  toggleTrack: { width: 38, height: 22, borderRadius: 11, justifyContent: "center" },
  toggleThumb: { width: 18, height: 18, borderRadius: 9 },
  footnote: { fontSize: 11.5, lineHeight: 17, marginTop: 2 },
});
