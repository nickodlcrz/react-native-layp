import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { daysUntil, fmtDateLong, fmtTime12, peso } from "./utils";
import * as LaypAlarm from "../modules/layp-alarm";

// Ids for a subject's "class starting now" alarm that were armed through
// the native Kotlin alarm engine (see modules/layp-alarm) are prefixed so
// cancelSubjectNotifications can tell them apart from a plain
// expo-notifications id and route the cancel to the right place.
const NATIVE_ALARM_PREFIX = "native:";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Re-exported so App.js can tell a plain notification tap apart from one of
// the class-alarm action buttons below, without importing the raw
// expo-notifications module itself (everything notification-related is
// meant to funnel through this file).
export const DEFAULT_ACTION_IDENTIFIER = Notifications.DEFAULT_ACTION_IDENTIFIER;
export const CLASS_ALARM_CONFIRM_ACTION = "CONFIRM";
export const CLASS_ALARM_CANCELLED_ACTION = "CANCELLED";
const CLASS_ALARM_CATEGORY = "layp-class-alarm-actions";
export const CLASS_CHECKIN_YES_ACTION = "CHECKIN_YES";
export const CLASS_CHECKIN_NONE_ACTION = "CHECKIN_NONE";
const CLASS_CHECKIN_CATEGORY = "layp-class-checkin-actions";
// Lets the Daily Budget reminder itself carry the "save it" / "keep it
// for tomorrow" decision right on the notification -- see
// rescheduleDailyBudgetNotification below for how the actual save amount
// gets attached to each notification's data payload.
export const DAILY_BUDGET_SAVE_ACTION = "DAILY_BUDGET_SAVE";
export const DAILY_BUDGET_KEEP_ACTION = "DAILY_BUDGET_KEEP";
const DAILY_BUDGET_CATEGORY = "layp-daily-budget-actions";
// Fallback for how long before a class's own alarm the "Do you have class
// today?" check-in fires, used only if a subject somehow has no value of
// its own. Per-subject (subject.classCheckInMinutes, defaulting from
// DEFAULT_SCHOOL_DEFAULTS in theme.js) is now configurable in the
// Add/Edit Subject form instead of being fixed app-wide.
const CLASS_CHECKIN_MINUTES_BEFORE_FALLBACK = 60;

// Lets the class-starting-now / advance notification carry two action
// buttons right on the notification itself (lock screen included), so it
// can be handled without unlocking the phone or opening the app at all --
// "I'm up" behaves like the in-app slide-to-confirm, "Class cancelled"
// behaves like the in-app suspend button. Registering the category is
// idempotent, so it's safe to call this on every app start.
export async function setupNotificationCategories() {
  await Notifications.setNotificationCategoryAsync(CLASS_ALARM_CATEGORY, [
    // opensAppToForeground defaults to true and is left that way here on
    // purpose: recording a cancelled class (or clearing the in-app alarm
    // state) has to run in JS, and per Expo's own docs the response
    // listener won't fire at all for a killed app if this were false --
    // so tapping either button briefly foregrounds the app to actually
    // process the action, then it can return to the background on its own.
    { identifier: CLASS_ALARM_CONFIRM_ACTION, buttonTitle: "I'm up \u2713" },
    { identifier: CLASS_ALARM_CANCELLED_ACTION, buttonTitle: "Class cancelled", options: { isDestructive: true } },
  ]);
  await Notifications.setNotificationCategoryAsync(CLASS_CHECKIN_CATEGORY, [
    { identifier: CLASS_CHECKIN_YES_ACTION, buttonTitle: "Yes" },
    { identifier: CLASS_CHECKIN_NONE_ACTION, buttonTitle: "None", options: { isDestructive: true } },
  ]);
  // Lets the Daily Budget reminder be acted on right from the
  // notification (lock screen included) -- "Save" deposits today's
  // recommended savings split, "Keep for tomorrow" logs that decision,
  // matching the two in-app buttons on the review screen. Whether "Save"
  // actually appears is decided per-notification in
  // rescheduleDailyBudgetNotification below (only when there's really
  // something worth saving) by choosing which category to attach.
  await Notifications.setNotificationCategoryAsync(DAILY_BUDGET_CATEGORY, [
    { identifier: DAILY_BUDGET_SAVE_ACTION, buttonTitle: "Save to savings" },
    { identifier: DAILY_BUDGET_KEEP_ACTION, buttonTitle: "Keep for tomorrow" },
  ]);
}

