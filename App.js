import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { View, Text, Pressable, Image, StyleSheet, useColorScheme, AppState, BackHandler } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ListTodo, Wallet, FileText, Bell, X, Sun, Moon, Lock, Home, GraduationCap } from "lucide-react-native";

import { ThemeContext, LIGHT, DARK, ACCENT, DEFAULT_SPLITS, DEFAULT_ACCOUNTS, DEFAULT_DAILY_BUDGET_SETTINGS, DEFAULT_SCHOOL_DEFAULTS } from "./src/theme";
import { loadState, saveState } from "./src/storage";
import { requestNotificationPermission, setupAndroidChannel, setupNotificationCategories, cancelTodoNotifications, rescheduleDailyBudgetNotification, addNotificationResponseListener, getLastNotificationResponse, dismissNotification, DEFAULT_ACTION_IDENTIFIER, CLASS_ALARM_CONFIRM_ACTION, CLASS_ALARM_CANCELLED_ACTION } from "./src/notifications";
import { todayISO, daysUntil, fmtDateLong, uid, computeDailyBudgetReview, dailyBudgetNotificationContent, toLocalISO } from "./src/utils";
import { newAcademicPeriod, getActivePeriod, subjectsForPeriod, blocksForWeekday, todayExpoWeekday } from "./src/school";
import { LOGO_LIGHT_URI, LOGO_DARK_URI } from "./src/assets/logo";
import { setThemePreference } from "./src/themePreference";
import { isNativeAlarmAvailable } from "./modules/layp-alarm";
import LockScreen from "./src/screens/LockScreen";
import ClassAlarmScreen from "./src/components/ClassAlarmScreen";
import { getAutoLockMinutes, setAutoLockMinutes, AUTO_LOCK_OPTIONS, DEFAULT_AUTO_LOCK_MINUTES } from "./src/autoLockPreference";

import HomeScreen from "./src/screens/HomeScreen";
import TodoScreen from "./src/screens/TodoScreen";
import BudgetScreen from "./src/screens/BudgetScreen";
import SchoolScreen from "./src/screens/SchoolScreen";
import SummaryScreen from "./src/screens/SummaryScreen";
import TabTransition from "./src/components/TabTransition";
import SwipeNavigator from "./src/components/SwipeNavigator";
import ErrorBoundary from "./src/components/ErrorBoundary";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);
  const [autoLockMinutes, setAutoLockMinutesState] = useState(DEFAULT_AUTO_LOCK_MINUTES);
  const backgroundedAtRef = useRef(null);

  useEffect(() => {
    getAutoLockMinutes().then(setAutoLockMinutesState);
  }, []);

  const updateAutoLockMinutes = useCallback(async (minutes) => {
    setAutoLockMinutesState(minutes);
    await setAutoLockMinutes(minutes);
  }, []);
  const handleLock = useCallback(() => setUnlocked(false), []);
  const handleUnlock = useCallback(() => setUnlocked(true), []);

  // Auto-lock: instead of always locking the instant the app leaves the
  // foreground, this now respects the person's chosen grace period --
  // stepping away for a quick notification check shouldn't force a fresh
  // PIN entry if they're back in a few seconds, but leaving the app alone
  // for a while still should. "Immediately" (0) and "Never" (null) are
  // both honored as explicit choices, not just edge cases of the timer.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") {
        backgroundedAtRef.current = Date.now();
        if (autoLockMinutes === 0) setUnlocked(false);
        return;
      }
      // Coming back to active.
      if (backgroundedAtRef.current && autoLockMinutes !== null) {
        const elapsedMs = Date.now() - backgroundedAtRef.current;
        if (elapsedMs >= autoLockMinutes * 60 * 1000) setUnlocked(false);
      }
      backgroundedAtRef.current = null;
    });
    return () => sub.remove();
  }, [autoLockMinutes]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        {/* AppShell now stays mounted even while locked (instead of being
            unmounted/remounted on every lock cycle) specifically so its
            class-alarm polling loop and reminder timers keep running behind
            the PIN screen. Without this, an alarm due while the phone is
            sitting on LAYP's own lock screen would never trigger the
            in-app popup at all -- only the OS notification would still
            fire, since that's scheduled independently of app state. */}
        <AppShell onLock={handleLock} autoLockMinutes={autoLockMinutes} onChangeAutoLockMinutes={updateAutoLockMinutes} />
        {!unlocked && (
          // Rendered as an overlay, not a replacement -- see the zIndex
          // note on ClassAlarmScreen for why a class alarm can still show
          // through this, the same way a phone's own alarm clock can ring
          // over its lock screen.
          <View style={[StyleSheet.absoluteFillObject, { zIndex: 500, elevation: 500 }]}>
            <LockScreen onUnlock={handleUnlock} />
          </View>
        )}
      </View>
    </SafeAreaProvider>
  );
}

