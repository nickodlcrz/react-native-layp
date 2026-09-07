import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Animated, StyleSheet } from "react-native";
import { ACCENT } from "../theme";

// The bottom tab bar, pulled out of App.js into its own component like
// every other reusable piece under src/components (SwipeNavigator,
// ConfirmModal, etc). App.js used to define this inline as a `NavBtn`
// helper with a static per-button highlight; this version adds one
// indicator that slides between tabs instead, and measures its own width
// via onLayout so it isn't hardcoded to any particular tab count -- adding
// a 5th tab later needs no changes here, just a longer `tabs` array.
export default function TabBar({ tabs, activeKey, onChange, theme }) {
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === activeKey));
  const tabWidth = barWidth / (tabs.length || 1);

  // True once the indicator has been positioned for the first time --
  // lets the very first placement snap straight to the active tab instead
  // of visibly sliding in from the left edge before the bar has even
  // finished laying out.
  const didInitialize = useRef(false);

  useEffect(() => {
    if (!barWidth) return;
    const toValue = activeIndex * tabWidth + 5;
    if (!didInitialize.current) {
      indicatorX.setValue(toValue);
      didInitialize.current = true;
      return;
    }
    Animated.spring(indicatorX, {
      toValue,
      useNativeDriver: true,
      friction: 10,
      tension: 80,
    }).start();
    // barWidth and tabWidth move together (tabWidth is derived from it),
    // so depending on both would just double-fire this on every layout --
    // activeIndex is the only other thing that should retrigger the slide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, barWidth]);

  return (
    <View
      style={[styles.wrap, { borderColor: theme.line, backgroundColor: theme.card }]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {barWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              width: tabWidth - 10,
              backgroundColor: theme.bg,
              transform: [{ translateX: indicatorX }],
            },
          ]}
        />
      )}
      {tabs.map((t) => (
        <TabButton key={t.key} tab={t} active={t.key === activeKey} onPress={() => onChange(t.key)} theme={theme} />
      ))}
    </View>
  );
}

function TabButton({ tab, active, onPress, theme }) {
  // A small press-in/press-out bounce on the icon+label, independent of
  // the indicator's own slide animation -- makes tapping a tab that's
  // already active (or a fast double-tap while the indicator is still
  // mid-slide) still feel responsive instead of visually inert.
  const scale = useRef(new Animated.Value(1)).current;
  function handlePress() {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.88, duration: 70, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 140 }),
    ]).start();
    onPress();
  }
  const Icon = tab.icon;
  return (
    <Pressable
      onPress={handlePress}
      style={styles.btn}
      accessibilityRole="tab"
      accessibilityLabel={tab.label}
      accessibilityHint={`Open ${tab.label}`}
      accessibilityState={{ selected: active }}
      android_ripple={{ color: theme.line, borderless: true }}
      // 48pt minimum touch target (Android's own accessibility guidance,
      // close to Apple's 44pt) -- the old inline version had ~35px of
      // vertical hit area between its icon, label, and padding.
      hitSlop={{ top: 6, bottom: 6 }}
    >
      <Animated.View style={{ transform: [{ scale }], alignItems: "center", gap: 2 }}>
        <Icon size={17} color={active ? theme.text : theme.textMuted} strokeWidth={active ? 2.4 : 2} />
        <Text style={[styles.label, { color: active ? theme.text : theme.textMuted }]} numberOfLines={1}>
          {tab.label}
        </Text>
      </Animated.View>
      {active && <View style={[styles.dot, { backgroundColor: ACCENT.gold }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: 20,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingVertical: 4,
    // Lets the sliding indicator sit fully behind the row of buttons
    // without any of them needing z-index juggling.
    position: "relative",
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -2 },
  },
  indicator: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 16,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
    paddingVertical: 6,
    borderRadius: 16,
  },
  label: { fontSize: 8.5, fontWeight: "700" },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
});