export async function dismissNotification(identifier) {
  try {
    await Notifications.dismissNotificationAsync(identifier);
  } catch (e) {
    // Already gone (e.g. user swiped it away first) -- nothing to do.
  }
}

export async function requestNotificationPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      // Explicit so a class alarm can actually alert/sound/appear on the
      // lock screen on iOS -- without these, requestPermissionsAsync()
      // still "succeeds" but iOS may silently withhold sound or lock
      // screen presentation for the permission types it wasn't asked for.
      allowAlert: true,
      allowSound: true,
      allowBadge: true,
      allowCriticalAlerts: false, // requires a special Apple entitlement we don't have
      allowDisplayInCarPlay: false,
      provideAppNotificationSettings: true,
    },
  });
  return status === "granted";
}

export async function setupAndroidChannel() {
  if (Platform.OS === "android") {
    // General reminders (tasks, bills, loans, daily budget review): a
    // brief double-buzz, enough to notice without being alarming.
    await Notifications.setNotificationChannelAsync("layp-reminders", {
      name: "LAYP reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    // Class start/advance reminders: a longer, more insistent repeating
    // buzz pattern -- these are meant to actually get noticed like an
    // alarm, matching the vibration used by the in-app alarm popup
    // (ClassAlarmScreen) for when the app happens to be in the foreground.
    // `sound` and `lockscreenVisibility` are set explicitly here because
    // Android ignores the per-notification `sound`/visibility once a
    // channel exists -- only the channel's own settings apply from then on,
    // so leaving these unset means the class alarm can silently end up with
    // no sound and/or a hidden lock-screen preview on some devices.
    await Notifications.setNotificationChannelAsync("layp-class-alarm", {
      name: "LAYP class alarms",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 400, 700, 400, 700, 400],
      enableVibrate: true,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
  }
}

// Wraps every call to expo-notifications' own scheduleNotificationAsync so
// a failure -- permission revoked mid-session, an OS/OEM scheduling
// restriction, a malformed trigger -- can't leave LAYP's own state
// believing a reminder was armed when the platform actually refused it.
// Returns null instead of throwing, so one failed occurrence (say, one
// weekday of a weekly reminder) doesn't abort every other id still being
// scheduled around it -- callers building an ids array should filter out
// nulls before storing the result.
async function safeScheduleNotificationAsync(config) {
  try {
    return await Notifications.scheduleNotificationAsync(config);
  } catch (e) {
    console.error("Failed to schedule notification:", e?.message || e);
    return null;
  }
}

// Builds the full task detail line used by the soft Reminder notification --
// due date/time, category (or linked subject if it's a school task), and
// subtask progress -- so the notification alone tells the whole story
// instead of just the bare title. `subject` is optional (only present for
// category === "school" tasks with a linked subject), mirroring how
// rescheduleTodoAlarm already builds its own richer detail list for the
// native full-screen alarm.
function reminderBody(todo, subject) {
  const parts = [];
  if (todo.dueDate) {
    const dleft = daysUntil(todo.dueDate);
    const when = dleft === 0 ? "today" : dleft < 0 ? `${Math.abs(dleft)} day(s) ago` : `in ${dleft} day(s)`;
    const timeSuffix = todo.dueTime ? ` \u00b7 ${fmtTime12(todo.dueTime)}` : "";
    parts.push(`Due ${when} (${fmtDateLong(todo.dueDate)}${timeSuffix})`);
  }
  if (subject) {
    parts.push(`${subject.code}${subject.description ? ` \u2014 ${subject.description}` : ""}`);
  } else if (todo.category) {
    parts.push(todo.category[0].toUpperCase() + todo.category.slice(1));
  }
  if (todo.subtasks?.length) {
    const done = todo.subtasks.filter((s) => s.done).length;
    parts.push(`${done}/${todo.subtasks.length} subtasks done`);
  }
  const detail = parts.join(" \u00b7 ");
  return detail ? `"${todo.title}" \u2014 ${detail}` : `"${todo.title}"`;
}

async function scheduleOne(todo, trigger, subject) {
  return safeScheduleNotificationAsync({
    content: { title: todo.title, body: reminderBody(todo, subject), sound: true },
    trigger:
      Platform.OS === "android" ? { ...trigger, channelId: "layp-reminders" } : trigger,
  });
}

// Cancels any previously scheduled notifications for this todo, then
// schedules new ones based on its notify config. Returns the array of
// notification ids to store back on the todo.
//
// Due date and reminders are independent now: a task can have a reminder
// with no due date at all (it just repeats indefinitely), a due date with
// no reminder, or both -- in which case the due date acts as the cutoff
// for repeating reminders (see the "isPastDue" cleanup check in App.js).
// Only the "once" type inherently needs a specific date to fire on, so it
// requires a due date; every other type works with or without one.
// `subject` is optional -- pass the todo's linked school subject (when
// todo.category === "school") so the notification body can name the class,
// the same way rescheduleTodoAlarm already does for the native alarm.
export async function rescheduleTodoNotifications(todo, subject) {
  await cancelTodoNotifications(todo.notificationIds);
  if (todo.completed || todo.reminderEnabled === false) return [];

  const n = todo.notify || { type: "daily", time: "08:00" };
  const ids = [];

  if (n.type === "once") {
    if (!todo.dueDate) return [];
    const [h, m] = (n.time || "08:00").split(":").map(Number);
    const fireDate = new Date(`${todo.dueDate}T00:00:00`);
    fireDate.setHours(h, m, 0, 0);
    if (fireDate.getTime() > Date.now()) {
      ids.push(await scheduleOne(todo, { date: fireDate }, subject));
    }
  } else if (n.type === "daily") {
    const [h, m] = (n.time || "08:00").split(":").map(Number);
    // Repeats every day at this time. Expo will keep firing it; the app
    // cancels it once the task is marked complete or the due date passes
    // (see the daily "isPastDue" cleanup check in App.js).
    ids.push(await scheduleOne(todo, { hour: h, minute: m, repeats: true }, subject));
  } else if (n.type === "weekly") {
    const [h, m] = (n.time || "08:00").split(":").map(Number);
    for (const weekday of n.weekdays || []) {
      ids.push(await scheduleOne(todo, { weekday, hour: h, minute: m, repeats: true }, subject));
    }
  } else if (n.type === "interval") {
    const hrs = Number(n.intervalHours) || 1;
    ids.push(await scheduleOne(todo, { seconds: hrs * 3600, repeats: true }, subject));
  } else if (n.type === "custom") {
    for (const t of n.times || []) {
      const [h, m] = t.split(":").map(Number);
      ids.push(await scheduleOne(todo, { hour: h, minute: m, repeats: true }, subject));
    }
  }
  return ids.filter(Boolean);
}

export async function cancelTodoNotifications(ids) {
  if (!ids || !ids.length) return;
  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (e) {
      // already fired/cancelled -- safe to ignore
    }
  }
}

// --- Task alarms ---
//
// Separate from the soft Reminder notification above: a task alarm is the
// real ringing kind (sound, vibration, full-screen lock-screen UI), armed
// through the same native Kotlin engine School's class alarms use (see
// modules/layp-alarm). Only meaningful once a task has both a due date and
// a due time -- there's no cross-platform equivalent, so on iOS (or an
// Android build that hasn't linked the native module yet) this silently
// does nothing and the ordinary Reminder notification still covers it.
// `subject` is optional -- pass the todo's linked school subject (when
// todo.category === "school") so the ring screen/notification can show
// which class it's for, not just the bare task title.
export async function rescheduleTodoAlarm(todo, subject) {
  if (!LaypAlarm.isNativeAlarmAvailable()) return false;
  const id = `task:${todo.id}`;
  if (todo.completed || !todo.alarmEnabled || !todo.dueDate || !todo.dueTime) {
    await LaypAlarm.cancelAlarm(id);
    return false;
  }
  const [hour, minute] = todo.dueTime.split(":").map(Number);
  const details = [`\u{1F4C5} Due ${fmtDateLong(todo.dueDate)} \u00b7 ${fmtTime12(todo.dueTime)}`];
  if (subject) details.push(`\u{1F393} ${subject.code}${subject.description ? ` \u2014 ${subject.description}` : ""}`);
  if (todo.subtasks?.length) {
    const done = todo.subtasks.filter((s) => s.done).length;
    details.push(`\u2705 ${done}/${todo.subtasks.length} subtasks done`);
  }
  await LaypAlarm.updateAlarm({
    id,
    title: "\u23f0 Task due now",
    body: todo.title,
    heading: todo.title,
    subheading: subject ? subject.code : (todo.category ? todo.category[0].toUpperCase() + todo.category.slice(1) : ""),
    details,
    hour,
    minute,
    date: todo.dueDate,
    kind: "task",
  });
  return true;
}

export async function cancelTodoAlarm(todoId) {
  if (!LaypAlarm.isNativeAlarmAvailable()) return;
  await LaypAlarm.cancelAlarm(`task:${todoId}`);
}

// Loans get one simple one-time reminder at 9am on the due date -- these
// aren't recurring like task reminders, since a loan has a single due
// moment rather than an ongoing schedule.
export async function rescheduleLoanNotification(loan) {
  await cancelTodoNotifications(loan.notificationId ? [loan.notificationId] : []);
  if (!loan.dueDate || loan.settled) return null;

  const fireDate = new Date(`${loan.dueDate}T09:00:00`);
  if (fireDate.getTime() <= Date.now()) return null;

  const body =
    loan.type === "lent"
      ? `${loan.person} owes you ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(loan.principal * (1 + (loan.interestPercent || 0) / 100))} today`
      : `You owe ${loan.person} ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(loan.principal * (1 + (loan.interestPercent || 0) / 100))} today`;

  const id = await safeScheduleNotificationAsync({
    content: { title: "Payment due", body, sound: true },
    trigger: Platform.OS === "android" ? { date: fireDate, channelId: "layp-reminders" } : { date: fireDate },
  });
  return id;
}

// Daily Budget Review: one repeating local notification whose content gets
// refreshed (cancel + reschedule) whenever the app recomputes the day's
// numbers -- Expo notifications can't compute their own body at fire time,
// so this is the closest practical approximation to "context-aware" for a
// purely local, no-backend notification. See dailyBudgetNotificationContent
// in utils.js for how the title/body are derived.
//
// `savings` (optional) is { amount, account } -- when there's a positive
// amount safe to save right now, it's embedded in the notification's data
// payload and the DAILY_BUDGET_CATEGORY is attached so "Save to savings"
// shows up as a button on the notification itself; otherwise only "Keep
// for tomorrow" makes sense, so the category (and its Save button) is left
// off entirely rather than offering a button that would save ₱0.
export async function rescheduleDailyBudgetNotification(previousId, settings, content, savings) {
  await cancelTodoNotifications(previousId ? [previousId] : []);
  if (!settings?.enabled || !settings?.time) return null;
  const [h, m] = settings.time.split(":").map(Number);
  const hasSaveOption = Number(savings?.amount) > 0;
  return safeScheduleNotificationAsync({
    content: {
      title: content.title,
      body: content.body,
      sound: true,
      data: { type: "dailyBudget", saveAmount: hasSaveOption ? Number(savings.amount) : 0, saveAccount: savings?.account || null },
      categoryIdentifier: hasSaveOption ? DAILY_BUDGET_CATEGORY : undefined,
    },
    trigger: Platform.OS === "android" ? { hour: h, minute: m, repeats: true, channelId: "layp-reminders" } : { hour: h, minute: m, repeats: true },
  });
}

// One-time cleanup for a bug in an earlier version: a race between two
// overlapping reschedule calls could leave an extra, permanently untracked
// copy of this repeating notification on the device (see the debounce +
// request-token guard around this function's call site in App.js). Only
// dailyBudgetNotifId was ever remembered, so any duplicate had no way to
// get cancelled on its own -- this sweeps every *scheduled* notification
// (not yet-delivered ones sitting in the shade) tagged data.type ===
// "dailyBudget" and cancels all of them, so the very next
// rescheduleDailyBudgetNotification call above starts from a clean slate
// instead of adding yet another copy alongside existing duplicates. Safe
// to call on every app start -- it's a no-op once there's nothing left to
// clean up.
//
// That alone only stops *future* firings, though -- every orphaned
// duplicate that was scheduled before this cleanup ever got a chance to
// run had already been quietly firing every single day at the same
// repeating trigger time, so by the time the fix landed there could
// already be a whole stack of near-identical "Savings opportunity"
// notifications sitting delivered in the notification shade (this is
// exactly what a pile of same-time duplicates in the shade means: not one
// notification repeating, but several separate orphaned copies that all
// fired together). Cancelling the scheduled copies doesn't un-deliver
// ones that already fired, so this also sweeps anything already
// *presented* with the same tag and dismisses it -- the app recomputes
// and reschedules a fresh one right after this runs anyway, so there's
// nothing worth preserving in the stale delivered copies.
//
// One more wrinkle: the `data.type: "dailyBudget"` tag itself was added
// *as part of* this fix, so any duplicate scheduled by a version of the
// app from before the tag existed has no tag to match on -- it would
// otherwise keep silently re-firing its original, increasingly stale
// "Savings opportunity" figure forever, from what looks like "a past
// budget" since it was never rescheduled with current numbers. These
// legacy copies are recognized by title instead, since the four possible
// titles this feature has ever used are fixed strings (kept in sync with
// dailyBudgetNotificationContent in utils.ts).
const LEGACY_DAILY_BUDGET_TITLES = [
  "\ud83c\udf19 Daily budget review",
  "\u26a0\ufe0f Daily budget review",
  "\u26a0\ufe0f Budget review",
  "\ud83d\udcb0 Savings opportunity",
];
function isDailyBudgetNotificationContent(content) {
  if (content?.data?.type === "dailyBudget") return true;
  return LEGACY_DAILY_BUDGET_TITLES.includes(content?.title);
}

export async function cleanupDuplicateDailyBudgetNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const dupes = scheduled.filter((n) => isDailyBudgetNotificationContent(n.content));
    for (const n of dupes) {
      try {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      } catch (e) {
        // already gone -- fine
      }
    }
  } catch (e) {
    // best-effort cleanup; a failure here shouldn't block the app
  }

  try {
    const presented = await Notifications.getPresentedNotificationsAsync();
    const presentedDupes = presented.filter((n) => isDailyBudgetNotificationContent(n.request?.content));
    for (const n of presentedDupes) {
      try {
        await Notifications.dismissNotificationAsync(n.request.identifier);
      } catch (e) {
        // already gone -- fine
      }
    }
  } catch (e) {
    // best-effort cleanup; a failure here shouldn't block the app
  }
}

