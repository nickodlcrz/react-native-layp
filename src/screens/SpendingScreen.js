import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { Plus, X, Pencil, Trash2, ChevronDown, ChevronUp, ArrowDownCircle, ArrowUpCircle } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { peso, uid, todayISO, fmtDay, fmtDateLong, computeAccountBalance, loanInterest, loanTotalDue, isPositiveAmount } from "../utils";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";

export default function SpendingScreen({ expenses, setExpenses, moneyLog, setMoneyLog, weeklySummaries, splits, loans = [], savingsLog = [], accounts, transfers = [] }) {
  const { theme } = useTheme();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [showMoneyForm, setShowMoneyForm] = useState(false);
  const [historyOpen, setHistoryOpen] = useState({});
  const [ledgerOpen, setLedgerOpen] = useState(false);

  function saveExpense(data) {
    if (editingId) {
      setExpenses((prev) => prev.map((e) => (e.id === editingId ? { ...e, ...data } : e)));
      setEditingId(null);
    } else {
      setExpenses((prev) => [...prev, { id: uid(), ...data, createdAt: Date.now() }]);
    }
    setShowForm(false);
  }
  function remove(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    if (editingId === id) { setEditingId(null); setShowForm(false); }
  }
  function startEdit(e) { if (e.source === "bill") return; setEditingId(e.id); setShowForm(true); }
  function saveMoney(entry) { setMoneyLog((prev) => [...prev, { id: uid(), ...entry, createdAt: Date.now() }]); setShowMoneyForm(false); }

  const today = todayISO();
  // Recently added first: sort by createdAt (fallback to id for old entries
  // saved before createdAt existed).
  const byRecent = (a, b) => (b.createdAt || 0) - (a.createdAt || 0);
  const todayExpenses = expenses.filter((e) => e.date === today).sort(byRecent);
  const pastDates = [...new Set(expenses.filter((e) => e.date !== today).map((e) => e.date))].sort((a, b) => b.localeCompare(a));

  const now = new Date();
  const monthTotal = expenses.filter((e) => { const d = new Date(e.date + "T00:00:00"); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, e) => s + Number(e.amount), 0);
  const totalIncome = moneyLog.reduce((s, m) => s + Number(m.amount), 0);
  const rolledTotal = weeklySummaries.reduce((s, w) => s + w.total, 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0) + rolledTotal;
  const ctx = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };
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
    const currentExpenses = expenses.filter((expense) => isIn(expense.date, current));
    const previousTotal = expenses.filter((expense) => isIn(expense.date, previous)).reduce((sum, expense) => sum + Number(expense.amount), 0);
    const bySplit = currentExpenses.reduce((result, expense) => {
      result[expense.splitId] = (result[expense.splitId] || 0) + Number(expense.amount);
      return result;
    }, {});
    const categories = splits.map((split) => ({ ...split, amount: bySplit[split.id] || 0 })).filter((split) => split.amount > 0).sort((a, b) => b.amount - a.amount);
    return { categories, previousTotal };
  }, [expenses, splits, now]);

  // Income & outcome ledger: every money-in and money-out event, including
  // lending/borrowing movements (computed live, not stored separately), newest first.
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
  const ledger = [
    ...moneyLog.map((m) => ({ ...m, kind: "in" })),
    ...expenses.map((e) => ({ ...e, kind: "out" })),
    ...loanLedgerEntries,
  ].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
      <View style={styles.headerRow}>
        <Text style={[styles.h1, { color: theme.text }]}>Spending</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable onPress={() => { setShowMoneyForm((s) => !s); setShowForm(false); }} style={[styles.roundBtn, { backgroundColor: ACCENT.leaf }]}>
            {showMoneyForm ? <X size={16} color="#fff" /> : <ArrowDownCircle size={16} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => { setEditingId(null); setShowForm((s) => !s); setShowMoneyForm(false); }} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]}>
            {showForm ? <X size={16} color="#fff" /> : <Plus size={16} color="#fff" />}
          </Pressable>
        </View>
      </View>

      <View style={[styles.totalCard, { backgroundColor: theme.accentDark }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.totalLabel, { color: ACCENT.gold }]}>Spent this month</Text>
          <Text style={styles.totalValue}>{peso(monthTotal)}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.totalLabel, { color: "#ffffff99" }]}>Budget left</Text>
          <Text style={[styles.totalValue, { color: remaining < 0 ? ACCENT.ember : "#fff" }]}>{peso(remaining)}</Text>
        </View>
      </View>

      {showMoneyForm && <MoneyForm accounts={accounts} onSave={saveMoney} />}
      {showForm && <ExpenseForm initial={editing} splits={splits} accounts={accounts} ctx={ctx} onSave={saveExpense} onCancel={() => { setShowForm(false); setEditingId(null); }} />}

      <Text style={[styles.h2, { color: theme.text, marginBottom: 8 }]}>Today</Text>
      {todayExpenses.length === 0 ? <EmptyState text="Nothing logged today." /> : (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {todayExpenses.map((e) => <ExpenseRow key={e.id} e={e} splits={splits} accounts={accounts} onEdit={() => startEdit(e)} onRemove={() => remove(e.id)} />)}
        </View>
      )}

      {(pastDates.length > 0 || weeklySummaries.length > 0) && (
        <View style={{ marginBottom: 16 }}>
          <Text style={[styles.h2, { color: theme.text, marginBottom: 8 }]}>History</Text>
          <View style={{ gap: 8 }}>
            {pastDates.map((d) => {
              const dayExpenses = expenses.filter((e) => e.date === d).sort(byRecent);
              const dayTotal = dayExpenses.reduce((s, e) => s + Number(e.amount), 0);
              const open = !!historyOpen[d];
              return (
                <View key={d} style={[styles.historyGroup, { backgroundColor: theme.card, borderColor: theme.line }]}>
                  <Pressable onPress={() => setHistoryOpen((prev) => ({ ...prev, [d]: !open }))} style={styles.historyHeader}>
                    <Text style={[styles.historyDate, { color: theme.text }]}>{fmtDateLong(d)}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={[styles.historyTotal, { color: ACCENT.ember }]}>-{peso(dayTotal)}</Text>
                      {open ? <ChevronUp size={13} color={theme.textMuted} /> : <ChevronDown size={13} color={theme.textMuted} />}
                    </View>
                  </Pressable>
                  {open && (
                    <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                      {dayExpenses.map((e) => <ExpenseRow key={e.id} e={e} splits={splits} accounts={accounts} compact onEdit={() => startEdit(e)} onRemove={() => remove(e.id)} />)}
                    </View>
                  )}
                </View>
              );
            })}
            {[...weeklySummaries].sort((a, b) => b.startDate.localeCompare(a.startDate)).map((w) => (
              <View key={w.id} style={[styles.weekSummaryRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <View>
                  <Text style={[styles.historyDate, { color: theme.text }]}>Week of {fmtDay(w.startDate)} - {fmtDay(w.endDate)}</Text>
                  <Text style={[styles.weekSummarySub, { color: theme.textMuted }]}>{w.count} entries, summarized</Text>
                </View>
                <Text style={[styles.historyTotal, { color: ACCENT.ember }]}>-{peso(w.total)}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.rollupNote, { color: theme.textMuted }]}>Daily logs older than 7 days are automatically summarized into a weekly total like this, and the individual entries are removed.</Text>
        </View>
      )}

      <Pressable onPress={() => setLedgerOpen((o) => !o)} style={styles.ledgerHeader}>
        <Text style={[styles.h2, { color: theme.text }]}>Income & outcome history</Text>
        {ledgerOpen ? <ChevronUp size={15} color={theme.textMuted} /> : <ChevronDown size={15} color={theme.textMuted} />}
      </Pressable>
      {ledgerOpen && (
        ledger.length === 0 ? <EmptyState text="Nothing logged yet." /> : (
          <View style={{ gap: 6 }}>
            {ledger.map((item) => (
              <View key={item.id} style={[styles.ledgerRow, { backgroundColor: theme.card, borderColor: theme.line }]}>
                {item.kind === "in" ? <ArrowDownCircle size={16} color={ACCENT.leaf} /> : <ArrowUpCircle size={16} color={ACCENT.ember} />}
                <View style={{ flex: 1 }}>
                  <Text style={[styles.ledgerTitle, { color: theme.text }]}>{item.name || item.note || "Money added"}</Text>
                  <Text style={[styles.ledgerDate, { color: theme.textMuted }]}>{fmtDay(item.date)}{item.account ? ` - ${accounts.find((a) => a.id === item.account)?.label || item.account}` : ""}</Text>
                </View>
                <Text style={[styles.ledgerAmount, { color: item.kind === "in" ? ACCENT.leaf : ACCENT.ember }]}>{item.kind === "in" ? "+" : "-"}{peso(item.amount)}</Text>
              </View>
            ))}
          </View>
        )
      )}

      <View style={[styles.analyticsCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
        <Text style={[styles.analyticsTitle, { color: theme.text }]}>This month’s spending</Text>
        {analytics.categories.length === 0 ? (
          <Text style={[styles.analyticsHint, { color: theme.textMuted }]}>Add an expense to see your category breakdown.</Text>
        ) : analytics.categories.map((category) => {
          const share = monthTotal ? (category.amount / monthTotal) * 100 : 0;
          return (
            <View key={category.id} style={styles.categoryRow}>
              <View style={styles.categoryTopRow}>
                <Text style={[styles.categoryLabel, { color: theme.text }]}>{category.label}</Text>
                <Text style={[styles.categoryAmount, { color: theme.textMuted }]}>{peso(category.amount)} · {share.toFixed(0)}%</Text>
              </View>
              <View style={[styles.categoryTrack, { backgroundColor: theme.bg }]}><View style={[styles.categoryFill, { width: `${share}%`, backgroundColor: category.color }]} /></View>
            </View>
          );
        })}
        {analytics.previousTotal > 0 && (
          <Text style={[styles.analyticsHint, { color: monthTotal <= analytics.previousTotal ? ACCENT.leaf : ACCENT.ember }]}>
            {monthTotal <= analytics.previousTotal ? "↓" : "↑"} {Math.abs(((monthTotal - analytics.previousTotal) / analytics.previousTotal) * 100).toFixed(1)}% versus last month
          </Text>
        )}
      </View>
    </ScrollView>
  );
}

function ExpenseRow({ e, splits, accounts, onEdit, onRemove, compact }) {
  const { theme } = useTheme();
  const split = splits.find((s) => s.id === e.splitId);
  const account = accounts.find((a) => a.id === e.account);
  return (
    <View style={[styles.row, { backgroundColor: compact ? theme.bg : theme.card, borderColor: theme.line, borderWidth: compact ? 0 : 1 }]}>
      <Pressable style={{ flex: 1 }} onPress={onEdit}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>{e.name}{e.source === "bill" ? <Text style={{ fontSize: 9, fontWeight: "400", color: theme.textMuted }}> (bill)</Text> : null}</Text>
        {e.label ? <Text style={[styles.customLabel, { color: theme.textMuted }]}>{e.label}</Text> : null}
        <View style={{ flexDirection: "row", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
          {split && <View style={[styles.tag, { backgroundColor: split.color + "22" }]}><Text style={[styles.tagText, { color: split.color }]}>{split.label}</Text></View>}
          {account && <View style={[styles.tag, { backgroundColor: account.color + "22" }]}><Text style={[styles.tagText, { color: account.color }]}>{account.label}</Text></View>}
        </View>
      </Pressable>
      <Text style={[styles.amount, { color: ACCENT.ember }]}>-{peso(e.amount)}</Text>
      {e.source !== "bill" && <Pressable onPress={onEdit} style={{ marginRight: 4 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Pencil size={14} color={theme.textMuted} /></Pressable>}
      <Pressable onPress={onRemove} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Trash2 size={15} color={theme.textMuted} /></Pressable>
    </View>
  );
}

function ExpenseForm({ initial, onSave, onCancel, splits, accounts, ctx }) {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name || "");
  const [label, setLabel] = useState(initial?.label || "");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [splitId, setSplitId] = useState(initial?.splitId || splits[0]?.id);
  const [account, setAccount] = useState(initial?.account || accounts[0].id);
  const [date, setDate] = useState(initial?.date || todayISO());
  const amountNum = Number(amount);
  const currentBalance = computeAccountBalance(account, ctx);
  const available = currentBalance + (initial?.account === account ? Number(initial.amount) : 0);
  const exceedsBalance = isPositiveAmount(amount) && amountNum > available;
  const canSave = name.trim() && isPositiveAmount(amount) && !exceedsBalance;

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <TextInput value={name} onChangeText={setName} placeholder="What did you spend on?" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <TextInput value={label} onChangeText={setLabel} placeholder="Custom label / note (optional)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, marginBottom: 12 }]} />
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Budget category</Text>
      <View style={styles.chipWrap}>
        {splits.map((c) => <Chip key={c.id} label={c.label} color={c.color} active={splitId === c.id} onPress={() => setSplitId(c.id)} small />)}
      </View>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Paid from</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />)}
      </View>
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Amount (P)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={date} onChange={setDate} label="Date" /></View>
      {exceedsBalance && <Text style={[styles.warning, { color: ACCENT.ember }]}>This exceeds the available {peso(available)} in this account.</Text>}
      <View style={styles.formActions}>
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]}><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable disabled={!canSave} onPress={() => canSave && onSave({ name: name.trim(), label: label.trim(), amount: Number(amount), splitId, account, date })} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Log expense"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MoneyForm({ accounts, onSave }) {
  const { theme } = useTheme();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [account, setAccount] = useState(accounts[0].id);
  const [date, setDate] = useState(todayISO());
  const canSave = isPositiveAmount(amount);
  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>Money received / added</Text>
      <TextInput value={note} onChangeText={setNote} placeholder="e.g. Allowance, salary, gift (optional)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Goes into</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />)}
      </View>
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Amount (P)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={date} onChange={setDate} label="Date" /></View>
      <Pressable disabled={!canSave} onPress={() => canSave && onSave({ amount: Number(amount), note: note.trim(), account, date })} style={[styles.formBtn, { backgroundColor: ACCENT.leaf, opacity: canSave ? 1 : 0.5 }]}>
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
  totalCard: { flexDirection: "row", justifyContent: "space-between", borderRadius: 16, padding: 16, marginBottom: 16 },
  totalLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  totalValue: { fontSize: 20, fontWeight: "700", color: "#fff", marginTop: 4, fontFamily: "monospace" },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  formTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 8, paddingVertical: 4 },
  amountInput: { fontSize: 13, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  miniLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 16, padding: 12 },
  rowTitle: { fontSize: 13, fontWeight: "600" },
  customLabel: { fontSize: 10, fontStyle: "italic", marginTop: 1 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
  amount: { fontSize: 13, fontWeight: "600", fontFamily: "monospace" },
  historyGroup: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  historyDate: { fontSize: 12, fontWeight: "600" },
  historyTotal: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
  weekSummaryRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  weekSummarySub: { fontSize: 9, marginTop: 2 },
  rollupNote: { fontSize: 9, marginTop: 8, lineHeight: 13 },
  ledgerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8, marginTop: 4 },
  ledgerRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10 },
  ledgerTitle: { fontSize: 12, fontWeight: "600" },
  ledgerDate: { fontSize: 9, marginTop: 1, fontFamily: "monospace" },
  ledgerAmount: { fontSize: 12, fontWeight: "700", fontFamily: "monospace" },
  warning: { fontSize: 10, marginBottom: 10 },
  analyticsCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 16 },
  analyticsTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  analyticsHint: { fontSize: 10, marginTop: 10, lineHeight: 14 },
  categoryRow: { marginBottom: 10 },
  categoryTopRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  categoryLabel: { fontSize: 11, fontWeight: "600" },
  categoryAmount: { fontSize: 10, fontFamily: "monospace" },
  categoryTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  categoryFill: { height: 6, borderRadius: 3 },
});
