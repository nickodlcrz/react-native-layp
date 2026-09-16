import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { Plus, X, Pencil, Trash2, PiggyBank, Sparkles, ArrowLeftRight, AlertTriangle } from "lucide-react-native";
import { useTheme, ACCENT, PALETTE } from "../theme";
import {
  peso, uid, todayISO, fmtDay, goalProgress, unallocatedSavings, savingsAccountBalance,
  savingsAccountInterestEarned, addSavingsAccount, removeSavingsAccount, computeAccountBalance,
  isPositiveAmount,
} from "../utils";
import { validate, goalSchema } from "../validation";
import CalendarPicker from "../components/CalendarPicker";
import Chip from "../components/Chip";
import { confirmDelete } from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";

export default function GoalsScreen({
  goals, setGoals, savingsLog, setSavingsLog, savingsAccounts = [], setSavingsAccounts, interestLog = [],
  accounts = [], moneyLog = [], expenses = [], weeklySummaries = [], loans = [], transfers = [],
}) {
  const { theme } = useTheme();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [savingsMode, setSavingsMode] = useState("deposit");
  const editingGoal = editingGoalId ? goals.find((g) => g.id === editingGoalId) : null;
  const unallocated = unallocatedSavings(savingsLog);
  const ctx = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };

  // Everything not tagged to a specific named savings account (GoTyme,
  // Maribank, etc.) -- the "General" bucket in the breakdown below.
  const generalBalance = savingsLog
    .filter((s) => !s.savingsAccountId)
    .reduce((sum, s) => sum + (s.type === "withdraw" ? -Number(s.amount) : Number(s.amount)), 0);
  const accountBreakdown = savingsAccounts.map((sa) => ({ ...sa, balance: savingsAccountBalance(sa.id, savingsLog, interestLog) }));
  // Includes accrued interest (savingsAccountBalance folds interestLog in),
  // unlike a plain sum of savingsLog alone -- this is the real total
  // sitting across every savings destination, general pool included.
  const grandTotalSavings = generalBalance + accountBreakdown.reduce((s, a) => s + a.balance, 0);

  function removeSavAcc(sa) {
    const balance = savingsAccountBalance(sa.id, savingsLog, interestLog);
    confirmDelete(
      "Delete this savings account?",
      balance > 0
        ? `"${sa.name}" will be removed. Its ${peso(balance)} stays counted in your general savings, just no longer tracked under this name.`
        : `"${sa.name}" will be removed.`,
      () => setSavingsAccounts((prev) => removeSavingsAccount(prev, sa.id))
    );
  }

  function startAdd() { setEditingGoalId(null); setShowGoalForm((s) => !s); }
  function startEdit(g) { setEditingGoalId(g.id); setShowGoalForm(true); }
  function saveGoal(data) {
    if (editingGoalId) {
      setGoals((prev) => prev.map((g) => (g.id === editingGoalId ? { ...g, ...data } : g)));
    } else {
      setGoals((prev) => [...prev, { id: uid(), ...data, createdAt: Date.now() }]);
    }
    setShowGoalForm(false);
    setEditingGoalId(null);
  }
  function removeGoal(g) {
    confirmDelete("Delete this goal?", `"${g.name}" will be removed. Its saved money stays in your general savings.`, () => {
      setGoals((prev) => prev.filter((x) => x.id !== g.id));
    });
  }

  const active = goals
    .map((g) => ({ ...g, progress: goalProgress(g, savingsLog) }))
    .sort((a, b) => (a.progress.percent >= 100) - (b.progress.percent >= 100) || (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
      {/* HERO: total savings across every account, same treatment as the
          Overview tab's "Current budget" hero card. */}
      <View style={[styles.heroCard, { backgroundColor: theme.accentDark }]}>
        <Text style={[styles.heroLabel, { color: ACCENT.gold }]}>Total savings</Text>
        <Text style={styles.heroValue}>{peso(grandTotalSavings)}</Text>
        <View style={styles.heroDivider} />
        <View style={{ gap: 6 }}>
          <View style={styles.heroBreakdownRow}>
            <Text style={styles.heroBreakdownLabel}>General</Text>
            <Text style={styles.heroBreakdownAmount}>{peso(generalBalance)}</Text>
          </View>
          {accountBreakdown.map((a) => (
            <View key={a.id} style={styles.heroBreakdownRow}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <View style={[styles.heroDot, { backgroundColor: a.color }]} />
                <Text style={styles.heroBreakdownLabel}>{a.name}</Text>
              </View>
              <Text style={styles.heroBreakdownAmount}>{peso(a.balance)}</Text>
            </View>
          ))}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Pressable onPress={() => { setSavingsMode("deposit"); setShowSavingsForm((s) => (showSavingsForm && savingsMode === "deposit" ? false : true)); }} style={styles.heroBtn} accessibilityLabel="Add to savings">
            {showSavingsForm && savingsMode === "deposit" ? <X size={13} color={theme.accentDark} /> : <Plus size={13} color={theme.accentDark} />}
            <Text style={[styles.heroBtnText, { color: theme.accentDark }]}>Add</Text>
          </Pressable>
          <Pressable onPress={() => { setSavingsMode("withdraw"); setShowSavingsForm((s) => (showSavingsForm && savingsMode === "withdraw" ? false : true)); }} style={[styles.heroBtn, { backgroundColor: "#ffffff22" }]} accessibilityLabel="Withdraw from savings">
            {showSavingsForm && savingsMode === "withdraw" ? <X size={13} color="#fff" /> : <ArrowLeftRight size={13} color="#fff" />}
            <Text style={[styles.heroBtnText, { color: "#fff" }]}>Withdraw</Text>
          </Pressable>
        </View>
      </View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>Savings is kept separate from your spendable budget. Money moved here comes out of a budget account; withdrawing sends it back.</Text>

      {showSavingsForm && setSavingsLog && (
        <SavingsTransferForm
          mode={savingsMode}
          totalSavings={grandTotalSavings}
          ctx={ctx}
          accounts={accounts}
          goals={goals}
          savingsAccounts={savingsAccounts}
          interestLog={interestLog}
          onSave={(entry) => { setSavingsLog((prev) => [...prev, { id: uid(), ...entry, createdAt: Date.now() }]); setShowSavingsForm(false); }}
        />
      )}

      {savingsLog.length > 0 && setSavingsLog &&
        [...savingsLog].reverse().slice(0, 4).map((s) => {
          const account = accounts.find((a) => a.id === s.account);
          const isWithdraw = s.type === "withdraw";
          return (
            <View key={s.id} style={[styles.smallRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
              <View>
                <Text style={[styles.smallRowTitle, { color: theme.text }]}>{s.note || (isWithdraw ? "Withdrawn to " + (account?.label || "budget") : "Added from " + (account?.label || "budget"))}</Text>
                <Text style={[styles.smallRowDate, { color: theme.textMuted }]}>{fmtDay(s.date)}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={[styles.smallRowAmount, { color: isWithdraw ? ACCENT.ember : ACCENT.leaf }]}>{isWithdraw ? "-" : "+"}{peso(s.amount)}</Text>
                <Pressable onPress={() => confirmDelete("Delete this entry?", "This savings entry will be removed for good.", () => setSavingsLog((prev) => prev.filter((x) => x.id !== s.id)))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete savings entry"><Trash2 size={14} color={theme.textMuted} /></Pressable>
              </View>
            </View>
          );
        })}

      {setSavingsAccounts && (
        <>
          <View style={[styles.headerRow, { marginTop: savingsLog.length ? 4 : 16 }]}>
            <Text style={[styles.h1, { color: theme.text }]}>Savings accounts</Text>
            <Pressable onPress={() => setSavingsAccounts((prev) => addSavingsAccount(prev, PALETTE))} style={[styles.roundBtn, { backgroundColor: ACCENT.teal }]} accessibilityLabel="Add savings account">
              <Plus size={16} color="#fff" />
            </Pressable>
          </View>
          <Text style={[styles.hint, { color: theme.textMuted }]}>
            Track money sitting in a specific interest-bearing account -- GoTyme, Maribank, etc. Set a yearly rate and it earns interest automatically, every day.
          </Text>

          {savingsAccounts.length === 0 ? (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line, marginBottom: 16 }]}>
              <Text style={[styles.accountHint, { color: theme.textMuted }]}>No savings accounts yet -- everything's counted in one general savings pool above.</Text>
            </View>
          ) : (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line, marginBottom: 16 }]}>
              {savingsAccounts.map((sa) => {
                const balance = savingsAccountBalance(sa.id, savingsLog, interestLog);
                const earned = savingsAccountInterestEarned(sa.id, interestLog);
                return (
                  <View key={sa.id} style={styles.savAccRow}>
                    <View style={styles.accountEditRow}>
                      <View style={[styles.accountDotSmall, { backgroundColor: sa.color }]} />
                      <TextInput
                        value={sa.name}
                        onChangeText={(v) => setSavingsAccounts((prev) => prev.map((x) => (x.id === sa.id ? { ...x, name: v } : x)))}
                        style={[styles.accountEditInput, { color: theme.text }]}
                      />
                      <Text style={[styles.accountEditBalance, { color: theme.textMuted }]}>{peso(balance)}</Text>
                      <Pressable onPress={() => removeSavAcc(sa)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel={`Delete ${sa.name} savings account`}>
                        <Trash2 size={14} color={theme.textMuted} />
                      </Pressable>
                    </View>
                    <View style={styles.savAccRateRow}>
                      <Text style={[styles.savAccRateLabel, { color: theme.textMuted }]}>Interest rate (% per year)</Text>
                      <TextInput
                        value={sa.interestRate != null && sa.interestRate !== 0 ? String(sa.interestRate) : ""}
                        onChangeText={(v) => {
                          const cleaned = v.replace(/[^0-9.]/g, "");
                          setSavingsAccounts((prev) => prev.map((x) => (x.id === sa.id ? { ...x, interestRate: cleaned === "" ? 0 : Number(cleaned) } : x)));
                        }}
                        placeholder="0"
                        placeholderTextColor={theme.textMuted}
                        keyboardType="decimal-pad"
                        style={[styles.savAccRateInput, { backgroundColor: theme.bg, color: theme.text }]}
                      />
                      <Text style={[styles.savAccRateLabel, { color: theme.textMuted }]}>%</Text>
                    </View>
                    {earned > 0 && (
                      <View style={styles.savAccEarnedRow}>
                        <Sparkles size={11} color={ACCENT.gold} />
                        <Text style={[styles.savAccEarnedText, { color: ACCENT.gold }]}>{peso(earned)} earned in interest so far</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      )}

      <View style={styles.headerRow}>
        <Text style={[styles.h1, { color: theme.text }]}>Savings goals</Text>
        <Pressable onPress={startAdd} style={[styles.roundBtn, { backgroundColor: ACCENT.sky }]} accessibilityLabel={showGoalForm ? "Close goal form" : "Add savings goal"}>
          {showGoalForm ? <X size={16} color="#fff" /> : <Plus size={16} color="#fff" />}
        </Pressable>
      </View>
      <Text style={[styles.hint, { color: theme.textMuted }]}>Earmark part of your savings toward something specific. Unallocated savings: {peso(unallocated)}.</Text>

      {showGoalForm && (
        <GoalForm initial={editingGoal} onSave={saveGoal} onCancel={() => { setShowGoalForm(false); setEditingGoalId(null); }} />
      )}

      {active.length === 0 ? (
        <EmptyState icon={PiggyBank} text="No savings goals yet." />
      ) : (
        <View style={{ gap: 8 }}>
          {active.map((g) => {
            const prog = g.progress;
            const met = prog.percent >= 100;
            return (
              <View key={g.id} style={[styles.goalCard, { backgroundColor: theme.card, borderColor: theme.line, opacity: met ? 0.75 : 1 }]}>
                <View style={styles.goalHeaderRow}>
                  <Text style={[styles.goalName, { color: theme.text }]}>{g.name}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={() => startEdit(g)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Edit goal"><Pencil size={14} color={theme.textMuted} /></Pressable>
                    <Pressable onPress={() => removeGoal(g)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete goal"><Trash2 size={14} color={theme.textMuted} /></Pressable>
                  </View>
                </View>
                <Text style={[styles.goalAmounts, { color: theme.textMuted }]}>{peso(prog.current)} / {peso(prog.target)}</Text>
                <View style={[styles.track, { backgroundColor: theme.bg, marginTop: 4 }]}>
                  <View style={[styles.trackFill, { width: `${Math.min(100, prog.percent)}%`, backgroundColor: met ? ACCENT.leaf : ACCENT.sky }]} />
                </View>
                <View style={styles.goalFooterRow}>
                  <Text style={[styles.goalFooterText, { color: theme.textMuted }]}>{prog.percent.toFixed(1)}%</Text>
                  {g.targetDate && (
                    <Text style={[styles.goalFooterText, { color: theme.textMuted }]}>
                      {met ? "Goal reached" : `Target: ${fmtDay(g.targetDate)}`}
                    </Text>
                  )}
                </View>
                {!met && prog.recommendedMonthly > 0 && (
                  <Text style={[styles.goalRecommend, { color: ACCENT.sky }]}>Recommended: {peso(prog.recommendedMonthly)}/month</Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

// Moved here from BudgetScreen.js's Overview tab, unchanged, as part of
// folding the Savings section into this (now renamed) Savings tab.
function SavingsTransferForm({ mode, totalSavings, ctx, accounts, goals = [], savingsAccounts = [], interestLog = [], onSave }) {
  const { theme } = useTheme();
  const isWithdraw = mode === "withdraw";
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [account, setAccount] = useState(accounts[0]?.id);
  const [goalId, setGoalId] = useState(null);
  const [savingsAccountId, setSavingsAccountId] = useState(null);
  const amountNum = Number(amount) || 0;
  const accountBal = computeAccountBalance(account, ctx);
  // Withdrawing from one specific savings account (GoTyme, Maribank, etc.)
  // is capped by *that account's* own balance -- not the whole savings
  // pool -- so it's never possible to withdraw more from GoTyme than is
  // actually sitting in GoTyme, even if the overall savings total is
  // larger because of money held elsewhere.
  const withdrawCap = isWithdraw && savingsAccountId
    ? savingsAccountBalance(savingsAccountId, ctx.savingsLog || [], interestLog)
    : totalSavings;
  const exceedsSource = isWithdraw ? amountNum > withdrawCap : amountNum > accountBal;
  const canSave = isPositiveAmount(amount) && accounts.length > 0 && !exceedsSource;

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>{isWithdraw ? "Withdraw from savings" : "Add to savings"}</Text>
      <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{isWithdraw ? "Send back to" : "Take from"}</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />)}
      </View>
      {savingsAccounts.length > 0 && (
        <>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{isWithdraw ? "From which savings account" : "Which savings account"} (optional)</Text>
          <View style={styles.chipWrap}>
            <Chip label="General" color={theme.textMuted} active={!savingsAccountId} onPress={() => setSavingsAccountId(null)} small />
            {savingsAccounts.map((sa) => <Chip key={sa.id} label={sa.name} color={sa.color} active={savingsAccountId === sa.id} onPress={() => setSavingsAccountId(sa.id)} small />)}
          </View>
        </>
      )}
      {!isWithdraw && goals.length > 0 && (
        <>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Toward a goal (optional)</Text>
          <View style={styles.chipWrap}>
            <Chip label="General" color={theme.textMuted} active={!goalId} onPress={() => setGoalId(null)} small />
            {goals.map((g) => <Chip key={g.id} label={g.name} color={ACCENT.sky} active={goalId === g.id} onPress={() => setGoalId(g.id)} small />)}
          </View>
        </>
      )}
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Amount (P)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={date} onChange={setDate} label="Date" /></View>

      {amountNum > 0 && (
        <Text style={[styles.previewText2, { color: theme.textMuted }]}>
          {isWithdraw
            ? `Will move ${peso(amountNum)} from savings into ${accounts.find((a) => a.id === account)?.label}`
            : `Will move ${peso(amountNum)} from ${accounts.find((a) => a.id === account)?.label} into savings${savingsAccountId ? ` (${savingsAccounts.find((sa) => sa.id === savingsAccountId)?.name})` : ""}${goalId ? ` (toward ${goals.find((g) => g.id === goalId)?.name})` : ""}`}
        </Text>
      )}
      {exceedsSource && (
        <View style={styles.warnRow2}>
          <AlertTriangle size={11} color={ACCENT.ember} />
          <Text style={styles.warnText2}>
            {isWithdraw
              ? `More than the ${peso(withdrawCap)} available${savingsAccountId ? ` in ${savingsAccounts.find((sa) => sa.id === savingsAccountId)?.name}` : " in savings"}.`
              : `More than your current ${accounts.find((a) => a.id === account)?.label} balance (${peso(accountBal)}).`}
          </Text>
        </View>
      )}

      <Pressable
        disabled={!canSave}
        onPress={() => canSave && onSave({ amount: amountNum, date, note: note.trim(), account, goalId: isWithdraw ? null : goalId, savingsAccountId, type: isWithdraw ? "withdraw" : "deposit" })}
        style={[styles.formBtn, { backgroundColor: isWithdraw ? theme.accentDark : ACCENT.leaf, opacity: canSave ? 1 : 0.5 }]}
      >
        <Text style={[styles.formBtnText, { color: "#fff" }]}>{isWithdraw ? "Withdraw" : "Add to savings"}</Text>
      </Pressable>
    </View>
  );
}

function GoalForm({ initial, onSave, onCancel }) {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name || "");
  const [targetAmount, setTargetAmount] = useState(initial?.targetAmount != null ? String(initial.targetAmount) : "");
  const [targetDate, setTargetDate] = useState(initial?.targetDate || "");
  const [errors, setErrors] = useState({});

  function attemptSave() {
    const { ok, data, errors: fieldErrors } = validate(goalSchema, { name, targetAmount, targetDate });
    setErrors(fieldErrors);
    if (ok) onSave({ ...data, targetDate: data.targetDate || null });
  }

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>{initial ? "Edit goal" : "New savings goal"}</Text>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. New laptop, Emergency fund" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      {errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Target amount (P)</Text>
        <TextInput value={targetAmount} onChangeText={(v) => setTargetAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
        {errors.targetAmount && <Text style={styles.fieldError}>{errors.targetAmount}</Text>}
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={targetDate} onChange={setTargetDate} label="Target date (optional)" /></View>
      <View style={styles.formActions}>
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel"><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable onPress={attemptSave} style={[styles.formBtn, { backgroundColor: ACCENT.sky }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Create goal"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "700" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 11, marginBottom: 14, lineHeight: 15 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  // Hero: total savings across every account, mirroring the Overview
  // tab's "Current budget" hero card treatment.
  heroCard: { borderRadius: 20, padding: 18, marginBottom: 10 },
  heroLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroValue: { fontSize: 30, fontWeight: "800", fontFamily: "monospace", color: "#fff", marginTop: 4 },
  heroDivider: { height: 1, backgroundColor: "#ffffff22", marginVertical: 12 },
  heroBreakdownRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroBreakdownLabel: { fontSize: 12, fontWeight: "600", color: "#ffffffcc" },
  heroBreakdownAmount: { fontSize: 13, fontWeight: "700", fontFamily: "monospace", color: "#fff" },
  heroDot: { width: 7, height: 7, borderRadius: 3.5 },
  heroBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 9 },
  heroBtnText: { fontSize: 12, fontWeight: "700" },
  smallRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  smallRowTitle: { fontSize: 11, fontWeight: "600" },
  smallRowDate: { fontSize: 9, fontFamily: "monospace" },
  smallRowAmount: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  previewText2: { fontSize: 11, marginBottom: 8 },
  warnRow2: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 10 },
  warnText2: { fontSize: 10, color: ACCENT.ember, flex: 1, lineHeight: 14 },
  accountEditRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  accountDotSmall: { width: 8, height: 8, borderRadius: 4 },
  accountEditInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  accountEditBalance: { fontSize: 11, fontFamily: "monospace" },
  accountHint: { fontSize: 9, lineHeight: 13 },
  savAccRow: { borderBottomWidth: 1, borderBottomColor: "#00000010", paddingBottom: 8, marginBottom: 8 },
  savAccRateRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 18 },
  savAccRateLabel: { fontSize: 10.5, fontWeight: "600" },
  savAccRateInput: { width: 56, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: "700", textAlign: "center" },
  savAccEarnedRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 18, marginTop: 4 },
  savAccEarnedText: { fontSize: 10.5, fontWeight: "600" },
  goalCard: { borderWidth: 1, borderRadius: 14, padding: 12 },
  goalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  goalName: { fontSize: 13, fontWeight: "700" },
  goalAmounts: { fontSize: 11, marginTop: 2, fontFamily: "monospace" },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  trackFill: { height: 6, borderRadius: 3 },
  goalFooterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  goalFooterText: { fontSize: 10 },
  goalRecommend: { fontSize: 10.5, fontWeight: "600", marginTop: 6 },
  formCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 14 },
  formTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  fieldError: { color: ACCENT.ember, fontSize: 10.5, marginTop: -6, marginBottom: 8, fontWeight: "600" },
  input: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 10, borderWidth: 1, borderColor: "#00000010" },
  miniLabel: { fontSize: 10.5, fontWeight: "600", marginBottom: 6 },
  amountInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: "700" },
  formActions: { flexDirection: "row", gap: 8, justifyContent: "flex-end" },
  formBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  formBtnText: { fontSize: 12, fontWeight: "700" },
});
