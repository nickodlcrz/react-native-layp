import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming } from "react-native-reanimated";

// A plain `width: ${percent}%` style jumps instantly whenever the
// underlying value changes (e.g. a savings goal getting a new deposit) --
// this animates the fill smoothly to its new width instead, 500ms
// eased, so progress visibly "fills up" rather than teleporting.
export default function AnimatedProgressBar({ percent, color, trackColor, height = 6 }) {
  const width = useSharedValue(0);
  useEffect(() => {
    width.value = withTiming(Math.max(0, Math.min(100, percent)), { duration: 360 });
  }, [percent]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%`,
    backgroundColor: color,
  }));

  return (
    <Reanimated.View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: trackColor }]}>
      <Reanimated.View style={[styles.fill, { height, borderRadius: height / 2 }, fillStyle]} />
    </Reanimated.View>
  );
}

const styles = StyleSheet.create({
  track: { overflow: "hidden" },
  fill: {},
});