// --- Notification tap handling ---
//
// Lets a screen react when the person taps a delivered notification (as
// opposed to just receiving/displaying one). Two entry points are needed:
// addNotificationResponseListener for taps while the app is already
// running (foreground or background), and getLastNotificationResponse for
// the case where tapping the notification is what *launched* the app from
// fully killed -- that tap already happened before any listener could be
// attached, so it has to be read back explicitly on mount instead.
export function addNotificationResponseListener(callback) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

export async function getLastNotificationResponse() {
  try {
    return await Notifications.getLastNotificationResponseAsync();
  } catch (e) {
    console.error("getLastNotificationResponse failed", e);
    return null;
  }
}

// --- School: class + advance reminders ---
//
// A subject can meet multiple times a week (possibly across several
// schedule entries with different day/time blocks). Both the "class
// starting now" reminder and the optional "class in N minutes" advance
// reminder are weekly-repeating triggers, one per meeting day, same
// pattern as a Todo's "weekly" notify type. All ids fired for a subject are
// kept together on subject.notificationIds so they can be cancelled as a
// group whenever the subject, its schedule, or its reminder settings
// change, or when its academic period stops being the active one.
function classBody(subject, entry) {
  const time = `${fmtTime12(entry.startTime)} \u2013 ${fmtTime12(entry.endTime)}`;
  const room = subject.room ? `\nRoom ${subject.room}` : "";
  const professor = subject.professor ? `\n${subject.professor}` : "";
  return `${subject.code} \u2014 ${subject.description}\n${time}${room}${professor}`;
}

