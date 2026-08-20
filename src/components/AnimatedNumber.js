import React, { useEffect, useRef, useState } from "react";
import { Text, Animated } from "react-native";

// Animates a number counting up/down from its previous value to a new one
// whenever `value` changes. Uses React Native's built-in Animated API
// (no extra native dependency, no rebuild needed) rather than Reanimated.
export default function AnimatedNumber({ value, formatter, style, duration = 500 }) {
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current === value) return;
    prevValue.current = value;
    const listenerId = anim.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(anim, { toValue: value, duration, useNativeDriver: false }).start();
    return () => anim.removeListener(listenerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <Text style={style}>{formatter ? formatter(display) : Math.round(display)}</Text>;
}
