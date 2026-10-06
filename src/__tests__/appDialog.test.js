import React from "react";
import renderer, { act } from "react-test-renderer";
import { Pressable, Text } from "react-native";
import AppDialogHost, { showAppDialog } from "../components/AppDialog";
import { confirmDelete } from "../components/ConfirmModal";

jest.mock("lucide-react-native", () => ({ Info: () => null, AlertTriangle: () => null, XCircle: () => null }));
jest.mock("../haptics", () => ({ hapticImpact: jest.fn(), hapticSuccess: jest.fn() }));
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: require("react-native").View },
  useSharedValue: (value) => require("react").useRef({ value }).current,
  useAnimatedStyle: (fn) => fn(), withTiming: (value) => value,
  Easing: { out: (fn) => fn, cubic: jest.fn() }, ReduceMotion: { System: "system" },
}));
let tree;
beforeEach(() => { jest.useFakeTimers(); act(() => { tree = renderer.create(<AppDialogHost />); }); });
afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });
const labels = () => tree.root.findAllByType(Text).map((t) => t.props.children);
function press(label) {
  const button = tree.root.findAllByType(Pressable).find((p) => p.findAllByType(Text).some((t) => t.props.children === label));
  act(() => button.props.onPress());
}

it("queues simultaneous notices instead of losing the first", () => {
  act(() => { showAppDialog("First"); showAppDialog("Second"); });
  expect(labels()).toContain("First"); expect(labels()).not.toContain("Second");
  press("OK"); act(() => jest.advanceTimersByTime(120));
  expect(labels()).toContain("Second");
});
it("confirmation double taps invoke a destructive action only once", () => {
  const remove = jest.fn();
  act(() => confirmDelete("Delete task?", "This removes the task.", remove));
  press("Delete"); press("Delete");
  act(() => jest.advanceTimersByTime(120));
  expect(remove).toHaveBeenCalledTimes(1);
});
it("cancel keeps the record and supports the cancel callback", () => {
  const remove = jest.fn(), cancel = jest.fn();
  act(() => showAppDialog("Delete?", "", [{ text: "Keep", style: "cancel", onPress: cancel }, { text: "Delete", onPress: remove }]));
  press("Keep"); act(() => jest.advanceTimersByTime(120));
  expect(cancel).toHaveBeenCalledTimes(1); expect(remove).not.toHaveBeenCalled();
});