function AppShellComponent({ onLock, autoLockMinutes, onChangeAutoLockMinutes }) {
  const systemScheme = useColorScheme();
  const [dark, setDark] = useState(systemScheme === "dark");
  const [tab, setTabRaw] = useState("home");
  const [tabDirection, setTabDirection] = useState(0);
  const TAB_ORDER = ["home", "todo", "school", "budget"];
  function setTab(next) {
    setTabDirection(Math.sign(TAB_ORDER.indexOf(next) - TAB_ORDER.indexOf(tab)));
    setTabRaw(next);
  }
  function swipeToTab(delta) {
    const idx = TAB_ORDER.indexOf(tab);
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= TAB_ORDER.length) return; // no wraparound at the ends
    setTab(TAB_ORDER[nextIdx]);
  }
  const [budgetSubTab, setBudgetSubTab] = useState("overview");
  const [showDailyBudget, setShowDailyBudget] = useState(false);
  const [ready, setReady] = useState(false);
  const [todos, setTodos] = useState([]);
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [moneyLog, setMoneyLog] = useState([]); // all money received/added -- the "income" side of the ledger
  const [weeklySummaries, setWeeklySummaries] = useState([]); // rolled-up, deleted weeks
  const [savingsLog, setSavingsLog] = useState([]);
  const [goals, setGoals] = useState([]); // savings goals: name, target amount, target date
  const [loans, setLoans] = useState([]); // lent / borrowed tracker
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS.map((a) => ({ ...a })));
  const [transfers, setTransfers] = useState([]); // money moved between accounts -- never counts as income/expense
  const [splits, setSplits] = useState(DEFAULT_SPLITS["50-30-20"].map((s) => ({ ...s })));
  const [dailyBudgetSettings, setDailyBudgetSettings] = useState({ ...DEFAULT_DAILY_BUDGET_SETTINGS });
  const [dailyBudgetLog, setDailyBudgetLog] = useState([]); // record of the user's daily savings decisions (saved/kept/remind) -- informational only, never used to move money on its own
  const [dailyBudgetNotifId, setDailyBudgetNotifId] = useState(null);
  const [reminderBanner, setReminderBanner] = useState(null);
  const [classAlarm, setClassAlarm] = useState(null); // { block, kind: "class" | "advance", advanceMinutes } | null
  const [cancelledClasses, setCancelledClasses] = useState([]); // [{ date, entryId }] -- classes marked suspended/cancelled for a specific day, from the alarm popup

  // Hardware back button: close whatever's "on top" first (the class
  // alarm is deliberately NOT closable this way -- it should only ever be
  // dismissed with the slide-to-confirm gesture, same as a real alarm),
  // then drop out of a Budget sub-screen/sub-tab, then return to Home from
  // any other tab, and only let the OS handle it (background/exit the app)
  // once we're already sitting at Home with nothing open.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (classAlarm) return true;
      if (showDailyBudget) { setShowDailyBudget(false); return true; }
      if (budgetSubTab !== "overview") { setBudgetSubTab("overview"); return true; }
      if (tab !== "home") { setTab("home"); return true; }
      return false;
    });
    return () => sub.remove();
  }, [classAlarm, showDailyBudget, budgetSubTab, tab]);

  // Tapping a notification (as opposed to just seeing it appear) should
  // take you straight to what it's about, not just open the app to
  // whatever tab happened to be showing. Two hooks are needed: the
  // listener below covers taps while the app is already running
  // (foreground or backgrounded), and the getLastNotificationResponse
  // check covers the app being launched by the tap itself -- that tap
  // happens before this listener even exists, so it has to be read back
  // explicitly.
  //
  // The handler is kept in a ref and reassigned on every render (cheap --
  // it's just a function reference, not a subscription) so it always
  // closes over the latest classAlarm/academicPeriods/etc. without needing
  // to tear down and recreate the actual OS-level subscription itself,
  // which is set up exactly once below.
  const notificationHandlerRef = useRef(() => {});
  useEffect(() => {
    notificationHandlerRef.current = async (response) => {
      const data = response?.notification?.request?.content?.data;
      const actionId = response?.actionIdentifier;
      const notifId = response?.notification?.request?.identifier;
      if (!data?.type) return;

      if (data.type === "dailyBudget") {
        if (!actionId || actionId === DEFAULT_ACTION_IDENTIFIER) {
          setTab("budget");
          setBudgetSubTab("overview");
          setShowDailyBudget(true);
        }
        return;
      }

      if (data.type === "classAlarm") {
        if (actionId === CLASS_ALARM_CONFIRM_ACTION) {
          // Same effect as sliding to confirm in the in-app popup: just
          // silence it. Doesn't touch cancelledClasses since the class is
          // still happening -- only clears today's *alarm*, not the class.
          if (notifId) await dismissNotification(notifId);
          setClassAlarm((current) => (current?.block?.subject?.id === data.subjectId ? null : current));
          return;
        }
        if (actionId === CLASS_ALARM_CANCELLED_ACTION) {
          if (notifId) await dismissNotification(notifId);
          const block = findTodaysBlockForSubject(data.subjectId);
          if (block) handleSuspendClass(block);
          else setClassAlarm((current) => (current?.block?.subject?.id === data.subjectId ? null : current));
          return;
        }
        // A plain tap (not an action button): the live alarm popup is
        // driven by the in-app polling loop, not by this tap -- if the
        // class is still "now" that popup is already showing or will be
        // within a second. Tapping just makes sure you land on School
        // either way.
        setTab("school");
      }
    };
  });

  function findTodaysBlockForSubject(subjectId) {
    const activePeriod = getActivePeriod(academicPeriods);
    if (!activePeriod) return null;
    const periodSubjects = subjectsForPeriod(subjects, activePeriod.id);
    const subjectIds = periodSubjects.map((s) => s.id);
    const entries = scheduleEntries.filter((e) => subjectIds.includes(e.subjectId));
    const todaysBlocks = blocksForWeekday(periodSubjects, entries, todayExpoWeekday());
    return todaysBlocks.find((b) => b.subject.id === subjectId) || null;
  }

  useEffect(() => {
    const sub = addNotificationResponseListener((response) => notificationHandlerRef.current(response));
    getLastNotificationResponse().then((response) => { if (response) notificationHandlerRef.current(response); });
    return () => sub.remove();
  }, []);
  // School: academic periods, the classes within them, and their weekly
  // meeting times. Seeded with one default active period so the School tab
  // is usable immediately on a brand-new install, before loadState resolves.
  const [academicPeriods, setAcademicPeriods] = useState(() => [newAcademicPeriod("Current Schedule")]);
  const [subjects, setSubjects] = useState([]);
  const [scheduleEntries, setScheduleEntries] = useState([]);
  const [schoolDefaults, setSchoolDefaults] = useState({ ...DEFAULT_SCHOOL_DEFAULTS });
  const [prefillSubjectId, setPrefillSubjectId] = useState(null);
  // Only the active period's subjects are offered when linking a task to a
  // class -- a task shouldn't be pinned to a subject from an archived term.
  const activeSubjects = useMemo(
    () => subjectsForPeriod(subjects, getActivePeriod(academicPeriods)?.id),
    [subjects, academicPeriods]
  );
  const firstLoad = useRef(true);
  const dismissedTodayRef = useRef({});

  const theme = dark ? DARK : LIGHT;

  useEffect(() => {
    (async () => {
      await setupAndroidChannel();
      await setupNotificationCategories();
      await requestNotificationPermission();
      const s = await loadState();
      if (s) {
        setTodos(s.todos || []);
        setBills(s.bills || []);
        setExpenses(s.expenses || []);
        setWeeklySummaries(s.weeklySummaries || []);
        setSavingsLog(s.savingsLog || []);
        setGoals(s.goals || []);
        setLoans(s.loans || []);
        setSplits(s.splits || DEFAULT_SPLITS["50-30-20"].map((sp) => ({ ...sp })));
        setAccounts(s.accounts || DEFAULT_ACCOUNTS.map((a) => ({ ...a })));
        setTransfers(s.transfers || []);
        setDailyBudgetSettings(s.dailyBudgetSettings || { ...DEFAULT_DAILY_BUDGET_SETTINGS });
        setDailyBudgetLog(s.dailyBudgetLog || []);
        setDailyBudgetNotifId(s.dailyBudgetNotifId || null);
        // A brand new install (or a backup from before the School feature)
        // gets one default, already-active academic period seeded so the
        // School tab is usable immediately -- no empty "create a period
        // first" step required.
        setAcademicPeriods(s.academicPeriods?.length ? s.academicPeriods : [newAcademicPeriod("Current Schedule")]);
        setSubjects(s.subjects || []);
        setScheduleEntries(s.scheduleEntries || []);
        setSchoolDefaults(s.schoolDefaults || { ...DEFAULT_SCHOOL_DEFAULTS });
        setCancelledClasses(s.cancelledClasses || []);
        if (typeof s.dark === "boolean") setDark(s.dark);

        // Migrate old single "income" number (pre-accounts) into the money log.
        if (s.moneyLog) {
          setMoneyLog(s.moneyLog);
        } else if (s.income) {
          setMoneyLog([{ id: uid(), amount: Number(s.income), account: "ecash", note: "Migrated balance", date: todayISO(), createdAt: Date.now() }]);
        }
      }
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    saveState({ todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, splits, accounts, transfers, goals, dark, dailyBudgetSettings, dailyBudgetLog, dailyBudgetNotifId, academicPeriods, subjects, scheduleEntries, schoolDefaults, cancelledClasses });
    setThemePreference(dark);
  }, [todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, splits, accounts, transfers, goals, dark, ready, dailyBudgetSettings, dailyBudgetLog, dailyBudgetNotifId, academicPeriods, subjects, scheduleEntries, schoolDefaults, cancelledClasses]);

  // Cancellation records only ever need to cover "today" at check time, so
  // trim anything older than a week on load rather than let this list grow
  // forever -- a week of slack in case the device's clock or timezone
  // hiccups, not because old records need to stick around.
  useEffect(() => {
    if (!ready) return;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffKey = toLocalISO(cutoff);
    setCancelledClasses((prev) => prev.filter((c) => c.date >= cutoffKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keeps the end-of-day local notification's copy roughly current. Local
  // notifications can't recompute their own body at fire time, so instead
  // the app cancels + reschedules the repeating daily notification any time
  // the numbers behind it change (new expense, new income, model edited,
  // reminder settings changed) -- see dailyBudgetNotificationContent.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const review = computeDailyBudgetReview({ splits, accounts, moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers });
      const content = dailyBudgetNotificationContent(review);
      const id = await rescheduleDailyBudgetNotification(dailyBudgetNotifId, dailyBudgetSettings, content);
      if (id !== dailyBudgetNotifId) setDailyBudgetNotifId(id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, dailyBudgetSettings, splits, moneyLog, expenses, savingsLog, accounts, weeklySummaries, loans, transfers]);

  // New expenses are retained indefinitely. Existing weekly summaries are
  // kept only as legacy records created by earlier app versions.

  // Daily cleanup: cancel any repeating "daily"/"weekly"/etc reminders whose
  // due date has passed, since expo-notifications has no "repeat until X".
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const overdueRepeating = todos.filter((t) => !t.completed && t.dueDate && todayISO() > t.dueDate && t.notify?.type !== "once");
      for (const t of overdueRepeating) {
        if (t.notificationIds?.length) {
          await cancelTodoNotifications(t.notificationIds);
          setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, notificationIds: [] } : x)));
        }
      }
    })();
  }, [ready]);

  // In-app banner while the app is open, in addition to the real OS notification.
  const lastCheckedMinuteRef = useRef(null);
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
      // The actual fire condition below only changes once a minute (it
      // matches on an exact HH:MM string), so re-running the full scan
      // over every todo 60 times within the same minute was pure wasted
      // CPU. Still polling every 1s so a reminder is caught within a
      // second of its minute starting -- just skipping the expensive part
      // for the 59 ticks where nothing could possibly have changed.
      if (hhmm === lastCheckedMinuteRef.current) return;
      lastCheckedMinuteRef.current = hhmm;
      const todayKey = todayISO();
      todos.forEach((t) => {
        if (t.completed || t.reminderEnabled === false) return;
        const n = t.notify || { type: "daily", time: "08:00" };
        let fire = false;
        if (n.type === "once") fire = !!t.dueDate && hhmm === n.time && todayKey === t.dueDate;
        else if (n.type === "daily") fire = hhmm === n.time && (!t.dueDate || todayKey <= t.dueDate);
        else if (n.type === "weekly") {
          const todayWeekday = now.getDay() + 1;
          fire = hhmm === n.time && (n.weekdays || []).includes(todayWeekday) && (!t.dueDate || todayKey <= t.dueDate);
        }
        else if (n.type === "custom") fire = (n.times || []).includes(hhmm) && (!t.dueDate || todayKey <= t.dueDate);
        const fireKey = t.id + "-" + todayKey + "-" + hhmm;
        if (fire && !dismissedTodayRef.current[fireKey]) {
          dismissedTodayRef.current[fireKey] = true;
          let message;
          if (t.dueDate) {
            const dleft = daysUntil(t.dueDate);
            const when = dleft === 0 ? "today" : dleft < 0 ? `${Math.abs(dleft)} day(s) ago` : `in ${dleft} day(s)`;
            message = `"${t.title}" is due ${when} (${fmtDateLong(t.dueDate)})`;
          } else {
            message = `Reminder: "${t.title}"`;
          }
          setReminderBanner({ ...t, message });
        }
      });
    };
    check();
    // Polled every second (not every 30s) because `fire` matches on an exact
    // HH:MM string -- a slow poll meant a reminder could sit undetected for
    // up to half a minute after its minute actually started.
    const iv = setInterval(check, 1000);
    return () => clearInterval(iv);
  }, [todos]);

  // Alarm-style class reminders. The "class starting now" ring itself is
  // now armed natively (see modules/layp-alarm and
  // notifications.js#rescheduleSubjectNotifications) so it keeps working
  // even when the app is closed -- this effect only still owns the
  // "advance" heads-up popup, plus the "class" popup as a fallback for
  // iOS or an Android build that hasn't linked the native module yet.
  const firedClassAlarmsRef = useRef({});
  const lastCheckedClassMinuteRef = useRef(null);
  useEffect(() => {
    const check = () => {
      if (classAlarm) return; // one at a time -- don't stack a second popup over the first
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      // Same reasoning as the todo-reminder check above: the fire window
      // is minute-wide, so there's nothing to gain from redoing this scan
      // 60 times within the same minute.
      if (nowMin === lastCheckedClassMinuteRef.current) return;
      lastCheckedClassMinuteRef.current = nowMin;
      const activePeriod = getActivePeriod(academicPeriods);
      if (!activePeriod) return;
      const periodSubjects = subjectsForPeriod(subjects, activePeriod.id);
      const subjectIds = periodSubjects.map((s) => s.id);
      const entries = scheduleEntries.filter((e) => subjectIds.includes(e.subjectId));
      const todaysBlocks = blocksForWeekday(periodSubjects, entries, todayExpoWeekday());
      const todayKey = todayISO();
      const isCancelledToday = (entryId) => cancelledClasses.some((c) => c.date === todayKey && c.entryId === entryId);

      for (const block of todaysBlocks) {
        if (isCancelledToday(block.entry.id)) continue; // marked suspended earlier today -- don't alarm for it again
        const { subject } = block;
        if (!isNativeAlarmAvailable() && subject.classReminderEnabled && nowMin >= block.startMin && nowMin < block.startMin + 1) {
          const key = `${todayKey}-${block.entry.id}-class`;
          if (!firedClassAlarmsRef.current[key]) {
            firedClassAlarmsRef.current[key] = true;
            setClassAlarm({ block, kind: "class" });
            return;
          }
        }
        if (subject.advanceReminderEnabled && subject.advanceReminderMinutes) {
          const fireAt = block.startMin - subject.advanceReminderMinutes;
          if (nowMin >= fireAt && nowMin < fireAt + 1) {
            const key = `${todayKey}-${block.entry.id}-advance`;
            if (!firedClassAlarmsRef.current[key]) {
              firedClassAlarmsRef.current[key] = true;
              setClassAlarm({ block, kind: "advance", advanceMinutes: subject.advanceReminderMinutes });
              return;
            }
          }
        }
      }
    };
    check();
    // This was polling every 30 seconds against a 1-minute-wide window
    // (nowMin >= startMin && nowMin < startMin + 1), so the alarm could fire
    // anywhere from instantly to ~30s after the class actually started,
    // depending on where in the 30s cycle the minute boundary landed. A
    // 1-second poll keeps the same matching logic but makes that window
    // effectively immediate.
    const iv = setInterval(check, 1000);
    return () => clearInterval(iv);
  }, [academicPeriods, subjects, scheduleEntries, classAlarm, cancelledClasses]);

  // Marking a class suspended from the alarm popup both dismisses that
  // alarm and records the cancellation for today, so the matching
  // class/advance alarm for the same schedule entry won't fire again later
  // the same day (e.g. marking it suspended from the advance reminder
  // means the "starting now" alarm won't also go off).
  function handleSuspendClass(block) {
    setCancelledClasses((prev) => [...prev, { date: todayISO(), entryId: block.entry.id }]);
    setClassAlarm(null);
  }

  const todayLabel = new Date().toLocaleDateString("en-PH", { weekday: "long", month: "short", day: "numeric" });

  // Stable callback/data references for the always-mounted screens below.
  // Without these, an inline `() => setTab("school")` (or a fresh
  // `{ ...backup }` object literal) gets created fresh every single time
  // AppShell re-renders -- which, now that every tab stays mounted instead
  // of being swapped in and out, happens on *any* state change anywhere in
  // the app, not just ones relevant to a given screen. A brand-new prop
  // reference every render defeats React.memo on the screen components
  // below regardless of whether that screen's own data actually changed,
  // so a keystroke in a Todo form would otherwise still force Home,
  // School, Budget, and Summary to all re-render and recompute along with it.
  const goToSchool = useCallback(() => setTab("school"), []);
  const goToTodo = useCallback(() => setTab("todo"), []);
  const clearPrefillSubject = useCallback(() => setPrefillSubjectId(null), []);
  const goToTodoForSubject = useCallback((subjectId) => { setPrefillSubjectId(subjectId); setTab("todo"); }, []);
  const restoreBackup = useCallback((data) => {
    setTodos(data.todos); setBills(data.bills); setExpenses(data.expenses);
    setMoneyLog(data.moneyLog); setWeeklySummaries(data.weeklySummaries);
    setSavingsLog(data.savingsLog); setGoals(data.goals); setLoans(data.loans);
    setSplits(data.splits); setAccounts(data.accounts); setTransfers(data.transfers);
    setDark(data.dark);
    setDailyBudgetSettings(data.dailyBudgetSettings || { ...DEFAULT_DAILY_BUDGET_SETTINGS });
    setDailyBudgetLog(data.dailyBudgetLog || []);
    setAcademicPeriods(data.academicPeriods?.length ? data.academicPeriods : [newAcademicPeriod("Current Schedule")]);
    setSubjects(data.subjects || []);
    setScheduleEntries(data.scheduleEntries || []);
    setSchoolDefaults(data.schoolDefaults || { ...DEFAULT_SCHOOL_DEFAULTS });
  }, []);
  const backupData = useMemo(
    () => ({ version: 1, todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, goals, loans, splits, accounts, transfers, dark, dailyBudgetSettings, dailyBudgetLog, academicPeriods, subjects, scheduleEntries, schoolDefaults }),
    [todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, goals, loans, splits, accounts, transfers, dark, dailyBudgetSettings, dailyBudgetLog, academicPeriods, subjects, scheduleEntries, schoolDefaults]
  );

  function renderTabContent(t) {
    switch (t) {
      case "home":
        return (
          <HomeScreen
            accounts={accounts} moneyLog={moneyLog} expenses={expenses} weeklySummaries={weeklySummaries}
            loans={loans} savingsLog={savingsLog} transfers={transfers} bills={bills} splits={splits}
            goals={goals} todos={todos}
            periods={academicPeriods} subjects={subjects} scheduleEntries={scheduleEntries} cancelledClasses={cancelledClasses}
            onViewSchedule={goToSchool}
            onViewTodos={goToTodo}
          />
        );
      case "todo":
        return (
          <TodoScreen
            todos={todos} setTodos={setTodos}
            subjects={activeSubjects}
            prefillSubjectId={prefillSubjectId}
            onConsumePrefillSubject={clearPrefillSubject}
          />
        );
      case "school":
        return (
          <SchoolScreen
            periods={academicPeriods} setPeriods={setAcademicPeriods}
            subjects={subjects} setSubjects={setSubjects}
            entries={scheduleEntries} setEntries={setScheduleEntries}
            schoolDefaults={schoolDefaults} setSchoolDefaults={setSchoolDefaults}
            todos={todos} setTodos={setTodos}
            onGoToTodoForSubject={goToTodoForSubject}
          />
        );
      case "budget":
        return (
          <BudgetScreen
            moneyLog={moneyLog} setMoneyLog={setMoneyLog}
            splits={splits} setSplits={setSplits}
            bills={bills} setBills={setBills}
            expenses={expenses} setExpenses={setExpenses}
            weeklySummaries={weeklySummaries} setWeeklySummaries={setWeeklySummaries}
            savingsLog={savingsLog} setSavingsLog={setSavingsLog}
            loans={loans} setLoans={setLoans}
            accounts={accounts} setAccounts={setAccounts}
            transfers={transfers} setTransfers={setTransfers}
            goals={goals} setGoals={setGoals}
            dailyBudgetSettings={dailyBudgetSettings} setDailyBudgetSettings={setDailyBudgetSettings}
            setDailyBudgetLog={setDailyBudgetLog}
            dailyBudgetLog={dailyBudgetLog}
            subTab={budgetSubTab} setSubTab={setBudgetSubTab}
            showDailyBudget={showDailyBudget} setShowDailyBudget={setShowDailyBudget}
          />
        );
      case "summary":
        return (
          <SummaryScreen
            todos={todos} splits={splits} bills={bills} expenses={expenses}
            moneyLog={moneyLog} weeklySummaries={weeklySummaries} savingsLog={savingsLog} loans={loans}
            accounts={accounts} transfers={transfers}
            backup={backupData}
            onRestore={restoreBackup}
            autoLockMinutes={autoLockMinutes}
            onChangeAutoLockMinutes={onChangeAutoLockMinutes}
          />
        );
      default:
        return null;
    }
  }


  // All hooks for this component are declared above this point -- this
  // early return for the loading screen has to come after every one of
  // them (not interleaved, as it originally was) or the hook count
  // changes between the "loading" render and the first "ready" render,
  // which React detects as a Rules-of-Hooks violation and throws on.
  if (!ready) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" }]}>
        <Text style={{ color: theme.textMuted }}>Loading LAYP...</Text>
      </SafeAreaView>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, dark }}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <StatusBar style={dark ? "light" : "dark"} />
        {classAlarm && (
          <ClassAlarmScreen alarm={classAlarm} onDismiss={() => setClassAlarm(null)} onSuspend={() => handleSuspendClass(classAlarm.block)} />
        )}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={{ uri: dark ? LOGO_DARK_URI : LOGO_LIGHT_URI }} style={styles.logo} />
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>LAYP</Text>
              <Text style={[styles.headerDate, { color: theme.textMuted }]}>{todayLabel}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => setTab("summary")} style={[styles.themeBtn, tab === "summary" && { backgroundColor: theme.bg }, { backgroundColor: tab === "summary" ? theme.bg : theme.card, borderColor: theme.line }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Summary">
              <FileText size={13} color={tab === "summary" ? ACCENT.gold : theme.textMuted} />
            </Pressable>
            <Pressable onPress={onLock} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Lock app">
              <Lock size={13} color={theme.textMuted} />
            </Pressable>
            <Pressable onPress={() => setDark((d) => !d)} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]} accessibilityLabel={dark ? "Switch to light mode" : "Switch to dark mode"}>
              {dark ? <Sun size={14} color={ACCENT.gold} /> : <Moon size={14} color={theme.text} />}
            </Pressable>
          </View>
        </View>

        {reminderBanner && (
          <View style={[styles.banner, { backgroundColor: theme.accentDark }]}>
            <Bell size={16} color={ACCENT.gold} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Reminder</Text>
              <Text style={styles.bannerBody}>{reminderBanner.message}</Text>
            </View>
            <Pressable onPress={() => setReminderBanner(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><X size={14} color="#fff" /></Pressable>
          </View>
        )}

        <SwipeNavigator
          style={{ flex: 1 }}
          enabled={!classAlarm}
          onSwipeLeft={() => swipeToTab(1)}
          onSwipeRight={() => swipeToTab(-1)}
        >
        <View style={{ flex: 1 }}>
          {["home", "todo", "school", "budget", "summary"].map((t) => (
            // Every screen stays mounted for the app's whole lifetime instead
            // of being torn down and rebuilt on every switch -- `display`
            // (not conditional rendering) is what hides the inactive ones,
            // since that's a pure layout/paint toggle with no unmount, so
            // whatever a screen computed on its last visit (memoized totals,
            // scroll position, open forms) is still sitting there ready the
            // instant you swipe back. The previous version's `{tab === "x" &&
            // <X/>}` pattern unmounted and remounted the *entire* screen on
            // every single switch -- for a screen like Budget or School that
            // does real work on mount (schedule/category computations), that
            // remount cost is exactly what showed up as "the tab content
            // takes a moment to appear" even after the swipe gesture itself
            // became smooth.
            <View key={t} style={[{ flex: 1 }, tab !== t && { display: "none" }]} pointerEvents={tab === t ? "auto" : "none"}>
              <ErrorBoundary resetKey={t}>
                <TabTransition transitionKey={tab === t ? "active" : "inactive"} direction={tabDirection} style={styles.content}>
                  {renderTabContent(t)}
                </TabTransition>
              </ErrorBoundary>
            </View>
          ))}
        </View>
        </SwipeNavigator>

        <View style={[styles.tabBar, { borderTopColor: theme.line, backgroundColor: theme.card }]}>
          <NavBtn icon={Home} label="Home" active={tab === "home"} onPress={() => setTab("home")} theme={theme} />
          <NavBtn icon={ListTodo} label="Todo" active={tab === "todo"} onPress={() => setTab("todo")} theme={theme} />
          <NavBtn icon={GraduationCap} label="School" active={tab === "school"} onPress={() => setTab("school")} theme={theme} />
          <NavBtn icon={Wallet} label="Budget" active={tab === "budget"} onPress={() => setTab("budget")} theme={theme} />
        </View>
      </SafeAreaView>
    </ThemeContext.Provider>
  );
}

