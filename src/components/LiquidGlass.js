import React from "react";
import { View, StyleSheet } from "react-native";
import { useTheme } from "../theme";

// A plain, opaque, themed surface (the name is historical -- real frosted
// glass is reserved for the Android home-screen widgets).
//
// `background` lets a caller pick a solid fill such as theme.accentDark for
// hero cards that carry white text. Without it the surface follows the
// theme's card color, so dark text / theme.text always stays readable.
//
// NOTE: the content wrapper must NOT use flex:1. This component usually
// sits in an auto-height parent, and a flex:1 child there collapses to its
// minHeight, which is what was clipping cards, sheets and buttons.
export default function LiquidGlass({
  children,
  style,
  radius = 24,
  contentStyle,
  background,
  testID,
}) {
  const { theme } = useTheme();
  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          borderRadius: radius,
          borderColor: theme.line,
          backgroundColor: background || theme.card,
        },
        style,
      ]}
    >
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
});