// Short, already-formatted rows for the ring screen's detail card (native
// AlarmActivity, and the in-app ClassAlarmScreen) -- one line per known
// fact about the meeting, skipping anything the subject hasn't filled in.
function classDetailLines(subject, entry) {
  const lines = [`\u{1F550} ${fmtTime12(entry.startTime)} \u2013 ${fmtTime12(entry.endTime)}`];
  if (subject.room) lines.push(`\u{1F4CD} Room ${subject.room}`);
  if (subject.professor) lines.push(`\u{1F9D1}\u200D\u{1F3EB} ${subject.professor}`);
  if (subject.notes) lines.push(`\u{1F4DD} ${subject.notes}`);
  return lines;
}

async function scheduleWeekly(weekday, hour, minute, content) {
  return safeScheduleNotificationAsync({
    content: {
      ...content,
      sound: true,
      // Android channel vibration only fires once at delivery, not on a
      // loop -- setting it here too doesn't change that (a real
      // continuously-ringing alarm needs a foreground service + full-screen
      // intent, which is native code outside what expo-notifications'
      // JS API can configure), but it does make sure this specific
      // notification uses the strongest available pattern rather than
      // whatever a shared default would be.
      vibrate: [0, 700, 400, 700, 400, 700, 400],
      priority: Notifications.AndroidNotificationPriority.MAX,
      sticky: true, // can't be swiped away by accident -- only "I'm up" / "Class cancelled" or opening it clears it
      autoDismiss: false,
      interruptionLevel: "timeSensitive", // iOS: break through Focus/Do Not Disturb without needing the Critical Alerts entitlement
      categoryIdentifier: CLASS_ALARM_CATEGORY,
    },
    trigger: Platform.OS === "android" ? { weekday, hour, minute, repeats: true, channelId: "layp-class-alarm" } : { weekday, hour, minute, repeats: true },
  });
}

