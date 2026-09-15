import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { Plus, X, Pencil, Trash2, PiggyBank, Sparkles } from "lucide-react-native";
import { useTheme, ACCENT, PALETTE } from "../theme";
import { peso, uid, fmtDay, goalProgress, unallocatedSavings, savingsAccountBalance, savingsAccountInterestEarned, addSavingsAccount, removeSavingsAccount } from "../utils";
import { validate, goalSchema } from "../validation";
import CalendarPicker from "../components/CalendarPicker";
import { confirmDelete } from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";

export default function GoalsScreen({ goals, setGoals, savingsLog, savingsAccounts = [], setSavingsAccounts, interestLog = [] }) {
  const { theme } = useTheme();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const editingGoal = editingGoalId ? goals.find((g) => g.id === editingGoalId) : null;
  const unallocated = unallocatedSavings(savingsLog);

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
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
      {setSavingsAccounts && (
        <>
          <View style={styles.headerRow}>
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
              <Text style={[styles.accountHint, { color: theme.textMuted }]}>No savings accounts yet -- everything's counted in one general savings pool below.</Text>
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
                        value={sa.interestRate != null ? String(sa.interestRate) : ""}
                        onChangeText={(v) => {
                          const cleaned = v.replace(/[^0-9.]/g, "");
                          setSavingsAccounts((prev) => prev.map((x) => (x.id === sa.id ? { ...x, interestRate: cleaned === "" ? 0 : Number(cleaned) } : x)));
                        }}
                        placeholder="0"
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
        <TextInput value={targetAmount} onChangeText={(v) => setTargetAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
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
