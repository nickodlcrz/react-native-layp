// Must be the very first import so gesture-handler installs its native
// event subscriptions before anything else touches the RN bridge -- this
// is what lets EditSheet's swipe-to-dismiss work.
import "react-native-gesture-handler";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { View, Text, Pressable, Image, StyleSheet, useColorScheme, AppState, BackHandler, InteractionManager } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ListTodo, Wallet, Settings as GearIcon, Bell, X, Lock, Home, GraduationCap, Heart } from "lucide-react-native";

import { ThemeContext, LIGHT, DARK, ACCENT, DEFAULT_SPLITS, DEFAULT_ACCOUNTS, DEFAULT_SAVINGS_ACCOUNTS, DEFAULT_DAILY_BUDGET_SETTINGS, DEFAULT_SCHOOL_DEFAULTS, INCOME_CATEGORIES, CATEGORIES } from "./src/theme";
import Reanimated, { FadeOut } from "react-native-reanimated";
import { DURATION } from "./src/animation";
import LiquidGlass from "./src/components/LiquidGlass";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { loadState, saveState, clearUnreadableLegacyState } from "./src/storage";
import { requestNotificationPermission, setupAndroidChannel, setupNotificationCategories, cancelTodoNotifications, cancelTodoAlarm, rescheduleTodoNotifications, rescheduleDailyBudgetNotification, rescheduleDateNotifications, cleanupDuplicateDailyBudgetNotifications, addNotificationResponseListener, getLastNotificationResponse, dismissNotification, DEFAULT_ACTION_IDENTIFIER, CLASS_ALARM_CONFIRM_ACTION, CLASS_ALARM_CANCELLED_ACTION, CLASS_CHECKIN_YES_ACTION, CLASS_CHECKIN_NONE_ACTION, DAILY_BUDGET_SAVE_ACTION, DAILY_BUDGET_KEEP_ACTION, TODO_STARTED_YES_ACTION, TODO_STARTED_NOT_YET_ACTION, TODO_PASSED_YES_ACTION, TODO_PASSED_NOT_YET_ACTION, suspendClassAlarmToday, addClassAlarmSuspendedListener, sweepExpiredDailyNotifications } from "./src/notifications";
import { isScheduledPopupDue, markScheduledPopupShown, isFrequencyPopupDue, isIntervalPopupDue, markFrequencyPopupShown } from "./src/reminderLogic";
import { todayISO, daysUntil, fmtDateLong, uid, computeAccountBalance, computeDailyBudgetReview, dailyBudgetNotificationContent, toLocalISO, nextRecurringDate, accrueSavingsAccountInterest, accrueAccountInterest } from "./src/utils";
import { newAcademicPeriod, getActivePeriod, subjectsForPeriod, blocksForWeekday, todayExpoWeekday } from "./src/school";
import { LOGO_LIGHT_URI, LOGO_DARK_URI } from "./src/assets/logo";
import { setThemePreference } from "./src/themePreference";
import { isNativeAlarmAvailable, getAlarmStatus, openExactAlarmSettings, openBatteryOptimizationSettings } from "./modules/layp-alarm";
import { isNativeWidgetAvailable, pushWidgetSummary, getPendingWidgetItems, ackWidgetItems } from "./modules/layp-widget";
import { buildWidgetSummary, pendingToExpenses, pendingToMoney, pendingToTodos, applyTaskOps } from "./src/widgetSummary";
import { buildWidgetEvents } from "./src/widgetEvents";
import { entryRepeat, entryKind } from "./src/gfDates";
import { loadWidgetPrefs, saveWidgetPrefs, DEFAULT_WIDGET_PREFS } from "./src/widgetPrefs";
import { loadGfScreenEnabled, saveGfScreenEnabled, DEFAULT_GF_SCREEN_ENABLED } from "./src/gfScreenPreference";
import { maybeAutoBackup } from "./src/autoBackup";
import { peso } from "./src/utils";
import LockScreen from "./src/screens/LockScreen";
import RecoveryScreen from "./src/screens/RecoveryScreen";
import ClassAlarmScreen from "./src/components/ClassAlarmScreen";
import { ConfirmModalHost } from "./src/components/ConfirmModal";
import AppDialogHost from "./src/components/AppDialog";
import { getAutoLockMinutes, setAutoLockMinutes, AUTO_LOCK_OPTIONS, DEFAULT_AUTO_LOCK_MINUTES } from "./src/autoLockPreference";

import HomeScreen from "./src/screens/HomeScreen";
import TodoScreen from "./src/screens/TodoScreen";
import BudgetScreen from "./src/screens/BudgetScreen";
import SchoolScreen from "./src/screens/SchoolScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import TabTransition from "./src/components/TabTransition";
import SwipeNavigator from "./src/components/SwipeNavigator";
import ErrorBoundary from "./src/components/ErrorBoundary";
import TabBar from "./src/components/TabBar";
import GFScreen from "./src/screens/GFScreen";
import RemindPopup from "./src/components/RemindPopup";

