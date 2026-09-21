import React, { useEffect, useRef } from "react";
import { Animated } from "react-native";

// Used to also slide content in from the left/right on top of a plain
// fade, following SwipeNavigator's own live drag-follow (a separate
// transform on dragX, untouched by this). That extra slide -- a spring
// animating both opacity and translateX together -- is exactly the kind
// of compositing work that visibly stutters on lower-end hardware like a
// Redmi 10, and a tab switch is common enough that any stutter there is
// noticeable. So this is now a flat 150ms opacity fade only: still native-
// driven, still marks a switch as an intentional transition rather than a
// hard cut, just without the extra transform.
export default function TabTransition({ transitionKey, style, children }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}
