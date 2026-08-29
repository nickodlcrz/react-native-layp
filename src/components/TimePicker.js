import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Modal } from "react-native";
import { Bell } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { fmtTime12 } from "../utils";

const ITEM_HEIGHT = 40;
const VISIBLE_ROWS = 5; // odd number so one row sits dead center
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_ROWS;
const PAD = ITEM_HEIGHT * Math.floor(VISIBLE_ROWS / 2);

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1-12
const MINUTES = Array.from({ length: 60 }, (_, i) => i); // every minute, for finer control
const AMPM = ["AM", "PM"];

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
      <Pressable onPress={() => setOpen(true)} style={[styles.trigger, { backgroundColor: theme.bg }]} accessibilityLabel={`${label}, ${fmtTime12(value)}`}>
        <Bell size={12} color={theme.textMuted} />
        <Text style={[styles.triggerText, { color: theme.text }]}>{fmtTime12(value)}</Text>
      </Pressable>

      {/* Rendered as a Modal (its own top-level tree) rather than an inline
          panel -- this keeps the vertical scroll wheels from being nested
          inside whatever ScrollView the form itself sits in (which either
          blocks their scroll gesture or squeezes them into a half-width
          column when Start/End pickers sit side by side). */}
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.line }]} onPress={() => {}}>
            <Text style={[styles.sheetLabel, { color: theme.textMuted }]}>{label}</Text>
            <View style={styles.wheelRow}>
              <Wheel data={HOURS} selected={h12} format={(v) => String(v)} onSelect={(hh) => set(hh, m, ap)} />
              <Text style={[styles.colon, { color: theme.text }]}>:</Text>
              <Wheel data={MINUTES} selected={m} format={(v) => String(v).padStart(2, "0")} onSelect={(mm) => set(h12, mm, ap)} />
              <Wheel data={AMPM} selected={ap} format={(v) => v} onSelect={(a) => set(h12, m, a)} />
            </View>
            <Pressable onPress={() => setOpen(false)} style={[styles.doneBtn, { backgroundColor: ACCENT.leaf }]} accessibilityLabel="Done">
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// A single vertically-scrolling, snap-to-row wheel. `selected` can change
// from outside (e.g. another wheel's onSelect triggering a re-render with a
// new prop) so the scroll position is kept in sync via a ref + effect rather
// than only reacting to the user's own scroll gestures.
function Wheel({ data, selected, format, onSelect }) {
  const { theme } = useTheme();
  const listRef = useRef(null);
  const selectedIndex = data.indexOf(selected);
  const lastReportedIndex = useRef(selectedIndex);

  useEffect(() => {
    if (selectedIndex !== lastReportedIndex.current) {
      listRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false });
      lastReportedIndex.current = selectedIndex;
    }
  }, [selectedIndex]);

  function commitIndex(index) {
    const clamped = Math.max(0, Math.min(data.length - 1, index));
    lastReportedIndex.current = clamped;
    onSelect(data[clamped]);
  }

  function handleMomentumEnd(e) {
    commitIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT));
  }

  return (
    <View style={styles.wheelWrap}>
      <View pointerEvents="none" style={[styles.wheelHighlight, { borderColor: theme.line, top: PAD }]} />
      <ScrollView
        ref={listRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        nestedScrollEnabled
        contentContainerStyle={{ paddingVertical: PAD }}
        onMomentumScrollEnd={handleMomentumEnd}
        onScrollEndDrag={(e) => {
          // Covers the case where the drag ends without enough velocity to
          // trigger a momentum event at all.
          if (e.nativeEvent.velocity && Math.abs(e.nativeEvent.velocity.y) < 0.05) {
            commitIndex(Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT));
          }
        }}
        contentOffset={{ x: 0, y: selectedIndex * ITEM_HEIGHT }}
        style={{ height: WHEEL_HEIGHT }}
      >
        {data.map((v, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Pressable key={String(v)} style={styles.wheelItem} onPress={() => { listRef.current?.scrollTo({ y: i * ITEM_HEIGHT, animated: true }); commitIndex(i); }} accessibilityLabel={format(v)}>
              <Text style={[styles.wheelItemText, { color: isSelected ? ACCENT.gold : theme.textMuted, fontWeight: isSelected ? "800" : "500", fontSize: isSelected ? 18 : 14 }]}>
                {format(v)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  trigger: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  triggerText: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 24 },
  sheet: { width: 280, maxWidth: "100%", borderRadius: 20, borderWidth: 1, padding: 16 },
  sheetLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", textAlign: "center", marginBottom: 10, letterSpacing: 0.5 },
  wheelRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  colon: { fontSize: 18, fontWeight: "800", marginHorizontal: 2 },
  wheelWrap: { width: 64, height: WHEEL_HEIGHT, marginHorizontal: 4, overflow: "hidden" },
  wheelHighlight: { position: "absolute", left: 0, right: 0, height: ITEM_HEIGHT, borderTopWidth: 1, borderBottomWidth: 1 },
  wheelItem: { height: ITEM_HEIGHT, alignItems: "center", justifyContent: "center" },
  wheelItemText: { fontFamily: "monospace" },
  doneBtn: { paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  doneText: { fontSize: 12, fontWeight: "700", color: "#fff" },
});
