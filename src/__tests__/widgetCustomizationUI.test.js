import React from "react";
import renderer, { act } from "react-test-renderer";
import { Pressable } from "react-native";
import WidgetCustomization from "../components/WidgetCustomization";
import { DEFAULT_WIDGET_PREFS } from "../widgetPrefsLogic";
jest.mock("react-native-reanimated", () => ({ __esModule: true, default: { View: require("react-native").View }, useAnimatedStyle: (fn) => fn(), withSpring: (v) => v, useReducedMotion: () => true }));
test("changing font size preserves event and visibility choices", () => {
  const onChange = jest.fn(); let tree;
  act(() => { tree = renderer.create(<WidgetCustomization prefs={{ ...DEFAULT_WIDGET_PREFS, accountIds: ["cash"], calendarKinds: [] }} onChange={onChange} />); });
  act(() => tree.root.findAllByType(Pressable).find((p) => p.props.accessibilityLabel === "Large").props.onPress());
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fontScale: 1.15, accountIds: ["cash"], calendarKinds: [] }));
  act(() => tree.unmount());
});
