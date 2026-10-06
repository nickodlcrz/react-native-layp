import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { Plus, X, CheckCircle2, Trash2, Check, ArrowLeftRight, AlertTriangle, Bell, Sparkles, Eye, EyeOff } from "lucide-react-native";
import { useTheme, ACCENT, PALETTE, DEFAULT_SPLITS, INCOME_CATEGORIES, INTEREST_PRESETS } from "../theme";
import { peso, uid, todayISO, fmtTime12, computeAccountBalance, savingsAccountBalance, addAccount as pushAccount, isPositiveAmount, accountInterestEarned } from "../utils";
import Chip from "../components/Chip";
import SegmentedTabs from "../components/SegmentedTabs";
import CalendarPicker from "../components/CalendarPicker";
import { hapticSuccess } from "../haptics";
import DailyBudgetScreen from "./DailyBudgetScreen";
import SpendingScreen from "./SpendingScreen";
import BorrowScreen from "./BorrowScreen";
import GoalsScreen from "./GoalsScreen";
import ActivityScreen from "./ActivityScreen";
import ErrorBoundary from "../components/ErrorBoundary";
import { confirmDelete } from "../components/ConfirmModal";
import { showAppDialog } from "../components/AppDialog";

function matchPresetName(splits) {
  for (const [name, preset] of Object.entries(DEFAULT_SPLITS)) {
    if (splits.length === preset.length && preset.every((p, i) => splits[i]?.label === p.label && splits[i]?.percent === p.percent)) return name;
  }
  return "Custom";
}