// Arms the real, ringing "class starting now" alarm through the native
// Kotlin engine (AlarmManager + a full-screen lock-screen Activity) rather
// than an expo-notifications trigger -- see modules/layp-alarm. One native
// alarm id per schedule entry (it already carries its own list of meeting
// days), prefixed so cancelSubjectNotifications can recognize and route to
// it later.
async function scheduleNativeClassAlarm(subject, entry, hour, minute) {
  if (!entry.days?.length) return null;
  const id = `class:${subject.id}:${entry.id}`;
  await LaypAlarm.updateAlarm({
    id,
    title: "\ud83d\udd14 Class starting now",
    body: classBody(subject, entry),
    heading: subject.code || "Class starting now",
    subheading: subject.description || "",
    details: classDetailLines(subject, entry),
    hour,
    minute,
    days: entry.days,
    repeatWeekly: true,
    kind: "class",
  });
  return `${NATIVE_ALARM_PREFIX}${id}`;
}

// Marks a class's native "starting now" alarm suspended for just today --
// called both from the in-app advance-reminder popup (App.js#
// handleSuspendClass) and, symmetrically, whenever the native ring screen's
// own "Class suspended today?" option fires (see addAlarmSuspendedListener
// below), so either path keeps the other in sync.
export async function suspendClassAlarmToday(subjectId, entryId) {
  if (!LaypAlarm.isNativeAlarmAvailable()) return;
  await LaypAlarm.suspendAlarmToday(`class:${subjectId}:${entryId}`);
}

