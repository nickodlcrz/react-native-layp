import React, { useEffect, useRef, useState, useMemo } from "react";
import { View, Text, Pressable, Image, StyleSheet, useColorScheme, AppState, BackHandler } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ListTodo, Wallet, FileText, Bell, X, Sun, Moon, Lock, Home, GraduationCap } from "lucide-react-native";

import { ThemeContext, LIGHT, DARK, ACCENT, DEFAULT_SPLITS, DEFAULT_ACCOUNTS, DEFAULT_DAILY_BUDGET_SETTINGS, DEFAULT_SCHOOL_DEFAULTS } from "./src/theme";
import { loadState, saveState } from "./src/storage";
import { requestNotificationPermission, setupAndroidChannel, cancelTodoNotifications, rescheduleDailyBudgetNotification } from "./src/notifications";
import { todayISO, daysUntil, fmtDateLong, uid, computeDailyBudgetReview, dailyBudgetNotificationContent, toLocalISO } from "./src/utils";
import { newAcademicPeriod, getActivePeriod, subjectsForPeriod, blocksForWeekday, todayExpoWeekday } from "./src/school";
import { LOGO_LIGHT_URI, LOGO_DARK_URI } from "./src/assets/logo";
import { setThemePreference } from "./src/themePreference";
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

  async function updateAutoLockMinutes(minutes) {
    setAutoLockMinutesState(minutes);
    await setAutoLockMinutes(minutes);
  }

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
      {unlocked ? (
        <AppShell onLock={() => setUnlocked(false)} autoLockMinutes={autoLockMinutes} onChangeAutoLockMinutes={updateAutoLockMinutes} />
      ) : (
        <LockScreen onUnlock={() => setUnlocked(true)} />
      )}
    </SafeAreaProvider>
  );
}

function AppShell({ onLock, autoLockMinutes, onChangeAutoLockMinutes }) {
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
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
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
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [todos]);

  // Alarm-style class reminders: a full-screen popup (ClassAlarmScreen)
  // that takes over while the app is in the foreground, on top of the
  // ordinary OS notification (see notifications.js) that still fires
  // either way in case the app is backgrounded. Entirely optional per
  // subject -- gated on that subject's own ClassReminder / AdvanceReminder
  // toggles, same switches School already exposes. Only checks the active
  // period's schedule, same as everywhere else class reminders apply.
  const firedClassAlarmsRef = useRef({});
  useEffect(() => {
    const check = () => {
      if (classAlarm) return; // one at a time -- don't stack a second popup over the first
      const activePeriod = getActivePeriod(academicPeriods);
      if (!activePeriod) return;
      const periodSubjects = subjectsForPeriod(subjects, activePeriod.id);
      const subjectIds = periodSubjects.map((s) => s.id);
      const entries = scheduleEntries.filter((e) => subjectIds.includes(e.subjectId));
      const todaysBlocks = blocksForWeekday(periodSubjects, entries, todayExpoWeekday());
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();
      const todayKey = todayISO();
      const isCancelledToday = (entryId) => cancelledClasses.some((c) => c.date === todayKey && c.entryId === entryId);

      for (const block of todaysBlocks) {
        if (isCancelledToday(block.entry.id)) continue; // marked suspended earlier today -- don't alarm for it again
        const { subject } = block;
        if (subject.classReminderEnabled && nowMin >= block.startMin && nowMin < block.startMin + 1) {
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
    const iv = setInterval(check, 30000);
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
        <ErrorBoundary resetKey={tab}>
        <TabTransition transitionKey={tab} direction={tabDirection} style={styles.content}>
          {tab === "home" && (
            <HomeScreen
              accounts={accounts} moneyLog={moneyLog} expenses={expenses} weeklySummaries={weeklySummaries}
              loans={loans} savingsLog={savingsLog} transfers={transfers} bills={bills} splits={splits}
              goals={goals} todos={todos}
              periods={academicPeriods} subjects={subjects} scheduleEntries={scheduleEntries} cancelledClasses={cancelledClasses}
              onViewSchedule={() => setTab("school")}
              onViewTodos={() => setTab("todo")}
            />
          )}
          {tab === "todo" && (
            <TodoScreen
              todos={todos} setTodos={setTodos}
              subjects={activeSubjects}
              prefillSubjectId={prefillSubjectId}
              onConsumePrefillSubject={() => setPrefillSubjectId(null)}
            />
          )}
          {tab === "school" && (
            <SchoolScreen
              periods={academicPeriods} setPeriods={setAcademicPeriods}
              subjects={subjects} setSubjects={setSubjects}
              entries={scheduleEntries} setEntries={setScheduleEntries}
              schoolDefaults={schoolDefaults} setSchoolDefaults={setSchoolDefaults}
              todos={todos} setTodos={setTodos}
              onGoToTodoForSubject={(subjectId) => { setPrefillSubjectId(subjectId); setTab("todo"); }}
            />
          )}
          {tab === "budget" && (
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
          )}
          {tab === "summary" && (
            <SummaryScreen
              todos={todos} splits={splits} bills={bills} expenses={expenses}
              moneyLog={moneyLog} weeklySummaries={weeklySummaries} savingsLog={savingsLog} loans={loans}
              accounts={accounts} transfers={transfers}
              backup={{ version: 1, todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, goals, loans, splits, accounts, transfers, dark, dailyBudgetSettings, dailyBudgetLog, academicPeriods, subjects, scheduleEntries, schoolDefaults }}
              onRestore={(data) => {
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
              }}
              autoLockMinutes={autoLockMinutes}
              onChangeAutoLockMinutes={onChangeAutoLockMinutes}
            />
          )}
        </TabTransition>
        </ErrorBoundary>
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
