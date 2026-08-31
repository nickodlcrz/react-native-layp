import React, { useEffect, useRef } from "react";
import { Animated, Dimensions } from "react-native";

const SCREEN_WIDTH = Dimensions.get("window").width;

// A native-driver transition makes switching tabs feel intentional without
// adding a heavier navigation-library dependency. `direction` comes from
// the tab's position in the tab order relative to the previous tab: 1 when
// moving to a tab further right (content slides in from the right, like
// swiping left), -1 moving further left, 0 for a transition with no
// inherent direction (e.g. opening a sub-screen).
export default function TabTransition({ transitionKey, direction = 0, style, children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateX.setValue(direction === 0 ? 0 : direction * SCREEN_WIDTH * 0.25);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true, friction: 10, tension: 60 }),
    ]).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transitionKey]);

  return <Animated.View style={[style, { opacity, transform: [{ translateX }] }]}>{children}</Animated.View>;
}
