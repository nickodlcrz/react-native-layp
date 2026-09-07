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
// Diminishing-returns curve for dragging past an edge that has nowhere to
// go (swiping right on the first tab, or left on the last one) -- a real
// pager resists past its end instead of sliding freely and then teleporting
// back once released. log1p keeps the resistance strong close to 0 (so it
// still *feels* like a drag, not a wall) while flattening out hard the
// further the finger travels, capped well short of a full screen-width.
function rubberBand(dx) {
  const sign = Math.sign(dx);
  return sign * Math.log1p(Math.abs(dx) / 18) * 18;
}

export default function SwipeNavigator({ onSwipeLeft, onSwipeRight, enabled = true, canSwipeLeft = true, canSwipeRight = true, style, children }) {
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  const enabledRef = useRef(enabled);
  // "Left"/"right" here match the gesture direction (dx sign), same
  // convention as onSwipeLeft/onSwipeRight below: dragging left (dx < 0)
  // is what triggers onSwipeLeft, so canSwipeLeft gates that direction.
  const canSwipeLeftRef = useRef(canSwipeLeft);
  const canSwipeRightRef = useRef(canSwipeRight);
  onSwipeLeftRef.current = onSwipeLeft;
  onSwipeRightRef.current = onSwipeRight;
  enabledRef.current = enabled;
  canSwipeLeftRef.current = canSwipeLeft;
  canSwipeRightRef.current = canSwipeRight;

  const dragX = useRef(new Animated.Value(0)).current;

  // Applies rubber-band resistance whenever the drag points toward a
  // direction that has no destination tab, otherwise passes the raw finger
  // delta straight through.
  function dampedValue(dx) {
    const goingLeft = dx < 0;
    const allowed = goingLeft ? canSwipeLeftRef.current : canSwipeRightRef.current;
    return allowed ? dx : rubberBand(dx);
  }

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
        // Run it through the same damping as every subsequent move so a
        // fast initial grant at a boundary doesn't jump straight to the
        // undamped position before easing in.
        dragX.setValue(dampedValue(g.dx));
      },
      // Can't use Animated.event here since the boundary case needs a
      // nonlinear (damped) transform of dx rather than a 1:1 passthrough --
      // this still runs entirely on the JS thread same as before
      // (useNativeDriver: false), so it's no more or less "native" than
      // the previous Animated.event wiring.
      onPanResponderMove: (_, g) => dragX.setValue(dampedValue(g.dx)),
      onPanResponderRelease: (_, g) => {
        const goingLeft = g.dx < 0;
        const allowed = goingLeft ? canSwipeLeftRef.current : canSwipeRightRef.current;
        // No destination in this direction (or swiping disabled outright,
        // e.g. a class alarm is up) -- spring back from wherever the
        // damped drag left off. Never plays the full off-screen exit
        // animation here, which is exactly what used to cause the
        // "reload"-looking snap: the content would slide fully off, the
        // tab wouldn't actually change, and it would then reappear at 0
        // with no animation at all.
        if (!enabledRef.current || !allowed) {
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