// callback receives { id: "class:<subjectId>:<entryId>", date, kind }.
// Only fires for a suspend that happened natively (the in-app popup's own
// suspend button already updates cancelledClasses directly in App.js).
export function addClassAlarmSuspendedListener(callback) {
  return LaypAlarm.addAlarmSuspendedListener((event) => {
    if (event?.kind !== "class") return;
    const parts = (event.id || "").split(":");
    if (parts[0] !== "class" || parts.length < 3) return;
    callback({ subjectId: parts[1], entryId: parts[2], date: event.date });
  });
}

// "Do you have class today?" -- a lighter-weight, earlier heads-up than
// the actual class alarm, for the common case where a class is
// suspended/cancelled and the person already knows before the alarm's own
// time comes around. Tapping "None" reuses the exact same suspend
// machinery as the in-app/native "Class suspended today?" option (see
// addClassAlarmSuspendedListener's App.js counterpart, handleSuspendClass)
// so it's honored the same way either alarm would have checked it.
// Deliberately a plain expo-notification (not a native ring) -- this is a
// question to answer when convenient, not something that needs to wake
// the phone up like a real alarm.
async function scheduleClassCheckIn(subject, entry, hour, minute) {
  const minutesBefore = Number(subject.classCheckInMinutes) || CLASS_CHECKIN_MINUTES_BEFORE_FALLBACK;
  const ids = [];
  for (const weekday of entry.days) {
    let total = hour * 60 + minute - minutesBefore;
    let wd = weekday;
    if (total < 0) {
      total += 24 * 60;
      wd = wd === 1 ? 7 : wd - 1;
    }
    const oh = Math.floor(total / 60);
    const om = total % 60;
    ids.push(
      await safeScheduleNotificationAsync({
        content: {
          title: "Do you have class today?",
          body: `${subject.code} \u2014 ${subject.description}, ${fmtTime12(entry.startTime)}`,
          sound: true,
          categoryIdentifier: CLASS_CHECKIN_CATEGORY,
          data: { type: "classCheckIn", subjectId: subject.id, entryId: entry.id },
        },
        trigger: Platform.OS === "android" ? { weekday: wd, hour: oh, minute: om, repeats: true, channelId: "layp-reminders" } : { weekday: wd, hour: oh, minute: om, repeats: true },
      })
    );
  }
  return ids.filter(Boolean);
}

