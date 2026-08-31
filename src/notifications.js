import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { daysUntil, fmtDateLong, fmtTime12 } from "./utils";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
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
    });
    // Class start/advance reminders: a longer, more insistent repeating
    // buzz pattern -- these are meant to actually get noticed like an
    // alarm, matching the vibration used by the in-app alarm popup
    // (ClassAlarmScreen) for when the app happens to be in the foreground.
    await Notifications.setNotificationChannelAsync("layp-class-alarm", {
      name: "LAYP class alarms",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 700, 400, 700, 400, 700, 400],
      enableVibrate: true,
    });
  }
}

function reminderBody(todo) {
  if (!todo.dueDate) return `Reminder: "${todo.title}"`;
  const dleft = daysUntil(todo.dueDate);
  const when = dleft === 0 ? "today" : dleft < 0 ? `${Math.abs(dleft)} day(s) ago` : `in ${dleft} day(s)`;
  return `"${todo.title}" is due ${when} (${fmtDateLong(todo.dueDate)})`;
}

async function scheduleOne(todo, trigger) {
  return Notifications.scheduleNotificationAsync({
    content: { title: "Reminder", body: reminderBody(todo), sound: true },
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
export async function rescheduleTodoNotifications(todo) {
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
      ids.push(await scheduleOne(todo, { date: fireDate }));
    }
  } else if (n.type === "daily") {
    const [h, m] = (n.time || "08:00").split(":").map(Number);
    // Repeats every day at this time. Expo will keep firing it; the app
    // cancels it once the task is marked complete or the due date passes
    // (see the daily "isPastDue" cleanup check in App.js).
    ids.push(await scheduleOne(todo, { hour: h, minute: m, repeats: true }));
  } else if (n.type === "weekly") {
    const [h, m] = (n.time || "08:00").split(":").map(Number);
    for (const weekday of n.weekdays || []) {
      ids.push(await scheduleOne(todo, { weekday, hour: h, minute: m, repeats: true }));
    }
  } else if (n.type === "interval") {
    const hrs = Number(n.intervalHours) || 1;
    ids.push(await scheduleOne(todo, { seconds: hrs * 3600, repeats: true }));
  } else if (n.type === "custom") {
    for (const t of n.times || []) {
      const [h, m] = t.split(":").map(Number);
      ids.push(await scheduleOne(todo, { hour: h, minute: m, repeats: true }));
    }
  }
  return ids;
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

  const id = await Notifications.scheduleNotificationAsync({
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
export async function rescheduleDailyBudgetNotification(previousId, settings, content) {
  await cancelTodoNotifications(previousId ? [previousId] : []);
  if (!settings?.enabled || !settings?.time) return null;
  const [h, m] = settings.time.split(":").map(Number);
  return Notifications.scheduleNotificationAsync({
    content: { title: content.title, body: content.body, sound: true },
    trigger: Platform.OS === "android" ? { hour: h, minute: m, repeats: true, channelId: "layp-reminders" } : { hour: h, minute: m, repeats: true },
  });
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
  return `${subject.code} \u2014 ${subject.description}\n${time}${room}`;
}

async function scheduleWeekly(weekday, hour, minute, content) {
  return Notifications.scheduleNotificationAsync({
    content: { ...content, sound: true },
    trigger: Platform.OS === "android" ? { weekday, hour, minute, repeats: true, channelId: "layp-class-alarm" } : { weekday, hour, minute, repeats: true },
  });
}

export async function cancelSubjectNotifications(subject) {
  if (!subject?.notificationIds) return;
  await cancelTodoNotifications(subject.notificationIds.class);
  await cancelTodoNotifications(subject.notificationIds.advance);
}

// Cancels this subject's previous notifications, then schedules fresh ones
// from its current reminder settings and the full list of schedule entries
// currently belonging to it. Returns the new { class, advance } id arrays to
// store back on the subject. Pass an empty `entries` array (or call
// cancelSubjectNotifications directly) to just stop reminders, e.g. when the
// subject's period is no longer the active one.
export async function rescheduleSubjectNotifications(subject, entries) {
  await cancelSubjectNotifications(subject);
  const classIds = [];
  const advanceIds = [];

  for (const entry of entries) {
    const [h, m] = (entry.startTime || "08:00").split(":").map(Number);

    if (subject.classReminderEnabled !== false) {
      for (const weekday of entry.days) {
        classIds.push(await scheduleWeekly(weekday, h, m, { title: "\ud83d\udd14 Class starting now", body: classBody(subject, entry) }));
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
          await scheduleWeekly(wd, oh, om, { title: `\ud83d\udd14 Class in ${advanceMin} minutes`, body: classBody(subject, entry) })
        );
      }
    }
  }

  return { class: classIds, advance: advanceIds };
}

export async function rescheduleBillNotification(bill) {
  await cancelTodoNotifications(bill.notificationId ? [bill.notificationId] : []);
  if (!bill.dueDate || bill.paid) return null;

  const fireDate = new Date(`${bill.dueDate}T09:00:00`);
  if (fireDate.getTime() <= Date.now()) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: "Bill due today",
      body: `${bill.name} needs ${new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(bill.amount)} today`,
      sound: true,
    },
    trigger: Platform.OS === "android" ? { date: fireDate, channelId: "layp-reminders" } : { date: fireDate },
  });
}
