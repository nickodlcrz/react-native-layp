import React, { useRef } from "react";
import { Animated, PanResponder, Dimensions } from "react-native";

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
// The content now follows the finger in real time during the drag
// (translateX bound live to the gesture via Animated.event), instead of
// the previous version which did nothing at all until the finger lifted --
// that "nothing moves, then a canned animation plays after release" gap is
// what actually read as lag, independent of how fast the release-triggered
// animation itself was. This can't use the native driver (gestureState.dx
// is computed on the JS thread), so it isn't quite as silky as a fully
// native pager, but tracking the finger live -- even JS-driven -- removes
// the dead zone that made every swipe feel like it was waiting on something.
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

  const dragX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) => {
        if (!enabledRef.current) return false;
        return Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6;
      },
      onPanResponderGrant: (_, g) => {
        // Sync to where the finger already is instead of starting from 0 --
        // by the time this fires, the touch has already moved past the
        // 16px claim threshold above, so starting at 0 would cause a
        // visible little jump to catch up to the real finger position.
        dragX.setValue(g.dx);
      },
      onPanResponderMove: Animated.event([null, { dx: dragX }], { useNativeDriver: false }),
      onPanResponderRelease: (_, g) => {
        if (!enabledRef.current) {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: false, friction: 9, tension: 70 }).start();
          return;
        }
        const past = Math.abs(g.dx) > SWIPE_DISTANCE_THRESHOLD || Math.abs(g.vx) > SWIPE_VELOCITY_THRESHOLD;
        if (!past) {
          Animated.spring(dragX, { toValue: 0, useNativeDriver: false, friction: 9, tension: 70 }).start();
          return;
        }
        // Finish the motion the rest of the way off-screen in the same
        // direction the finger was already moving, then switch tabs the
        // instant it's off -- continuing the drag rather than snapping
        // back to 0 and separately playing an unrelated entrance
        // animation, which is what used to create the "wait for it"
        // feeling even once the swipe was recognized.
        const goingLeft = g.dx < 0;
        Animated.timing(dragX, {
          toValue: goingLeft ? -SCREEN_WIDTH : SCREEN_WIDTH,
          duration: 140,
          useNativeDriver: false,
        }).start(() => {
          dragX.setValue(0);
          if (goingLeft) onSwipeLeftRef.current?.();
          else onSwipeRightRef.current?.();
        });
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragX, { toValue: 0, useNativeDriver: false, friction: 9, tension: 70 }).start();
      },
    })
  ).current;

  return (
    <Animated.View style={[style, { transform: [{ translateX: dragX }] }]} {...panResponder.panHandlers}>
      {children}
    </Animated.View>
  );
}