async function cancelClassAlarmId(id) {
  if (id.startsWith(NATIVE_ALARM_PREFIX)) {
    await LaypAlarm.cancelAlarm(id.slice(NATIVE_ALARM_PREFIX.length));
  } else {
    await cancelTodoNotifications([id]);
  }
}

export async function cancelSubjectNotifications(subject) {
  if (!subject?.notificationIds) return;
  for (const id of subject.notificationIds.class || []) await cancelClassAlarmId(id);
  await cancelTodoNotifications(subject.notificationIds.advance);
  await cancelTodoNotifications(subject.notificationIds.checkIn);
}

// Cancels this subject's previous notifications, then schedules fresh ones
// from its current reminder settings and the full list of schedule entries
// currently belonging to it. Returns the new { class, advance, checkIn } id
// arrays to store back on the subject. Pass an empty `entries` array (or
// call cancelSubjectNotifications directly) to just stop reminders, e.g.
// when the subject's period is no longer the active one.
export async function rescheduleSubjectNotifications(subject, entries) {
  await cancelSubjectNotifications(subject);
  const classIds = [];
  const advanceIds = [];
  const checkInIds = [];

  for (const entry of entries) {
    const [h, m] = (entry.startTime || "08:00").split(":").map(Number);

    if (subject.classReminderEnabled !== false) {
      if (LaypAlarm.isNativeAlarmAvailable()) {
        const id = await scheduleNativeClassAlarm(subject, entry, h, m);
        if (id) classIds.push(id);
      } else {
        // iOS, or an Android build made before this module was linked --
        // falls back to the previous expo-notifications-based weekly
        // trigger so class reminders keep working either way.
        for (const weekday of entry.days) {
          classIds.push(await scheduleWeekly(weekday, h, m, { title: "\ud83d\udd14 Class starting now", body: classBody(subject, entry), data: { type: "classAlarm", subjectId: subject.id } }));
        }
      }
      if (subject.classCheckInEnabled !== false) {
        checkInIds.push(...(await scheduleClassCheckIn(subject, entry, h, m)));
      }
    }

    if (subject.advanceReminderEnabled) {
      const advanceMin = Number(subject.advanceReminderMinutes) || 10;
      for (const weekday of entry.days) {
        // Roll back into the previous weekday if the advance offset crosses
        // midnight (e.g. a 12:05am class with a 10-minute advance reminder).
        let total = h * 60 + m - advanceMin;
        let wd = weekday;
        if (total < 0) {
          total += 24 * 60;
          wd = wd === 1 ? 7 : wd - 1;
        }
        const oh = Math.floor(total / 60);
        const om = total % 60;
        advanceIds.push(
          await scheduleWeekly(wd, oh, om, { title: `\ud83d\udd14 Class in ${advanceMin} minutes`, body: classBody(subject, entry), data: { type: "classAlarm", subjectId: subject.id } })
        );
      }
    }
  }

  return { class: classIds.filter(Boolean), advance: advanceIds.filter(Boolean), checkIn: checkInIds.filter(Boolean) };
}

