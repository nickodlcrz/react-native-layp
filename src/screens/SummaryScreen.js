import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Copy, Check, Lock } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { peso, todayISO, fmtDay, fmtDateLong, savingsTotal as computeSavingsTotal, computeAccountBalance } from "../utils";
import { AUTO_LOCK_OPTIONS } from "../autoLockPreference";
import Chip from "../components/Chip";

export default function SummaryScreen({ todos, splits, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, accounts = [], transfers = [], backup, onRestore, autoLockMinutes, onChangeAutoLockMinutes }) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [restoreText, setRestoreText] = useState("");

  const text = useMemo(() => {
    const lines = [];
    lines.push(`LAYP SUMMARY - ${fmtDateLong(todayISO())}`, "");

    lines.push("TASKS");
    const active = todos.filter((t) => !t.completed).sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
    const done = todos.filter((t) => t.completed);
    if (active.length === 0) lines.push("  (none active)");
    active.forEach((t) => lines.push(`  [ ] ${t.title} (${t.category}) - due ${t.dueDate ? fmtDateLong(t.dueDate) : "no date"}`));
    if (done.length) lines.push(`  Finished: ${done.length}`);

    const totalIncome = moneyLog.reduce((s, m) => s + Number(m.amount), 0);
    const rolledTotal = weeklySummaries.reduce((s, w) => s + w.total, 0);
    const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0) + rolledTotal;
    const ctx = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };
    const trueRemaining = accounts.reduce((s, a) => s + computeAccountBalance(a.id, ctx), 0);

    lines.push("", "ACCOUNTS");
    accounts.forEach((a) => lines.push(`  ${a.label}: ${peso(computeAccountBalance(a.id, ctx))}`));
    if (transfers.length) {
      lines.push(`  Recent transfers: ${[...transfers].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5).map((t) => {
        const from = accounts.find((a) => a.id === t.fromAccount)?.label || t.fromAccount;
        const to = accounts.find((a) => a.id === t.toAccount)?.label || t.toAccount;
        return `${peso(t.amount)} ${from} -> ${to} (${fmtDay(t.date)})`;
      }).join("; ")}`);
    }

    lines.push("", "BUDGET");
    lines.push(`  Total received: ${peso(totalIncome)}`);
    lines.push(`  Total spent: ${peso(totalSpent)}`);
    lines.push(`  Remaining: ${peso(trueRemaining)}`);
    splits.forEach((s) => {
      const spentLive = expenses.filter((e) => e.splitId === s.id).reduce((sum, e) => sum + Number(e.amount), 0);
      const spentRolled = weeklySummaries.reduce((sum, w) => sum + (w.bySplit?.[s.id] || 0), 0);
      const spent = spentLive + spentRolled;
      const allocated = totalIncome * s.percent / 100;
      lines.push(`  ${s.label}: ${s.percent}% - allocated ${peso(allocated)}, spent ${peso(spent)}, remaining ${peso(allocated - spent)}`);
    });
    const unpaid = bills.filter((b) => !b.paid);
    const paid = bills.filter((b) => b.paid);
    lines.push(`  Unpaid bills: ${unpaid.length ? unpaid.map((b) => `${b.name} ${peso(b.amount)} (due ${fmtDay(b.dueDate)})`).join("; ") : "none"}`);
    lines.push(`  Paid bills: ${paid.length ? paid.map((b) => `${b.name} ${peso(b.amount)}`).join("; ") : "none"}`);
    const savingsTotalNow = computeSavingsTotal(savingsLog);
    lines.push(`  Total saved: ${peso(savingsTotalNow)}`);

    lines.push("", "BORROW TRACKER");
    const lent = loans.filter((l) => l.type === "lent" && !l.settled);
    const borrowed = loans.filter((l) => l.type === "borrowed" && !l.settled);
    lines.push(`  Owed to you: ${lent.length ? lent.map((l) => `${l.person} ${peso(l.principal * (1 + l.interestPercent / 100))} (due ${fmtDay(l.dueDate)})`).join("; ") : "none"}`);
    lines.push(`  You owe: ${borrowed.length ? borrowed.map((l) => `${l.person} ${peso(l.principal * (1 + l.interestPercent / 100))} (due ${fmtDay(l.dueDate)})`).join("; ") : "none"}`);

    lines.push("", "SPENDING");
    const today = todayISO();
    const todayEx = expenses.filter((e) => e.date === today);
    lines.push(`  Today (${fmtDay(today)}): ${todayEx.length ? todayEx.map((e) => `${e.name} ${peso(e.amount)}`).join("; ") : "none"}`);
    const pastDates = [...new Set(expenses.filter((e) => e.date !== today).map((e) => e.date))].sort((a, b) => b.localeCompare(a));
    pastDates.slice(0, 14).forEach((d) => {
      const dayEx = expenses.filter((e) => e.date === d);
      lines.push(`  ${fmtDay(d)}: ${dayEx.map((e) => `${e.name} ${peso(e.amount)}`).join("; ")}`);
    });
    if (weeklySummaries.length) {
      lines.push("  Older weeks (summarized):");
      [...weeklySummaries].sort((a, b) => b.startDate.localeCompare(a.startDate)).forEach((w) => {
        lines.push(`    Week of ${fmtDay(w.startDate)}-${fmtDay(w.endDate)}: ${peso(w.total)} (${w.count} entries)`);
      });
    }
    return lines.join("\n");
  }, [todos, splits, bills, expenses, moneyLog, weeklySummaries, savingsLog, loans, accounts, transfers]);

  async function copy() {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function copyBackup() {
    await Clipboard.setStringAsync(JSON.stringify(backup));
    Alert.alert("Backup copied", "Save the copied text somewhere private. It contains your financial data.");
  }

  function restoreBackup() {
    try {
      const data = JSON.parse(restoreText);
      const requiredArrays = ["todos", "bills", "expenses", "moneyLog", "weeklySummaries", "savingsLog", "goals", "loans", "splits", "accounts", "transfers"];
      if (data?.version !== 1 || requiredArrays.some((key) => !Array.isArray(data[key])) || typeof data.dark !== "boolean") {
        throw new Error("invalid backup");
      }
      Alert.alert("Replace current data?", "This will overwrite the data currently stored in LAYP.", [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", style: "destructive", onPress: () => { onRestore(data); setRestoreText(""); setShowRestore(false); } },
      ]);
    } catch {
      Alert.alert("Backup not recognized", "Paste a complete backup created by LAYP.");
    }
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
      <Text style={[styles.h1, { color: theme.text }]}>Summary</Text>
      <Text style={[styles.sub, { color: theme.textMuted }]}>A plain-text snapshot of your tasks, budget, spending, and borrow tracker -- copy it anywhere.</Text>

      {onChangeAutoLockMinutes && (
        <View style={[styles.restoreCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Lock size={13} color={theme.textMuted} />
            <Text style={[styles.backupBtnText, { color: theme.text }]}>App lock</Text>
          </View>
          <Text style={[styles.restoreHint, { color: theme.textMuted }]}>
            How long LAYP can stay open in the background before it needs your PIN again.
          </Text>
          <View style={styles.chipWrap}>
            {AUTO_LOCK_OPTIONS.map((opt) => (
              <Chip
                key={opt.label}
                label={opt.label}
                small
                active={autoLockMinutes === opt.minutes}
                onPress={() => onChangeAutoLockMinutes(opt.minutes)}
              />
            ))}
          </View>
        </View>
      )}

      <Pressable onPress={copy} style={[styles.copyBtn, { backgroundColor: theme.accentDark }]}>
        {copied ? <Check size={16} color={ACCENT.leaf} /> : <Copy size={16} color={ACCENT.gold} />}
        <Text style={styles.copyBtnText}>{copied ? "Copied!" : "Copy to clipboard"}</Text>
      </Pressable>

      <View style={styles.backupRow}>
        <Pressable onPress={copyBackup} style={[styles.backupBtn, { borderColor: theme.line }]}>
          <Text style={[styles.backupBtnText, { color: theme.text }]}>Copy full backup</Text>
        </Pressable>
        <Pressable onPress={() => setShowRestore((show) => !show)} style={[styles.backupBtn, { borderColor: theme.line }]}>
          <Text style={[styles.backupBtnText, { color: theme.text }]}>{showRestore ? "Cancel restore" : "Restore backup"}</Text>
        </Pressable>
      </View>
      {showRestore && (
        <View style={[styles.restoreCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Text style={[styles.restoreHint, { color: theme.textMuted }]}>Paste a backup made by LAYP. Restoring replaces all current app data.</Text>
          <TextInput value={restoreText} onChangeText={setRestoreText} multiline placeholder="Paste backup JSON" placeholderTextColor={theme.textMuted} style={[styles.restoreInput, { color: theme.text, borderColor: theme.line }]} />
          <Pressable onPress={restoreBackup} style={[styles.restoreBtn, { backgroundColor: ACCENT.ember }]}><Text style={styles.copyBtnText}>Restore and replace data</Text></Pressable>
        </View>
      )}

      <View style={[styles.textBox, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.mono, { color: theme.text }]}>{text}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "700", marginBottom: 4 },
  sub: { fontSize: 11, marginBottom: 16 },
  copyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 16, paddingVertical: 14, marginBottom: 16 },
  copyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  textBox: { borderWidth: 1, borderRadius: 16, padding: 12 },
  mono: { fontSize: 10, fontFamily: "monospace", lineHeight: 15 },
  backupRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  backupBtn: { flex: 1, borderWidth: 1, borderRadius: 12, alignItems: "center", paddingVertical: 10 },
  backupBtnText: { fontSize: 11, fontWeight: "700" },
  restoreCard: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
  restoreHint: { fontSize: 10, lineHeight: 14, marginBottom: 8 },
  restoreInput: { minHeight: 90, borderWidth: 1, borderRadius: 10, padding: 8, fontSize: 10, textAlignVertical: "top", marginBottom: 8 },
  restoreBtn: { borderRadius: 10, alignItems: "center", paddingVertical: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
