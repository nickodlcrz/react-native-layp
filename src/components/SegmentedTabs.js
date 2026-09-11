import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { useTheme } from "../theme";

// A row of section tabs that live inside a screen (as opposed to TabBar,
// which is the app's one fixed bottom nav). Visually it's the same idea --
// a pill that slides to whichever segment is active -- scaled down to sit
// inline above a screen's content instead of anchored to the bottom edge.
// Used wherever a plain filter-style Chip row was actually standing in for
// primary navigation between sections (Budget's Overview/Goals/Activity/
// Spending/Borrow, Todo's Active/Finished, Borrow's Active/Settled, Daily
// Budget's review/settings), which is why those all got promoted to this
// component rather than every Chip in the app being restyled -- Chip still
// covers genuine filters and multi-color selectors (categories, accounts)
// elsewhere, where a segmented control wouldn't make sense.
export default function SegmentedTabs({ options, value, onChange, style }) {
  const { theme } = useTheme();
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));
  const segWidth = barWidth / (options.length || 1);

  // Mirrors TabBar's own approach: snap to place on the very first layout
  // instead of visibly sliding in from the left edge before the row has
  // even finished measuring itself.
  const didInitialize = useRef(false);

  useEffect(() => {
    if (!barWidth) return;
    const toValue = activeIndex * segWidth + 3;
    if (!didInitialize.current) {
      indicatorX.setValue(toValue);
      didInitialize.current = true;
      return;
    }
    Animated.spring(indicatorX, {
      toValue,
      useNativeDriver: true,
      friction: 10,
      tension: 90,
    }).start();
    // barWidth and segWidth move together, so depending on both would just
    // double-fire this on every layout -- activeIndex is the only other
    // thing that should retrigger the slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, barWidth]);

  return (
    <View
      style={[styles.wrap, { backgroundColor: theme.bg, borderColor: theme.line }, style]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {barWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: segWidth - 6,
              backgroundColor: theme.card,
              transform: [{ translateX: indicatorX }],
            },
          ]}
        />
      )}
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={styles.seg}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={[styles.label, { color: active ? theme.text : theme.textMuted, fontWeight: active ? "700" : "600" }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderRadius: 13,
    borderWidth: 1,
    padding: 3,
    // Lets the sliding indicator sit fully behind the segments without any
    // of them needing z-index juggling.
    position: "relative",
    overflow: "hidden",
    marginBottom: 12,
  },
  indicator: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: 10,
    elevation: 2,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  seg: {
    flex: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: 10,
  },
  label: { fontSize: 11.5 },
});
