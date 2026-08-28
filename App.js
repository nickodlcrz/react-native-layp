import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, Image, StyleSheet, useColorScheme, AppState } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ListTodo, Wallet, Receipt, FileText, Bell, X, Sun, Moon, HandCoins, Lock, Home } from "lucide-react-native";

import { ThemeContext, LIGHT, DARK, ACCENT, DEFAULT_SPLITS, DEFAULT_ACCOUNTS, DEFAULT_DAILY_BUDGET_SETTINGS } from "./src/theme";
import { loadState, saveState } from "./src/storage";
import { requestNotificationPermission, setupAndroidChannel, cancelTodoNotifications, rescheduleDailyBudgetNotification } from "./src/notifications";
import { todayISO, daysUntil, fmtDateLong, uid, computeDailyBudgetReview, dailyBudgetNotificationContent } from "./src/utils";
import { LOGO_LIGHT_URI, LOGO_DARK_URI } from "./src/assets/logo";
import { setThemePreference } from "./src/themePreference";
import LockScreen from "./src/screens/LockScreen";

import HomeScreen from "./src/screens/HomeScreen";
import TodoScreen from "./src/screens/TodoScreen";
import BudgetScreen from "./src/screens/BudgetScreen";
import SpendingScreen from "./src/screens/SpendingScreen";
import BorrowScreen from "./src/screens/BorrowScreen";
import SummaryScreen from "./src/screens/SummaryScreen";
import TabTransition from "./src/components/TabTransition";

export default function App() {
  const [unlocked, setUnlocked] = useState(false);

  // Auto-lock: any time the app leaves the foreground (backgrounded, screen
  // off, app-switcher), immediately drop back to the PIN screen.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") setUnlocked(false);
    });
    return () => sub.remove();
  }, []);

  return (
    <SafeAreaProvider>
      {unlocked ? (
        <AppShell onLock={() => setUnlocked(false)} />
      ) : (
        <LockScreen onUnlock={() => setUnlocked(true)} />
      )}
    </SafeAreaProvider>
  );
}

function AppShell({ onLock }) {
  const systemScheme = useColorScheme();
  const [dark, setDark] = useState(systemScheme === "dark");
  const [tab, setTab] = useState("home");
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
    saveState({ todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, splits, accounts, transfers, goals, dark, dailyBudgetSettings, dailyBudgetLog, dailyBudgetNotifId });
    setThemePreference(dark);
  }, [todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, splits, accounts, transfers, goals, dark, ready, dailyBudgetSettings, dailyBudgetLog, dailyBudgetNotifId]);

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
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Image source={{ uri: dark ? LOGO_DARK_URI : LOGO_LIGHT_URI }} style={styles.logo} />
            <View>
              <Text style={[styles.headerTitle, { color: theme.text }]}>LAYP</Text>
              <Text style={[styles.headerDate, { color: theme.textMuted }]}>{todayLabel}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={onLock} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Lock size={13} color={theme.textMuted} />
            </Pressable>
            <Pressable onPress={() => setDark((d) => !d)} style={[styles.themeBtn, { backgroundColor: theme.card, borderColor: theme.line }]}>
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

        <TabTransition transitionKey={tab} style={styles.content}>
          {tab === "home" && (
            <HomeScreen
              accounts={accounts} moneyLog={moneyLog} expenses={expenses} weeklySummaries={weeklySummaries}
              loans={loans} savingsLog={savingsLog} transfers={transfers} bills={bills} splits={splits}
              goals={goals}
            />
          )}
          {tab === "todo" && <TodoScreen todos={todos} setTodos={setTodos} />}
          {tab === "budget" && (
            <BudgetScreen
              moneyLog={moneyLog} setMoneyLog={setMoneyLog}
              splits={splits} setSplits={setSplits}
              bills={bills} setBills={setBills}
              expenses={expenses} setExpenses={setExpenses}
              weeklySummaries={weeklySummaries}
              savingsLog={savingsLog} setSavingsLog={setSavingsLog}
              loans={loans}
              accounts={accounts} setAccounts={setAccounts}
              transfers={transfers} setTransfers={setTransfers}
              goals={goals} setGoals={setGoals}
              dailyBudgetSettings={dailyBudgetSettings} setDailyBudgetSettings={setDailyBudgetSettings}
              setDailyBudgetLog={setDailyBudgetLog}
            />
          )}
          {tab === "spending" && (
            <SpendingScreen
              expenses={expenses} setExpenses={setExpenses}
              moneyLog={moneyLog} setMoneyLog={setMoneyLog}
              weeklySummaries={weeklySummaries} setWeeklySummaries={setWeeklySummaries}
              splits={splits}
              loans={loans}
              savingsLog={savingsLog}
              accounts={accounts}
              transfers={transfers}
            />
          )}
          {tab === "borrow" && (
            <BorrowScreen
              loans={loans} setLoans={setLoans}
              moneyLog={moneyLog} expenses={expenses} weeklySummaries={weeklySummaries}
              savingsLog={savingsLog}
              accounts={accounts}
              transfers={transfers}
            />
          )}
          {tab === "summary" && (
            <SummaryScreen
              todos={todos} splits={splits} bills={bills} expenses={expenses}
              moneyLog={moneyLog} weeklySummaries={weeklySummaries} savingsLog={savingsLog} loans={loans}
              accounts={accounts} transfers={transfers}
              backup={{ version: 1, todos, bills, expenses, moneyLog, weeklySummaries, savingsLog, goals, loans, splits, accounts, transfers, dark, dailyBudgetSettings, dailyBudgetLog }}
              onRestore={(data) => {
                setTodos(data.todos); setBills(data.bills); setExpenses(data.expenses);
                setMoneyLog(data.moneyLog); setWeeklySummaries(data.weeklySummaries);
                setSavingsLog(data.savingsLog); setGoals(data.goals); setLoans(data.loans);
                setSplits(data.splits); setAccounts(data.accounts); setTransfers(data.transfers);
                setDark(data.dark);
                setDailyBudgetSettings(data.dailyBudgetSettings || { ...DEFAULT_DAILY_BUDGET_SETTINGS });
                setDailyBudgetLog(data.dailyBudgetLog || []);
              }}
            />
          )}
        </TabTransition>

        <View style={[styles.tabBar, { borderTopColor: theme.line, backgroundColor: theme.card }]}>
          <NavBtn icon={Home} label="Home" active={tab === "home"} onPress={() => setTab("home")} theme={theme} />
          <NavBtn icon={ListTodo} label="Todo" active={tab === "todo"} onPress={() => setTab("todo")} theme={theme} />
          <NavBtn icon={Wallet} label="Budget" active={tab === "budget"} onPress={() => setTab("budget")} theme={theme} />
          <NavBtn icon={Receipt} label="Spending" active={tab === "spending"} onPress={() => setTab("spending")} theme={theme} />
          <NavBtn icon={HandCoins} label="Borrow" active={tab === "borrow"} onPress={() => setTab("borrow")} theme={theme} />
          <NavBtn icon={FileText} label="Summary" active={tab === "summary"} onPress={() => setTab("summary")} theme={theme} />
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
