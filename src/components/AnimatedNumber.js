import React, { useEffect, useRef, useState } from "react";
import { Text } from "react-native";

// Animates a number counting up/down from its previous value to a new one
// whenever `value` changes.
//
// This used to run on Animated.Value + an addListener callback. Animated's
// listener path always runs on the JS thread regardless of useNativeDriver
// (there's no native driver option here anyway -- a changing text string
// isn't a transform/opacity style, so it was never eligible), and pays the
// JS bridge round-trip on every single frame just to read the interpolated
// number back out. A plain requestAnimationFrame loop does the same
// interpolation without that bridge traffic per frame.
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedNumber({ value, formatter, style, duration = 500 }) {
  const [display, setDisplay] = useState(value);
  const prevValueRef = useRef(value);
  const rafRef = useRef(null);

  useEffect(() => {
    const from = prevValueRef.current;
    const to = value;
    if (from === to) return;
    prevValueRef.current = to;

    const start = Date.now();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = () => {
      const elapsed = Date.now() - start;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      setDisplay(from + (to - from) * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <Text style={style}>{formatter ? formatter(display) : Math.round(display)}</Text>;
}
