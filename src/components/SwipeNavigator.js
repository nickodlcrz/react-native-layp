import React, { useRef } from "react";
import { View, PanResponder, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;
const SWIPE_DISTANCE_THRESHOLD = SCREEN_WIDTH * 0.22;
const SWIPE_VELOCITY_THRESHOLD = 0.35;

// Wraps the main tab content so a left/right drag moves between tabs, the
// same way swiping between home screens works on a phone launcher. Only
// claims the gesture once a drag is clearly more horizontal than vertical
// and past a small distance -- taps, vertical scrolling inside a tab, and
// any nested horizontal control (sliders, the slide-to-confirm alarm
// control) all keep working normally, since this never captures on a bare
// touch-start, only on a sustained horizontal move.
//
// PanResponder.create(...) is only called once (inside the useRef
// initializer) since recreating it every render would drop touches
// mid-gesture. That means its handler closures are fixed at first mount --
// they'd otherwise keep seeing whichever `tab` was active on that very
// first render forever, which is exactly why swiping used to always land
// on the second tab no matter where you started, and swiping back always
// failed. Reading the latest callbacks through refs (updated on every
// render, but never causing the responder itself to be rebuilt) is what
// makes the handlers see current values without that staleness.
export default function SwipeNavigator({ onSwipeLeft, onSwipeRight, enabled = true, style, children }) {
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  const enabledRef = useRef(enabled);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;
  enabledRef.current = enabled;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        if (!enabledRef.current) return false;
        return Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6;
      },
      onPanResponderRelease: (_, g) => {
        if (!enabledRef.current) return;
        const past = Math.abs(g.dx) > SWIPE_DISTANCE_THRESHOLD || Math.abs(g.vx) > SWIPE_VELOCITY_THRESHOLD;
        if (!past) return;
        if (g.dx < 0) onSwipeLeftRef.current?.();
        else onSwipeRightRef.current?.();
      },
    })
  ).current;

  return (
    <View style={style} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}
