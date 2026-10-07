import { blocksForWeekday, getActivePeriod, subjectsForPeriod, weekdayLabel, minutesSinceMidnight } from "./school";
import { normalizeWidgetPrefs } from "./widgetPrefsLogic";
// Pure helpers for the Android spending widget (modules/layp-widget). No
// React Native imports, so everything here can be unit tested on its own.

// Shown on the widget's quick-log chips until there is enough history to
// pick the person's own most-used labels.
export const DEFAULT_WIDGET_LABELS = ["Food", "Transportation", "School", "Shopping"];
export const WIDGET_LABEL_COUNT = 4;
const LABEL_WINDOW_DAYS = 60;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// "YYYY-MM-DD" -> the same format `days` earlier (UTC math, so DST can't
// shift the result by a day).
function daysBefore(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}

// The labels used most often over the last two months, best first, padded
// out with the defaults so there are always `limit` of them. Labels are
// matched ignoring case ("food" and "Food" are one label), shown the way
// they were most recently typed. Expenses with no label don't count.
export function topLabels(expenses, today, limit = WIDGET_LABEL_COUNT) {
  const cutoff = daysBefore(today, LABEL_WINDOW_DAYS);
  const stats = new Map(); // lowercase -> { label, count, last }
  for (const e of expenses) {
    const label = (e.label || "").trim();
    if (!label || !e.date || e.date < cutoff || e.date > today) continue;
    const key = label.toLowerCase();
    const entry = stats.get(key) || { label, count: 0, last: "" };
    entry.count += 1;
    if (e.date >= entry.last) { entry.last = e.date; entry.label = label; }
    stats.set(key, entry);
  }
  const ranked = [...stats.values()]
    .sort((a, b) => b.count - a.count || b.last.localeCompare(a.last))
    .map((s) => s.label);
  const out = [];
  for (const label of [...ranked, ...DEFAULT_WIDGET_LABELS]) {
    if (out.length >= limit) break;
    if (!out.some((l) => l.toLowerCase() === label.toLowerCase())) out.push(label);
  }
  return out;
}

export const MAX_RECENT_EXPENSES = 300;
// Native ListViews scroll; retain every open task rather than truncating the list.

const STATUS_ORDER = ["not_started", "wip", "to_pass"];