// Fires immediately (not scheduled ahead of time) the moment a spend
// category crosses 80% of its recommended amount for today -- a one-off
// heads-up, not a repeating alarm like the class/reminder notifications
// above. Uses the same "reminders" channel/importance as other everyday
// nudges (bills, tasks), not the insistent class-alarm channel.
export async function notifyBudgetThreshold(category) {
  const pct = category.recommended > 0 ? Math.round((category.actual / category.recommended) * 100) : 0;
  return safeScheduleNotificationAsync({
    content: {
      title: `${category.label} budget check-in`,
      body: `You've used ${pct}% of today's ${category.label} budget (${peso(category.actual)} of ${peso(category.recommended)}).`,
      sound: true,
    },
    trigger: Platform.OS === "android" ? { seconds: 1, channelId: "layp-reminders" } : { seconds: 1 },
  });
}

export async function rescheduleBillNotification(bill) {
  await cancelTodoNotifications(bill.notificationId ? [bill.notificationId] : []);
  if (!bill.dueDate || bill.paid) return null;

  const fireDate = new Date(`${bill.dueDate}T09:00:00`);
  if (fireDate.getTime() <= Date.now()) return null;

  return safeScheduleNotificationAsync({
    content: {
      title: "Bill due today",
      body: `${bill.name} needs ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(bill.amount)} today`,
      sound: true,
    },
    trigger: Platform.OS === "android" ? { date: fireDate, channelId: "layp-reminders" } : { date: fireDate },
  });
}
