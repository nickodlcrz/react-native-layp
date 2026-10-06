// JS-side bridge for LAYP's Android widgets (spending, tasks, calendar) and
// for notification buttons that are answered without opening the app. See
// android/src/main/java/expo/modules/laypwidget for the Kotlin side.
//
// How the two halves talk (they never share a database -- the widgets must
// work while the app isn't running):
//   app -> native : pushWidgetSummary()  everything the widgets display
//   native -> app : getPendingWidgetItems() / ackWidgetItems()
//                   what happened while the app was closed: expenses and
//                   money logged from the widget, task taps, answered
//                   notification buttons. Applied by App.js, then acked.
//
// requireNativeModule throws when the native module isn't linked into the
// running binary (iOS, Expo Go, or an Android dev client built before this
// module existed) -- every export below stays a safe no-op in that case so
// callers never need their own platform checks.
import { requireNativeModule } from "expo-modules-core";

let LaypWidgetNative = null;
try {
  LaypWidgetNative = requireNativeModule("LaypWidget");
} catch (e) {
  LaypWidgetNative = null;
}

export function isNativeWidgetAvailable() {
  return LaypWidgetNative != null;
}

// summary: see buildWidgetSummary in src/widgetSummary.js.
export async function pushWidgetSummary(summary) {
  if (!LaypWidgetNative) return false;
  await LaypWidgetNative.pushSummary(JSON.stringify(summary));
  return true;
}

const EMPTY_PENDING = { expenses: [], money: [], taskOps: [], notifActions: [], newTasks: [] };

// Everything waiting for the app:
//   expenses      [{ id, amount, name, label, splitId, account, date, createdAt }]
//   money         [{ id, amount, note, category, account, date, createdAt }]
//   taskOps       [{ id, taskId, status?, onlyIf?, complete, at }]
//   notifActions  [{ id, actionId, notifId, data, at, date }]
//   newTasks      [{ id, title, category, dueDate?, createdAt }]  (Tasks widget's +)
// Read-only -- call ackWidgetItems once they're safely saved.
export async function getPendingWidgetItems() {
  if (!LaypWidgetNative) return EMPTY_PENDING;
  try {
    const parsed = JSON.parse(await LaypWidgetNative.getPending());
    return {
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      money: Array.isArray(parsed.money) ? parsed.money : [],
      taskOps: Array.isArray(parsed.taskOps) ? parsed.taskOps : [],
      notifActions: Array.isArray(parsed.notifActions) ? parsed.notifActions : [],
      newTasks: Array.isArray(parsed.newTasks) ? parsed.newTasks : [],
    };
  } catch (e) {
    return EMPTY_PENDING;
  }
}

// ids from any of the lists above.
export async function ackWidgetItems(ids) {
  if (!LaypWidgetNative || !ids || ids.length === 0) return false;
  await LaypWidgetNative.ackPending(ids);
  return true;
}

// How many widgets (of all kinds) are currently on a home screen.
export async function getWidgetInstalledCount() {
  if (!LaypWidgetNative) return 0;
  return LaypWidgetNative.getInstalledCount();
}

// Asks the launcher to offer adding a widget (Android 8+, launchers that
// support pinning). kind: "spend" | "tasks4x4" | "tasks4x6" | "calendar".
// Resolves false when it can't be offered -- the person can still add it
// from the home screen's widget picker.
export async function requestPinWidget(kind = "spend") {
  if (!LaypWidgetNative) return false;
  return !!(await LaypWidgetNative.requestPinWidget(kind));
}
