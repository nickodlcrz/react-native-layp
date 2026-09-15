import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Reanimated, { useAnimatedStyle, withSpring } from "react-native-reanimated";
import { useTheme } from "../theme";
import { SPRING } from "../animation";

// A row of section tabs that live inside a screen (as opposed to TabBar,
// which is the app's one fixed bottom nav). Visually it's the same idea --
// a pill that slides to whichever segment is active -- scaled down to sit
// inline above a screen's content instead of anchored to the bottom edge.
// Used wherever a plain filter-style Chip row was actually standing in for
// primary navigation between sections (Budget's Overview/Goals/Activity/
// Spending/Borrow, Todo's All/Upcoming/Overdue/Finished, Borrow's
// Active/Settled, Daily Budget's review/settings), which is why those all
// got promoted to this component rather than every Chip in the app being
// restyled -- Chip still covers genuine filters and multi-color selectors
// (categories, accounts) elsewhere, where a segmented control wouldn't
// make sense.
//
// Runs on Reanimated (like the rest of the app's motion) instead of RN's
// own Animated API, so the slide is driven on the UI thread and shares the
// same spring feel as everything else -- one shared implementation this
// control's used from Todo, Budget, Borrow, and Daily Budget all get for
// free instead of each screen's tab bar animating slightly differently.
export default function SegmentedTabs({ options, value, onChange, style }) {
  const { theme } = useTheme();
  const [barWidth, setBarWidth] = useState(0);
  const activeIndex = Math.max(0, options.findIndex((o) => o.key === value));
  const segWidth = barWidth / (options.length || 1);
  const didInitialize = React.useRef(false);

  // Snap to place on the very first layout instead of visibly sliding in
  // from the left edge before the row has even finished measuring itself.
  React.useEffect(() => {
    if (barWidth) didInitialize.current = true;
  }, [barWidth]);

  const indicatorStyle = useAnimatedStyle(() => {
    const toValue = activeIndex * segWidth + 3;
    return {
      width: segWidth - 6,
      transform: [{ translateX: didInitialize.current ? withSpring(toValue, SPRING) : toValue }],
    };
  }, [activeIndex, segWidth]);

  return (
    <View
      style={[styles.wrap, { backgroundColor: theme.bg, borderColor: theme.line }, style]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {barWidth > 0 && (
        <Reanimated.View pointerEvents="none" style={[styles.indicator, { backgroundColor: theme.card }, indicatorStyle]} />
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
