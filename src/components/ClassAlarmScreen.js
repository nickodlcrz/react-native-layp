import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Vibration, Alert, Pressable } from "react-native";
import { GraduationCap, Clock, MapPin, Ban } from "lucide-react-native";
import { ACCENT } from "../theme";
import { fmtTime12 } from "../utils";
import SlideToConfirm from "./SlideToConfirm";

// Buzz, pause, buzz, pause, repeating -- more like an actual alarm clock
// than a single tap-to-phone buzz. Android honors the full repeating
// pattern natively. iOS's Vibration API only supports one fixed-length
// buzz per call and ignores custom patterns/repeat, so there we fall back
// to re-triggering that single buzz on an interval to get a similar
// repeating effect.
const VIBRATION_PATTERN = [0, 700, 400, 700, 400];

// A full-screen, alarm-clock-style popup that takes over the screen when a
// class is about to start (or is starting right now). Only appears while
// the app is in the foreground -- see App.js for how it's triggered and
// see notifications.js for the OS-level notification that still fires
// separately so the reminder isn't lost if the app is backgrounded. Never
// shown unless the subject's own ClassReminder/AdvanceReminder toggle is
// on -- entirely optional per subject, matching how those toggles already
// work everywhere else in School.
export default function ClassAlarmScreen({ alarm, onDismiss, onSuspend }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Starts as soon as the popup appears, stops the moment it's dismissed
  // (unmount) or the component unmounts for any other reason -- never left
  // buzzing in the background. RN's Vibration module actually implements
  // proper pattern+repeat cross-platform (Android hands the whole waveform
  // to the OS to loop natively; iOS/others loop it in JS via their own
  // scheduler) -- earlier this re-triggered a single default buzz on a
  // fixed interval for iOS under the belief that patterns/repeat were
  // Android-only, which wasn't actually true and produced a duller,
  // less urgent buzz than the real pattern below.
  useEffect(() => {
    Vibration.vibrate(VIBRATION_PATTERN, true);
    return () => Vibration.cancel();
  }, []);

  const { block, kind, advanceMinutes } = alarm;
  const timeStr = now.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  const heading = kind === "advance"
    ? `Starts in ${advanceMinutes} minute${advanceMinutes === 1 ? "" : "s"}`
    : "Starting now";

  function confirmSuspend() {
    Alert.alert(
      "Class suspended or cancelled?",
      `This turns off today's alarm for ${block.subject.code}. It'll fire normally again next time this class meets.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Mark suspended", style: "destructive", onPress: onSuspend },
      ]
    );
  }

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

        <Pressable onPress={confirmSuspend} style={styles.suspendBtn} accessibilityLabel="Mark class suspended or cancelled today">
          <Ban size={13} color="#ffffffaa" />
          <Text style={styles.suspendText}>Class suspended today?</Text>
        </Pressable>
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
    backgroundColor: "#0B0E17",
    // Above the app's own PIN lock screen (zIndex 500 in App.js) so a class
    // alarm can still interrupt even while the phone is sitting on LAYP's
    // lock screen -- the same way a phone's own alarm clock rings over its
    // lock screen instead of waiting for it to be unlocked.
    zIndex: 999, elevation: 999,
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
  suspendBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 22, paddingVertical: 6, paddingHorizontal: 12 },
  suspendText: { fontSize: 12, color: "#ffffffaa", fontWeight: "600" },
  bottom: {},
});
