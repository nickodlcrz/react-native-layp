import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, ScrollView, StyleSheet, Platform, Modal } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Plus, X, Trash2, ChevronDown, ChevronUp, ArrowDownCircle, ArrowUpCircle, Search, Filter, Receipt, History, Download } from "lucide-react-native";
import { useTheme, ACCENT, INCOME_CATEGORIES, SPENDING_LABELS } from "../theme";
import { peso, uid, todayISO, fmtDay, fmtDaySmart, fmtDateLong, computeAccountBalance, loanInterest, loanTotalDue, isPositiveAmount, computeDailyBudgetReview, nextRecurringDate } from "../utils";
import { categoryBreakdown, frequentExpenseTemplates, spendingByLabel } from "../selectors";
import { validate, expenseSchema } from "../validation";
import { notifyBudgetThreshold } from "../notifications";
import { hapticSuccess } from "../haptics";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";
import { confirmDelete, confirmAction } from "../components/ConfirmModal";
import EditSheet from "../components/EditSheet";
import BillsCard from "../components/BillsCard";
import { buildLedgerCsv } from "../exportCsv";
import { DURATION, SPRING, useCardPressAnimation } from "../animation";
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from "react-native-reanimated";
import { showAppDialog } from "../components/AppDialog";

// How many of the most recent days with activity the main screen lists.
const RECENT_DAYS = 5;