// Single source of truth for which tabs exist, their order, icons, and
// labels -- the old version had this order duplicated as a bare array of
// strings (TAB_ORDER, for swipe direction) *and* as four separate hardcoded
// <NavBtn> lines (for the tab bar itself), so adding/reordering a tab meant
// remembering to update both in sync. Module-level (not inside the
// component) since it's static and TabBar/swipe logic both just read it.
const TABS = [
  { key: "home", label: "Home", icon: Home },
  { key: "todo", label: "Todo", icon: ListTodo },
  { key: "school", label: "School", icon: GraduationCap },
  { key: "budget", label: "Budget", icon: Wallet },
];
const TAB_ORDER = TABS.map((t) => t.key);

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
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <View style={{ flex: 1 }}>
        {/* AppShell now stays mounted even while locked (instead of being
            unmounted/remounted on every lock cycle) specifically so its
            class-alarm polling loop and reminder timers keep running behind
            the PIN screen. Without this, an alarm due while the phone is
            sitting on LAYP's own lock screen would never trigger the
            in-app popup at all -- only the OS notification would still
            fire, since that's scheduled independently of app state. */}
        <AppShell onLock={handleLock} unlocked={unlocked} autoLockMinutes={autoLockMinutes} onChangeAutoLockMinutes={updateAutoLockMinutes} />
        {!unlocked && (
          // Rendered as an overlay, not a replacement -- see the zIndex
          // note on ClassAlarmScreen for why a class alarm can still show
          // through this, the same way a phone's own alarm clock can ring
          // over its lock screen. Fades out on unlock (matching the ~0.2s
          // feel used for every other transition in the app) instead of
          // just vanishing the instant the PIN is accepted.
          <Reanimated.View exiting={FadeOut.duration(DURATION)} style={[StyleSheet.absoluteFillObject, { zIndex: 500, elevation: 500 }]}>
            <LockScreen onUnlock={handleUnlock} />
          </Reanimated.View>
        )}
      </View>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShellComponent({ onLock, unlocked, autoLockMinutes, onChangeAutoLockMinutes }) {
  const systemScheme = useColorScheme();
  const [dark, setDark] = useState(systemScheme === "dark");
  const [tab, setTabRaw] = useState("home");
  const [tabDirection, setTabDirection] = useState(0);
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
  const [needsRecovery, setNeedsRecovery] = useState(false);
  const [todos, setTodos] = useState([]);
  const [bills, setBills] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [moneyLog, setMoneyLog] = useState([]); // all money received/added -- the "income" side of the ledger
  const [weeklySummaries, setWeeklySummaries] = useState([]); // rolled-up, deleted weeks
  const [savingsLog, setSavingsLog] = useState([]);
  const [goals, setGoals] = useState([]); // savings goals: name, target amount, target date
  const [loans, setLoans] = useState([]); // lent / borrowed tracker
  // General "Remember" quick-capture list (Todo tab) -- separate from
  // todos since these are notes/reminders rather than tasks with a
  // completion workflow.
  const [reminders, setReminders] = useState([]);
  // The GF module -- a heart-icon-gated panel of relationship info, kept
  // as its own set of domains (rather than folded into an existing one)
  // since none of it is financial or task data. gfOpen controls the
  // full-screen panel itself; GFScreen re-verifies the PIN every time it
  // opens (see its own effect), so no "unlocked" flag needs to live here.
  const [gfOpen, setGfOpen] = useState(false);
  const [gfScreenEnabled, setGfScreenEnabledState] = useState(DEFAULT_GF_SCREEN_ENABLED);
  useEffect(() => { loadGfScreenEnabled().then(setGfScreenEnabledState); }, []);
  const onChangeGfScreenEnabled = useCallback((enabled) => {
    setGfScreenEnabledState(enabled);
    if (!enabled) setGfOpen(false);
    saveGfScreenEnabled(enabled);
  }, []);
  // The gear menu (Settings): which tab it opens on, and what the date widgets show.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("general");
  const [widgetPrefs, setWidgetPrefs] = useState(DEFAULT_WIDGET_PREFS);
  useEffect(() => { loadWidgetPrefs().then(setWidgetPrefs); }, []);
  const onChangeWidgetPrefs = useCallback((next) => { setWidgetPrefs(next); saveWidgetPrefs(next); }, []);
  const [gfName, setGfName] = useState("Her");
  const [gfLikes, setGfLikes] = useState([]);
  const [gfDislikes, setGfDislikes] = useState([]);
  const [gfDates, setGfDates] = useState([]);
  const [gfNotes, setGfNotes] = useState([]);
  const [gfGiftIdeas, setGfGiftIdeas] = useState([]);
  const [gfPromises, setGfPromises] = useState([]);
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS.map((a) => ({ ...a })));
  // Whether budget/money figures (Home's Total money + Safe to spend,
  // Budget Overview's Current budget) are masked out -- e.g. showing the
  // screen around other people. Lifted up here rather than kept local to
  // each screen so toggling it in one tab is instantly reflected in the
  // other (both HomeScreen and BudgetScreen stay mounted at once in the
  // tab navigator, so two independent local states would drift out of
  // sync with each other). Persisted on its own in AsyncStorage rather
  // than folded into the main app-state schema, since it's a pure
  // display preference with nothing to migrate or sync.
  const [budgetHidden, setBudgetHiddenState] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem("layp:budgetHidden").then((v) => { if (v === "1") setBudgetHiddenState(true); }).catch(() => {});
  }, []);
  function toggleBudgetHidden() {
    setBudgetHiddenState((prev) => {
      const next = !prev;
      AsyncStorage.setItem("layp:budgetHidden", next ? "1" : "0").catch(() => {});
      return next;
    });
  }
  const [savingsAccounts, setSavingsAccounts] = useState(DEFAULT_SAVINGS_ACCOUNTS.map((a) => ({ ...a })));
  const [interestLog, setInterestLog] = useState([]); // one entry per day/account interest was actually credited
  const [transfers, setTransfers] = useState([]); // money moved between accounts -- never counts as income/expense
  const [recurringIncome, setRecurringIncome] = useState([]); // templates: [{ id, label, category, amount, account, frequency, nextDate }] -- see the catch-up effect below for how these actually post to moneyLog
  const [spendingLimits, setSpendingLimits] = useState({}); // { [spendingLabel]: monthlyLimitAmount } -- a user-set budget per spending label (Food, Transportation, etc.), separate from the automatic 80%-of-split alert
  const [splits, setSplits] = useState(DEFAULT_SPLITS["50-30-20"].map((s) => ({ ...s })));
  const [dailyBudgetSettings, setDailyBudgetSettings] = useState({ ...DEFAULT_DAILY_BUDGET_SETTINGS });
  const [dailyBudgetLog, setDailyBudgetLog] = useState([]); // record of the user's daily savings decisions (saved/kept/remind) -- informational only, never used to move money on its own
  const [dailyBudgetNotifId, setDailyBudgetNotifId] = useState(null);
  const [reminderBanner, setReminderBanner] = useState(null);
  const [classAlarm, setClassAlarm] = useState(null); // { block, kind: "class" | "advance", advanceMinutes } | null
  const [cancelledClasses, setCancelledClasses] = useState([]); // [{ date, entryId }] -- classes marked suspended/cancelled for a specific day, from the alarm popup
  const [alarmReliabilityBanner, setAlarmReliabilityBanner] = useState(null); // { exact: bool, battery: bool } | null -- surfaced once so real alarms don't silently degrade to inexact/Doze-delayed timing

  // Checked once on launch: if the OS-level "Alarms & reminders" permission
  // hasn't been granted (Android 12+) or the app isn't exempted from
  // battery optimization, every native alarm (class + task) can silently
  // fall back to inexact, Doze-batched timing -- which looks like "the
  // alarm rang late" with no error anywhere. Surfacing it once up front is
  // cheaper than debugging phantom delay reports per device.
  useEffect(() => {
    if (!isNativeAlarmAvailable()) return;
    getAlarmStatus().then((status) => {
      if (!status) return;
      if (!status.exactAlarmsAllowed || !status.ignoringBatteryOptimizations) {
        setAlarmReliabilityBanner({ exact: !status.exactAlarmsAllowed, battery: !status.ignoringBatteryOptimizations });
      }
    });
  }, []);

  // A class suspended natively (from the lock-screen ring screen's own
  // "Class suspended today?" option) needs the same cancelledClasses entry
  // the in-app advance popup already writes -- otherwise Home's "cancelled"
  // badge and the JS polling loop's isCancelledToday check wouldn't know
  // about a suspend that happened while the app was backgrounded/killed.
  useEffect(() => {
    const sub = addClassAlarmSuspendedListener(({ entryId, date }) => {
      setCancelledClasses((prev) => (prev.some((c) => c.date === date && c.entryId === entryId) ? prev : [...prev, { date, entryId }]));
    });
    return () => sub.remove();
  }, []);

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
        if (actionId === DAILY_BUDGET_SAVE_ACTION || actionId === DAILY_BUDGET_KEEP_ACTION) {
          // Same "one decision per day" lock the in-app review screen
          // uses (see DailyBudgetScreen's todayDecision) -- ignore a late
          // or duplicate tap if today's already been decided some other
          // way (e.g. the app was opened and acted on in between).
          // Replayed answers carry the day the button was really tapped.
          const decisionDay = response?.actionDate || todayISO();
          const already = dailyBudgetLog.find((e) => e.date === decisionDay);
          if (!already) {
            if (actionId === DAILY_BUDGET_SAVE_ACTION) {
              // Recomputed fresh rather than trusting the notification's
              // own (possibly stale) saveAmount -- balances may have
              // moved since this notification was scheduled.
              const review = computeDailyBudgetReview({ splits, accounts, moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers });
              const cappedAmount = review.savings ? Math.max(0, Math.min(review.savings.maxSafeToSave || 0, review.currentBalance || 0)) : 0;
              if (cappedAmount > 0) {
                const saveAccount = data.saveAccount || accounts[0]?.id;
                setSavingsLog((prev) => [...prev, { id: uid(), amount: cappedAmount, account: saveAccount, splitId: review.savings.id, note: "Daily budget review", date: decisionDay, type: "deposit", createdAt: Date.now() }]);
                setDailyBudgetLog((prev) => [...prev, { id: uid(), date: decisionDay, choice: "saved", amount: cappedAmount }]);
              }
            } else {
              setDailyBudgetLog((prev) => [...prev, { id: uid(), date: decisionDay, choice: "kept" }]);
            }
          }
          if (notifId) await dismissNotification(notifId);
          return;
        }
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

      if (data.type === "classCheckIn") {
        if (notifId) await dismissNotification(notifId);
        if (actionId === CLASS_CHECKIN_NONE_ACTION) {
          // Same suspend path the ring screen's own "Class suspended
          // today?" option uses -- marks cancelledClasses and tells the
          // native engine to skip today's alarm for this entry, so
          // answering "None" here actually prevents the alarm later, not
          // just this notification.
          const block = findTodaysBlockForSubject(data.subjectId);
          if (block) handleSuspendClass(block);
          return;
        }
        // "Yes" (or a plain tap): nothing to do -- the class alarm rings
        // normally, same as if this check-in had never been answered.
        if (!actionId || actionId === DEFAULT_ACTION_IDENTIFIER || actionId === CLASS_CHECKIN_YES_ACTION) {
          setTab("school");
        }
      }
      if (data.type === "todo") {
        if (actionId === TODO_STARTED_YES_ACTION) {
          if (notifId) await dismissNotification(notifId);
          setTodos((prev) => prev.map((t) => (t.id === data.todoId && t.status === "not_started" ? { ...t, status: "wip" } : t)));
          return;
        }
        if (actionId === TODO_PASSED_YES_ACTION) {
          if (notifId) await dismissNotification(notifId);
          const t = todos.find((x) => x.id === data.todoId);
          if (t && !t.completed) {
            // Mirrors TodoScreen's own toggle() completion path -- cancel
            // whatever's still armed for it (reminders and any native
            // alarm) rather than leaving them to fire against a task
            // that's already done.
            await cancelTodoNotifications(t.notificationIds);
            await cancelTodoAlarm(t.id);
            setTodos((prev) => prev.map((x) => (x.id === t.id ? { ...x, completed: true, completedAt: new Date().toISOString() } : x)));
          }
          return;
        }
        if (actionId === TODO_STARTED_NOT_YET_ACTION || actionId === TODO_PASSED_NOT_YET_ACTION) {
          // Acknowledged, nothing to change -- the next occurrence will
          // simply ask again.
          if (notifId) await dismissNotification(notifId);
          return;
        }
        // A plain tap (not an action button).
        setTab("todo");
        return;
      }

      if (data.type === "reminder") {
        setTab("todo");
        return;
      }

      if (data.type === "gfPromise" || data.type === "gfDate") {
        setGfOpen(true);
        return;
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

  // Popups due right now, across every source that can produce one:
  // general Reminders and GF Promises in "popup" mode (a scheduled
  // date/time-or-daily thing), and GF Notes with a popup frequency set
  // (an unscheduled "show this again every N hours" thing). Recomputed
  // fresh each call rather than memoized, since it's only ever invoked
  // from the two triggers below, never from a render.
  const [remindPopupVisible, setRemindPopupVisible] = useState(false);
  const [remindPopupItems, setRemindPopupItems] = useState([]);

  const checkDuePopups = useCallback(() => {
    // A reminder or promise can be popup-due either the "scheduled" way (a
    // specific date/time, or daily-at-a-time) or the "interval" way (every
    // N hours, no clock time involved) -- checked separately since they're
    // mutually exclusive per item (scheduleKind decides which) but both
    // count as "this item's popup is due right now". Reminders only
    // gained the interval option alongside promises, so it wasn't checked
    // here before -- an interval-mode Remember reminder in popup mode
    // would never have actually surfaced.
    const dueRemindersScheduled = reminders.filter(isScheduledPopupDue);
    const dueRemindersInterval = reminders.filter(isIntervalPopupDue);
    const dueReminders = [...dueRemindersScheduled, ...dueRemindersInterval];
    const duePromisesScheduled = gfPromises.filter(isScheduledPopupDue);
    const duePromisesInterval = gfPromises.filter(isIntervalPopupDue);
    const duePromises = [...duePromisesScheduled, ...duePromisesInterval];
    const dueNotes = gfNotes.filter(isFrequencyPopupDue);
    if (!dueReminders.length && !duePromises.length && !dueNotes.length) return;
    setRemindPopupItems([
      ...dueReminders.map((r) => ({ id: `reminder:${r.id}`, text: r.text, gf: false })),
      ...duePromises.map((p) => ({ id: `gfPromise:${p.id}`, text: p.text, gf: true })),
      ...dueNotes.map((n) => ({ id: `gfNote:${n.id}`, text: n.text, gf: true })),
    ]);
    setRemindPopupVisible(true);
    // Stamps each shown item so it doesn't immediately re-qualify as due
    // on the very next check -- a one-time (dated) item won't fire again
    // at all, a repeating one waits out its own cooldown first.
    if (dueReminders.length) setReminders((prev) => prev.map((r) => (
      isScheduledPopupDue(r) ? { ...r, ...markScheduledPopupShown(r) }
      : isIntervalPopupDue(r) ? { ...r, ...markFrequencyPopupShown() }
      : r
    )));
    if (duePromises.length) setGfPromises((prev) => prev.map((p) => (
      isScheduledPopupDue(p) ? { ...p, ...markScheduledPopupShown(p) }
      : isIntervalPopupDue(p) ? { ...p, ...markFrequencyPopupShown() }
      : p
    )));
    if (dueNotes.length) setGfNotes((prev) => prev.map((n) => (isFrequencyPopupDue(n) ? { ...n, ...markFrequencyPopupShown() } : n)));
  }, [reminders, gfPromises, gfNotes]);

  // Checked once right after unlocking (covers cold start and re-entering
  // the PIN) -- gated on `unlocked` for the same reason as the old
  // mechanism it replaced: AppShell stays mounted behind the lock screen,
  // and this popup is a Modal that renders above everything natively
  // regardless of JS z-index, so without this gate it could appear ON TOP
  // OF the PIN screen before the person has actually gotten past it.
  useEffect(() => {
    if (!ready || !unlocked) return;
    // Deferred rather than called straight away: checkDuePopups can touch
    // every reminder/promise/note and fire off several setState calls,
    // which re-renders the whole (large, already-mounted) AppShell tree.
    // Running that synchronously in the same tick as the unlock meant it
    // competed with the LockScreen fade-out for the JS thread right as
    // the person unlocked -- the exact moment "opening" needs to feel
    // instant. runAfterInteractions pushes it past that transition
    // instead, so the fade-out itself stays smooth and any popup still
    // appears right after, just a beat later rather than fighting for the
    // same frame.
    const task = InteractionManager.runAfterInteractions(() => checkDuePopups());
    return () => task.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, unlocked]);

  // Also checked every time the app comes back to the foreground -- an
  // hourly/3-hourly GF Note or a daily time-only Reminder needs to be
  // re-evaluated on every reopen, not just the first one of the session.
  // Reads `unlocked` through a ref rather than depending on it directly,
  // so this doesn't need to tear down and resubscribe the AppState
  // listener on every lock/unlock -- it just checks the ref's current
  // value at the moment the app actually resumes.
  const unlockedRef = useRef(unlocked);
  useEffect(() => { unlockedRef.current = unlocked; }, [unlocked]);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active" && unlockedRef.current) checkDuePopups();
    });
    return () => sub.remove();
  }, [checkDuePopups]);

  // Repeating (date-less) reminders/promises can't tell Expo their own
  // end date -- enforced here instead, swept once on every load.
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const expiredReminderIds = await sweepExpiredDailyNotifications(reminders);
      if (expiredReminderIds.length) setReminders((prev) => prev.map((r) => (expiredReminderIds.includes(r.id) ? { ...r, notificationId: null } : r)));
      const expiredPromiseIds = await sweepExpiredDailyNotifications(gfPromises);
      if (expiredPromiseIds.length) setGfPromises((prev) => prev.map((p) => (expiredPromiseIds.includes(p.id) ? { ...p, notificationId: null } : p)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // A repeating task reminder's "due in N days" / "have you started it?"
  // wording is fixed at schedule time (see the comment on
  // rescheduleTodoNotifications) -- refreshed here once per calendar day,
  // for every incomplete task with both a due date and a repeating
  // reminder, so the wording stays honest as the days actually pass.
  // Guarded by a ref (not state) since "have I already swept today" is
  // bookkeeping for this effect alone, not something that should trigger
  // its own re-render or persist across app restarts -- worst case, it
  // just re-sweeps once more the next time the app opens.
  const lastTodoRefreshRef = useRef(null);
  useEffect(() => {
    if (!ready) return;
    const today = todayISO();
    if (lastTodoRefreshRef.current === today) return;
    lastTodoRefreshRef.current = today;
    const stale = todos.filter((t) => !t.completed && t.dueDate && t.reminderEnabled !== false && t.notify && t.notify.type !== "once");
    if (!stale.length) return;
    (async () => {
      const updates = await Promise.all(stale.map(async (t) => {
        const subject = t.category === "school" && t.subjectId ? activeSubjects.find((s) => s.id === t.subjectId) : undefined;
        const ids = await rescheduleTodoNotifications(t, subject);
        return { id: t.id, ids };
      }));
      setTodos((prev) => prev.map((t) => {
        const match = updates.find((u) => u.id === t.id);
        return match ? { ...t, notificationIds: match.ids } : t;
      }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, todos]);


  const gfMissedCount = useMemo(
    () => gfPromises.filter((p) => !p.done && p.remindDate && p.remindTime && Date.now() - new Date(`${p.remindDate}T${p.remindTime}:00`).getTime() > 24 * 3600 * 1000).length,
    [gfPromises]
  );


  useEffect(() => {
    (async () => {
      await setupAndroidChannel();
      await setupNotificationCategories();
      // Every reminder/bill/class-alarm feature in the app quietly depends
      // on this having been granted -- if it wasn't, LAYP would otherwise
      // just silently fail to remind about anything with no indication why.
      // Surfaces on every launch while permission stays off (not just the
      // first time) since it's genuinely actionable each time, not a nag
      // about something already resolved -- stops appearing entirely once
      // the person grants it from Settings.
      const notifGranted = await requestNotificationPermission();
      if (!notifGranted) {
        showAppDialog(
          "Notifications are off",
          "LAYP can't send task reminders, bill alerts, or class alarms without notification permission. You can turn it on anytime from your phone's Settings."
        );
      }
      await cleanupDuplicateDailyBudgetNotifications();
      const s = await loadState();
      if (s?.__totalCorruption) {
        // Stop here -- don't populate any state from this, since there's
        // nothing usable in it. RecoveryScreen takes over the render
        // below until the person either restores a backup file or
        // explicitly chooses to start fresh.
        setNeedsRecovery(true);
        setReady(true);
        return;
      }
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
        setSavingsAccounts(s.savingsAccounts || DEFAULT_SAVINGS_ACCOUNTS.map((a) => ({ ...a })));
        setInterestLog(s.interestLog || []);
        setTransfers(s.transfers || []);
        setRecurringIncome(s.recurringIncome || []);
        setSpendingLimits(s.spendingLimits || {});
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
        setReminders(s.reminders || []);
        setGfName(s.gfName || "Her");
        setGfLikes(s.gfLikes || []);
        setGfDislikes(s.gfDislikes || []);
        setGfDates(s.gfDates || []);
        setGfNotes(s.gfNotes || []);
        setGfGiftIdeas(s.gfGiftIdeas || []);
        setGfPromises(s.gfPromises || []);

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

  // Once per launch, catch up on any daily interest each savings account
  // has missed since it was last credited (see accrueSavingsAccountInterest
  // in utils.ts for how the "missed days" catch-up math works). This is
  // what makes an interest-bearing savings account (GoTyme, Maribank, or
  // any other one someone adds) actually gain interest every day instead
  // of only whenever someone happens to be looking at the screen.
  useEffect(() => {
    if (!ready) return;
    const today = todayISO();
    const newEntries = [];
    for (const acc of savingsAccounts) {
      const entry = accrueSavingsAccountInterest(acc, savingsLog, [...interestLog, ...newEntries], today);
      if (entry) newEntries.push(entry);
    }
    if (newEntries.length) setInterestLog((prev) => [...prev, ...newEntries]);
    // Deliberately only [ready] -- this is a once-per-launch catch-up job,
    // not something that should re-run and potentially double-credit
    // interest every time savings data changes during the session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Same once-per-launch catch-up, but for regular budget accounts that
  // have their own interestRate set (e.g. a Maribank account used for
  // everyday spending that still earns interest without the money being
  // moved into a separate savings account). Posted straight to moneyLog
  // as an ordinary "interest" income entry so it's counted in the
  // account's income total automatically -- no separate ledger needed.
  useEffect(() => {
    if (!ready) return;
    const today = todayISO();
    const newEntries = [];
    const ctx = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };
    for (const acc of accounts) {
      const entry = accrueAccountInterest(acc, ctx, [...moneyLog, ...newEntries], today);
      if (entry) newEntries.push(entry);
    }
    if (newEntries.length) setMoneyLog((prev) => [...prev, ...newEntries]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (firstLoad.current) { firstLoad.current = false; return; }
    saveState({ todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, splits, accounts, transfers, goals, dark, dailyBudgetSettings, dailyBudgetLog, dailyBudgetNotifId, academicPeriods, subjects, scheduleEntries, schoolDefaults, cancelledClasses, recurringIncome, spendingLimits, savingsAccounts, interestLog, reminders, gfName, gfLikes, gfDislikes, gfDates, gfNotes, gfGiftIdeas, gfPromises });
    setThemePreference(dark);
  }, [todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, splits, accounts, transfers, goals, dark, ready, dailyBudgetSettings, dailyBudgetLog, dailyBudgetNotifId, academicPeriods, subjects, scheduleEntries, schoolDefaults, cancelledClasses, recurringIncome, spendingLimits, savingsAccounts, interestLog, reminders, gfName, gfLikes, gfDislikes, gfDates, gfNotes, gfGiftIdeas, gfPromises]);

  // --- Home-screen widgets + quiet notification buttons (modules/layp-widget, Android) ---
  //
  // The widgets (spending, tasks, calendar) and some notification buttons are
  // native, so they work while this JS isn't running. Two one-way flows:
  //  * native -> app: what happened while the app was closed waits in a
  //    durable native queue -- expenses and money logged from the widget,
  //    taps on a task's circle, and answers to notification buttons that
  //    don't open the app ("Yes, started", "Save to savings"...).
  //    syncWidgetItems() applies them on launch and whenever the app comes
  //    back to the foreground.
  //  * app -> native: the summary effect below pushes everything the widgets
  //    show (today's total, balances, tasks, upcoming events, theme...).
  // Both are no-ops where the native module isn't linked (iOS, Expo Go).
  const widgetCtxRef = useRef({});
  widgetCtxRef.current = { ready, needsRecovery, splits, accounts, todos, expenses, moneyLog, weeklySummaries, loans, savingsLog, transfers, cancelledClasses };
  // Queue ids already applied this session, so two syncs close together
  // (launch + foreground) can't apply the same item twice before it's acked.
  const widgetDoneRef = useRef(new Set());
  const widgetBusyRef = useRef(false);
  const syncWidgetItems = useCallback(async () => {
    const c = widgetCtxRef.current;
    if (!c.ready || c.needsRecovery || !isNativeWidgetAvailable() || widgetBusyRef.current) return;
    widgetBusyRef.current = true;
    try {
      const all = await getPendingWidgetItems();
      const fresh = (list) => list.filter((x) => !widgetDoneRef.current.has(x.id));
      const queued = { expenses: fresh(all.expenses), money: fresh(all.money), taskOps: fresh(all.taskOps), notifActions: fresh(all.notifActions), newTasks: fresh(all.newTasks), classSuspends: fresh(all.classSuspends || []) };
      const ackIds = [...all.expenses, ...all.money, ...all.taskOps, ...all.notifActions, ...all.newTasks, ...(all.classSuspends || [])].map((x) => x.id);
      if (ackIds.length === 0) return;
      const today = todayISO();
      const ctx = { moneyLog: c.moneyLog, expenses: c.expenses, weeklySummaries: c.weeklySummaries, loans: c.loans, savingsLog: c.savingsLog, transfers: c.transfers };

      // Money received first, so an expense logged right after it can use it.
      const moneyRes = pendingToMoney(queued.money, { accounts: c.accounts, incomeCategories: INCOME_CATEGORIES, existingIds: new Set(c.moneyLog.map((m) => m.id)), today });
      const moneyAdded = {};
      for (const m of moneyRes.entries) moneyAdded[m.account] = (moneyAdded[m.account] || 0) + m.amount;
      if (moneyRes.entries.length > 0) {
        setMoneyLog((prev) => {
          const have = new Set(prev.map((m) => m.id));
          const add = moneyRes.entries.filter((m) => !have.has(m.id));
          return add.length > 0 ? [...prev, ...add] : prev;
        });
      }

      // Spending never goes past an account's balance: the widget's dialog
      // blocks it, and this re-checks against the real balance (the widget's
      // copy can be a little stale). Anything that doesn't fit is dropped
      // and the person is told, rather than silently overspending.
      const balances = Object.fromEntries(c.accounts.map((a) => [a.id, computeAccountBalance(a.id, ctx)]));
      const expRes = pendingToExpenses(queued.expenses, { splits: c.splits, accounts: c.accounts, existingIds: new Set(c.expenses.map((e) => e.id)), today, balances, moneyAdded });
      if (expRes.expenses.length > 0) {
        setExpenses((prev) => {
          const have = new Set(prev.map((e) => e.id));
          const add = expRes.expenses.filter((e) => !have.has(e.id));
          return add.length > 0 ? [...prev, ...add] : prev;
        });
      }
      if (expRes.rejected.length > 0) {
        const lines = expRes.rejected.map((r) => {
          const acct = c.accounts.find((a) => a.id === r.account)?.label || "that account";
          return `${r.name} (${peso(r.amount)}) -- only ${peso(r.available)} left in ${acct}`;
        });
        showAppDialog("Some widget expenses weren't added", `${lines.join("\n")}\n\nSpending can't go past an account's balance.`);
      }

      // Tasks added from the Tasks widget: created like the in-app form
      // creates them, including scheduling their reminders.
      const taskRes = pendingToTodos(queued.newTasks, { existingIds: new Set(c.todos.map((t) => t.id)), today });
      const newTodos = [];
      for (const draft of taskRes.todos) {
        let notificationIds = [];
        try { notificationIds = await rescheduleTodoNotifications(draft, null); } catch (e) { /* the task is still created */ }
        newTodos.push({ ...draft, notificationIds });
      }

      // Task taps / "Have you started?" answers: same effects as doing it in
      // the Todo screen -- finishing a task also cancels its reminders/alarm.
      // Applied after the new tasks exist, so a task added and then tapped
      // from the widget before the app ran ends up in the right state.
      if (newTodos.length > 0 || queued.taskOps.length > 0) {
        const { completed } = applyTaskOps([...c.todos, ...newTodos], queued.taskOps);
        for (const t of completed) {
          await cancelTodoNotifications(t.notificationIds);
          await cancelTodoAlarm(t.id);
        }
        setTodos((prev) => {
          const have = new Set(prev.map((t) => t.id));
          const add = newTodos.filter((t) => !have.has(t.id));
          return applyTaskOps(add.length > 0 ? [...prev, ...add] : prev, queued.taskOps).todos;
        });
      }

      // A class suspended from the 2x2 widget is recorded for today using
      // the same cancelledClasses state as the in-app class alarm screen.
      if (queued.classSuspends.length > 0) {
        setCancelledClasses((prev) => {
          const next = [...prev];
          for (const item of queued.classSuspends) {
            if (!item?.entryId || !item?.date) continue;
            if (!next.some((x) => x.date === item.date && x.entryId === item.entryId)) {
              next.push({ date: item.date, entryId: item.entryId });
            }
          }
          return next;
        });
      }

      // Notification buttons that need the app's own logic (daily budget):
      // replayed through the same handler a tap would have reached, stamped
      // with the day the button was actually tapped.
      for (const a of queued.notifActions) {
        await notificationHandlerRef.current({
          actionIdentifier: a.actionId,
          actionDate: a.date,
          notification: { request: { identifier: a.notifId, content: { data: a.data } } },
        });
      }

      for (const id of ackIds) widgetDoneRef.current.add(id);
      // Acknowledged only after saveState's debounce has had time to write
      // it all to disk (src/storage.js SAVE_DEBOUNCE_MS = 800). If the app is
      // killed first, the next sync skips what was already saved by id.
      setTimeout(() => { ackWidgetItems(ackIds).catch(() => {}); }, 3000);
    } catch (e) {
      console.warn("syncWidgetItems failed", e);
    } finally {
      widgetBusyRef.current = false;
    }
  }, []);
  useEffect(() => {
    if (!ready || needsRecovery || !isNativeWidgetAvailable()) return undefined;
    syncWidgetItems();
    const sub = AppState.addEventListener("change", (next) => { if (next === "active") syncWidgetItems(); });
    return () => sub.remove();
  }, [ready, needsRecovery, syncWidgetItems]);
  useEffect(() => {
    if (!ready || needsRecovery || !isNativeWidgetAvailable()) return undefined;
    const t = setTimeout(() => {
      const ctx = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };
      const today = todayISO();
      pushWidgetSummary(buildWidgetSummary({
        expenses, splits, accounts,
        balanceOf: (id) => computeAccountBalance(id, ctx),
        hidden: budgetHidden,
        today,
        dark,
        incomeCategories: INCOME_CATEGORIES,
        todos,
        subjects,
        categories: CATEGORIES,
        academicPeriods,
        scheduleEntries,
        cancelledClasses,
        // Each date widget shows only what was chosen in Settings > Widgets.
        events: buildWidgetEvents({ todos, bills, loans, reminders, gfDates, today, kinds: widgetPrefs.calendarKinds }),
        // A month ahead is pushed (the widget itself picks the 7-day window
        // each day, so it stays right even if the app isn't opened for days).
        upcoming: buildWidgetEvents({ todos, bills, loans, reminders, gfDates, today, horizonDays: 30, limit: 80, kinds: widgetPrefs.upcomingKinds }),
      })).catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [ready, needsRecovery, expenses, splits, accounts, moneyLog, weeklySummaries, loans, savingsLog, transfers, budgetHidden, dark, todos, bills, reminders, gfDates, subjects, academicPeriods, scheduleEntries, cancelledClasses, widgetPrefs]);

  // Monthly GF dates (monthsaries) can't use a repeating OS trigger, so only
  // their next few occurrences are scheduled at a time. Re-arm them once per
  // launch so that window keeps rolling forward as months pass.
  useEffect(() => {
    if (!ready || needsRecovery) return;
    const monthly = gfDates.filter((d) => entryRepeat(d) === "monthly");
    if (monthly.length === 0) return;
    (async () => {
      const fresh = {};
      for (const d of monthly) {
        try { fresh[d.id] = await rescheduleDateNotifications(d.notificationIds || [], d.date, d.label, "monthly", entryKind(d)); } catch (e) { /* keep the old ids */ }
      }
      setGfDates((prev) => prev.map((d) => (fresh[d.id] ? { ...d, notificationIds: fresh[d.id] } : d)));
    })();
  }, [ready, needsRecovery]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Recurring income "catches up" rather than running on its own clock --
  // there's no background execution here, so instead of trying to fire
  // exactly on schedule, any recurring income template whose nextDate has
  // arrived gets posted to moneyLog (and its nextDate advanced) the next
  // time the app is opened. If the app hasn't been opened in a while, this
  // loops per template rather than only posting one entry, so a weekly
  // allowance that was due 3 times while the app was untouched shows up as
  // 3 separate income entries on the dates they were actually due, not one
  // lump sum or a silently skipped catch-up. Capped at 24 iterations per
  // template as a safety net against a corrupted/very old nextDate looping
  // effectively forever.
  useEffect(() => {
    if (!ready) return;
    const today = todayISO();
    const newEntries = [];
    setRecurringIncome((prev) => {
      if (!prev.length) return prev;
      let changed = false;
      const updated = prev.map((r) => {
        let next = r.nextDate;
        let guard = 0;
        while (next && next <= today && guard < 24) {
          newEntries.push({ id: uid(), amount: Number(r.amount), category: r.category || "other", account: r.account, note: r.label, date: next, source: "recurring", recurringId: r.id, createdAt: Date.now() });
          next = nextRecurringDate(next, r.frequency);
          guard++;
        }
        if (next === r.nextDate) return r;
        changed = true;
        return { ...r, nextDate: next };
      });
      return changed ? updated : prev;
    });
    if (newEntries.length) setMoneyLog((prev) => [...prev, ...newEntries]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keeps the end-of-day local notification's copy roughly current. Local
  // notifications can't recompute their own body at fire time, so instead
  // the app cancels + reschedules the repeating daily notification any time
  // the numbers behind it change (new expense, new income, model edited,
  // reminder settings changed) -- see dailyBudgetNotificationContent.
  //
  // Debounced (rather than firing on every single dependency change) and
  // guarded with a request token: without both of these, logging a few
  // expenses back-to-back could fire this effect twice before the first
  // async reschedule finished. Both calls would read the same
  // (not-yet-updated) tracked id, both would cancel it, and both would
  // schedule a brand-new *repeating* notification -- but only one of the
  // two new ids ever gets saved to state, so the other became a
  // permanently untracked, never-cancelled duplicate that just kept firing
  // every day alongside the real one. The token below makes sure only the
  // most recent reschedule call is ever trusted; a stale one cancels the
  // notification it just created instead of leaving it orphaned.
  const dailyBudgetRequestRef = useRef(0);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const myToken = ++dailyBudgetRequestRef.current;
      (async () => {
        const review = computeDailyBudgetReview({ splits, accounts, moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers });
        const content = dailyBudgetNotificationContent(review);
        // Cap the same way the in-app "Save recommended" button does --
        // never more than what's actually sitting in the accounts right
        // now -- so the notification's Save button can't ever save more
        // than is really there.
        const saveAmount = review.savings ? Math.max(0, Math.min(review.savings.maxSafeToSave || 0, review.currentBalance || 0)) : 0;
        const id = await rescheduleDailyBudgetNotification(dailyBudgetNotifId, dailyBudgetSettings, content, { amount: saveAmount, account: accounts[0]?.id });
        if (dailyBudgetRequestRef.current !== myToken) {
          // A newer change already superseded this one while we were
          // awaiting -- this id would otherwise never be cancelled again.
          if (id) await cancelTodoNotifications([id]);
          return;
        }
        if (id !== dailyBudgetNotifId) setDailyBudgetNotifId(id);
      })();
    }, 800);
    return () => clearTimeout(timer);
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
  // means the "starting now" alarm won't also go off) -- including the
  // native "starting now" alarm, which otherwise has no way to know about
  // cancelledClasses at all (see suspendClassAlarmToday).
  function handleSuspendClass(block) {
    setCancelledClasses((prev) => [...prev, { date: todayISO(), entryId: block.entry.id }]);
    setClassAlarm(null);
    suspendClassAlarmToday(block.subject.id, block.entry.id);
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
  const goToSummary = useCallback(() => { setSettingsTab("summary"); setSettingsOpen(true); }, []);
  const clearPrefillSubject = useCallback(() => setPrefillSubjectId(null), []);
  const goToTodoForSubject = useCallback((subjectId) => { setPrefillSubjectId(subjectId); setTab("todo"); }, []);
  const restoreBackup = useCallback((data) => {
    setTodos(data.todos); setBills(data.bills); setExpenses(data.expenses);
    setMoneyLog(data.moneyLog); setWeeklySummaries(data.weeklySummaries);
    setSavingsLog(data.savingsLog); setGoals(data.goals); setLoans(data.loans);
    setSplits(data.splits); setAccounts(data.accounts); setTransfers(data.transfers);
    setSavingsAccounts(data.savingsAccounts?.length ? data.savingsAccounts : DEFAULT_SAVINGS_ACCOUNTS.map((a) => ({ ...a })));
    setInterestLog(data.interestLog || []);
    setDark(data.dark);
    setDailyBudgetSettings(data.dailyBudgetSettings || { ...DEFAULT_DAILY_BUDGET_SETTINGS });
    setDailyBudgetLog(data.dailyBudgetLog || []);
    setAcademicPeriods(data.academicPeriods?.length ? data.academicPeriods : [newAcademicPeriod("Current Schedule")]);
    setSubjects(data.subjects || []);
    setScheduleEntries(data.scheduleEntries || []);
    setSchoolDefaults(data.schoolDefaults || { ...DEFAULT_SCHOOL_DEFAULTS });
    setRecurringIncome(data.recurringIncome || []);
    setSpendingLimits(data.spendingLimits || {});
    setReminders(data.reminders || []);
    setGfName(data.gfName || "Her");
    setGfLikes(data.gfLikes || []);
    setGfDislikes(data.gfDislikes || []);
    setGfDates(data.gfDates || []);
    setGfNotes(data.gfNotes || []);
    setGfGiftIdeas(data.gfGiftIdeas || []);
    setGfPromises(data.gfPromises || []);
  }, []);
  const backupData = useMemo(
    () => ({ version: 1, todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, goals, loans, splits, accounts, transfers, dark, dailyBudgetSettings, dailyBudgetLog, academicPeriods, subjects, scheduleEntries, schoolDefaults, recurringIncome, spendingLimits, savingsAccounts, interestLog, reminders, gfName, gfLikes, gfDislikes, gfDates, gfNotes, gfGiftIdeas, gfPromises }),
    [todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, goals, loans, splits, accounts, transfers, dark, dailyBudgetSettings, dailyBudgetLog, academicPeriods, subjects, scheduleEntries, schoolDefaults, recurringIncome, spendingLimits, savingsAccounts, interestLog, reminders, gfName, gfLikes, gfDislikes, gfDates, gfNotes, gfGiftIdeas, gfPromises]
  );

  // Automatic backup: once a week LAYP backs itself up to this phone (and to
  // Google Drive when that's connected). A phone can't run LAYP's JavaScript
  // while the app is closed, so "due" is checked when it opens and each time
  // it comes back to the foreground; src/backupSchedule.js decides if a week
  // has passed (and waits out a retry window after a failure).
  const backupDataRef = useRef(null);
  backupDataRef.current = backupData;
  useEffect(() => {
    if (!ready || needsRecovery) return undefined;
    const run = () => { maybeAutoBackup(backupDataRef.current).catch((e) => console.warn("auto backup failed", e)); };
    // A moment after launch, so it never competes with the app starting up.
    const t = setTimeout(run, 4000);
    const sub = AppState.addEventListener("change", (next) => { if (next === "active") run(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, [ready, needsRecovery]);


  function renderTabContent(t) {
    switch (t) {
      case "home":
        return (
          <HomeScreen
            accounts={accounts} moneyLog={moneyLog} expenses={expenses} weeklySummaries={weeklySummaries}
            loans={loans} savingsLog={savingsLog} transfers={transfers} bills={bills} splits={splits}
            goals={goals} todos={todos} reminders={reminders}
            periods={academicPeriods} subjects={subjects} scheduleEntries={scheduleEntries} cancelledClasses={cancelledClasses}
            onViewSchedule={goToSchool}
            onViewTodos={goToTodo}
            budgetHidden={budgetHidden} onToggleBudgetHidden={toggleBudgetHidden}
            onGoToBackup={goToSummary}
          />
        );
      case "todo":
        return (
          <TodoScreen
            todos={todos} setTodos={setTodos}
            subjects={activeSubjects}
            prefillSubjectId={prefillSubjectId}
            onConsumePrefillSubject={clearPrefillSubject}
            reminders={reminders} setReminders={setReminders}
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
            cancelledClasses={cancelledClasses}
            onSuspendClass={handleSuspendClass}
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
            savingsAccounts={savingsAccounts} setSavingsAccounts={setSavingsAccounts}
            interestLog={interestLog}
            transfers={transfers} setTransfers={setTransfers}
            goals={goals} setGoals={setGoals}
            recurringIncome={recurringIncome} setRecurringIncome={setRecurringIncome}
            spendingLimits={spendingLimits} setSpendingLimits={setSpendingLimits}
            dailyBudgetSettings={dailyBudgetSettings} setDailyBudgetSettings={setDailyBudgetSettings}
            setDailyBudgetLog={setDailyBudgetLog}
            dailyBudgetLog={dailyBudgetLog}
            subTab={budgetSubTab} setSubTab={setBudgetSubTab}
            showDailyBudget={showDailyBudget} setShowDailyBudget={setShowDailyBudget}
            budgetHidden={budgetHidden} onToggleBudgetHidden={toggleBudgetHidden}
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

  if (needsRecovery) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <RecoveryScreen
          theme={theme}
          onRestore={(data) => { restoreBackup(data); clearUnreadableLegacyState(); setNeedsRecovery(false); }}
          onSkip={() => { clearUnreadableLegacyState(); setNeedsRecovery(false); }}
        />
      </SafeAreaView>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, dark }}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
        <StatusBar style={dark ? "light" : "dark"} />
        <ConfirmModalHost />
        <AppDialogHost />
        {classAlarm && (
          <ClassAlarmScreen alarm={classAlarm} onDismiss={() => setClassAlarm(null)} onSuspend={() => handleSuspendClass(classAlarm.block)} />
        )}
        <SettingsScreen
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          initialTab={settingsTab}
          dark={dark} setDark={setDark}
          autoLockMinutes={autoLockMinutes}
          onChangeAutoLockMinutes={onChangeAutoLockMinutes}
          widgetPrefs={widgetPrefs}
          onChangeWidgetPrefs={onChangeWidgetPrefs}
          gfScreenEnabled={gfScreenEnabled}
          onChangeGfScreenEnabled={onChangeGfScreenEnabled}
          summaryProps={{
            todos, splits, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, accounts, transfers,
            backup: backupData,
            onRestore: restoreBackup,
          }}
        />
        {gfScreenEnabled && <GFScreen
          visible={gfOpen}
          onClose={() => setGfOpen(false)}
          gfName={gfName} setGfName={setGfName}
          gfLikes={gfLikes} setGfLikes={setGfLikes}
          gfDislikes={gfDislikes} setGfDislikes={setGfDislikes}
          gfDates={gfDates} setGfDates={setGfDates}
          gfNotes={gfNotes} setGfNotes={setGfNotes}
          gfGiftIdeas={gfGiftIdeas} setGfGiftIdeas={setGfGiftIdeas}
          gfPromises={gfPromises} setGfPromises={setGfPromises}
        />}
        <RemindPopup
          visible={remindPopupVisible}
          items={remindPopupItems}
          onDismiss={() => setRemindPopupVisible(false)}
        />
        <LiquidGlass radius={22} style={styles.headerGlass} contentStyle={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={{ uri: dark ? LOGO_DARK_URI : LOGO_LIGHT_URI }} style={styles.logo} />
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>LAYP</Text>
              <Text style={[styles.headerDate, { color: theme.textMuted }]}>{todayLabel}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 7 }}>
            <Pressable onPress={onLock} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Lock app">
              <Lock size={13} color={theme.textMuted} />
            </Pressable>
            {gfScreenEnabled && (
              <Pressable onPress={() => setGfOpen(true)} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Open GF">
                <Heart size={14} color={ACCENT.rose} fill={ACCENT.rose} />
                {gfMissedCount > 0 && (
                  <View style={styles.gfBadge}>
                    <Text style={styles.gfBadgeText}>{gfMissedCount > 9 ? "9+" : gfMissedCount}</Text>
                  </View>
                )}
              </Pressable>
            )}
            <Pressable onPress={() => { setSettingsTab("general"); setSettingsOpen(true); }} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Settings">
              <GearIcon size={14} color={theme.text} />
            </Pressable>
          </View>
        </LiquidGlass>

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

        {alarmReliabilityBanner && (
          <View style={[styles.banner, { backgroundColor: theme.accentDark }]}>
            <Bell size={16} color={ACCENT.gold} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Alarms may ring late</Text>
              <Text style={styles.bannerBody}>
                {alarmReliabilityBanner.exact && alarmReliabilityBanner.battery
                  ? "Grant \"Alarms & reminders\" and turn off battery optimization for LAYP so class and task alarms ring exactly on time, even in the background."
                  : alarmReliabilityBanner.exact
                  ? "Grant LAYP the \"Alarms & reminders\" permission so alarms ring exactly on time instead of being delayed."
                  : "Turn off battery optimization for LAYP so alarms aren't delayed while the app is in the background."}
              </Text>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                {alarmReliabilityBanner.exact && (
                  <Pressable onPress={() => { openExactAlarmSettings(); setAlarmReliabilityBanner(null); }}>
                    <Text style={styles.bannerAction}>Fix alarm permission</Text>
                  </Pressable>
                )}
                {alarmReliabilityBanner.battery && (
                  <Pressable onPress={() => { openBatteryOptimizationSettings(); setAlarmReliabilityBanner(null); }}>
                    <Text style={styles.bannerAction}>Fix battery setting</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <Pressable onPress={() => setAlarmReliabilityBanner(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><X size={14} color="#fff" /></Pressable>
          </View>
        )}

        <SwipeNavigator
          style={{ flex: 1 }}
          enabled={!classAlarm}
          // A drag "left" moves to the next tab, "right" moves to the
          // previous one -- these tell SwipeNavigator when there's actually
          // a tab in that direction so it can resist the drag at either end
          // (Home swiping right, or the last tab swiping left) instead of
          // dragging freely and then snapping back once released.
          canSwipeLeft={TAB_ORDER.indexOf(tab) < TAB_ORDER.length - 1}
          canSwipeRight={TAB_ORDER.indexOf(tab) > 0}
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
                <TabTransition transitionKey={tab === t ? "active" : "inactive"} style={styles.content}>
                  {renderTabContent(t)}
                </TabTransition>
              </ErrorBoundary>
            </View>
          ))}
        </View>
        </SwipeNavigator>

        <TabBar tabs={TABS} activeKey={tab} onChange={setTab} theme={theme} />
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

const styles = StyleSheet.create({
  safe: { flex: 1 },
  ambientOrb: { position: "absolute", width: 270, height: 270, borderRadius: 135 },
  ambientOrbOne: { top: 80, left: -95 },
  ambientOrbTwo: { top: 380, right: -115 },
  ambientOrbThree: { bottom: 185, left: 65 },
  ambientOrbFour: { top: 170, right: 40, width: 150, height: 150, borderRadius: 75 },
  headerGlass: { marginHorizontal: 12, marginTop: 6, marginBottom: 8, minHeight: 54 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  logo: { width: 30, height: 30, borderRadius: 8 },
  headerTitle: { fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
  headerDate: { fontSize: 10, marginTop: 1 },
  themeBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", borderWidth: 1, position: "relative" },
  gfBadge: { position: "absolute", top: -3, right: -3, minWidth: 14, height: 14, borderRadius: 7, backgroundColor: ACCENT.ember, alignItems: "center", justifyContent: "center", paddingHorizontal: 2 },
  gfBadgeText: { color: "#fff", fontSize: 8, fontWeight: "800" },
  banner: { flexDirection: "row", gap: 8, borderRadius: 16, padding: 12, marginHorizontal: 16, marginBottom: 4 },
  bannerTitle: { color: "#fff", fontSize: 12, fontWeight: "700" },
  bannerBody: { color: "#ffffffcc", fontSize: 11, marginTop: 2 },
  bannerAction: { color: ACCENT.gold, fontSize: 12, fontWeight: "700" },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
});