// Memoized so the outer App component re-rendering (e.g. the auto-lock
// AppState listener firing) doesn't cascade into re-rendering everything
// inside AppShell -- its props (onLock, autoLockMinutes,
// onChangeAutoLockMinutes) are all stabilized above specifically so this
// comparison actually has a chance to succeed.
const AppShell = React.memo(AppShellComponent);

function NavBtn({ icon: Icon, label, active, onPress, theme }) {
  return (
    <Pressable onPress={onPress} style={[styles.navBtn, active && { backgroundColor: theme.bg }]} accessibilityRole="tab" accessibilityLabel={label} accessibilityHint={`Open ${label}`} accessibilityState={{ selected: active }} android_ripple={{ color: theme.line, borderless: true }}>
      <Icon size={17} color={active ? theme.text : theme.textMuted} strokeWidth={active ? 2.4 : 2} />
      <Text style={[styles.navLabel, { color: active ? theme.text : theme.textMuted }]}>{label}</Text>
      {active && <View style={[styles.navDot, { backgroundColor: ACCENT.gold }]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 30, height: 30, borderRadius: 8 },
  headerTitle: { fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  headerDate: { fontSize: 10, marginTop: 1 },
  themeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  banner: { flexDirection: "row", gap: 8, borderRadius: 16, padding: 12, marginHorizontal: 16, marginBottom: 4 },
  bannerTitle: { color: "#fff", fontSize: 12, fontWeight: "700" },
  bannerBody: { color: "#ffffffcc", fontSize: 11, marginTop: 2 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  tabBar: { flexDirection: "row", justifyContent: "space-around", paddingTop: 8, paddingBottom: 10, borderTopWidth: 1 },
  navBtn: { flex: 1, alignItems: "center", gap: 2, paddingHorizontal: 2, paddingVertical: 6, borderRadius: 12 },
  navLabel: { fontSize: 8.5, fontWeight: "700" },
  navDot: { width: 4, height: 4, borderRadius: 2 },
});
