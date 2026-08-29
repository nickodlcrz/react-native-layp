import React, { useRef, useState } from "react";
import { View, Text, Animated, PanResponder, StyleSheet, Dimensions } from "react-native";
import { ChevronsRight } from "lucide-react-native";

const THUMB_SIZE = 56;
const TRACK_PADDING = 4;

// A drag-to-confirm control, alarm-clock style: the thumb has to be pulled
// almost all the way across before it counts as confirmed. Letting go
// early snaps it back to the start instead of firing -- this is what makes
// it hard to dismiss by accident (a stray tap won't do it), which matters
// for something that's about to wake someone up for class.
export default function SlideToConfirm({ label, onConfirm, color, trackColor }) {
  const [trackWidth, setTrackWidth] = useState(Dimensions.get("window").width - 64);
  const pan = useRef(new Animated.Value(0)).current;
  const confirmedRef = useRef(false);
  const maxDrag = Math.max(0, trackWidth - THUMB_SIZE - TRACK_PADDING * 2);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        const next = Math.min(Math.max(0, gesture.dx), maxDrag);
        pan.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const dx = Math.min(Math.max(0, gesture.dx), maxDrag);
        if (maxDrag > 0 && dx >= maxDrag * 0.88 && !confirmedRef.current) {
          confirmedRef.current = true;
          Animated.timing(pan, { toValue: maxDrag, duration: 120, useNativeDriver: false }).start(() => {
            onConfirm();
          });
        } else {
          Animated.spring(pan, { toValue: 0, useNativeDriver: false, friction: 6 }).start();
        }
      },
    })
  ).current;

  const fillWidth = Animated.add(pan, new Animated.Value(THUMB_SIZE));

  return (
    <View
      style={[styles.track, { backgroundColor: trackColor }]}
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      <Animated.View style={[styles.fill, { width: fillWidth, backgroundColor: color }]} />
      <Text style={styles.label} pointerEvents="none">{label}</Text>
      <Animated.View
        {...panResponder.panHandlers}
        style={[styles.thumb, { backgroundColor: color, transform: [{ translateX: pan }] }]}
        accessibilityLabel={label}
        accessibilityHint="Drag all the way to the right to confirm"
      >
        <ChevronsRight size={22} color="#fff" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: THUMB_SIZE + TRACK_PADDING * 2, borderRadius: (THUMB_SIZE + TRACK_PADDING * 2) / 2, justifyContent: "center", overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, opacity: 0.28, borderRadius: (THUMB_SIZE + TRACK_PADDING * 2) / 2 },
  label: { textAlign: "center", fontSize: 13, fontWeight: "700", color: "#fff", letterSpacing: 0.3 },
  thumb: {
    position: "absolute", left: TRACK_PADDING, top: TRACK_PADDING,
    width: THUMB_SIZE, height: THUMB_SIZE, borderRadius: THUMB_SIZE / 2,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4,
  },
});
