import React, { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from "react-native";
import Slider from "@react-native-community/slider";
import { Plus, X, CheckCircle2, PiggyBank, Pencil, Trash2, Check, ArrowLeftRight, AlertTriangle } from "lucide-react-native";
import { useTheme, ACCENT, PALETTE, DEFAULT_SPLITS } from "../theme";
import { peso, uid, todayISO, daysUntil, fmtDay, normalizeSplits, removeSplitAndRedistribute, computeAccountBalance, savingsTotal as computeSavingsTotal, unallocatedSavings, goalProgress, addAccount as pushAccount, isPositiveAmount } from "../utils";
import Chip from "../components/Chip";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";

export default function BudgetScreen({ moneyLog, setMoneyLog, splits, setSplits, bills, setBills, expenses, setExpenses, weeklySummaries, savingsLog, setSavingsLog, loans, accounts, setAccounts, transfers, setTransfers, goals, setGoals }) {
  const { theme } = useTheme();
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [savingsMode, setSavingsMode] = useState("deposit");
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState(null);
  const [billStatusView, setBillStatusView] = useState("unpaid");
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [addAmount, setAddAmount] = useState("");
  const [addAccount, setAddAccount] = useState(accounts[0]?.id);

  function applyPreset(key) { setSplits(DEFAULT_SPLITS[key].map((s) => ({ ...s }))); }
  function addMoney() {
    const amt = Number(addAmount);
    if (!isPositiveAmount(amt)) return;
    setMoneyLog((prev) => [...prev, { id: uid(), amount: amt, account: addAccount, note: "Money added", date: todayISO(), createdAt: Date.now() }]);
    setAddAmount("");
    setShowAddMoney(false);
  }
  function updateSplitPercent(idx, val) { setSplits((prev) => normalizeSplits(prev, idx, val)); }
  function updateSplitLabel(idx, label) { setSplits((prev) => prev.map((s, i) => (i === idx ? { ...s, label } : s))); }
  function addSplit() {
    setSplits((prev) => {
      const color = PALETTE[prev.length % PALETTE.length];
      const next = [...prev, { id: uid(), label: "New split", percent: 0, color }];
      return normalizeSplits(next, next.length - 1, 10);
    });
  }
  function removeSplit(id) { setSplits((prev) => removeSplitAndRedistribute(prev, id)); }

  function saveBill(data) {
    if (editingBillId) {
      setBills((prev) => prev.map((b) => (b.id === editingBillId ? { ...b, ...data } : b)));
      setEditingBillId(null);
    } else {
      setBills((prev) => [...prev, { id: uid(), ...data, paid: false, createdAt: Date.now() }]);
    }
    setShowBillForm(false);
  }
  function togglePaid(bill) {
    if (!bill.paid) {
      const available = computeAccountBalance(bill.account, ctx);
      if (Number(bill.amount) > available) {
        Alert.alert("Not enough money", `This bill needs ${peso(bill.amount)}, but the selected account has ${peso(available)} available.`);
        return;
      }
      setExpenses((prev) => [...prev, { id: uid(), name: bill.name, amount: bill.amount, splitId: bill.splitId, account: bill.account, date: todayISO(), source: "bill", billId: bill.id, createdAt: Date.now() }]);
      setBills((prev) => prev.map((b) => (b.id === bill.id ? { ...b, paid: true, paidAt: todayISO() } : b)));
    } else {
      setExpenses((prev) => prev.filter((e) => e.billId !== bill.id));
      setBills((prev) => prev.map((b) => (b.id === bill.id ? { ...b, paid: false, paidAt: null } : b)));
    }
  }
  function removeBill(id) {
    setExpenses((prev) => prev.filter((e) => e.billId !== id));
    setBills((prev) => prev.filter((b) => b.id !== id));
    if (editingBillId === id) { setEditingBillId(null); setShowBillForm(false); }
  }
  function startEditBill(b) { setEditingBillId(b.id); setShowBillForm(true); }

  function removeAccount(id) {
    const referenced = [
      ...moneyLog, ...expenses, ...bills, ...savingsLog, ...loans,
      ...transfers.filter((t) => t.fromAccount === id || t.toAccount === id),
    ].some((entry) => entry.account === id || entry.fromAccount === id || entry.toAccount === id)
      || weeklySummaries.some((week) => Number(week.byAccount?.[id]) > 0);
    if (referenced) {
      Alert.alert("Account still has history", "This account can't be deleted because transactions are linked to it. Move or remove those records first so no financial history is hidden.");
      return;
    }
    setAccounts((prev) => prev.length > 1 ? prev.filter((a) => a.id !== id) : prev);
  }

  const unpaidBills = bills.filter((b) => !b.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paidBills = bills.filter((b) => b.paid).sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
  const unpaidTotal = unpaidBills.reduce((s, b) => s + b.amount, 0);
  const editingBill = editingBillId ? bills.find((b) => b.id === editingBillId) : null;

  const totalSavings = computeSavingsTotal(savingsLog);
  const unallocated = unallocatedSavings(savingsLog);
  const editingGoal = editingGoalId ? goals.find((g) => g.id === editingGoalId) : null;
  const totalPercent = splits.reduce((s, x) => s + x.percent, 0);

  const totalIncome = moneyLog.reduce((s, m) => s + Number(m.amount), 0);
  const rolledTotal = weeklySummaries.reduce((s, w) => s + w.total, 0);
  const totalSpent = expenses.reduce((s, e) => s + Number(e.amount), 0) + rolledTotal;
  const ctx = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };
  // True remaining cash = sum of both accounts, which already factors in
  // money currently lent out (unavailable) and money currently borrowed
  // (available) -- not just plain income minus spending.
  const remaining = accounts.reduce((s, a) => s + computeAccountBalance(a.id, ctx), 0);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
      <Text style={[styles.h1, { color: theme.text }]}>Pay plan</Text>

      {/* HERO: current remaining budget is the focus */}
      <View style={[styles.heroCard, { backgroundColor: theme.accentDark }]}>
        <Text style={[styles.heroLabel, { color: ACCENT.gold }]}>Current budget</Text>
        <Text style={[styles.heroValue, { color: remaining < 0 ? ACCENT.ember : "#fff" }]}>{peso(remaining)}</Text>
        <Text style={styles.heroSub}>remaining after {peso(totalSpent)} spent</Text>

        <View style={styles.heroDivider} />

        <View style={styles.accountRow}>
          {accounts.map((a) => (
            <View key={a.id} style={styles.accountChip}>
              <View style={[styles.accountDot, { backgroundColor: a.color }]} />
              <Text style={styles.accountLabel}>{a.label}</Text>
              <Text style={styles.accountBalance}>{peso(computeAccountBalance(a.id, ctx))}</Text>
            </View>
          ))}
        </View>

        {!showAddMoney ? (
          <Pressable onPress={() => setShowAddMoney(true)} style={styles.addMoneyBtn}>
            <Plus size={13} color={theme.accentDark} />
            <Text style={styles.addMoneyBtnText}>Add money received</Text>
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
              <Pressable onPress={addMoney} style={styles.addMoneyConfirm} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Check size={14} color={theme.accentDark} />
              </Pressable>
              <Pressable onPress={() => { setShowAddMoney(false); setAddAmount(""); }} style={styles.addMoneyCancel} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <X size={14} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.h2, { color: theme.text }]}>Accounts</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable onPress={() => setShowTransferForm((s) => !s)} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]}>
            {showTransferForm ? <X size={14} color="#fff" /> : <ArrowLeftRight size={14} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => setAccounts((prev) => pushAccount(prev, PALETTE))} style={[styles.roundBtn, { backgroundColor: ACCENT.leaf }]}>
            <Plus size={14} color="#fff" />
          </Pressable>
        </View>
      </View>

      {showTransferForm && (
        <TransferForm
          accounts={accounts}
          ctx={ctx}
          onSave={(entry) => { setTransfers((prev) => [...prev, { id: uid(), ...entry, createdAt: Date.now() }]); setShowTransferForm(false); }}
        />
      )}

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        {accounts.map((a) => (
          <View key={a.id} style={styles.accountEditRow}>
            <View style={[styles.accountDotSmall, { backgroundColor: a.color }]} />
            <TextInput
              value={a.label}
              onChangeText={(v) => setAccounts((prev) => prev.map((x) => (x.id === a.id ? { ...x, label: v } : x)))}
              style={[styles.accountEditInput, { color: theme.text }]}
            />
            <Text style={[styles.accountEditBalance, { color: theme.textMuted }]}>{peso(computeAccountBalance(a.id, ctx))}</Text>
            {accounts.length > 1 && (
              <Pressable onPress={() => removeAccount(a.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Trash2 size={13} color={theme.textMuted} />
              </Pressable>
            )}
          </View>
        ))}
        <Text style={[styles.accountHint, { color: theme.textMuted }]}>Add as many named accounts as you use -- GCash, Maya, Wallet, Bank, etc. Tap a name to rename it.</Text>
      </View>

      <View style={styles.chipRow}>
        <Chip label="50-30-20" onPress={() => applyPreset("50-30-20")} small />
        <Chip label="70-20-10" onPress={() => applyPreset("70-20-10")} small />
        <Pressable onPress={addSplit} style={[styles.addSplitBtn, { backgroundColor: theme.card, borderColor: theme.line }]}>
          <Plus size={11} color={theme.text} />
          <Text style={{ fontSize: 10, fontWeight: "600", color: theme.text }}>Add split</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line }]}>
        {splits.map((s, i) => {
          const allocated = totalIncome * s.percent / 100;
          const spentLive = expenses.filter((e) => e.splitId === s.id).reduce((sum, e) => sum + Number(e.amount), 0);
          const spentRolled = weeklySummaries.reduce((sum, w) => sum + (w.bySplit?.[s.id] || 0), 0);
          const spent = spentLive + spentRolled;
          const splitRemaining = allocated - spent;
          const pct = allocated > 0 ? Math.min(100, (spent / allocated) * 100) : 0;
          return (
            <View key={s.id} style={{ marginBottom: 16 }}>
              <View style={styles.splitHeaderRow}>
                <TextInput value={s.label} onChangeText={(v) => updateSplitLabel(i, v)} style={[styles.splitLabelInput, { color: theme.text }]} />
                <Text style={[styles.splitPercent, { color: s.color }]}>{s.percent}%</Text>
                {splits.length > 1 && <Pressable onPress={() => removeSplit(s.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Trash2 size={12} color={theme.textMuted} /></Pressable>}
              </View>
              <Slider minimumValue={0} maximumValue={100} step={1} value={s.percent} onValueChange={(v) => updateSplitPercent(i, v)} minimumTrackTintColor={s.color} maximumTrackTintColor={theme.bg} />
              <View style={styles.splitStatsRow}>
                <Text style={[styles.splitStat, { color: theme.textMuted }]}>{peso(spent)} spent of {peso(allocated)}</Text>
                <Text style={[styles.splitStat, { color: splitRemaining < 0 ? ACCENT.ember : theme.textMuted }]}>{peso(splitRemaining)} left</Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.bg }]}>
                <View style={[styles.trackFill, { width: `${pct}%`, backgroundColor: splitRemaining < 0 ? ACCENT.ember : s.color }]} />
              </View>
            </View>
          );
        })}
        <View style={styles.autoBalanceRow}>
          {totalPercent === 100 ? <Check size={11} color={ACCENT.leaf} /> : null}
          <Text style={{ fontSize: 9, color: totalPercent === 100 ? ACCENT.leaf : theme.textMuted }}>
            {totalPercent === 100 ? "Splits equal 100% automatically." : "Adjusting one split rebalances the rest."}
          </Text>
        </View>
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.h2, { color: theme.text }]}>Savings</Text>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Pressable onPress={() => { setSavingsMode("deposit"); setShowSavingsForm((s) => (showSavingsForm && savingsMode === "deposit" ? false : true)); }} style={[styles.roundBtn, { backgroundColor: ACCENT.leaf }]}>
            {showSavingsForm && savingsMode === "deposit" ? <X size={14} color="#fff" /> : <Plus size={14} color="#fff" />}
          </Pressable>
          <Pressable onPress={() => { setSavingsMode("withdraw"); setShowSavingsForm((s) => (showSavingsForm && savingsMode === "withdraw" ? false : true)); }} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]}>
            {showSavingsForm && savingsMode === "withdraw" ? <X size={14} color="#fff" /> : <ArrowLeftRight size={14} color="#fff" />}
          </Pressable>
        </View>
      </View>
      <Text style={[styles.savingsHint, { color: theme.textMuted }]}>Savings is kept separate from your spendable budget above. Money moved here comes out of E-cash/Physical; withdrawing sends it back.</Text>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.line, marginBottom: 12 }]}>
        <Text style={[styles.smallLabel, { color: theme.textMuted }]}>Total in savings</Text>
        <Text style={[styles.savingsTotal, { color: ACCENT.leaf }]}>{peso(totalSavings)}</Text>
      </View>
      {showSavingsForm && (
        <SavingsTransferForm
          mode={savingsMode}
          totalSavings={totalSavings}
          ctx={ctx}
          accounts={accounts}
          goals={goals}
          onSave={(entry) => { setSavingsLog((prev) => [...prev, { id: uid(), ...entry }]); setShowSavingsForm(false); }}
        />
      )}
      {savingsLog.length > 0 &&
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
                <Pressable onPress={() => setSavingsLog((prev) => prev.filter((x) => x.id !== s.id))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Trash2 size={13} color={theme.textMuted} /></Pressable>
              </View>
            </View>
          );
        })}

      <View style={styles.headerRow}>
        <Text style={[styles.h2, { color: theme.text }]}>Savings goals</Text>
        <Pressable onPress={() => { setEditingGoalId(null); setShowGoalForm((s) => !s); }} style={[styles.roundBtn, { backgroundColor: ACCENT.sky }]}>
          {showGoalForm ? <X size={14} color="#fff" /> : <Plus size={14} color="#fff" />}
        </Pressable>
      </View>
      <Text style={[styles.savingsHint, { color: theme.textMuted }]}>Earmark part of your savings toward something specific. Unallocated savings: {peso(unallocated)}.</Text>

      {showGoalForm && (
        <GoalForm
          initial={editingGoal}
          onSave={(data) => {
            if (editingGoalId) {
              setGoals((prev) => prev.map((g) => (g.id === editingGoalId ? { ...g, ...data } : g)));
            } else {
              setGoals((prev) => [...prev, { id: uid(), ...data, createdAt: Date.now() }]);
            }
            setShowGoalForm(false);
            setEditingGoalId(null);
          }}
          onCancel={() => { setShowGoalForm(false); setEditingGoalId(null); }}
        />
      )}

      {goals.length === 0 ? (
        <EmptyState text="No savings goals yet." />
      ) : (
        <View style={{ gap: 8, marginBottom: 16 }}>
          {goals.map((g) => {
            const prog = goalProgress(g, savingsLog);
            const met = prog.percent >= 100;
            return (
              <View key={g.id} style={[styles.goalCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
                <View style={styles.goalHeaderRow}>
                  <Text style={[styles.goalName, { color: theme.text }]}>{g.name}</Text>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={() => { setEditingGoalId(g.id); setShowGoalForm(true); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Pencil size={13} color={theme.textMuted} /></Pressable>
                    <Pressable onPress={() => setGoals((prev) => prev.filter((x) => x.id !== g.id))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Trash2 size={13} color={theme.textMuted} /></Pressable>
                  </View>
                </View>
                <Text style={[styles.goalAmounts, { color: theme.textMuted }]}>{peso(prog.current)} / {peso(prog.target)}</Text>
                <View style={[styles.track, { backgroundColor: theme.bg, marginTop: 4 }]}>
                  <View style={[styles.trackFill, { width: `${prog.percent}%`, backgroundColor: met ? ACCENT.leaf : ACCENT.sky }]} />
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

      <View style={[styles.chipRow, { marginTop: savingsLog.length ? 12 : 4 }]}>
        <Chip label={`Unpaid (${unpaidBills.length})`} active={billStatusView === "unpaid"} onPress={() => setBillStatusView("unpaid")} small />
        <Chip label={`Paid (${paidBills.length})`} active={billStatusView === "paid"} onPress={() => setBillStatusView("paid")} small />
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => { setEditingBillId(null); setShowBillForm((s) => !s); }} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]}>
          {showBillForm ? <X size={14} color="#fff" /> : <Plus size={14} color="#fff" />}
        </Pressable>
      </View>

      {billStatusView === "unpaid" && unpaidTotal > 0 && (
        <Text style={[styles.hintText, { color: theme.textMuted }]}>You need <Text style={{ color: ACCENT.ember, fontWeight: "700" }}>{peso(unpaidTotal)}</Text> ready for unpaid bills.</Text>
      )}

      {showBillForm && <BillForm splits={splits} accounts={accounts} initial={editingBill} onSave={saveBill} onCancel={() => { setShowBillForm(false); setEditingBillId(null); }} />}

      {(billStatusView === "unpaid" ? unpaidBills : paidBills).length === 0 ? (
        <EmptyState text={billStatusView === "unpaid" ? "No bills tracked yet." : "No paid bills yet."} />
      ) : (
        (billStatusView === "unpaid" ? unpaidBills : paidBills).map((b) => {
          const dleft = daysUntil(b.dueDate);
          const split = splits.find((s) => s.id === b.splitId);
          const account = accounts.find((a) => a.id === b.account);
          return (
            <View key={b.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.line, opacity: b.paid ? 0.6 : 1 }]}>
              <Pressable onPress={() => togglePaid(b)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>{b.paid ? <CheckCircle2 size={19} color={ACCENT.leaf} /> : <PiggyBank size={19} color={ACCENT.gold} />}</Pressable>
              <Pressable style={{ flex: 1 }} onPress={() => !b.paid && startEditBill(b)}>
                <Text style={[styles.rowTitle, { color: theme.text }]}>{b.name}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <Text style={[styles.metaText, { color: dleft < 0 && !b.paid ? ACCENT.ember : theme.textMuted }]}>
                    {peso(b.amount)} - {b.paid ? `paid ${fmtDay(b.paidAt)}` : dleft === 0 ? "due today" : dleft < 0 ? `${Math.abs(dleft)}d overdue` : `in ${dleft}d`}
                  </Text>
                  {split && <View style={[styles.tag, { backgroundColor: split.color + "22" }]}><Text style={[styles.tagText, { color: split.color }]}>{split.label}</Text></View>}
                  {account && <View style={[styles.tag, { backgroundColor: account.color + "22" }]}><Text style={[styles.tagText, { color: account.color }]}>{account.label}</Text></View>}
                </View>
              </Pressable>
              {!b.paid && <Pressable onPress={() => startEditBill(b)} style={{ marginRight: 4 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Pencil size={14} color={theme.textMuted} /></Pressable>}
              <Pressable onPress={() => removeBill(b.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}><Trash2 size={15} color={theme.textMuted} /></Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

function BillForm({ initial, onSave, onCancel, splits, accounts }) {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [dueDate, setDueDate] = useState(initial?.dueDate || todayISO());
  const [splitId, setSplitId] = useState(initial?.splitId || splits[0]?.id);
  const [account, setAccount] = useState(initial?.account || accounts[0].id);
  const canSave = name.trim() && isPositiveAmount(amount);
  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Parcel COD, rent, load" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Budget category</Text>
      <View style={styles.chipWrap}>
        {splits.map((s) => <Chip key={s.id} label={s.label} color={s.color} active={splitId === s.id} onPress={() => setSplitId(s.id)} small />)}
      </View>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Pay from</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />)}
      </View>
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Amount (P)</Text>
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={dueDate} onChange={setDueDate} label="Needed by" /></View>
      <View style={styles.formActions}>
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]}><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable disabled={!canSave} onPress={() => canSave && onSave({ name: name.trim(), amount: Number(amount), dueDate, splitId, account })} style={[styles.formBtn, { backgroundColor: ACCENT.gold, opacity: canSave ? 1 : 0.5 }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Add bill"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function SavingsTransferForm({ mode, totalSavings, ctx, accounts, goals = [], onSave }) {
  const { theme } = useTheme();
  const isWithdraw = mode === "withdraw";
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [account, setAccount] = useState(accounts[0].id);
  const [goalId, setGoalId] = useState(null);
  const amountNum = Number(amount) || 0;
  const accountBal = computeAccountBalance(account, ctx);
  const exceedsSource = isWithdraw ? amountNum > totalSavings : amountNum > accountBal;
  const canSave = isPositiveAmount(amount) && !exceedsSource;

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>{isWithdraw ? "Withdraw from savings" : "Add to savings"}</Text>
      <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{isWithdraw ? "Send back to" : "Take from"}</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />)}
      </View>
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
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={date} onChange={setDate} label="Date" /></View>

      {amountNum > 0 && (
        <Text style={[styles.previewText2, { color: theme.textMuted }]}>
          {isWithdraw
            ? `Will move ${peso(amountNum)} from savings into ${accounts.find((a) => a.id === account)?.label}`
            : `Will move ${peso(amountNum)} from ${accounts.find((a) => a.id === account)?.label} into savings${goalId ? ` (toward ${goals.find((g) => g.id === goalId)?.name})` : ""}`}
        </Text>
      )}
      {exceedsSource && (
        <View style={styles.warnRow2}>
          <AlertTriangle size={11} color={ACCENT.ember} />
          <Text style={styles.warnText2}>
            {isWithdraw ? `More than your ${peso(totalSavings)} in savings.` : `More than your current ${accounts.find((a) => a.id === account)?.label} balance (${peso(accountBal)}).`}
          </Text>
        </View>
      )}

      <Pressable
        disabled={!canSave}
        onPress={() => canSave && onSave({ amount: amountNum, date, note: note.trim(), account, goalId: isWithdraw ? null : goalId, type: isWithdraw ? "withdraw" : "deposit" })}
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
  const canSave = name.trim() && Number(targetAmount) > 0;

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>{initial ? "Edit goal" : "New savings goal"}</Text>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. New laptop, Emergency fund" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      <View style={{ marginBottom: 12 }}>
        <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Target amount (P)</Text>
        <TextInput value={targetAmount} onChangeText={(v) => setTargetAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={targetDate} onChange={setTargetDate} label="Target date (optional)" /></View>
      <View style={styles.formActions}>
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]}><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable disabled={!canSave} onPress={() => canSave && onSave({ name: name.trim(), targetAmount: Number(targetAmount), targetDate: targetDate || null })} style={[styles.formBtn, { backgroundColor: ACCENT.sky, opacity: canSave ? 1 : 0.5 }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Create goal"}</Text>
        </Pressable>
      </View>
    </View>
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
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
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
  h1: { fontSize: 20, fontWeight: "700", marginBottom: 12 },
  h2: { fontSize: 15, fontWeight: "700" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  roundBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  heroCard: { borderRadius: 20, padding: 18, marginBottom: 16 },
  heroLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroValue: { fontSize: 32, fontWeight: "800", fontFamily: "monospace", marginTop: 4 },
  heroSub: { fontSize: 10, color: "#ffffff99", marginTop: 2 },
  heroDivider: { height: 1, backgroundColor: "#ffffff22", marginVertical: 12 },
  accountRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  accountChip: { flex: 1, backgroundColor: "#ffffff14", borderRadius: 12, padding: 10 },
  accountDot: { width: 6, height: 6, borderRadius: 3, marginBottom: 4 },
  accountEditRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  accountDotSmall: { width: 8, height: 8, borderRadius: 4 },
  accountEditInput: { flex: 1, fontSize: 13, fontWeight: "600" },
  accountEditBalance: { fontSize: 11, fontFamily: "monospace" },
  accountHint: { fontSize: 9, lineHeight: 13, marginTop: 6 },
  accountLabel: { fontSize: 9, color: "#ffffffaa", fontWeight: "600" },
  accountBalance: { fontSize: 13, color: "#fff", fontWeight: "700", fontFamily: "monospace", marginTop: 2 },
  accountPickRow: { flexDirection: "row", gap: 6, marginBottom: 8 },
  accountPickChip: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  accountPickText: { fontSize: 10, fontWeight: "700" },
  addMoneyBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "#fff", borderRadius: 12, paddingVertical: 10 },
  addMoneyBtnText: { fontSize: 12, fontWeight: "700", color: "#17203A" },
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
  smallLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  savingsHint: { fontSize: 10, lineHeight: 14, marginBottom: 8 },
  formTitle: { fontSize: 13, fontWeight: "700", marginBottom: 10 },
  previewText2: { fontSize: 11, marginBottom: 8 },
  warnRow2: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 10 },
  warnText2: { fontSize: 10, color: "#D1573F", flex: 1, lineHeight: 14 },
  miniLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  savingsTotal: { fontSize: 20, fontWeight: "700", fontFamily: "monospace" },
  smallRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 },
  smallRowTitle: { fontSize: 11, fontWeight: "600" },
  smallRowDate: { fontSize: 9, fontFamily: "monospace" },
  smallRowAmount: { fontSize: 11, fontWeight: "600", fontFamily: "monospace" },
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
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
});