// Everything the widgets show or offer, as the JSON the native side stores.
// `balanceOf(accountId)` is injected (rather than importing LAYP's balance
// math) so this stays free of app dependencies.
export function buildWidgetSummary({
  expenses = [], splits = [], accounts = [], balanceOf = () => 0, hidden = false, today, currency = "\u20B1",
  dark = false, incomeCategories = [], todos = [], events = [], upcoming = [], subjects = [], categories = [], academicPeriods = [], scheduleEntries = [], cancelledClasses = [], appliedWidgetIds = [], widgetPrefs = null,
}) {
  const prefs = normalizeWidgetPrefs(widgetPrefs);
  const todays = expenses.filter((e) => e.date === today);
  const recent = [...expenses]
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, MAX_RECENT_EXPENSES)
    .map((e) => ({ id: e.id, name: e.name || "", label: e.label || "", amount: round2(e.amount), date: e.date, account: e.account || "", splitId: e.splitId || "" }));
  const subjectCode = (t) => (t.subjectId ? subjects.find((s) => s.id === t.subjectId)?.code || "" : "");
  const categoryLabel = (t) => categories.find((c) => c.id === t.category)?.label || "";
  const tasks = todos
    .filter((t) => !t.completed && (!t.subjectId || prefs.subjectIds === null || prefs.subjectIds.includes(t.subjectId)))
    .sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"))
    .map((t) => ({ id: t.id, title: t.title || "Untitled task", status: STATUS_ORDER.includes(t.status) ? t.status : "not_started", due: t.dueDate || null, dueTime: t.dueTime || null, category: t.category || "", categoryLabel: categoryLabel(t), subject: subjectCode(t), subtaskCount: (t.subtasks || []).length, subtaskDone: (t.subtasks || []).filter((s) => s.done).length }));
  const activePeriod = getActivePeriod(academicPeriods);
  const activeSubjects = activePeriod ? subjectsForPeriod(subjects, activePeriod.id) : [];
  const activeIds = new Set(activeSubjects.map((s) => s.id));
  const activeEntries = scheduleEntries.filter((e) => activeIds.has(e.subjectId) && (prefs.subjectIds === null || prefs.subjectIds.includes(e.subjectId)));
  // Use the supplied local calendar date, not a second clock read.
  const todayId = new Date(`${today}T12:00:00`).getDay() + 1;
  const cancelledToday = new Set(cancelledClasses.filter((c) => c.date === today).map((c) => c.entryId));
  const classBlock = (b, dayLabel = "Today") => ({
    entryId: b.entry.id,
    subjectId: b.subject.id,
    code: b.subject.code || b.subject.description || "Class",
    description: b.subject.description || "",
    room: b.subject.room || "",
    start: b.entry.startTime || "",
    end: b.entry.endTime || "",
    startMin: b.startMin,
    endMin: b.endMin,
    dayLabel,
  });
  // A weekly snapshot lets Android pick its own local day after midnight,
  // without waiting for React Native to publish another summary.
  const classSchedule = activeEntries.map((entry) => {
    const subject = activeSubjects.find((s) => s.id === entry.subjectId);
    return { ...classBlock({ entry, subject, startMin: minutesSinceMidnight(entry.startTime), endMin: minutesSinceMidnight(entry.endTime) }), days: (entry.days || []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7) };
  }).filter((c) => c.startMin >= 0 && c.endMin <= 1440 && c.endMin > c.startMin);
  const cancelledClassKeys = cancelledClasses.map((c) => `${c.date}|${c.entryId}`);
  const todayBlocks = blocksForWeekday(activeSubjects, activeEntries, todayId)
    .filter((b) => !cancelledToday.has(b.entry.id));
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const currentBlock = todayBlocks.find((b) => nowMin >= b.startMin && nowMin < b.endMin) || null;
  let classes = [];
  if (currentBlock) {
    const later = todayBlocks.filter((b) => b.startMin > nowMin);
    classes = [classBlock(currentBlock), ...later.map((b) => classBlock(b))];
  } else {
    const later = todayBlocks.filter((b) => b.startMin > nowMin);
    if (later.length) {
      classes = later.map((b) => classBlock(b));
    } else {
      for (let offset = 1; offset <= 7; offset += 1) {
        const dayId = ((todayId - 1 + offset) % 7) + 1;
        const dayDate = addDaysIso(today, offset);
        const dayBlocks = blocksForWeekday(activeSubjects, activeEntries, dayId);
        const first = dayBlocks.find((b) => !cancelledClasses.some((c) => c.date === dayDate && c.entryId === b.entry.id));
        if (first) {
          classes = [classBlock(first, weekdayLabel(dayId))];
          break;
        }
      }
    }
  }
  return {
    date: today,
    fontScale: prefs.fontScale,
    opacity: prefs.opacity,
    budgetAccountIds: prefs.accountIds,
    visibleSubjectIds: prefs.subjectIds,
    appliedWidgetIds,
    todaySpent: round2(todays.reduce((sum, e) => sum + Number(e.amount || 0), 0)),
    todayCount: todays.length,
    hidden: !!hidden,
    currency,
    theme: dark ? "dark" : "light",
    labels: topLabels(expenses, today),
    splits: splits.map((s) => ({ id: s.id, label: s.label })),
    accounts: accounts.map((a) => ({ id: a.id, label: a.label, balance: round2(balanceOf(a.id)) })),
    incomeCategories: incomeCategories.filter((c) => c.id !== "interest").map((c) => ({ id: c.id, label: c.label })),
    recent,
    subjects: subjects.map((s) => ({ id: s.id, label: s.code || s.description || "Subject" })),
    tasks,
    classes,
    classSchedule,
    cancelledClassKeys,
    events,     // marked on the Calendar widget
    upcoming,   // listed in the Upcoming events widget
  };
}

