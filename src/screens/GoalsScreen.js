import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import { Plus, X, Pencil, Trash2 } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { peso, uid, fmtDay, goalProgress, unallocatedSavings, confirmDelete } from "../utils";
import { validate, goalSchema } from "../validation";
import CalendarPicker from "../components/CalendarPicker";
import EmptyState from "../components/EmptyState";

export default function GoalsScreen({ goals, setGoals, savingsLog }) {
  const { theme } = useTheme();
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const editingGoal = editingGoalId ? goals.find((g) => g.id === editingGoalId) : null;
  const unallocated = unallocatedSavings(savingsLog);

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
    confirmDelete(Alert, "Delete this goal?", `"${g.name}" will be removed. Its saved money stays in your general savings.`, () => {
      setGoals((prev) => prev.filter((x) => x.id !== g.id));
    });
  }

  const active = goals
    .map((g) => ({ ...g, progress: goalProgress(g, savingsLog) }))
    .sort((a, b) => (a.progress.percent >= 100) - (b.progress.percent >= 100) || (a.targetDate || "9999").localeCompare(b.targetDate || "9999"));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
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
        <EmptyState text="No savings goals yet." />
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
                    <Pressable onPress={() => startEdit(g)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Edit goal"><Pencil size={13} color={theme.textMuted} /></Pressable>
                    <Pressable onPress={() => removeGoal(g)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete goal"><Trash2 size={13} color={theme.textMuted} /></Pressable>
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
  h1: { fontSize: 20, fontWeight: "800" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  hint: { fontSize: 11, marginBottom: 14, lineHeight: 15 },
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
