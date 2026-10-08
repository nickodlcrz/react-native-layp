import React from "react";
import renderer, { act } from "react-test-renderer";
import { Pressable, Text } from "react-native";
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

test("budget preview totals all accounts even when only one card is selected", () => {
  let tree;
  act(() => { tree = renderer.create(<WidgetCustomization prefs={{ ...DEFAULT_WIDGET_PREFS, accountIds: ["cash"] }} onChange={jest.fn()} accounts={[{ id: "cash", label: "Cash", balance: 100 }, { id: "bank", label: "Bank", balance: 50 }]} />); });
  act(() => tree.root.findAllByType(Pressable).find((p) => p.props.accessibilityLabel === "Budget").props.onPress());
  const labels = tree.root.findAllByType(Text).map((node) => node.props.children);
  expect(labels).toContain("Total budget · all accounts");
  expect(labels).toContain("₱150");
  expect(labels).toContain("₱100");
  expect(labels).not.toContain("₱50");
  act(() => tree.unmount());
});

test("hidden budget preview masks the total and individual balances", () => {
  let tree;
  act(() => { tree = renderer.create(<WidgetCustomization prefs={DEFAULT_WIDGET_PREFS} onChange={jest.fn()} hidden accounts={[{ id: "cash", label: "Cash", balance: 123 }]} />); });
  act(() => tree.root.findAllByType(Pressable).find((p) => p.props.accessibilityLabel === "Budget").props.onPress());
  const labels = tree.root.findAllByType(Text).map((node) => node.props.children);
  expect(labels.filter((text) => text === "••••")).toHaveLength(2);
  expect(labels).not.toContain("₱123");
  act(() => tree.unmount());
});
