// A single shared timing/spring config so that opening or closing an edit
// sheet, a card expanding, an item being added or removed from a list,
// the app unlocking after the security screen, and ordinary button presses
// all move at the same, consistent ~0.2s pace instead of every screen
// picking its own duration by feel.
//
// Import DURATION for withTiming/Animated.timing calls, and SPRING for
// withSpring calls that want that same snappy feel but with a natural
// settle instead of a hard stop.
export const DURATION = 200; // ms

// Tuned so a spring driven by this config finishes in roughly DURATION ms
// with a small, natural overshoot -- not a slow, floaty settle.
export const SPRING = { damping: 20, stiffness: 260 };

// A slightly softer spring for larger movements (sheets, bigger surfaces)
// where a bit more travel time reads as smooth rather than abrupt.
export const SPRING_SOFT = { damping: 18, stiffness: 200 };

import { useSharedValue, useAnimatedStyle, withTiming, withSequence, withSpring } from "react-native-reanimated";

// Shared "long-press to edit" card interaction, used identically by Todo
// and Spending rows (and meant for Borrow too): a light press-in/out on
// every ordinary touch so the row always feels responsive, and a quick
// "pop" -- scale up then spring back -- on long-press, right before the
// row's onLongPressAction (typically opening that item's edit sheet)
// fires. Long-press replaces the separate pencil/trash buttons those rows
// used to have, so the card itself is the only editing affordance.
export function useCardPressAnimation(onLongPressAction) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  function pressIn() { scale.value = withTiming(0.985, { duration: DURATION * 0.6 }); }
  function pressOut() { scale.value = withTiming(1, { duration: DURATION }); }
  function handleLongPress() {
    scale.value = withSequence(
      withTiming(1.045, { duration: DURATION * 0.45 }),
      withSpring(1, SPRING),
    );
    onLongPressAction();
  }
  return { style, pressIn, pressOut, handleLongPress };
}