export default function SpendingScreen({
  expenses, setExpenses, moneyLog, setMoneyLog, weeklySummaries, splits, loans = [], savingsLog = [], accounts, transfers = [],
  recurringIncome = [], setRecurringIncome, spendingLimits = {}, setSpendingLimits,
  bills = [], setBills,
}) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showMoneyForm, setShowMoneyForm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState({});
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [limitsEditorOpen, setLimitsEditorOpen] = useState(false);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);

  // This month's spending per label, matched up against any limit the user
  // has set for that label -- separate from spendingLimits itself (which
  // is just "label -> monthly cap"), this is the derived "how close am I"
  // view the progress bars actually render.
  const labelSpending = useMemo(() => spendingByLabel(expenses), [expenses]);
  const limitProgress = useMemo(() => {
    return Object.entries(spendingLimits)
      .filter(([, limit]) => isPositiveAmount(limit))
      .map(([label, limit]) => {
        const spent = labelSpending.find((l) => l.label.toLowerCase() === label.toLowerCase())?.amount || 0;
        const percent = Math.min(1, spent / limit);
        return { label, limit: Number(limit), spent, percent };
      })
      .sort((a, b) => b.percent - a.percent);
  }, [spendingLimits, labelSpending]);

  function saveExpense(data) {
    if (editingId) {
      setExpenses((prev) => prev.map((e) => (e.id === editingId ? { ...e, ...data } : e)));
      setEditingId(null);
    } else {
      const newExpense = { id: uid(), ...data, createdAt: Date.now() };
      // Fire a one-time "heads up" notification the moment a spend category
      // crosses 80% of today's recommended amount -- compared before/after
      // this specific expense so it only fires once per crossing, not on
      // every expense logged while already over.
      const reviewCtx = { splits, accounts, moneyLog, weeklySummaries, loans, savingsLog, transfers };
      const before = computeDailyBudgetReview({ ...reviewCtx, expenses });
      const after = computeDailyBudgetReview({ ...reviewCtx, expenses: [...expenses, newExpense] });
      const beforeCat = before.categories.find((c) => c.id === data.splitId && !c.isSavings);
      const afterCat = after.categories.find((c) => c.id === data.splitId && !c.isSavings);
      if (afterCat && afterCat.recommended > 0) {
        const beforePct = beforeCat ? beforeCat.actual / afterCat.recommended : 0;
        const afterPct = afterCat.actual / afterCat.recommended;
        if (beforePct < 0.8 && afterPct >= 0.8) {
          notifyBudgetThreshold(afterCat);
        }
      }
      // Separately, if this expense's spending label has a user-set
      // monthly limit, fire a one-time heads-up the moment *that* crosses
      // 80% -- independent of the automatic budget-split alert above,
      // since a label limit ("Food: P3,000/month") and a split's daily
      // recommended amount are two different things the user might be
      // tracking at once.
      if (data.label && spendingLimits[data.label]) {
        const limit = Number(spendingLimits[data.label]);
        const spentBefore = spendingByLabel(expenses).find((l) => l.label.toLowerCase() === data.label.toLowerCase())?.amount || 0;
        const spentAfter = spentBefore + Number(data.amount);
        const beforePct = limit > 0 ? spentBefore / limit : 0;
        const afterPct = limit > 0 ? spentAfter / limit : 0;
        if (beforePct < 0.8 && afterPct >= 0.8) {
          notifyBudgetThreshold({ label: data.label, actual: spentAfter, recommended: limit });
        }
      }
      setExpenses((prev) => [...prev, newExpense]);
    }
    setShowForm(false);
  }
  const remove = useCallback((id) => {
    const e = expenses.find((x) => x.id === id);
    confirmDelete("Delete this expense?", `"${e?.name}" (${peso(e?.amount || 0)}) will be removed for good.`, () => {
      setExpenses((prev) => prev.filter((x) => x.id !== id));
      setEditingId((current) => (current === id ? null : current));
      if (editingId === id) setShowForm(false);
    });
  }, [expenses, editingId, setExpenses]);
  const startEdit = useCallback((e) => { if (e.source === "bill") return; setEditingId(e.id); setShowForm(true); }, []);
  // Money-added entries have no edit form, so unlike expenses there's no
  // "long-press opens the edit sheet, which has its own Delete button" --
  // this is the only delete affordance for them, so it deletes directly.
  const removeMoneyEntry = useCallback((id) => {
    const m = moneyLog.find((x) => x.id === id);
    confirmDelete("Delete this entry?", `"${m?.name || "This entry"}" (${peso(m?.amount || 0)}) will be removed for good.`, () => {
      setMoneyLog((prev) => prev.filter((x) => x.id !== id));
    });
  }, [moneyLog, setMoneyLog]);
  // A `recurring` flag on the entry means "also set up a standing template
  // for this" -- the income itself still gets logged today like any other
  // entry (recurringId links it back for reference), and a template is
  // added so future occurrences post themselves automatically (see the
  // catch-up effect in App.js) without the user needing to remember to log
  // it again.
  function saveMoney({ recurring, ...entry }) {
    const id = uid();
    setMoneyLog((prev) => [...prev, { id, ...entry, source: recurring ? "recurring" : undefined, createdAt: Date.now() }]);
    if (recurring) {
      setRecurringIncome((prev) => [...prev, {
        id: uid(), label: entry.note, category: entry.category, amount: entry.amount,
        account: entry.account, frequency: recurring, nextDate: nextRecurringDate(entry.date, recurring),
      }]);
    }
    setShowMoneyForm(false);
    hapticSuccess();
  }

  function removeRecurringIncome(id) {
    confirmDelete(
      "Stop this recurring income?",
      "Past entries it already created stay in your history -- this only stops future ones.",
      () => setRecurringIncome((prev) => prev.filter((r) => r.id !== id))
    );
  }

  // "Log again" quick-add -- lets a repeat expense (same coffee, same
  // jeepney fare) be re-logged with one tap and a confirm, instead of
  // reopening the form and retyping the name and amount. Reuses whichever
  // split/account/label the most recent matching expense used, dated
  // today.
  const quickTemplates = useMemo(() => frequentExpenseTemplates(expenses), [expenses]);
  // Every distinct expense name ever logged, not just the top few -- the
  // form's search/dropdown searches this instead of the capped list
  // above, so "reuse it over and over again" actually reaches back
  // through your whole history, not just the last several.
  const allExpenseTemplates = useMemo(() => frequentExpenseTemplates(expenses, Infinity), [expenses]);
  function logAgain(template) {
    confirmAction({
      title: "Log this expense again?",
      message: `${template.name} - ${peso(template.amount)}`,
      confirmLabel: "Log it",
      onConfirm: () => saveExpense({
        name: template.name, label: template.label, amount: template.amount,
        splitId: template.splitId, account: template.account, date: todayISO(),
      }),
    });
  }

  const today = todayISO();
  // Recently added first: sort by createdAt (fallback to id for old entries
  // saved before createdAt existed).
  const byRecent = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);

  // Combined income & outcome ledger: every money-in and money-out event,
  // including lending/borrowing movements (computed live, not stored
  // separately), newest first. This is the single source for the "Recent
  // Activity" list below -- there's no separate spending-only vs.
  // income/outcome section anymore, it's all one merged, day-grouped feed.
  const ledger = useMemo(() => {
    const loanLedgerEntries = loans.flatMap((l) => {
      const entries = [];
      const createdEntry = {
        id: l.id + "-created", createdAt: l.createdAt, date: l.dueDate, account: l.account,
        amount: l.principal,
        kind: l.type === "lent" ? "out" : "in",
        name: l.type === "lent" ? `Lent to ${l.person}` : `Borrowed from ${l.person}`,
      };
      entries.push(createdEntry);
      if (l.settled) {
        entries.push({
          id: l.id + "-settled", createdAt: new Date(l.settledAt + "T12:00:00").getTime(), date: l.settledAt, account: l.account,
          amount: loanTotalDue(l),
          kind: l.type === "lent" ? "in" : "out",
          name: l.type === "lent" ? `${l.person} repaid you` : `You repaid ${l.person}`,
        });
      }
      return entries;
    });
    return [
      // ledgerKind marks which store an item actually lives in (as opposed
      // to `kind`, which is "in"/"out" for direction) -- expenses already
      // have their own long-press-to-edit-or-delete via ExpenseRow, and
      // loan movements are computed here on the fly from `loans` rather
      // than being real standalone records, so they aren't something this
      // screen can delete on its own. moneyLog entries are real standalone
      // records with nothing else offering a delete, hence "moneyLog" being
      // the one LedgerEntryRow below actually wires a long-press onto.
      ...moneyLog.map((m) => ({ ...m, kind: "in", ledgerKind: "moneyLog" })),
      ...expenses.map((e) => ({ ...e, kind: "out", ledgerKind: "expense" })),
      ...loanLedgerEntries.map((l) => ({ ...l, ledgerKind: "loan" })),
    ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [moneyLog, expenses, loans]);
  const ledgerTotals = useMemo(() => {
    let income = 0, outcome = 0;
    for (const item of ledger) {
      if (item.kind === "in") income += Number(item.amount);
      else outcome += Number(item.amount);
    }
    return { income, outcome };
  }, [ledger]);

  const todayEntries = ledger.filter((item) => item.date === today).sort(byRecent);

  // Grouped once (not re-filtered per day inside the render loop below) --
  // for a user with a long history this turns an O(days x entries) scan
  // into a single O(entries) pass.
  const entriesByDate = useMemo(() => {
    const map = {};
    for (const item of ledger) {
      if (item.date === today) continue;
      (map[item.date] ||= []).push(item);
    }
    for (const day of Object.values(map)) day.sort(byRecent);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger, today]);
  const allPastDates = useMemo(
    () => Object.keys(entriesByDate).sort((a, b) => b.localeCompare(a)),
    [entriesByDate]
  );
  // Every day that has activity, newest first -- today included as just the
  // most recent entry rather than a separately-styled section, income
  // sitting right alongside outcome in the same group. The main screen only
  // shows the latest few of these (RECENT_DAYS) so the page stays short;
  // the "All activity" popup (see AllActivityModal) shows every one.
  const allDays = useMemo(() => {
    const days = allPastDates.map((d) => ({ date: d, items: entriesByDate[d] || [], isToday: false }));
    if (todayEntries.length > 0) days.unshift({ date: today, items: todayEntries, isToday: true });
    return days;
  }, [allPastDates, entriesByDate, todayEntries, today]);
  const recentDays = useMemo(() => allDays.slice(0, RECENT_DAYS), [allDays]);
  const recentTotals = useMemo(() => {
    let income = 0, outcome = 0;
    for (const day of recentDays) {
      for (const item of day.items) {
        if (item.kind === "in") income += Number(item.amount);
        else outcome += Number(item.amount);
      }
    }
    return { income, outcome };
  }, [recentDays]);

  // Search/filter -- matches name or label (case-insensitive substring),
  // optionally narrowed further to one spending label. Active whenever
  // either is set; searches across *all* expenses (not just what's
  // currently visible in Today/History) so it can find something from
  // months back without paging through History first.
  const [searchQuery, setSearchQuery] = useState("");
  const [filterLabel, setFilterLabel] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const isFiltering = searchQuery.trim().length > 0 || !!filterLabel;
  const searchResults = useMemo(() => {
    if (!isFiltering) return [];
    const q = searchQuery.trim().toLowerCase();
    return expenses
      .filter((e) => {
        const matchesQuery = !q || e.name.toLowerCase().includes(q) || (e.label || "").toLowerCase().includes(q);
        const matchesLabel = !filterLabel || (e.label || "").toLowerCase() === filterLabel.toLowerCase();
        return matchesQuery && matchesLabel;
      })
      .sort(byRecent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, searchQuery, filterLabel, isFiltering]);

  const now = new Date();
  const monthTotal = expenses.filter((e) => { const d = new Date(e.date + "T00:00:00"); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, e) => s + Number(e.amount), 0);
  const ctx = useMemo(
    () => ({ moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers }),
    [moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers]
  );
  // True remaining cash across both accounts, including the effect of
  // money currently lent out or borrowed -- not just income minus spending.
  const remaining = accounts.reduce((s, account) => s + computeAccountBalance(account.id, ctx), 0);
  const editing = editingId ? expenses.find((e) => e.id === editingId) : null;

  const analytics = useMemo(() => {
    const current = new Date(now.getFullYear(), now.getMonth(), 1);
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const isIn = (date, month) => {
      const d = new Date(date + "T00:00:00");
      return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
    };
    const previousTotal = expenses.filter((expense) => isIn(expense.date, previous)).reduce((sum, expense) => sum + Number(expense.amount), 0);
    const categories = categoryBreakdown(expenses, splits, current);
    const monthLabel = current.toLocaleDateString("en-PH", { month: "long" });
    const previousMonthLabel = previous.toLocaleDateString("en-PH", { month: "long" });
    return { categories, previousTotal, monthLabel, previousMonthLabel };
  }, [expenses, splits, now]);

  return (
    <>
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 12 }}
      data={[]}
      keyExtractor={(item) => item.id}
      renderItem={() => null}
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.h1, { color: theme.text }]}>Spending</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable onPress={() => setShowAllActivity(true)} style={[styles.roundBtn, { backgroundColor: theme.neutralDark }]} accessibilityLabel="View all activity">
                <History size={16} color="#fff" />
              </Pressable>
              <Pressable onPress={() => { setShowForm(false); setEditingId(null); setShowMoneyForm(true); }} style={[styles.roundBtn, { backgroundColor: ACCENT.leaf }]} accessibilityLabel="Add money">
                <ArrowDownCircle size={16} color="#fff" />
              </Pressable>
              <Pressable onPress={() => { setEditingId(null); setShowMoneyForm(false); setShowForm(true); }} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]} accessibilityLabel="Log expense">
                <Plus size={16} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View style={[styles.summaryCard, { backgroundColor: theme.accentDark }]}>
            <Text style={[styles.summaryMonthLabel, { color: ACCENT.gold }]}>{analytics.monthLabel} Spending</Text>
            <Text style={styles.summaryTotal}>{peso(monthTotal)}</Text>
            <Text style={[styles.summaryCaption, { color: "#ffffffb0" }]}>Total spent this month</Text>

            <View style={styles.summaryBudgetRow}>
              <Text style={[styles.summaryBudgetLabel, { color: "#ffffff99" }]}>Budget left</Text>
              <Text style={[styles.summaryBudgetValue, { color: remaining < 0 ? ACCENT.ember : "#fff" }]}>{peso(remaining)}</Text>
            </View>

            {analytics.categories.length > 0 ? (
              <View style={styles.summaryBreakdown}>
                {analytics.categories.map((category) => {
                  const share = monthTotal ? (category.amount / monthTotal) * 100 : 0;
                  return (
                    <View key={category.id} style={styles.categoryRow}>
                      <View style={styles.categoryTopRow}>
                        <Text style={[styles.categoryLabel, { color: "#fff" }]}>{category.label}</Text>
                        <Text style={[styles.categoryAmount, { color: "#ffffffb0" }]}>{peso(category.amount)} · {share.toFixed(0)}%</Text>
                      </View>
                      <View style={[styles.categoryTrack, { backgroundColor: "#ffffff26" }]}><View style={[styles.categoryFill, { width: `${share}%`, backgroundColor: category.color }]} /></View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.summaryEmptyHint, { color: "#ffffffb0" }]}>Add an expense to see your category breakdown.</Text>
            )}

            {analytics.previousTotal > 0 && (
              <Pressable onPress={() => setComparisonExpanded((s) => !s)} style={styles.summaryComparisonRow}>
                <Text style={[styles.summaryComparisonText, { color: monthTotal <= analytics.previousTotal ? ACCENT.leaf : ACCENT.gold }]}>
                  {monthTotal <= analytics.previousTotal ? "↓" : "↑"} {Math.abs(((monthTotal - analytics.previousTotal) / analytics.previousTotal) * 100).toFixed(1)}% vs {analytics.previousMonthLabel}
                </Text>
                {comparisonExpanded ? <ChevronUp size={12} color="#ffffffb0" /> : <ChevronDown size={12} color="#ffffffb0" />}
              </Pressable>
            )}
            {comparisonExpanded && analytics.previousTotal > 0 && (
              <Text style={[styles.summaryComparisonDetail, { color: "#ffffffb0" }]}>
                {analytics.monthLabel}: {peso(monthTotal)} · {analytics.previousMonthLabel}: {peso(analytics.previousTotal)}
              </Text>
            )}
          </View>

          <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={styles.panelHeaderRow}>
              <Text style={[styles.miniLabel, { color: theme.textMuted, marginBottom: 0 }]}>Spending limits</Text>
              <Pressable onPress={() => setLimitsEditorOpen((s) => !s)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: ACCENT.sky }}>{limitsEditorOpen ? "Done" : "Edit"}</Text>
              </Pressable>
            </View>
            {limitsEditorOpen ? (
              <View style={{ marginTop: 8, gap: 8 }}>
                {SPENDING_LABELS.map((l) => (
                  <View key={l.id} style={styles.limitEditRow}>
                    <Text style={[styles.limitEditLabel, { color: theme.text }]}>{l.label}</Text>
                    <TextInput
                      value={spendingLimits[l.label] != null ? String(spendingLimits[l.label]) : ""}
                      onChangeText={(v) => {
                        const clean = v.replace(/[^0-9.]/g, "");
                        setSpendingLimits((prev) => {
                          const next = { ...prev };
                          if (clean) next[l.label] = clean;
                          else delete next[l.label];
                          return next;
                        });
                      }}
                      placeholder="No limit"
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.textMuted}
                      style={[styles.limitEditInput, { backgroundColor: theme.bg, color: theme.text }]}
                    />
                  </View>
                ))}
              </View>
            ) : limitProgress.length === 0 ? (
              <Text style={[styles.hint, { color: theme.textMuted, marginTop: 4 }]}>No limits set. Tap Edit to set a monthly cap per label (e.g. Food: P3,000).</Text>
            ) : (
              <View style={{ marginTop: 8, gap: 10 }}>
                {limitProgress.map((p) => {
                  const barColor = p.percent >= 1 ? ACCENT.ember : p.percent >= 0.8 ? ACCENT.gold : ACCENT.leaf;
                  return (
                    <View key={p.label}>
                      <View style={styles.limitRow}>
                        <Text style={[styles.limitLabel, { color: theme.text }]}>{p.label}</Text>
                        <Text style={[styles.limitAmount, { color: theme.textMuted }]}>{peso(p.spent)} / {peso(p.limit)}</Text>
                      </View>
                      <View style={[styles.progressTrack, { backgroundColor: theme.bg }]}>
                        <View style={[styles.progressFill, { width: `${p.percent * 100}%`, backgroundColor: barColor }]} />
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {recurringIncome.length > 0 && (
            <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Recurring income</Text>
              <View style={{ gap: 8 }}>
                {recurringIncome.map((r) => (
                  <View key={r.id} style={styles.limitRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.limitLabel, { color: theme.text }]}>{r.label || "Income"}</Text>
                      <Text style={[styles.hint, { color: theme.textMuted }]}>
                        {peso(r.amount)} · {r.frequency === "monthly" ? "monthly" : "weekly"} · next {fmtDay(r.nextDate)}
                      </Text>
                    </View>
                    <Pressable onPress={() => removeRecurringIncome(r.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Stop this recurring income">
                      <Trash2 size={14} color={theme.textMuted} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={{ marginBottom: 14 }}>
            <View style={[styles.searchRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <Search size={14} color={theme.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search expenses..."
                placeholderTextColor={theme.textMuted}
                style={[styles.searchInput, { color: theme.text }]}
              />
              {isFiltering && (
                <Pressable onPress={() => { setSearchQuery(""); setFilterLabel(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Clear search">
                  <X size={14} color={theme.textMuted} />
                </Pressable>
              )}
              <Pressable
                onPress={() => setFilterOpen((s) => !s)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={[styles.filterBtn, { backgroundColor: filterLabel || filterOpen ? theme.neutralDark : "transparent" }]}
                accessibilityLabel={filterOpen ? "Hide category filter" : "Filter by category"}
              >
                <Filter size={13} color={filterLabel || filterOpen ? "#fff" : theme.textMuted} />
                {filterLabel && <Text style={styles.filterBtnText}>{filterLabel}</Text>}
              </Pressable>
            </View>
            {/* Category filter row -- tucked behind the Filter button
                instead of always shown, so the search bar isn't followed
                by a permanent wall of 8 chips on every visit to this
                screen. */}
            {filterOpen && (
              <View style={[styles.chipWrap, { marginTop: 8, marginBottom: 0 }]}>
                {SPENDING_LABELS.map((l) => (
                  <Chip key={l.id} label={l.label} color={l.color} small active={filterLabel === l.label} onPress={() => setFilterLabel((cur) => (cur === l.label ? null : l.label))} />
                ))}
              </View>
            )}
          </View>

          {isFiltering ? (
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.h2, { color: theme.text, marginBottom: 8 }]}>
                {searchResults.length} result{searchResults.length === 1 ? "" : "s"}
              </Text>
              {searchResults.length === 0 ? <EmptyState icon={Search} text="No matching expenses." /> : (
                <View style={{ gap: 10 }}>
                  {searchResults.map((e) => <ExpenseRow key={e.id} e={e} splits={splits} accounts={accounts} onEdit={startEdit} onRemove={remove} />)}
                </View>
              )}
            </View>
          ) : (recentDays.length > 0 || weeklySummaries.length > 0) && (
            <View style={{ marginBottom: 16 }}>
              <Text style={[styles.h2, { color: theme.text, marginBottom: 4 }]}>Recent Activity</Text>
              <Text style={[styles.ledgerSubtitle, { color: theme.textMuted, marginBottom: 8 }]}>Your latest {RECENT_DAYS} days · tap the history button for everything</Text>
              <View style={styles.ledgerPreviewRow}>
                <Text style={[styles.ledgerPreviewText, { color: ACCENT.leaf }]}>Income {peso(recentTotals.income)}</Text>
                <Text style={[styles.ledgerPreviewText, { color: ACCENT.ember }]}>Outcome {peso(recentTotals.outcome)}</Text>
              </View>
              <View style={{ gap: 8 }}>
                {recentDays.length === 0 && <EmptyState icon={Receipt} text="Nothing in the last few days. Tap the history button to see older activity." />}
                {recentDays.map(({ date: d, items: dayItems, isToday }) => (
                  <DayGroup
                    key={d}
                    date={d}
                    items={dayItems}
                    isToday={isToday}
                    // Today defaults open (so what you just logged is visible
                    // right away) until the person deliberately collapses it;
                    // every other day defaults closed. Either way, once
                    // they've tapped a day once, their choice sticks.
                    open={historyOpen[d] !== undefined ? !!historyOpen[d] : isToday}
                    onToggle={() => setHistoryOpen((prev) => ({ ...prev, [d]: !(prev[d] !== undefined ? !!prev[d] : isToday) }))}
                    splits={splits}
                    accounts={accounts}
                    onEdit={startEdit}
                    onRemoveExpense={remove}
                    onRemoveMoney={removeMoneyEntry}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Bills -- at the very bottom of the Spending screen. */}
          <BillsCard bills={bills} setBills={setBills} setExpenses={setExpenses} accounts={accounts} splits={splits} ctx={ctx} />
        </>
      }
    />

    {/* Editing a logged expense now opens its own popped-up, blurred sheet
        instead of an inline form -- same pattern as the Todo task editor,
        so the "edit this one thing" moment is consistent app-wide. */}
    <EditSheet
      visible={showForm}
      title={editing ? "Edit expense" : "Log expense"}
      onClose={() => { setShowForm(false); setEditingId(null); }}
    >
      <ExpenseForm
        initial={editing}
        splits={splits}
        accounts={accounts}
        ctx={ctx}
        onSave={saveExpense}
        onCancel={() => { setShowForm(false); setEditingId(null); }}
        onDelete={remove}
        quickTemplates={quickTemplates}
        allTemplates={allExpenseTemplates}
        onLogAgain={(t) => { logAgain(t); setShowForm(false); }}
      />
    </EditSheet>

    {/* Money received / added is a popped-up sheet too, same as Log expense. */}
    <EditSheet
      visible={showMoneyForm}
      title="Money received / added"
      onClose={() => setShowMoneyForm(false)}
    >
      <MoneyForm accounts={accounts} ctx={ctx} onSave={saveMoney} />
    </EditSheet>

    <AllActivityModal
      visible={showAllActivity}
      onClose={() => setShowAllActivity(false)}
      days={allDays}
      totals={ledgerTotals}
      ledger={ledger}
      weeklySummaries={weeklySummaries}
      splits={splits}
      accounts={accounts}
      onEdit={startEdit}
      onRemoveExpense={remove}
      onRemoveMoney={removeMoneyEntry}
    />
    </>
  );
}

// One day's worth of activity as a collapsible card -- shared by the main
// Recent Activity list and the All activity popup so both look identical.
// `open`/`onToggle` are controlled by the caller so each list keeps its own
// expanded/collapsed state.
function DayGroup({ date, items, isToday, open, onToggle, splits, accounts, onEdit, onRemoveExpense, onRemoveMoney }) {
  const { theme } = useTheme();
  const dayNet = items.reduce((s, it) => s + (it.kind === "in" ? Number(it.amount) : -Number(it.amount)), 0);
  return (
    <View style={[styles.historyGroup, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Pressable onPress={onToggle} style={styles.historyHeader} accessibilityLabel={open ? `Collapse ${fmtDateLong(date)}` : `Expand ${fmtDateLong(date)}`}>
        <View style={styles.historyHeaderTopRow}>
          <Text style={[styles.historyDate, { color: theme.text }]}>{isToday ? "Today" : fmtDaySmart(date)}</Text>
          <Text style={[styles.historyTotal, { color: dayNet < 0 ? ACCENT.ember : ACCENT.leaf }]}>{dayNet < 0 ? "-" : "+"}{peso(Math.abs(dayNet))}</Text>
        </View>
        <View style={styles.historyHeaderBottomRow}>
          <Text style={[styles.historyCount, { color: theme.textMuted }]}>{items.length} transaction{items.length === 1 ? "" : "s"}</Text>
          {open ? <ChevronUp size={13} color={theme.textMuted} /> : <ChevronDown size={13} color={theme.textMuted} />}
        </View>
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
          {items.map((item) => isExpenseEntry(item)
            ? <ExpenseRow key={item.id} e={item} splits={splits} accounts={accounts} compact onEdit={onEdit} onRemove={onRemoveExpense} />
            : <LedgerEntryRow key={item.id} item={item} accounts={accounts} compact onRemove={onRemoveMoney} />
          )}
        </View>
      )}
    </View>
  );
}

// Full-screen popup listing every day of activity (not just the latest
// few), with an Export button that saves it all as a CSV and opens the
// share sheet. Editing/deleting from in here closes the popup first: the
// edit sheet and the delete-confirm dialog are their own modals, and a
// modal can't reliably open on top of another one on iOS.
function AllActivityModal({ visible, onClose, days, totals, ledger, weeklySummaries, splits, accounts, onEdit, onRemoveExpense, onRemoveMoney }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [openMap, setOpenMap] = useState({});
  const [exporting, setExporting] = useState(false);

  useEffect(() => { if (visible) setOpenMap({}); }, [visible]);

  const afterClose = (fn) => (...args) => {
    onClose();
    setTimeout(() => fn(...args), 350);
  };

  async function exportCsv() {
    if (exporting) return;
    setExporting(true);
    try {
      const csv = buildLedgerCsv(ledger, weeklySummaries, { splits, accounts, incomeCategories: INCOME_CATEGORIES });
      const uri = FileSystem.documentDirectory + `layp-spending-${todayISO()}.csv`;
      // Leading BOM so Excel opens non-ASCII names correctly.
      await FileSystem.writeAsStringAsync(uri, "\uFEFF" + csv, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export spending", UTI: "public.comma-separated-values-text" });
      } else {
        showAppDialog("Export saved", `Saved to:\n${uri}\n\nSharing isn't available on this device, so move the file manually if you need a copy elsewhere.`);
      }
    } catch (e) {
      showAppDialog("Export failed", "Couldn't create the spending file. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const sortedSummaries = useMemo(() => [...weeklySummaries].sort((a, b) => b.startDate.localeCompare(a.startDate)), [weeklySummaries]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <View style={styles.headerRow}>
          <Text style={[styles.h1, { color: theme.text }]}>All activity</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <Pressable onPress={exportCsv} disabled={exporting} style={[styles.exportBtn, { backgroundColor: theme.accentDark, opacity: exporting ? 0.6 : 1 }]} accessibilityLabel="Export spending as CSV">
              <Download size={14} color="#fff" />
              <Text style={styles.exportBtnText}>{exporting ? "Exporting..." : "Export"}</Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Close">
              <X size={20} color={theme.textMuted} />
            </Pressable>
          </View>
        </View>

        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24, gap: 8 }}
          data={days}
          keyExtractor={(d) => d.date}
          initialNumToRender={12}
          windowSize={7}
          ListHeaderComponent={
            <View style={[styles.ledgerPreviewRow, { marginBottom: 4 }]}>
              <Text style={[styles.ledgerPreviewText, { color: ACCENT.leaf }]}>Income {peso(totals.income)}</Text>
              <Text style={[styles.ledgerPreviewText, { color: ACCENT.ember }]}>Outcome {peso(totals.outcome)}</Text>
            </View>
          }
          ListEmptyComponent={<EmptyState icon={Receipt} text="Nothing logged yet." />}
          renderItem={({ item: day }) => (
            <DayGroup
              date={day.date}
              items={day.items}
              isToday={day.isToday}
              open={openMap[day.date] !== undefined ? !!openMap[day.date] : false}
              onToggle={() => setOpenMap((prev) => ({ ...prev, [day.date]: !prev[day.date] }))}
              splits={splits}
              accounts={accounts}
              onEdit={afterClose(onEdit)}
              onRemoveExpense={afterClose(onRemoveExpense)}
              onRemoveMoney={afterClose(onRemoveMoney)}
            />
          )}
          ListFooterComponent={
            sortedSummaries.length > 0 ? (
              <View style={{ gap: 8, marginTop: 0 }}>
                {sortedSummaries.map((w) => (
                  <View key={w.id} style={[styles.weekSummaryRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
                    <View>
                      <Text style={[styles.historyDate, { color: theme.text }]}>Week of {fmtDay(w.startDate)} - {fmtDay(w.endDate)}</Text>
                      <Text style={[styles.weekSummarySub, { color: theme.textMuted }]}>{w.count} entries, summarized</Text>
                    </View>
                    <Text style={[styles.historyTotal, { color: ACCENT.ember }]}>-{peso(w.total)}</Text>
                  </View>
                ))}
                <Text style={[styles.rollupNote, { color: theme.textMuted }]}>ⓘ Older transactions are automatically grouped into weekly summaries.</Text>
              </View>
            ) : null
          }
        />
      </View>
    </Modal>
  );
}

// Memoized since it's rendered in loops (today's list, each expanded
// history day) -- without React.memo here this re-renders on every parent
// state change regardless (e.g. typing in the add-expense form re-renders
// every visible ExpenseRow too).
const ExpenseRow = React.memo(function ExpenseRow({ e, splits, accounts, onEdit, onRemove, compact }) {
  const { theme } = useTheme();
  const split = splits.find((s) => s.id === e.splitId);
  const account = accounts.find((a) => a.id === e.account);
  const isBill = e.source === "bill";
  // Bill-generated entries aren't editable (no form to edit them into), so
  // they keep a direct delete button -- everything else opens its own
  // edit sheet on long-press instead, with Delete living inside that
  // sheet, same as Todo.
  const { style: pressStyle, pressIn, pressOut, handleLongPress } = useCardPressAnimation(() => onEdit(e));

  const content = (
    <View style={[styles.row, { backgroundColor: compact ? theme.bg : theme.card }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{e.name}{isBill ? <Text style={{ fontSize: 9, fontWeight: "400", color: theme.textMuted }}> (bill)</Text> : null}</Text>
        {e.label ? <Text style={[styles.customLabel, { color: theme.textMuted }]}>{e.label}</Text> : null}
        <View style={{ flexDirection: "row", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
          {split && <View style={[styles.tag, { backgroundColor: split.color + "22" }]}><Text style={[styles.tagText, { color: split.color }]}>{split.label}</Text></View>}
          {account && <View style={[styles.tag, { backgroundColor: account.color + "22" }]}><Text style={[styles.tagText, { color: account.color }]}>{account.label}</Text></View>}
        </View>
      </View>
      <Text style={[styles.amount, { color: ACCENT.ember }]}>-{peso(e.amount)}</Text>
      {isBill && <Pressable onPress={() => onRemove(e.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete expense"><Trash2 size={14} color={theme.textMuted} /></Pressable>}
    </View>
  );

  if (isBill) return content;

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={350} onPressIn={pressIn} onPressOut={pressOut} accessibilityLabel={`"${e.name}" expense`} accessibilityHint="Long press to edit">
      <Reanimated.View style={pressStyle}>{content}</Reanimated.View>
    </Pressable>
  );
});

// Distinguishes a real logged expense (has a budget category) from a
// money-added or loan-movement ledger entry, so the merged day groups know
// which row component -- editable ExpenseRow vs. read-only LedgerEntryRow
// -- to render for each item.
function isExpenseEntry(item) {
  return item.kind === "out" && Object.prototype.hasOwnProperty.call(item, "splitId");
}

// Row for a non-expense ledger entry (money added, or a lend/borrow
// movement) inside the merged Recent Activity day groups -- same visual
// rhythm as ExpenseRow. Loan movements stay fully read-only here (they're
// computed on the fly from `loans`, not standalone records -- deleting one
// belongs on the Borrow tab, not here). Money-added entries (ledgerKind
// "moneyLog") ARE real standalone records though, and had no delete
// affordance anywhere -- long-press now deletes directly, since (unlike
// expenses) there's no edit form for these to open into instead.
const LedgerEntryRow = React.memo(function LedgerEntryRow({ item, accounts, compact, onRemove }) {
  const { theme } = useTheme();
  const account = accounts.find((a) => a.id === item.account);
  const cat = item.kind === "in" && item.category ? INCOME_CATEGORIES.find((c) => c.id === item.category) : null;
  const isDeletable = item.ledgerKind === "moneyLog";
  const { style: pressStyle, pressIn, pressOut, handleLongPress } = useCardPressAnimation(() => onRemove && onRemove(item.id));

  const content = (
    <View style={[styles.row, { backgroundColor: compact ? theme.bg : theme.card }]}>
      {item.kind === "in" ? <ArrowDownCircle size={15} color={ACCENT.leaf} /> : <ArrowUpCircle size={15} color={ACCENT.ember} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{item.name || item.note || "Money added"}</Text>
        <View style={{ flexDirection: "row", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
          {cat && <View style={[styles.tag, { backgroundColor: cat.color + "22" }]}><Text style={[styles.tagText, { color: cat.color }]}>{cat.label}</Text></View>}
          {account && <View style={[styles.tag, { backgroundColor: account.color + "22" }]}><Text style={[styles.tagText, { color: account.color }]}>{account.label}</Text></View>}
        </View>
      </View>
      <Text style={[styles.amount, { color: item.kind === "in" ? ACCENT.leaf : ACCENT.ember }]}>{item.kind === "in" ? "+" : "-"}{peso(item.amount)}</Text>
    </View>
  );

  if (!isDeletable) return content;

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={350} onPressIn={pressIn} onPressOut={pressOut} accessibilityLabel={`"${item.name || "Money added"}" entry`} accessibilityHint="Long press to delete">
      <Reanimated.View style={pressStyle}>{content}</Reanimated.View>
    </Pressable>
  );
});

// Search-and-dropdown "Log again" -- replaces a wall of chips (one per
// frequent expense, which stopped being readable once there were more
// than a handful) with a single search field. Closed, it's just that one
// field; typing or tapping the chevron opens a scrollable list, matching
// against every distinct expense name ever logged (not just the top few)
// so an older, less-frequent expense can still be found and reused.
function LogAgainPicker({ recentTemplates, allTemplates, onPick }) {
  const { theme } = useTheme();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = useMemo(() => {
    if (!query.trim()) return recentTemplates;
    const q = query.trim().toLowerCase();
    return allTemplates.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 30);
  }, [query, recentTemplates, allTemplates]);

  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.miniLabel, { color: theme.textMuted, marginBottom: 6 }]}>Log again</Text>
      <View style={[styles.logAgainSearchRow, { backgroundColor: theme.bg, borderColor: theme.line }]}>
        <Search size={14} color={theme.textMuted} />
        <TextInput
          value={query}
          onChangeText={(v) => { setQuery(v); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search past expenses"
          placeholderTextColor={theme.textMuted}
          style={[styles.logAgainSearchInput, { color: theme.text }]}
        />
        <Pressable onPress={() => setOpen((o) => !o)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={open ? "Hide past expenses" : "Show all past expenses"}>
          {open ? <ChevronUp size={16} color={theme.textMuted} /> : <ChevronDown size={16} color={theme.textMuted} />}
        </Pressable>
      </View>
      {open && (
        <View style={[styles.logAgainDropdown, { backgroundColor: theme.card, borderColor: theme.line }]}>
          {filtered.length === 0 ? (
            <Text style={[styles.metaText, { color: theme.textMuted, padding: 10 }]}>No matches.</Text>
          ) : (
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
              {filtered.map((t) => (
                <Pressable key={t.id} onPress={() => { onPick(t); setOpen(false); setQuery(""); }} style={[styles.logAgainRow, { borderBottomColor: theme.line }]}>
                  <Text style={[styles.rowTitle, { color: theme.text, flex: 1 }]} numberOfLines={1}>{t.name}</Text>
                  <Text style={[styles.metaText, { color: theme.textMuted }]}>{peso(t.amount)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      )}
    </View>
  );
}

// Balance -> spend -> remaining, made visual instead of a single line of
// text: the top bar is the account's current balance (a fixed reference,
// always full width); the bottom one is what the balance would become
// after the typed amount, and animates its width down in real time as
// the amount changes, so the shrink itself is what communicates the
// impact rather than just the numbers alone.
function AccountSpendBar({ label, color, balance, spend, exceeds }) {
  const { theme } = useTheme();
  const remaining = balance - spend;
  const ratio = balance > 0 ? Math.max(0, Math.min(1, remaining / balance)) : 0;
  const anim = useSharedValue(ratio);
  useEffect(() => {
    anim.value = withTiming(ratio, { duration: 260, easing: Easing.out(Easing.quad) });
  }, [ratio]);
  // A sliver of width even at zero (rather than collapsing to nothing) so
  // an over-budget amount still reads as "a bar that shrank a lot", not
  // as the bar having broken/disappeared.
  const remainingBarStyle = useAnimatedStyle(() => ({ width: `${Math.max(anim.value * 100, spend > 0 ? 2 : 0)}%` }));

  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 6 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted, marginBottom: 0 }]}>{label}</Text>
        <Text style={[styles.balanceHeadline, { color: theme.text }]}>{peso(balance)}</Text>
      </View>
      <View style={[styles.spendBarTrack, { backgroundColor: color }]} />
      {spend > 0 && (
        <>
          <Text style={[styles.metaText, { color: exceeds ? ACCENT.ember : theme.textMuted, marginTop: 8, marginBottom: 6 }]}>
            {exceeds
              ? `If you spend ${peso(spend)}, that's ${peso(spend - balance)} more than you have.`
              : `If you spend ${peso(spend)}, your account balance will be ${peso(remaining)}.`}
          </Text>
          <View style={[styles.spendBarTrack, { backgroundColor: theme.bg }]}>
            <Reanimated.View style={[styles.spendBarFill, remainingBarStyle, { backgroundColor: exceeds ? ACCENT.ember : color }]} />
          </View>
        </>
      )}
    </View>
  );
}

function ExpenseForm({ initial, onSave, onCancel, onDelete, splits, accounts, ctx, quickTemplates = [], allTemplates = [], onLogAgain }) {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name || "");
  const [label, setLabel] = useState(initial?.label || "");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [splitId, setSplitId] = useState(initial?.splitId || splits[0]?.id);
  const [account, setAccount] = useState(initial?.account || accounts[0].id);
  const [date, setDate] = useState(initial?.date || todayISO());
  const [errors, setErrors] = useState({});
  const amountNum = Number(amount);
  const currentBalance = computeAccountBalance(account, ctx);
  const available = currentBalance + (initial?.account === account ? Number(initial.amount) : 0);
  const exceedsBalance = isPositiveAmount(amount) && amountNum > available;
  const selectedAccount = accounts.find((a) => a.id === account);

  function attemptSave() {
    const { ok, data, errors: fieldErrors } = validate(expenseSchema, { name, label, amount, splitId, account, date });
    if (exceedsBalance) fieldErrors.amount = `This exceeds the available ${peso(available)} in this account.`;
    setErrors(fieldErrors);
    if (ok && !exceedsBalance) onSave(data);
  }

  return (
    <View style={styles.formCardBare}>
      {/* "Log again" only makes sense while adding a brand-new expense --
          once you're editing one, quick-repeat templates aren't relevant. */}
      {!initial && quickTemplates.length > 0 && (
        <LogAgainPicker recentTemplates={quickTemplates} allTemplates={allTemplates} onPick={onLogAgain} />
      )}
      <TextInput value={name} onChangeText={setName} placeholder="What did you spend on?" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      {errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Label (optional)</Text>
      <View style={styles.chipWrap}>
        {SPENDING_LABELS.map((l) => (
          <Chip key={l.id} label={l.label} color={l.color} active={label.trim().toLowerCase() === l.label.toLowerCase()} onPress={() => setLabel((cur) => (cur.trim().toLowerCase() === l.label.toLowerCase() ? "" : l.label))} small />
        ))}
      </View>
      <TextInput value={label} onChangeText={setLabel} placeholder="Or type a custom label / note" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, marginBottom: 12 }]} />
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Budget category</Text>
      <View style={styles.chipWrap}>
        {splits.map((c) => <Chip key={c.id} label={c.label} color={c.color} active={splitId === c.id} onPress={() => setSplitId(c.id)} small />)}
      </View>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Paid from</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />)}
      </View>
      {selectedAccount && (
        <AccountSpendBar
          label={selectedAccount.label}
          color={selectedAccount.color}
          balance={available}
          spend={isPositiveAmount(amount) ? amountNum : 0}
          exceeds={exceedsBalance}
        />
      )}
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Amount (P)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
        {errors.amount && <Text style={styles.fieldError}>{errors.amount}</Text>}
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={date} onChange={setDate} label="Date" /></View>
      <View style={styles.formActions}>
        {initial && onDelete && (
          <Pressable onPress={() => onDelete(initial.id)} style={[styles.formBtn, styles.formBtnDanger, { borderColor: ACCENT.ember }]} accessibilityLabel="Delete expense">
            <Trash2 size={14} color={ACCENT.ember} />
            <Text style={[styles.formBtnText, { color: ACCENT.ember }]}>Delete</Text>
          </Pressable>
        )}
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel"><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable onPress={attemptSave} style={[styles.formBtn, { backgroundColor: ACCENT.gold }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Log expense"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MoneyForm({ accounts, ctx, onSave }) {
  const { theme } = useTheme();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState("other");
  const [account, setAccount] = useState(accounts[0].id);
  const [date, setDate] = useState(todayISO());
  const [recurring, setRecurring] = useState(null);
  const canSave = isPositiveAmount(amount);
  const currentBalance = ctx ? computeAccountBalance(account, ctx) : null;
  return (
    <View style={styles.formCardBare}>
      <TextInput value={note} onChangeText={setNote} placeholder="e.g. Allowance, salary, gift (optional)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Source</Text>
      <View style={styles.chipWrap}>
        {INCOME_CATEGORIES.map((c) => <Chip key={c.id} label={c.label} color={c.color} active={category === c.id} onPress={() => setCategory(c.id)} small />)}
      </View>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Goes into</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => {
          const bal = ctx ? computeAccountBalance(a.id, ctx) : null;
          return <Chip key={a.id} label={bal != null ? `${a.label} - ${peso(bal)}` : a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />;
        })}
      </View>
      {currentBalance != null && (
        <Text style={[styles.metaText, { color: theme.textMuted, marginBottom: 8 }]}>
          {peso(currentBalance + (isPositiveAmount(amount) ? Number(amount) : 0))} this will be your balance
        </Text>
      )}
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Amount (P)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={date} onChange={setDate} label="Date" /></View>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Repeats</Text>
      <View style={styles.chipWrap}>
        <Chip label="One-time" color={ACCENT.teal} active={!recurring} onPress={() => setRecurring(null)} small />
        <Chip label="Weekly" color={ACCENT.sky} active={recurring === "weekly"} onPress={() => setRecurring("weekly")} small />
        <Chip label="Monthly" color={ACCENT.plum} active={recurring === "monthly"} onPress={() => setRecurring("monthly")} small />
      </View>
      {!!recurring && (
        <Text style={[styles.hint, { color: theme.textMuted, marginBottom: 4 }]}>
          This entry logs now; a matching one will post itself automatically every {recurring === "monthly" ? "month" : "week"} after that.
        </Text>
      )}
      <Pressable disabled={!canSave} onPress={() => canSave && onSave({ amount: Number(amount), note: note.trim(), category, account, date, recurring })} style={[styles.formBtn, { backgroundColor: ACCENT.leaf, opacity: canSave ? 1 : 0.5 }]}>
        <Text style={[styles.formBtnText, { color: "#fff" }]}>Add money</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  h1: { fontSize: 20, fontWeight: "700" },
  h2: { fontSize: 15, fontWeight: "700" },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  logAgainSearchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  logAgainSearchInput: { flex: 1, fontSize: 13 },
  logAgainDropdown: { borderWidth: 1, borderRadius: 12, marginTop: 6, overflow: "hidden" },
  logAgainRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  balanceHeadline: { fontSize: 14, fontWeight: "800", fontFamily: "monospace" },
  spendBarTrack: { height: 10, borderRadius: 5, overflow: "hidden" },
  spendBarFill: { height: 10, borderRadius: 5 },
  // Hero card: the total-spent figure leads at a much larger size than
  // anything else on the page, per the "show total spending first, make
  // it the biggest number" request -- everything else here (budget left,
  // the Wants/Needs breakdown, the month-over-month line) is intentionally
  // smaller/secondary so the total stays the one thing that jumps out.
  summaryCard: { borderRadius: 16, padding: 16, marginBottom: 16 },
  summaryMonthLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  summaryTotal: { fontSize: 34, fontWeight: "800", color: "#fff", marginTop: 2, fontFamily: "monospace" },
  summaryCaption: { fontSize: 11, marginTop: 2, marginBottom: 12 },
  summaryBudgetRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTopWidth: 1, borderTopColor: "#ffffff1f", marginBottom: 12 },
  summaryBudgetLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  summaryBudgetValue: { fontSize: 13, fontWeight: "700", fontFamily: "monospace" },
  summaryBreakdown: { paddingTop: 2, marginBottom: 4 },
  summaryEmptyHint: { fontSize: 10.5, marginBottom: 4 },
  summaryComparisonRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  summaryComparisonText: { fontSize: 11, fontWeight: "700" },
  summaryComparisonDetail: { fontSize: 10, marginTop: 4, fontFamily: "monospace" },
  exportBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  exportBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  formCardBare: { paddingTop: 2, paddingBottom: 4 },
  formTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 8, paddingVertical: 4 },
  amountInput: { fontSize: 13, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  searchInput: { flex: 1, fontSize: 13 },
  filterBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5 },
  filterBtnText: { fontSize: 10, fontWeight: "700", color: "#fff", maxWidth: 70 },
  hint: { fontSize: 11, lineHeight: 15 },
  miniLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  panel: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  panelHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  limitEditRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  limitEditLabel: { fontSize: 12, fontWeight: "600", flex: 1 },
  limitEditInput: { width: 110, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, fontSize: 12, fontFamily: "monospace" },
  limitRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  limitLabel: { fontSize: 12, fontWeight: "600" },
  limitAmount: { fontSize: 11, fontFamily: "monospace" },
  progressTrack: { height: 5, borderRadius: 3, marginTop: 4, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnDanger: { flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, backgroundColor: "transparent" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  // Slightly tighter than before (was padding: 12, gap: 10) -- a modest
  // ~15% cut to let more transactions fit on screen without feeling cramped.
  row: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, padding: 13 },
  rowTitle: { fontSize: 14, fontWeight: "600" },
  customLabel: { fontSize: 10, fontStyle: "italic", marginTop: 1 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
  amount: { fontSize: 15, fontWeight: "800", fontFamily: "monospace", textAlign: "right" },
  historyGroup: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  // Two stacked rows -- date+amount on top, transaction count+chevron
  // below -- instead of the count living nowhere and the chevron crowding
  // the amount on one line.
  historyHeader: { paddingHorizontal: 12, paddingVertical: 10, gap: 4 },
  historyHeaderTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyHeaderBottomRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  historyDate: { fontSize: 12, fontWeight: "600" },
  historyTotal: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  historyCount: { fontSize: 10 },
  weekSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  weekSummarySub: { fontSize: 9, marginTop: 2 },
  rollupNote: { fontSize: 9, marginTop: 8, lineHeight: 13, opacity: 0.85 },
  ledgerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4, marginTop: 4 },
  ledgerSubtitle: { fontSize: 10, marginTop: 1 },
  ledgerPreviewRow: { flexDirection: "row", gap: 14, marginBottom: 8 },
  ledgerPreviewText: { fontSize: 11, fontWeight: "700" },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6 },
  ledgerTitle: { fontSize: 12, fontWeight: "600" },
  ledgerDate: { fontSize: 9, marginTop: 1, fontFamily: "monospace" },
  ledgerAmount: { fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
  warning: { fontSize: 10, marginBottom: 10 },
  metaText: { fontSize: 10.5, fontWeight: "600" },
  fieldError: { color: ACCENT.ember, fontSize: 10.5, marginTop: -6, marginBottom: 8, fontWeight: "600" },
  categoryRow: { marginBottom: 10 },
  categoryTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  categoryLabel: { fontSize: 11, fontWeight: "600" },
  categoryAmount: { fontSize: 10, fontFamily: "monospace" },
  categoryTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  categoryFill: { height: 6, borderRadius: 3 },
});