// Turns what the widget queued into real LAYP expenses.
//  - Anything whose id is already in `existingIds` is skipped, so a batch
//    that was saved but never acknowledged (app killed in between) can't be
//    added twice.
//  - A category or account that no longer exists falls back to the first
//    one, so an expense is never lost over a deleted category.
//  - Spending is never allowed past an account's balance. The widget's own
//    dialog already blocks it, but its balance can be slightly stale, so when
//    `balances` ({accountId: amount}) is given each expense is checked
//    against what is really left and rejected if it doesn't fit.
//    `moneyAdded` ({accountId: amount}) counts money received from the widget
//    in the same batch toward that balance.
// Returns { expenses, rejected, ackIds }: ackIds covers every queued entry we
// looked at (skipped, invalid or rejected ones too) so the queue always
// drains; `rejected` lists what didn't fit so the person can be told.
export function pendingToExpenses(pending, { splits = [], accounts = [], existingIds = new Set(), today, balances = null, moneyAdded = {} }) {
  const splitIds = new Set(splits.map((s) => s.id));
  const accountIds = new Set(accounts.map((a) => a.id));
  const remaining = balances ? { ...balances } : null;
  if (remaining) for (const [id, amt] of Object.entries(moneyAdded)) remaining[id] = (remaining[id] ?? 0) + amt;
  const expenses = [];
  const rejected = [];
  const seen = new Set();
  const ordered = [...pending].filter((p) => p && p.id).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  for (const p of ordered) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    const amount = round2(p.amount);
    if (existingIds.has(p.id) || !(amount > 0)) continue;
    const label = (p.label || "").trim();
    const account = accountIds.has(p.account) ? p.account : (accounts[0]?.id ?? "");
    if (remaining && account in remaining && amount > remaining[account] + 0.0001) {
      rejected.push({ id: p.id, name: (p.name || "").trim() || label || "Quick expense", amount, account, available: Math.max(0, round2(remaining[account])) });
      continue;
    }
    if (remaining && account in remaining) remaining[account] = round2(remaining[account] - amount);
    expenses.push({
      id: p.id,
      name: (p.name || "").trim() || label || "Quick expense",
      label,
      amount,
      splitId: splitIds.has(p.splitId) ? p.splitId : (splits[0]?.id ?? ""),
      account,
      date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : today,
      createdAt: Number(p.createdAt) || Date.now(),
    });
  }
  return { expenses, rejected, ackIds: pending.filter((p) => p && p.id).map((p) => p.id) };
}

// Money received/added from the widget -> LAYP moneyLog entries (same
// fields the in-app "Money received / added" form saves).
export function pendingToMoney(pending, { accounts = [], incomeCategories = [], existingIds = new Set(), today }) {
  const accountIds = new Set(accounts.map((a) => a.id));
  const categoryIds = new Set(incomeCategories.map((c) => c.id));
  const entries = [];
  const seen = new Set();
  for (const p of pending) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const amount = round2(p.amount);
    if (existingIds.has(p.id) || !(amount > 0)) continue;
    entries.push({
      id: p.id,
      amount,
      note: (p.note || "").trim(),
      category: categoryIds.has(p.category) ? p.category : "other",
      account: accountIds.has(p.account) ? p.account : (accounts[0]?.id ?? ""),
      date: /^\d{4}-\d{2}-\d{2}$/.test(p.date || "") ? p.date : today,
      createdAt: Number(p.createdAt) || Date.now(),
    });
  }
  return { entries, ackIds: pending.filter((p) => p && p.id).map((p) => p.id) };
}

// Task actions queued natively -- tapping a task's circle in the Tasks
// widget, or answering "Have you started?" on a notification without
// opening the app. Each op is absolute (set this status / complete this
// task), so replaying one is harmless:
//   { id, taskId, status, onlyIf? }  set status (only when the task is
//                                    currently `onlyIf`, if given)
//   { id, taskId, complete: true }   mark completed
// Returns { todos, completed, ackIds }. `completed` holds the tasks that were
// just finished so the caller can cancel their reminders/alarms, exactly like
// finishing one in the Todo screen does.
export function applyTaskOps(todos, ops) {
  const next = todos.map((t) => ({ ...t }));
  const completed = [];
  const ordered = [...ops].filter((o) => o && o.id).sort((a, b) => (a.at || 0) - (b.at || 0));
  for (const op of ordered) {
    const t = next.find((x) => x.id === op.taskId);
    if (!t || t.completed) continue;
    if (op.complete) {
      t.completed = true;
      t.completedAt = new Date(Number(op.at) || Date.now()).toISOString();
      completed.push(t);
    } else if (STATUS_ORDER.includes(op.status)) {
      if (op.onlyIf && t.status !== op.onlyIf) continue;
      t.status = op.status;
    }
  }
  return { todos: next, completed, ackIds: ops.filter((o) => o && o.id).map((o) => o.id) };
}

const TASK_CATEGORIES = ["school", "errands", "shopping", "other"];

