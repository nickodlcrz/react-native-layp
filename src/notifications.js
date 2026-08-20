import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { daysUntil, fmtDateLong } from "./utils";

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
    await Notifications.setNotificationChannelAsync("layp-reminders", {
      name: "LAYP reminders",
      importance: Notifications.AndroidImportance.HIGH,
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
