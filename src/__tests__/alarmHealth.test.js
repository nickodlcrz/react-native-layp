import React from "react";
import renderer, { act } from "react-test-renderer";
import { Pressable } from "react-native";
import AlarmHealthCard from "../components/AlarmHealthCard";
import { getAlarmStatus, testAlarm, cancelAlarm } from "../../modules/layp-alarm";
jest.mock("../components/AppDialog", () => ({ showAppDialog: jest.fn() }));
jest.mock("../../modules/layp-alarm", () => ({
  isNativeAlarmAvailable: () => true, getAlarmStatus: jest.fn(), testAlarm: jest.fn(), cancelAlarm: jest.fn(),
  openExactAlarmSettings: jest.fn(), openFullScreenAlarmSettings: jest.fn(), openBatteryOptimizationSettings: jest.fn(), openAlarmNotificationSettings: jest.fn(),
}));
const ready = { notificationsEnabled: true, alarmChannelEnabled: true, exactAlarmsAllowed: true, fullScreenAlarmsAllowed: true, ignoringBatteryOptimizations: true };
let tree;
const button = (label) => tree.root.findAllByType(Pressable).find((p) => p.props.accessibilityLabel === label);
beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date("2026-10-07T09:00:00Z")); jest.clearAllMocks(); getAlarmStatus.mockResolvedValue(ready); testAlarm.mockImplementation(async () => Date.now() + 10000); cancelAlarm.mockResolvedValue(true); });
afterEach(() => { if (tree) act(() => tree.unmount()); tree = null; jest.useRealTimers(); });
test("blocks the test when exact alarm timing is unavailable", async () => {
  getAlarmStatus.mockResolvedValue({ ...ready, exactAlarmsAllowed: false });
  await act(async () => { tree = renderer.create(<AlarmHealthCard />); });
  expect(button("Test alarm in 10 seconds").props.disabled).toBe(true);
  expect(testAlarm).not.toHaveBeenCalled();
});
test("starts and cancels a native test alarm with a live countdown", async () => {
  await act(async () => { tree = renderer.create(<AlarmHealthCard />); });
  await act(async () => { await button("Test alarm in 10 seconds").props.onPress(); });
  expect(testAlarm).toHaveBeenCalledTimes(1);
  expect(button("Test alarm in 10s · cancel")).toBeDefined();
  act(() => jest.advanceTimersByTime(2000));
  await act(async () => { await button("Test alarm in 8s · cancel").props.onPress(); });
  expect(cancelAlarm).toHaveBeenCalledWith("layp:test");
  expect(button("Test alarm in 10 seconds")).toBeDefined();
});
test("refreshes settings rather than retaining stale permission state", async () => {
  getAlarmStatus.mockResolvedValueOnce({ ...ready, notificationsEnabled: false }).mockResolvedValueOnce(ready);
  await act(async () => { tree = renderer.create(<AlarmHealthCard />); });
  expect(button("Test alarm in 10 seconds").props.disabled).toBe(true);
  await act(async () => { await button("Check again").props.onPress(); });
  expect(button("Test alarm in 10 seconds").props.disabled).toBe(false);
});
