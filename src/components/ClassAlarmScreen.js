import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { GraduationCap, Clock, MapPin } from "lucide-react-native";
import { ACCENT } from "../theme";
import { fmtTime12 } from "../utils";
import SlideToConfirm from "./SlideToConfirm";

// A full-screen, alarm-clock-style popup that takes over the screen when a
// class is about to start (or is starting right now). Only appears while
// the app is in the foreground -- see App.js for how it's triggered and
// see notifications.js for the OS-level notification that still fires
// separately so the reminder isn't lost if the app is backgrounded. Never
// shown unless the subject's own ClassReminder/AdvanceReminder toggle is
// on -- entirely optional per subject, matching how those toggles already
// work everywhere else in School.
export default function ClassAlarmScreen({ alarm, onDismiss }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const { block, kind, advanceMinutes } = alarm;
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  const heading = kind === "advance"
    ? `Starts in ${advanceMinutes} minute${advanceMinutes === 1 ? "" : "s"}`
    : "Starting now";

  return (
    <View style={styles.overlay}>
      <View style={styles.top}>
        <View style={styles.iconWrap}>
          <GraduationCap size={30} color={ACCENT.gold} />
        </View>
        <Text style={styles.time}>{timeStr}</Text>
        <Text style={styles.heading}>{heading}</Text>

        <View style={styles.card}>
          <Text style={styles.code}>{block.subject.code}</Text>
          <Text style={styles.desc}>{block.subject.description}</Text>
          <View style={styles.metaRow}>
            <Clock size={13} color="#ffffffaa" />
            <Text style={styles.metaText}>{fmtTime12(block.entry.startTime)} – {fmtTime12(block.entry.endTime)}</Text>
          </View>
          {!!block.subject.room && (
            <View style={styles.metaRow}>
              <MapPin size={13} color="#ffffffaa" />
              <Text style={styles.metaText}>{block.subject.room}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.bottom}>
        <SlideToConfirm
          label="Slide to confirm"
          color={ACCENT.gold}
          trackColor="#ffffff1f"
          onConfirm={onDismiss}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#0B0E17", zIndex: 999, elevation: 999,
    justifyContent: "space-between", paddingTop: 90, paddingBottom: 48, paddingHorizontal: 28,
  },
  top: { alignItems: "center" },
  iconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: "#ffffff14", alignItems: "center", justifyContent: "center", marginBottom: 18 },
  time: { fontSize: 48, fontWeight: "800", color: "#fff", fontFamily: "monospace", letterSpacing: 1 },
  heading: { fontSize: 13, fontWeight: "700", color: ACCENT.gold, marginTop: 6, marginBottom: 28, textTransform: "uppercase", letterSpacing: 0.6 },
  card: { width: "100%", backgroundColor: "#ffffff10", borderRadius: 20, padding: 20, alignItems: "center" },
  code: { fontSize: 22, fontWeight: "800", color: "#fff" },
  desc: { fontSize: 14, color: "#ffffffcc", marginTop: 4, textAlign: "center" },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  metaText: { fontSize: 12, color: "#ffffffaa", fontFamily: "monospace" },
  bottom: {},
});
