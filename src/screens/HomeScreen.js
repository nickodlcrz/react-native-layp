import React, { useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { TrendingUp, TrendingDown, PiggyBank, HandCoins, Receipt, AlertTriangle, CircleCheck, Landmark, GraduationCap, ChevronRight, ListTodo, Circle, Wallet } from "lucide-react-native";
import { useTheme, ACCENT, CATEGORIES } from "../theme";
import { peso, todayISO, daysUntil, fmtDay, fmtTime12, computeAccountBalance, savingsTotal as computeSavingsTotal, loanTotalDue, goalProgress } from "../utils";
import { totalBalance, netWorth as selectNetWorth, safeToSpend as selectSafeToSpend, monthlySummary, billCoverageByAccount } from "../selectors";
import { getActivePeriod, subjectsForPeriod, blocksForWeekday, todayExpoWeekday, minutesRemaining, minutesSinceMidnight } from "../school";
import AnimatedNumber from "../components/AnimatedNumber";
import EmptyState from "../components/EmptyState";

function HomeScreen({ accounts, moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers, bills, splits, goals = [], todos = [], periods = [], subjects = [], scheduleEntries = [], cancelledClasses = [], onViewSchedule, onViewTodos }) {
  const { theme } = useTheme();
  const ctx = useMemo(
    () => ({ moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers }),
    [moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers]
  );

  const activePeriod = getActivePeriod(periods);
  const activeSubjects = subjectsForPeriod(subjects, activePeriod?.id);
  const activeSubjectIds = activeSubjects.map((s) => s.id);
  const activeEntries = scheduleEntries.filter((e) => activeSubjectIds.includes(e.subjectId));
  const todaysClasses = activePeriod ? blocksForWeekday(activeSubjects, activeEntries, todayExpoWeekday()) : [];
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const showTodaysClasses = !!activePeriod && activeSubjects.length > 0;

  // Capped at 3 on the Overview (per the card-hierarchy pass -- this is a
  // glanceable preview, not the full list; View all tasks goes to the
  // real Todo screen for everything else).
  const upcomingTasks = todos
    .filter((t) => !t.completed)
    .sort((a, b) => (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99"))
    .slice(0, 3);

  const totalMoney = totalBalance(accounts, ctx);

  const now = new Date();
  const { income: monthIncome, spent: monthSpent, saved: monthSaved } = monthlySummary({ moneyLog, expenses, savingsLog }, now);
  const monthLabel = now.toLocaleDateString("en-PH", { month: "long", year: "numeric" }).toUpperCase();

  const unpaidBills = bills.filter((b) => !b.paid);
  const daysLeftInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  const safeToSpend = selectSafeToSpend(accounts, bills, ctx);
  const perDay = daysLeftInMonth > 0 ? safeToSpend / daysLeftInMonth : safeToSpend;

  const upcomingBills = [...unpaidBills].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3);
  const billCoverage = billCoverageByAccount(accounts, bills, ctx);
  const savingsTotalNow = computeSavingsTotal(savingsLog);
  const owedToMe = loans.filter((l) => l.type === "lent" && !l.settled).reduce((s, l) => s + loanTotalDue(l), 0);
  const iOwe = loans.filter((l) => l.type === "borrowed" && !l.settled).reduce((s, l) => s + loanTotalDue(l), 0);
  const netWorth = selectNetWorth(accounts, loans, savingsLog, ctx);

  const activeGoals = goals
    .map((g) => ({ ...g, progress: goalProgress(g, savingsLog) }))
    .filter((g) => g.progress.percent < 100)
    .sort((a, b) => (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));
  const featuredGoal = activeGoals[0];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
      <Text style={[styles.h1, { color: theme.text }]}>Overview</Text>

      {/* Total money, animated */}
      <View style={[styles.heroCard, { backgroundColor: theme.accentDark }]}>
        <Text style={[styles.heroLabel, { color: ACCENT.gold }]}>Total money</Text>
        <AnimatedNumber value={totalMoney} formatter={peso} style={styles.heroValue} />
        <View style={styles.accountBreakdown}>
          {accounts.map((a) => (
            <View key={a.id} style={styles.accountRow}>
              <View style={[styles.dot, { backgroundColor: a.color }]} />
              <Text style={styles.accountLabel}>{a.label}</Text>
              <AnimatedNumber value={computeAccountBalance(a.id, ctx)} formatter={peso} style={styles.accountValue} />
            </View>
          ))}
        </View>
      </View>

      {/* Safe to spend -- the card hierarchy puts this right under Total
          money and gives it the app's blue as a solid surface, the same
          "hero" treatment as Total money above, so it's the most visible
          number on the screen after your balance. */}
      <View style={[styles.safeCard, { backgroundColor: ACCENT.sky }]}>
        <View style={styles.safeLabelRow}>
          <Wallet size={12} color="#ffffffcc" />
          <Text style={styles.safeLabel}>SAFE TO SPEND</Text>
        </View>
        <AnimatedNumber value={safeToSpend} formatter={peso} style={styles.safeValue} />
        <Text style={styles.safeSub}>
          {daysLeftInMonth > 0 ? `\u2248 ${peso(perDay)}/day for the rest of the month` : "end of month"}
        </Text>
        <Text style={styles.estimateNote}>Estimate only, not financial advice -- total money minus unpaid bills.</Text>
      </View>

      {/* Upcoming tasks -- soonest-due unfinished todos across all categories, capped at 3 */}
      <Pressable onPress={onViewTodos} style={[styles.schoolCard, { backgroundColor: theme.card, borderColor: theme.line }]} accessibilityLabel="View all tasks">
        <View style={styles.schoolHeader}>
          <ListTodo size={14} color={ACCENT.gold} />
          <Text style={[styles.schoolTitle, { color: theme.text }]}>Upcoming Tasks</Text>
        </View>
        {upcomingTasks.length === 0 ? (
          <Text style={[styles.schoolEmpty, { color: theme.textMuted }]}>Nothing on your list right now.</Text>
        ) : (
          <View style={{ gap: 9 }}>
            {upcomingTasks.map((t, i) => {
              const cat = CATEGORIES.find((c) => c.id === t.category);
              const dleft = t.dueDate ? daysUntil(t.dueDate) : null;
              const overdue = dleft !== null && dleft < 0;
              return (
                <View key={t.id} style={[{ flexDirection: "row", alignItems: "center", gap: 8 }, i > 0 && { paddingTop: 9, borderTopWidth: 1, borderTopColor: theme.line }]}>
                  <Circle size={13} color={cat?.color || theme.textMuted} />
                  <Text style={[styles.taskTitle, { color: theme.text }]} numberOfLines={1}>{t.title}</Text>
                  {overdue ? (
                    <View style={styles.overduePill}>
                      <Text style={[styles.overduePillText, { color: ACCENT.ember }]}>{Math.abs(dleft)}d overdue</Text>
                    </View>
                  ) : (
                    <Text style={[styles.taskDue, { color: theme.textMuted }]}>
                      {dleft === null ? "" : dleft === 0 ? "Today" : `${dleft}d`}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}
        <View style={styles.schoolFooter}>
          <Text style={[styles.schoolFooterText, { color: ACCENT.gold }]}>View all tasks</Text>
          <ChevronRight size={12} color={ACCENT.gold} />
        </View>
      </Pressable>

      {/* Today's Classes -- compact horizontal strip (was a full detailed
          card; the per-block detail now lives on the School tab, this is
          just a glanceable "what's today" strip). */}
      {showTodaysClasses && (
        <Pressable onPress={onViewSchedule} style={[styles.schoolCard, { backgroundColor: theme.card, borderColor: theme.line }]} accessibilityLabel="View full class schedule">
          <View style={styles.schoolHeader}>
            <GraduationCap size={14} color={ACCENT.sky} />
            <Text style={[styles.schoolTitle, { color: theme.text }]}>Today's Classes</Text>
          </View>
          {todaysClasses.length === 0 ? (
            <Text style={[styles.schoolEmpty, { color: theme.textMuted }]}>No classes scheduled today.</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {todaysClasses.map((block) => {
                const isCancelled = cancelledClasses.some((c) => c.date === todayISO() && c.entryId === block.entry.id);
                const isNow = nowMin >= block.startMin && nowMin < block.endMin;
                const isDone = nowMin >= block.endMin;
                const dotColor = isCancelled ? ACCENT.ember : isNow ? ACCENT.leaf : isDone ? theme.textMuted : ACCENT.gold;
                return (
                  <View key={block.entry.id} style={[styles.classStrip, { backgroundColor: theme.bg, opacity: isDone || isCancelled ? 0.5 : 1 }]}>
                    <View style={styles.classStripTopRow}>
                      <View style={[styles.schoolDot, { backgroundColor: dotColor, marginTop: 0 }]} />
                      <Text style={[styles.classStripCode, { color: theme.text }]} numberOfLines={1}>{block.subject.code}</Text>
                    </View>
                    <Text style={[styles.classStripTime, { color: theme.textMuted }]}>{fmtTime12(block.entry.startTime)}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.schoolFooter}>
            <Text style={[styles.schoolFooterText, { color: ACCENT.sky }]}>View full schedule</Text>
            <ChevronRight size={12} color={ACCENT.sky} />
          </View>
        </Pressable>
      )}

      {/* Monthly overview */}
      <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{monthLabel}</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <MonthRow icon={TrendingUp} color={ACCENT.leaf} label="Income" value={monthIncome} theme={theme} />
        <MonthRow icon={TrendingDown} color={ACCENT.ember} label="Spent" value={monthSpent} theme={theme} />
        <MonthRow icon={PiggyBank} color={ACCENT.sky} label="Saved" value={monthSaved} theme={theme} last />
      </View>

      {featuredGoal && (
        <View style={[styles.goalPreviewCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={styles.goalPreviewHeader}>
            <Text style={[styles.goalPreviewName, { color: theme.text }]}>{featuredGoal.name}</Text>
            <Text style={[styles.goalPreviewPct, { color: ACCENT.sky }]}>{featuredGoal.progress.percent.toFixed(0)}%</Text>
          </View>
          <Text style={[styles.goalPreviewAmounts, { color: theme.textMuted }]}>{peso(featuredGoal.progress.current)} / {peso(featuredGoal.progress.target)}</Text>
          <View style={[styles.goalPreviewTrack, { backgroundColor: theme.bg }]}>
            <View style={[styles.goalPreviewFill, { width: `${featuredGoal.progress.percent}%`, backgroundColor: ACCENT.sky }]} />
          </View>
        </View>
      )}

      <View style={[styles.netWorthCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <View style={[styles.netWorthIcon, { backgroundColor: ACCENT.plum + "22" }]}><Landmark size={15} color={ACCENT.plum} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.netWorthLabel, { color: theme.textMuted }]}>NET WORTH</Text>
          <AnimatedNumber value={netWorth} formatter={peso} style={[styles.netWorthValue, { color: theme.text }]} />
          <Text style={[styles.netWorthSub, { color: theme.textMuted }]}>Cash + savings + money owed to you − money you owe</Text>
        </View>
      </View>

      {/* Savings + Borrowing side by side */}
      <View style={styles.twoCol}>
        <View style={[styles.miniCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <PiggyBank size={16} color={ACCENT.leaf} />
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>SAVINGS</Text>
          <Text style={[styles.miniValue, { color: ACCENT.leaf }]}>{peso(savingsTotalNow)}</Text>
        </View>
        <View style={[styles.miniCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <HandCoins size={16} color={ACCENT.gold} />
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>BORROWING</Text>
          <Text style={[styles.miniValue, { color: ACCENT.leaf }]}>+{peso(owedToMe)}</Text>
          <Text style={[styles.miniValueSub, { color: ACCENT.ember }]}>-{peso(iOwe)}</Text>
        </View>
      </View>

      {/* Bills -- moved to the bottom of Overview per the card-hierarchy
          pass: the money totals, tasks, and classes above are the
          glanceable "how am I doing today" cards, bills are the
          "something to action later" section. */}
      <Text style={[styles.sectionLabel, { color: theme.textMuted, marginTop: 4 }]}>UPCOMING BILLS</Text>
      {upcomingBills.length === 0 ? (
        <EmptyState icon={Receipt} text="No unpaid bills." />
      ) : (
        <View style={{ gap: 8, marginBottom: 4 }}>
          {upcomingBills.map((b) => {
            const dleft = daysUntil(b.dueDate);
            return (
              <View key={b.id} style={[styles.billRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <Receipt size={15} color={ACCENT.gold} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.billName, { color: theme.text }]}>{b.name}</Text>
                  {dleft < 0 ? (
                    <View style={[styles.overduePill, { marginTop: 2 }]}>
                      <Text style={[styles.overduePillText, { color: ACCENT.ember }]}>{Math.abs(dleft)}d overdue</Text>
                    </View>
                  ) : (
                    <Text style={[styles.billDue, { color: theme.textMuted }]}>
                      {dleft === 0 ? "Due today" : `Due in ${dleft}d`}
                    </Text>
                  )}
                </View>
                <Text style={[styles.billAmount, { color: theme.text }]}>{peso(b.amount)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {billCoverage.length > 0 && (
        <View style={[styles.coverageCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.coverageTitle, { color: theme.text }]}>Bill funding check</Text>
          <Text style={[styles.coverageHint, { color: theme.textMuted }]}>Money left in each bill account after unpaid bills.</Text>
          {billCoverage.map((account) => {
            const short = account.remaining < 0;
            return (
              <View key={account.id} style={styles.coverageRow}>
                {short ? <AlertTriangle size={14} color={ACCENT.ember} /> : <CircleCheck size={14} color={ACCENT.leaf} />}
                <Text style={[styles.coverageAccount, { color: theme.text }]}>{account.label}</Text>
                <Text style={[styles.coverageAmount, { color: short ? ACCENT.ember : ACCENT.leaf }]}>{short ? `${peso(Math.abs(account.remaining))} short` : `${peso(account.remaining)} free`}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

function MonthRow({ icon: Icon, color, label, value, theme, last }) {
  return (
    <View style={[styles.monthRow, !last && { marginBottom: 10 }]}>
      <View style={[styles.monthIconWrap, { backgroundColor: color + "22" }]}>
        <Icon size={13} color={color} />
      </View>
      <Text style={[styles.monthLabel, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.monthValue, { color: theme.text }]}>{peso(value)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  heroCard: { borderRadius: 20, padding: 18, marginBottom: 16 },
  heroLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroValue: { fontSize: 32, fontWeight: "800", color: "#fff", fontFamily: "monospace", marginTop: 4 },
  accountBreakdown: { marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#ffffff22", gap: 8 },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  accountLabel: { flex: 1, fontSize: 11, color: "#ffffffcc", fontWeight: "600" },
  accountValue: { fontSize: 11, color: "#fff", fontWeight: "700", fontFamily: "monospace" },
  schoolCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  schoolHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  schoolTitle: { fontSize: 12, fontWeight: "700" },
  schoolEmpty: { fontSize: 11 },
  schoolDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  schoolTag: { fontSize: 9, fontWeight: "800", letterSpacing: 0.4 },
  schoolDesc: { fontSize: 12, fontWeight: "700", marginTop: 2 },
  schoolTime: { fontSize: 10, marginTop: 2, fontFamily: "monospace" },
  schoolFooter: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 10, paddingTop: 8, borderTopWidth: 0 },
  schoolFooterText: { fontSize: 10, fontWeight: "700" },
  sectionLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", marginBottom: 8, letterSpacing: 0.5 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  monthRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  monthIconWrap: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  monthLabel: { flex: 1, fontSize: 12, fontWeight: "600" },
  monthValue: { fontSize: 13, fontWeight: "700", fontFamily: "monospace" },
  // Solid app-blue surface, same "hero" weight as the Total money card
  // above it -- this is meant to be the single most visible card on the
  // Overview after your balance, so it gets a filled color instead of a
  // muted card + border like the rest of the screen.
  safeCard: { borderRadius: 20, padding: 18, marginBottom: 16, alignItems: "center" },
  safeLabelRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  safeLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, color: "#ffffffcc" },
  safeValue: { fontSize: 32, fontWeight: "800", fontFamily: "monospace", marginTop: 6, color: "#fff" },
  safeSub: { fontSize: 11, marginTop: 4, color: "#ffffffe0" },
  estimateNote: { fontSize: 9, marginTop: 10, textAlign: "center", lineHeight: 13, color: "#ffffffb0" },
  classStrip: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, minWidth: 84 },
  classStripTopRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  classStripCode: { fontSize: 11.5, fontWeight: "700", flexShrink: 1 },
  classStripTime: { fontSize: 9.5, marginTop: 3, fontFamily: "monospace" },
  billRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  billName: { fontSize: 12, fontWeight: "600" },
  billDue: { fontSize: 10, fontFamily: "monospace", marginTop: 1 },
  billAmount: { fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
  coverageCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
  coverageTitle: { fontSize: 12, fontWeight: "700" },
  coverageHint: { fontSize: 10, marginTop: 2, marginBottom: 10 },
  coverageRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  coverageAccount: { flex: 1, fontSize: 11, fontWeight: "600" },
  coverageAmount: { fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  goalPreviewCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 12 },
  goalPreviewHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  goalPreviewName: { fontSize: 12, fontWeight: "700" },
  goalPreviewPct: { fontSize: 12, fontWeight: "800", fontFamily: "monospace" },
  goalPreviewAmounts: { fontSize: 10, fontFamily: "monospace", marginTop: 2, marginBottom: 6 },
  goalPreviewTrack: { width: "100%", height: 6, borderRadius: 3 },
  goalPreviewFill: { height: 6, borderRadius: 3 },
  netWorthCard: { borderWidth: 1, borderRadius: 16, padding: 14, flexDirection: "row", gap: 10, alignItems: "center", marginTop: 12 },
  netWorthIcon: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  netWorthLabel: { fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },
  netWorthValue: { fontSize: 20, fontWeight: "800", fontFamily: "monospace", marginTop: 2 },
  netWorthSub: { fontSize: 9, lineHeight: 13, marginTop: 2 },
  twoCol: { flexDirection: "row", gap: 10, marginTop: 12 },
  miniCard: { flex: 1, borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  miniLabel: { fontSize: 9, fontWeight: "700", marginTop: 2 },
  miniValue: { fontSize: 15, fontWeight: "800", fontFamily: "monospace" },
  miniValueSub: { fontSize: 11, fontWeight: "700", fontFamily: "monospace" },
  taskTitle: { flex: 1, fontSize: 12, fontWeight: "600" },
  taskDue: { fontSize: 10, fontFamily: "monospace" },
  overduePill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: ACCENT.ember + "22" },
  overduePillText: { fontSize: 9.5, fontWeight: "700", fontFamily: "monospace" },
});

// Memoized: these screens now stay permanently mounted (see App.js) so
// switching tabs is instant, which means without this, any state change
// anywhere in the app -- not just on this screen -- would re-render and
// recompute this one too, even while it's hidden behind another tab.
export default React.memo(HomeScreen);
