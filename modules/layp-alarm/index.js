// JS-side bridge for the native LAYP alarm engine (Android only). See
// android/src/main/java/expo/modules/laypalarm for the Kotlin side:
// AlarmManager + a BroadcastReceiver + a full-screen alarm Activity, so a
// scheduled alarm rings (sound, vibration, lock-screen UI) even if the app
// isn't running and LAYP's JS isn't executing at all.
//
// requireNativeModule throws when the native module isn't linked into the
// running binary (iOS, Expo Go, or an Android dev client built before this
// module existed) -- every export below stays a safe no-op in that case so
// callers never need their own platform checks.
import { requireNativeModule } from "expo-modules-core";

let LaypAlarmNative = null;
try {
  LaypAlarmNative = requireNativeModule("LaypAlarm");
} catch (e) {
  LaypAlarmNative = null;
}

export function isNativeAlarmAvailable() {
  return LaypAlarmNative != null;
}

// config: {
//   id: string -- groups every occurrence scheduled for this alarm, so a
//     later cancelAlarm(id)/updateAlarm(id, ...) call affects all of them.
//   title: string, body?: string
//   hour: number, minute: number
//   days?: number[] -- Expo/this app's weekday convention (1=Sun...7=Sat).
//     Omit for a one-shot alarm instead of a weekly-repeating one.
//   date?: string -- "YYYY-MM-DD", used with a one-shot alarm (no `days`)
//     to pin it to a specific day instead of "the next time it's hour:minute".
//   repeatWeekly?: boolean -- default true when `days` is set.
//   kind?: "class" | "task"
// }
export async function scheduleAlarm(config) {
  if (!LaypAlarmNative) return false;
  await LaypAlarmNative.scheduleAlarm(config);
  return true;
}

export async function updateAlarm(config) {
  if (!LaypAlarmNative) return false;
  await LaypAlarmNative.updateAlarm(config);
  return true;
}

export async function cancelAlarm(id) {
  if (!LaypAlarmNative) return false;
  await LaypAlarmNative.cancelAlarm(id);
  return true;
}

export async function getAlarmStatus() {
  if (!LaypAlarmNative) return null;
  return LaypAlarmNative.getAlarmStatus();
}

// Opens the OS "Alarms & reminders" (exact alarm) settings screen for this
// app -- Android 12+ requires the person to grant this explicitly, and
// LAYP's alarms silently degrade to inexact timing without it. Surface
// this from an "Alarm reliability" section in Settings.
export async function openExactAlarmSettings() {
  if (!LaypAlarmNative) return;
  await LaypAlarmNative.openExactAlarmSettings();
}

export async function openBatteryOptimizationSettings() {
  if (!LaypAlarmNative) return;
  await LaypAlarmNative.openBatteryOptimizationSettings();
}

export function addAlarmFiredListener(callback) {
  if (!LaypAlarmNative) return { remove() {} };
  return LaypAlarmNative.addListener("onAlarmFired", callback);
}

export function addAlarmSnoozedListener(callback) {
  if (!LaypAlarmNative) return { remove() {} };
  return LaypAlarmNative.addListener("onAlarmSnoozed", callback);
}

export function addAlarmDismissedListener(callback) {
  if (!LaypAlarmNative) return { remove() {} };
  return LaypAlarmNative.addListener("onAlarmDismissed", callback);
}