function BudgetScreen({
  moneyLog, setMoneyLog, splits, setSplits, bills, setBills, expenses, setExpenses, weeklySummaries, setWeeklySummaries,
  savingsLog, setSavingsLog, loans, setLoans, accounts, setAccounts, transfers, setTransfers, goals, setGoals,
  savingsAccounts, setSavingsAccounts, interestLog,
  recurringIncome, setRecurringIncome, spendingLimits, setSpendingLimits,
  dailyBudgetSettings, setDailyBudgetSettings, setDailyBudgetLog, dailyBudgetLog,
  subTab, setSubTab, showDailyBudget, setShowDailyBudget,
  budgetHidden, onToggleBudgetHidden,
}) {
  const { theme } = useTheme();
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [addAccount, setAddAccount] = useState(accounts[0]?.id);
  const [addCategory, setAddCategory] = useState("other");
  const maskedPeso = "\u20B1*****";

  function addMoney() {
    const amt = Number(addAmount);
    if (!isPositiveAmount(amt)) return;
    setMoneyLog((prev) => [...prev, { id: uid(), amount: amt, account: addAccount, category: addCategory, note: "Money added", date: todayISO(), createdAt: Date.now() }]);
    setAddAmount("");
    setShowAddMoney(false);
  }

  function removeAccount(id) {
    const referenced = [
      ...moneyLog, ...expenses, ...bills, ...savingsLog, ...loans,
      ...transfers.filter((t) => t.fromAccount === id || t.toAccount === id),
    ].some((entry) => entry.account === id || entry.fromAccount === id || entry.toAccount === id)
      || weeklySummaries.some((week) => Number(week.byAccount?.[id]) > 0);
    if (referenced) {
      showAppDialog("Account still has history", "This account can't be deleted because transactions are linked to it. Move or remove those records first so no financial history is hidden.");
      return;
    }
    const account = accounts.find((a) => a.id === id);
    confirmDelete("Delete this account?", `"${account?.label}" will be removed.`, () => {
      setAccounts((prev) => prev.length > 1 ? prev.filter((a) => a.id !== id) : prev);
    });
  }

  const rolledTotal = weeklySummaries.reduce((s, w) => s + w.total, 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0) + rolledTotal;
  const ctx = useMemo(
    () => ({ moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers }),
    [moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers]
  );
  // True remaining cash = sum of both accounts, which already factors in
  // money currently lent out (unavailable) and money currently borrowed
  // (available) -- not just plain income minus spending.
  const remaining = accounts.reduce((s, a) => s + computeAccountBalance(a.id, ctx), 0);

  if (showDailyBudget) {
    return (
      <DailyBudgetScreen
        splits={splits} setSplits={setSplits}
        accounts={accounts} moneyLog={moneyLog} expenses={expenses} weeklySummaries={weeklySummaries}
        loans={loans} transfers={transfers}
        savingsLog={savingsLog} setSavingsLog={setSavingsLog}
        dailyBudgetSettings={dailyBudgetSettings} setDailyBudgetSettings={setDailyBudgetSettings}
        setDailyBudgetLog={setDailyBudgetLog}
        dailyBudgetLog={dailyBudgetLog}
        onClose={() => setShowDailyBudget(false)}
      />
    );
  }

  const modelName = matchPresetName(splits);

  return (
    // KeyboardAvoidingView around the whole tab (rather than just the
    // Overview ScrollView) so BillForm and SavingsTransferForm's amount
    // inputs -- both live inside that ScrollView further down -- aren't
    // left hidden behind the keyboard on smaller phones. "padding" on iOS
    // shrinks the view to make room; Android's own "adjustResize" window
    // behavior already does the equivalent, so "height" here is mostly a
    // no-op safety net there rather than the primary fix.
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}>
    <View style={{ flex: 1 }}>
      <SegmentedTabs
        options={[
          { key: "overview", label: "Overview" },
          { key: "goals", label: "Savings" },
          { key: "activity", label: "Activity" },
          { key: "spending", label: "Spending" },
          { key: "borrow", label: "Borrow" },
        ]}
        value={subTab}
        onChange={setSubTab}
      />

      {subTab === "spending" ? (
        <ErrorBoundary resetKey={subTab}>
        <SpendingScreen
          expenses={expenses} setExpenses={setExpenses}
          moneyLog={moneyLog} setMoneyLog={setMoneyLog}
          weeklySummaries={weeklySummaries} setWeeklySummaries={setWeeklySummaries}
          splits={splits} loans={loans} savingsLog={savingsLog} accounts={accounts} transfers={transfers}
          recurringIncome={recurringIncome} setRecurringIncome={setRecurringIncome}
          spendingLimits={spendingLimits} setSpendingLimits={setSpendingLimits}
          bills={bills} setBills={setBills}
        />
        </ErrorBoundary>
      ) : subTab === "borrow" ? (
        <ErrorBoundary resetKey={subTab}>
        <BorrowScreen
          loans={loans} setLoans={setLoans}
          moneyLog={moneyLog} expenses={expenses} setExpenses={setExpenses} weeklySummaries={weeklySummaries}
          savingsLog={savingsLog} accounts={accounts} transfers={transfers}
        />
        </ErrorBoundary>
      ) : subTab === "goals" ? (
        <ErrorBoundary resetKey={subTab}>
        <GoalsScreen
          goals={goals} setGoals={setGoals} savingsLog={savingsLog} setSavingsLog={setSavingsLog}
          savingsAccounts={savingsAccounts} setSavingsAccounts={setSavingsAccounts} interestLog={interestLog}
          accounts={accounts} moneyLog={moneyLog} expenses={expenses} weeklySummaries={weeklySummaries}
          loans={loans} transfers={transfers}
        />
        </ErrorBoundary>
      ) : subTab === "activity" ? (
        <ErrorBoundary resetKey={subTab}>
        <ActivityScreen expenses={expenses} moneyLog={moneyLog} splits={splits} />
        </ErrorBoundary>
      ) : (
    <ScrollView showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={[styles.h1, { color: theme.text }]}>Pay plan</Text>

      {/* HERO: current remaining budget is the focus */}
      <View style={[styles.heroCard, { backgroundColor: theme.accentDark }]}>
        <View style={styles.heroLabelRow}>
          <Text style={[styles.heroLabel, { color: ACCENT.gold }]}>Current budget</Text>
          <Pressable onPress={onToggleBudgetHidden} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={budgetHidden ? "Show budget amount" : "Hide budget amount"}>
            {budgetHidden ? <EyeOff size={15} color={ACCENT.gold} /> : <Eye size={15} color={ACCENT.gold} />}
          </Pressable>
        </View>
        <Text style={[styles.heroValue, { color: remaining < 0 && !budgetHidden ? ACCENT.ember : "#fff" }]}>{budgetHidden ? maskedPeso : peso(remaining)}</Text>
        <Text style={styles.heroSub}>{budgetHidden ? `remaining after ${maskedPeso} spent` : `remaining after ${peso(totalSpent)} spent`}</Text>

        <View style={styles.heroDivider} />

        <ScrollView showsVerticalScrollIndicator={false} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.accountRow}>
          {accounts.map((a) => (
            <View key={a.id} style={styles.accountChip}>
              <View style={[styles.accountDot, { backgroundColor: a.color }]} />
              <Text style={styles.accountLabel} numberOfLines={1}>{a.label}</Text>
              <Text style={styles.accountBalance}>{budgetHidden ? maskedPeso : peso(computeAccountBalance(a.id, ctx))}</Text>
            </View>
          ))}
        </ScrollView>

        {!showAddMoney ? (
          <Pressable onPress={() => setShowAddMoney(true)} style={styles.addMoneyBtn} accessibilityLabel="Add money received">
            <Plus size={13} color={theme.accentDark} />
            <Text style={[styles.addMoneyBtnText, { color: theme.accentDark }]}>Add money received</Text>
          </Pressable>
        ) : (
          <View>
            <View style={styles.accountPickRow}>
              {accounts.map((a) => (
                <Pressable key={a.id} onPress={() => setAddAccount(a.id)} style={[styles.accountPickChip, { backgroundColor: addAccount === a.id ? a.color : "#ffffff22" }]}>
                  <Text style={[styles.accountPickText, { color: addAccount === a.id ? "#fff" : "#ffffffcc" }]}>{a.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.accountPickRow, { marginTop: 6 }]}>
              {INCOME_CATEGORIES.map((c) => (
                <Pressable key={c.id} onPress={() => setAddCategory(c.id)} style={[styles.accountPickChip, { backgroundColor: addCategory === c.id ? c.color : "#ffffff22" }]}>
                  <Text style={[styles.accountPickText, { color: addCategory === c.id ? "#fff" : "#ffffffcc" }]}>{c.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.addMoneyRow}>
              <TextInput
                value={addAmount}
                onChangeText={(v) => setAddAmount(v.replace(/[^0-9.]/g, ""))}
                keyboardType="decimal-pad"
                placeholder="e.g. 100"
                placeholderTextColor="#ffffff66"
                style={styles.addMoneyInput}
                autoFocus
                onSubmitEditing={addMoney}
              />
              <Pressable onPress={addMoney} style={styles.addMoneyConfirm} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Confirm amount">
                <Check size={14} color={theme.accentDark} />
              </Pressable>
              <Pressable onPress={() => { setShowAddMoney(false); setAddAmount(""); }} style={styles.addMoneyCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Cancel">
                <X size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.h2, { color: theme.text }]}>Accounts</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable onPress={() => setShowTransferForm((s) => !s)} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]} accessibilityLabel={showTransferForm ? "Close transfer form" : "Transfer between accounts"}>
            {showTransferForm ? <X size={14} color="#fff" /> : <ArrowLeftRight size={14} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => setAccounts((prev) => pushAccount(prev, PALETTE))} style={[styles.roundBtn, { backgroundColor: ACCENT.leaf }]} accessibilityLabel="Add account">
            <Plus size={14} color="#fff" />
          </Pressable>
        </View>
      </View>

      {showTransferForm && (
        <TransferForm
          accounts={accounts}
          ctx={ctx}
          onSave={(entry) => { setTransfers((prev) => [...prev, { id: uid(), ...entry, createdAt: Date.now() }]); setShowTransferForm(false); hapticSuccess(); }}
        />
      )}

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        {accounts.map((a) => {
          const earned = accountInterestEarned(a.id, moneyLog);
          return (
            <View key={a.id} style={styles.accountEditBlock}>
              <View style={styles.accountEditRow}>
                <View style={[styles.accountDotSmall, { backgroundColor: a.color }]} />
                <TextInput
                  value={a.label}
                  onChangeText={(v) => setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, label: v } : x)))}
                  style={[styles.accountEditInput, { color: theme.text }]}
                />
                <Text style={[styles.accountEditBalance, { color: theme.textMuted }]}>{peso(computeAccountBalance(a.id, ctx))}</Text>
                {accounts.length > 1 && (
                  <Pressable onPress={() => removeAccount(a.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Delete ${a.label} account`}>
                    <Trash2 size={14} color={theme.textMuted} />
                  </Pressable>
                )}
              </View>
              <View style={styles.presetRow}>
                {INTEREST_PRESETS.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() => setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, interestRate: p.interestRate, interestTiers: p.interestTiers } : x)))}
                    style={[styles.presetChip, { borderColor: theme.line }]}
                  >
                    <Text style={[styles.presetChipText, { color: theme.textMuted }]}>{p.label}</Text>
                  </Pressable>
                ))}
              </View>
              {a.interestTiers?.length ? (
                <View style={styles.savAccRateRow}>
                  <Text style={[styles.savAccRateLabel, { color: theme.textMuted }]}>Tiered rate applied ({a.interestTiers.map((t) => `${t.rate}%`).join(" / ")})</Text>
                  <Pressable onPress={() => setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, interestTiers: null } : x)))}>
                    <Text style={[styles.presetChipText, { color: ACCENT.sky, fontWeight: "700" }]}>Use flat rate instead</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.savAccRateRow}>
                  <Text style={[styles.savAccRateLabel, { color: theme.textMuted }]}>Interest rate (% per year, optional)</Text>
                  <TextInput
                    value={a.interestRate != null && a.interestRate !== 0 ? String(a.interestRate) : ""}
                    onChangeText={(v) => {
                      const cleaned = v.replace(/[^0-9.]/g, "");
                      setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, interestRate: cleaned === "" ? 0 : Number(cleaned), interestTiers: null } : x)));
                    }}
                    placeholder="0"
                    placeholderTextColor={theme.textMuted}
                    keyboardType="decimal-pad"
                    style={[styles.savAccRateInput, { backgroundColor: theme.bg, color: theme.text }]}
                  />
                  <Text style={[styles.savAccRateLabel, { color: theme.textMuted }]}>%</Text>
                </View>
              )}
              {earned > 0 && (
                <View style={styles.savAccEarnedRow}>
                  <Sparkles size={11} color={ACCENT.gold} />
                  <Text style={[styles.savAccEarnedText, { color: ACCENT.gold }]}>{peso(earned)} earned in interest so far</Text>
                </View>
              )}
            </View>
          );
        })}
        <Text style={[styles.accountHint, { color: theme.textMuted }]}>Add as many named accounts as you use -- GCash, Maya, Wallet, Bank, etc. Tap a name to rename it. Set a yearly interest rate on an account (like Maribank) to have it earn interest automatically, every day, counted as income -- no separate savings transfer needed.</Text>
      </View>

      <Pressable onPress={() => setShowDailyBudget(true)} style={[styles.dailyBudgetCard, { backgroundColor: theme.card, borderColor: theme.line }]} accessibilityLabel="Open Daily Budget">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={[styles.dailyBudgetIcon, { backgroundColor: ACCENT.gold + "22" }]}>
            <Bell size={16} color={ACCENT.gold} />
          </View>
          <View>
            <Text style={[styles.dailyBudgetTitle, { color: theme.text }]}>Daily Budget</Text>
            <Text style={[styles.dailyBudgetSub, { color: theme.textMuted }]}>
              {modelName}{dailyBudgetSettings.enabled ? ` \u00B7 Review at ${fmtTime12(dailyBudgetSettings.time)}` : " \u00B7 Reminder off"}
            </Text>
          </View>
        </View>
        <Text style={[styles.dailyBudgetChevron, { color: theme.textMuted }]}>{"\u203A"}</Text>
      </Pressable>
    </ScrollView>
      )}
    </View>
    </KeyboardAvoidingView>
  );
}

function TransferForm({ accounts, ctx, onSave }) {
  const { theme } = useTheme();
  const [fromAccount, setFromAccount] = useState(accounts[0]?.id);
  const [toAccount, setToAccount] = useState(accounts[1]?.id || accounts[0]?.id);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const amountNum = Number(amount) || 0;
  const fromBalance = computeAccountBalance(fromAccount, ctx);
  const exceedsBalance = amountNum > fromBalance;
  const canSave = isPositiveAmount(amount) && fromAccount && toAccount && fromAccount !== toAccount && !exceedsBalance;

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>Transfer between accounts</Text>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>From</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={fromAccount === a.id} onPress={() => setFromAccount(a.id)} small />)}
      </View>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>To</Text>
      <View style={styles.chipWrap}>
        {accounts.filter((a) => a.id !== fromAccount).map((a) => <Chip key={a.id} label={a.label} color={a.color} active={toAccount === a.id} onPress={() => setToAccount(a.id)} small />)}
      </View>
      <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Amount (P)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={date} onChange={setDate} label="Date" /></View>
      <Text style={[styles.previewText2, { color: theme.textMuted }]}>Transfers don't count as income or spending -- your total money stays the same, it just moves between accounts.</Text>
      {exceedsBalance && (
        <View style={styles.warnRow2}>
          <AlertTriangle size={11} color={ACCENT.ember} />
          <Text style={styles.warnText2}>More than your current {accounts.find((a) => a.id === fromAccount)?.label} balance ({peso(fromBalance)}).</Text>
        </View>
      )}
      <Pressable disabled={!canSave} onPress={() => canSave && onSave({ fromAccount, toAccount, amount: amountNum, date, note: note.trim() })} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}>
        <Text style={[styles.formBtnText, { color: "#fff" }]}>Transfer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fieldError: { color: ACCENT.ember, fontSize: 10.5, marginTop: -6, marginBottom: 8, fontWeight: "600" },
  dailyBudgetCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  dailyBudgetIcon: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dailyBudgetTitle: { fontSize: 13, fontWeight: "700" },
  dailyBudgetSub: { fontSize: 10, marginTop: 2 },
  dailyBudgetChevron: { fontSize: 18, fontWeight: "700" },
  h1: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  h2: { fontSize: 15, fontWeight: "700" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  roundBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroCard: { borderRadius: 20, padding: 18, marginBottom: 16 },
  heroLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  heroLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroValue: { fontSize: 32, fontWeight: "800", fontFamily: "monospace", marginTop: 4 },
  heroSub: { fontSize: 10, color: "#ffffff99", marginTop: 2 },
  heroDivider: { height: 1, backgroundColor: "#ffffff22", marginVertical: 12 },
  // Horizontal-scrolling row rather than flex:1 chips -- with flex:1 every
  // chip shrank to fit whenever more accounts were added, eventually
  // squeezing labels/balances down to illegible slivers. A fixed minimum
  // width per chip plus horizontal scroll keeps every chip readable no
  // matter how many accounts exist.
  accountRow: { flexDirection: "row", gap: 8, marginBottom: 12, paddingRight: 4 },
  accountChip: { minWidth: 108, backgroundColor: "#ffffff14", borderRadius: 12, padding: 10 },
  accountDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  accountEditBlock: { borderBottomWidth: 1, borderBottomColor: "#00000010", paddingBottom: 8, marginBottom: 8 },
  accountEditRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  accountDotSmall: { width: 8, height: 8, borderRadius: 4 },
  accountEditInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  accountEditBalance: { fontSize: 11, fontFamily: "monospace" },
  accountHint: { fontSize: 9, lineHeight: 13, marginTop: 6 },
  savAccRateRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 18 },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingLeft: 18, marginBottom: 6 },
  presetChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  presetChipText: { fontSize: 10, fontWeight: "600" },
  savAccRateLabel: { fontSize: 10.5, fontWeight: "600" },
  savAccRateInput: { width: 56, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: "700", textAlign: "center" },
  savAccEarnedRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 18, marginTop: 4 },
  savAccEarnedText: { fontSize: 10.5, fontWeight: "600" },
  accountLabel: { fontSize: 9, color: "#ffffffaa", fontWeight: "600" },
  accountBalance: { fontSize: 13, color: "#fff", fontWeight: "700", fontFamily: "monospace", marginTop: 2 },
  accountPickRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  accountPickChip: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  accountPickText: { fontSize: 10, fontWeight: "700" },
  addMoneyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 10 },
  addMoneyBtnText: { fontSize: 12, fontWeight: "700" },
  addMoneyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addMoneyInput: { flex: 1, backgroundColor: "#ffffff22", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: "#fff", fontFamily: "monospace", fontSize: 13 },
  addMoneyConfirm: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  addMoneyCancel: { width: 36, height: 36, borderRadius: 12, backgroundColor: "#ffffff22", alignItems: "center", justifyContent: "center" },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  addSplitBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 16 },
  splitHeaderRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  splitLabelInput: { flex: 1, fontSize: 12, fontWeight: "600" },
  splitPercent: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  splitStatsRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2, marginBottom: 4 },
  splitStat: { fontSize: 9, fontFamily: "monospace" },
  track: { width: "100%", height: 6, borderRadius: 3 },
  trackFill: { height: 6, borderRadius: 3 },
  goalCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  goalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  goalName: { fontSize: 13, fontWeight: "700" },
  goalAmounts: { fontSize: 11, fontFamily: "monospace" },
  goalFooterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  goalFooterText: { fontSize: 9, fontFamily: "monospace" },
  goalRecommend: { fontSize: 10, fontWeight: "700", marginTop: 6 },
  autoBalanceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  formTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  previewText2: { fontSize: 11, marginBottom: 8 },
  warnRow2: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 10 },
  warnText2: { fontSize: 10, color: ACCENT.ember, flex: 1, lineHeight: 14 },
  miniLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  hintText: { fontSize: 11, marginBottom: 8 },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 12, paddingVertical: 4 },
  amountInput: { fontSize: 13, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 13, fontWeight: "600" },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  partialPayRow: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: -4, marginBottom: 8 },
  customInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace", fontSize: 13 },
  customConfirm: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
});

// Memoized: these screens now stay permanently mounted (see App.js) so
// switching tabs is instant, which means without this, any state change
// anywhere in the app -- not just on this screen -- would re-render and
// recompute this one too, even while it's hidden behind another tab.
export default React.memo(BudgetScreen);