// Tasks added from the Tasks widget's (+) button -> real LAYP tasks, shaped
// exactly like the ones the in-app form creates (see saveTodo / TodoForm in
// TodoScreen.js) with the form's own defaults: not started, no description, a
// daily 08:00 reminder, no alarm, no subtasks for older widget entries.
// New entries preserve the expanded form fields. The widget's id is kept as the
// task id, so absorbing the same entry twice can't create a duplicate.
// `notificationIds` is left empty -- the caller schedules the reminders and
// fills it in. Returns { todos, ackIds } (ackIds covers invalid ones too, so
// the queue always drains).
export function pendingToTodos(pending, { existingIds = new Set(), today, subjects = [] } = {}) {
  const todos = [];
  const seen = new Set();
  for (const p of pending) {
    if (!p || !p.id || seen.has(p.id)) continue;
    seen.add(p.id);
    const title = (p.title || "").trim();
    if (existingIds.has(p.id) || !title) continue;
    todos.push({
      id: p.id,
      title,
      description: typeof p.description === "string" ? p.description.trim() : "",
      category: TASK_CATEGORIES.includes(p.category) ? p.category : "other",
      status: "not_started",
      subjectId: p.category === "school" && subjects.some((s) => s.id === p.subjectId) ? p.subjectId : null,
      dueDate: validDate(p.dueDate) ? p.dueDate : null,
      dueTime: validDate(p.dueDate) && validTime(p.dueTime) ? p.dueTime : null,
      alarmEnabled: p.alarmEnabled === true && validDate(p.dueDate) && validTime(p.dueTime),
      reminderEnabled: p.reminderEnabled !== false,
      notify: normalizeTaskNotify(p.notify, validDate(p.dueDate)),
      subtasks: [],
      completed: false,
      notificationIds: [],
    });
  }
  return { todos, ackIds: pending.filter((p) => p && p.id).map((p) => p.id) };
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
function validTime(value) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || ""); }

function normalizeTaskNotify(value, hasDate) {
  const n = value && typeof value === "object" ? value : {};
  const type = ["once", "daily", "weekly", "interval", "custom"].includes(n.type) ? n.type : "daily";
  if (type === "weekly") {
    const weekdays = [...new Set((Array.isArray(n.weekdays) ? n.weekdays : []).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))];
    return { type: weekdays.length ? "weekly" : "daily", time: validTime(n.time) ? n.time : "08:00", ...(weekdays.length ? { weekdays } : {}) };
  }
  if (type === "interval") return { type, intervalHours: Math.max(1, Math.min(24, Number(n.intervalHours) || 1)) };
  if (type === "custom") {
    const times = [...new Set((Array.isArray(n.times) ? n.times : []).filter(validTime))].sort();
    return times.length ? { type, times } : { type: "daily", time: "08:00" };
  }
  return { type: type === "once" && !hasDate ? "daily" : type, time: validTime(n.time) ? n.time : "08:00" };
}

// Durable native queue -> the same reminder shape as RememberList's form.
export function pendingToReminders(pending, { existingIds = new Set() } = {}) {
  const reminders = [];
  const seen = new Set(existingIds);
  for (const p of pending) {
    if (!p?.id || seen.has(p.id) || typeof p.text !== "string" || !p.text.trim()) continue;
    seen.add(p.id);
    const mode = ["none", "notification", "popup", "both"].includes(p.remindMode) ? p.remindMode : "none";
    const interval = mode !== "none" && p.scheduleKind === "interval";
    const frequency = ["always", "1h", "3h", "custom"].includes(p.remindInterval?.frequency) ? p.remindInterval.frequency : "1h";
    const date = !interval && mode !== "none" && validDate(p.remindDate) ? p.remindDate : null;
    const until = !date && !interval && mode !== "none" && validDate(p.remindUntil) ? p.remindUntil : null;
    reminders.push({
      id: p.id, text: p.text.trim(), tags: [...new Set((Array.isArray(p.tags) ? p.tags : []).filter((t) => typeof t === "string").map((t) => t.trim()).filter(Boolean))],
      remindMode: mode, scheduleKind: interval ? "interval" : "time",
      remindDate: date, remindTime: !interval && mode !== "none" ? (validTime(p.remindTime) ? p.remindTime : "09:00") : null,
      remindUntil: until,
      remindInterval: interval ? { frequency: frequency === "always" && mode !== "popup" ? "1h" : frequency, customHours: frequency === "custom" ? Math.max(1 / 60, Math.min(24 * 365, Number(p.remindInterval.customHours) || 1)) : null } : null,
      createdAt: Number(p.createdAt) || Date.now(), done: false, popupFired: false, lastPopupShownDate: null, notificationId: null,
    });
  }
  return reminders;
}

export function applyClassSuspends(previous, pending) {
  const next = [...previous];
  for (const p of pending) {
    if (!p?.entryId || !validDate(p.date) || next.some((c) => c.entryId === p.entryId && c.date === p.date)) continue;
    next.push({ entryId: p.entryId, date: p.date });
  }
  return next;
}
