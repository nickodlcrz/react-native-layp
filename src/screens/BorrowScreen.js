import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Platform, Alert } from "react-native";
import { Plus, X, CheckCircle2, Circle, Trash2, ArrowDownLeft, ArrowUpRight, AlertTriangle, TrendingUp, TrendingDown, Wallet, Check, HandCoins, Receipt, PiggyBank, Pencil, Bell } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { peso, uid, todayISO, daysUntil, fmtDay, loanInterest, loanTotalDue, loanTotalPaid, computeAccountBalance, isPositiveAmount, nextRecurringDate } from "../utils";
import Chip from "../components/Chip";
import SegmentedTabs from "../components/SegmentedTabs";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";
import { validate, loanSchema, billSchema } from "../validation";
import { rescheduleLoanNotification, cancelTodoNotifications, rescheduleBillNotification } from "../notifications";
import { confirmDelete } from "../components/ConfirmModal";
import EditSheet from "../components/EditSheet";
import { useCardPressAnimation, DURATION } from "../animation";
import { hapticSuccess } from "../haptics";
import Reanimated, { FadeOut, Layout as ReanimatedLayout } from "react-native-reanimated";

export default function BorrowScreen({ loans, setLoans, moneyLog, expenses, setExpenses, weeklySummaries, savingsLog = [], accounts, transfers = [], splits = [], bills = [], setBills }) {
  const { theme } = useTheme();
  const [typeView, setTypeView] = useState("lent"); // "lent" = money others owe me, "borrowed" = money I owe others
  const [statusView, setStatusView] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [payingId, setPayingId] = useState(null); // loan currently showing its inline "record payment" input
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccount, setPaymentAccount] = useState(null); // which account the payment was made/received through -- defaults to the loan's own account when the row opens

  // Bills -- moved here from Budget Overview so unpaid/paid obligations
  // (bills) sit alongside unpaid/paid lending (loans) in one place instead
  // of two separate tabs.
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [payingBillId, setPayingBillId] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [billStatusView, setBillStatusView] = useState("unpaid");

  async function saveLoan(data) {
    if (editingId) {
      const prev = loans.find((l) => l.id === editingId);
      const merged = { ...prev, ...data };
      const notificationId = await rescheduleLoanNotification(merged);
      setLoans((prevList) => prevList.map((l) => (l.id === editingId ? { ...merged, notificationId } : l)));
      setEditingId(null);
    } else {
      const draft = { id: uid(), type: typeView, ...data, settled: false, createdAt: Date.now() };
      const notificationId = await rescheduleLoanNotification(draft);
      setLoans((prev) => [...prev, { ...draft, notificationId }]);
    }
    setShowForm(false);
  }
  // Wrapped in useCallback for the same reason as TodoScreen's handlers:
  // LoanRow is React.memo'd, and a fresh function reference on every
  // render of this screen (which plain function declarations produce)
  // silently defeats that -- every row would re-render on every keystroke
  // in the payment-amount input, not just the row that input belongs to.
  const toggleSettled = useCallback(async (l) => {
    const nowSettled = !l.settled;
    if (nowSettled && l.notificationId) await cancelTodoNotifications([l.notificationId]);
    setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, settled: nowSettled, settledAt: nowSettled ? todayISO() : null } : x)));
  }, [setLoans]);

  // Logs a partial payment against a loan without requiring the whole
  // thing to be settled at once -- each payment immediately shows up in
  // the account balance via loanNetAdjustment (see utils.js), same as any
  // other transaction. If this payment brings the loan fully current, it's
  // auto-marked settled (and its reminder notification cancelled) so
  // there's no separate "now go tap settled too" step, but that's just a
  // convenience: the person can always toggle it back open again.
  //
  // `account` records which account the money actually moved through --
  // e.g. a loan borrowed into GoTyme but paid back with Cash -- so
  // computeAccountBalance (see utils.js's loanAccountEffect) reflects the
  // real account, not just whichever one the loan was originally tied to.
  const recordPayment = useCallback(async (l, account) => {
    const amt = Number(paymentAmount);
    if (!isPositiveAmount(amt)) return;
    const payments = [...(l.payments || []), { id: uid(), amount: amt, account: account || l.account, date: todayISO(), createdAt: Date.now() }];
    const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0);
    const nowSettled = totalPaid >= loanTotalDue(l);
    if (nowSettled && l.notificationId) await cancelTodoNotifications([l.notificationId]);
    setLoans((prev) => prev.map((x) => (x.id === l.id ? { ...x, payments, settled: nowSettled, settledAt: nowSettled ? todayISO() : x.settledAt } : x)));
    setPayingId(null);
    setPaymentAmount("");
    setPaymentAccount(null);
  }, [paymentAmount, setLoans]);

  const remove = useCallback((l) => {
    confirmDelete("Delete this entry?", `The ${l.type === "lent" ? "loan to" : "loan from"} ${l.person} (${peso(loanTotalDue(l))}) will be removed for good.`, async () => {
      if (l.notificationId) await cancelTodoNotifications([l.notificationId]);
      setLoans((prev) => prev.filter((x) => x.id !== l.id));
      setEditingId((current) => (current === l.id ? null : current));
      if (editingId === l.id) setShowForm(false);
    });
  }, [editingId, setLoans]);
  const startEdit = useCallback((l) => { setEditingId(l.id); setShowForm(true); }, []);
  const startAdd = useCallback(() => { setEditingId(null); setShowForm((s) => !s); }, []);

  const filtered = loans
    .filter((l) => l.type === typeView)
    .filter((l) => (statusView === "active" ? !l.settled : l.settled))
    .sort((a, b) => statusView === "active" ? (a.dueDate || "9999").localeCompare(b.dueDate || "9999") : (b.settledAt || "").localeCompare(a.settledAt || ""));

  const activeTotal = loans.filter((l) => l.type === typeView && !l.settled).reduce((s, l) => s + loanTotalDue(l), 0);
  const interestEarned = loans.filter((l) => l.type === "lent" && l.settled).reduce((s, l) => s + loanInterest(l), 0);
  const interestPaid = loans.filter((l) => l.type === "borrowed" && l.settled).reduce((s, l) => s + loanInterest(l), 0);
  const editingLoan = editingId ? loans.find((l) => l.id === editingId) : null;

  const ctx = useMemo(
    () => ({ moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers }),
    [moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers]
  );

  // --- Bills (moved here from Budget Overview) ---

  useEffect(() => {
    // Existing bills from before bill reminders was introduced are scheduled
    // once, then keep their id for future edits/payment/deletion.
    const missingReminders = bills.filter((b) => !b.paid && !b.notificationId && b.dueDate && new Date(`${b.dueDate}T09:00:00`).getTime() > Date.now());
    if (!missingReminders.length) return;
    (async () => {
      const ids = await Promise.all(missingReminders.map((b) => rescheduleBillNotification(b)));
      const idByBill = Object.fromEntries(missingReminders.map((b, i) => [b.id, ids[i]]));
      setBills((prev) => prev.map((b) => idByBill[b.id] ? { ...b, notificationId: idByBill[b.id] } : b));
    })();
  }, [bills, setBills]);

  // For a recurring bill that's just been fully paid, creates the next
  // occurrence -- same name/amount/category/account/recurrence, due date
  // advanced by one interval, unpaid, with its own reminder scheduled.
  // Returns null for a non-recurring bill so callers can spread the result
  // into their bills update unconditionally.
  async function spawnNextRecurringBill(bill) {
    if (!bill.recurring) return null;
    const next = {
      id: uid(), name: bill.name, amount: bill.amount, splitId: bill.splitId,
      account: bill.account, recurring: bill.recurring,
      dueDate: nextRecurringDate(bill.dueDate, bill.recurring),
      paid: false, paidAmount: 0, paidAt: null, createdAt: Date.now(),
    };
    const notificationId = await rescheduleBillNotification(next);
    return { ...next, notificationId };
  }

  async function saveBill(data) {
    if (editingBillId) {
      const previous = bills.find((b) => b.id === editingBillId);
      const updated = { ...previous, ...data };
      const notificationId = await rescheduleBillNotification(updated);
      setBills((prev) => prev.map((b) => (b.id === editingBillId ? { ...updated, notificationId } : b)));
      setEditingBillId(null);
    } else {
      const draft = { id: uid(), ...data, paid: false, createdAt: Date.now() };
      const notificationId = await rescheduleBillNotification(draft);
      setBills((prev) => [...prev, { ...draft, notificationId }]);
    }
    setShowBillForm(false);
  }
  async function togglePaid(bill) {
    if (!bill.paid) {
      // Full pay from the checkbox -- pays whatever is left on the bill
      // (the whole amount if nothing's been paid toward it yet, or just the
      // remaining balance if a partial payment already covered some of it).
      const remaining = Number(bill.amount) - Number(bill.paidAmount || 0);
      const available = computeAccountBalance(bill.account, ctx);
      if (remaining > available) {
        Alert.alert("Not enough money", `This bill needs ${peso(remaining)} more, but the selected account has ${peso(available)} available.`);
        return;
      }
      if (bill.notificationId) await cancelTodoNotifications([bill.notificationId]);
      if (remaining > 0.005) {
        setExpenses((prev) => [...prev, { id: uid(), name: bill.name, amount: remaining, splitId: bill.splitId, account: bill.account, date: todayISO(), source: "bill", billId: bill.id, createdAt: Date.now() }]);
      }
      const nextBill = await spawnNextRecurringBill(bill);
      setBills((prev) => {
        const updated = prev.map((b) => (b.id === bill.id ? { ...b, paid: true, paidAmount: Number(b.amount), paidAt: todayISO(), notificationId: null } : b));
        return nextBill ? [...updated, nextBill] : updated;
      });
      setPayingBillId(null);
      hapticSuccess();
    } else {
      // Reopening a paid bill clears every expense tied to it (full and
      // partial alike) and resets the running paid amount back to zero.
      setExpenses((prev) => prev.filter((e) => e.billId !== bill.id));
      const reopened = { ...bill, paid: false, paidAmount: 0, paidAt: null, notificationId: null };
      const notificationId = await rescheduleBillNotification(reopened);
      setBills((prev) => prev.map((b) => (b.id === bill.id ? { ...reopened, notificationId } : b)));
    }
  }
  // Pays down part of a bill instead of the whole thing -- creates an
  // expense for just that amount and tracks the running paidAmount on the
  // bill itself, so the bill stays "unpaid" (with a remaining balance)
  // until enough partial payments add up to cover it in full.
  async function payPartial(bill, amountStr) {
    const amt = Number(amountStr);
    const remaining = Number(bill.amount) - Number(bill.paidAmount || 0);
    if (!isPositiveAmount(amt) || amt > remaining + 0.005) {
      Alert.alert("Invalid amount", `Enter an amount up to ${peso(remaining)} -- that's what's left on this bill.`);
      return;
    }
    const available = computeAccountBalance(bill.account, ctx);
    if (amt > available) {
      Alert.alert("Not enough money", `This payment needs ${peso(amt)}, but the selected account has ${peso(available)} available.`);
      return;
    }
    const newPaidAmount = Number(bill.paidAmount || 0) + amt;
    const fullyPaid = newPaidAmount >= Number(bill.amount) - 0.005;
    setExpenses((prev) => [...prev, {
      id: uid(),
      name: fullyPaid ? bill.name : `${bill.name} (partial)`,
      amount: amt, splitId: bill.splitId, account: bill.account, date: todayISO(),
      source: "bill", billId: bill.id, createdAt: Date.now(),
    }]);
    if (fullyPaid && bill.notificationId) await cancelTodoNotifications([bill.notificationId]);
    const nextBill = fullyPaid ? await spawnNextRecurringBill(bill) : null;
    setBills((prev) => {
      const updated = prev.map((b) => (b.id === bill.id
        ? { ...b, paidAmount: newPaidAmount, paid: fullyPaid, paidAt: fullyPaid ? todayISO() : null, notificationId: fullyPaid ? null : b.notificationId }
        : b));
      return nextBill ? [...updated, nextBill] : updated;
    });
    setPayingBillId(null);
    setPayAmount("");
    hapticSuccess();
  }
  function removeBill(id) {
    const bill = bills.find((b) => b.id === id);
    confirmDelete("Delete this bill?", `"${bill?.name}" will be removed for good.`, async () => {
      if (bill?.notificationId) await cancelTodoNotifications([bill.notificationId]);
      setExpenses((prev) => prev.filter((e) => e.billId !== id));
      setBills((prev) => prev.filter((b) => b.id !== id));
      if (editingBillId === id) { setEditingBillId(null); setShowBillForm(false); }
    });
  }
  function startEditBill(b) { setEditingBillId(b.id); setShowBillForm(true); }

  const unpaidBills = bills.filter((b) => !b.paid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paidBills = bills.filter((b) => b.paid).sort((a, b) => (b.paidAt || "").localeCompare(a.paidAt || ""));
  // Remaining balance owed, not the original bill amount -- a bill that's
  // been partially paid down should count only what's actually still left.
  const unpaidTotal = unpaidBills.reduce((s, b) => s + (Number(b.amount) - Number(b.paidAmount || 0)), 0);
  const editingBill = editingBillId ? bills.find((b) => b.id === editingBillId) : null;

  const renderItem = useCallback(({ item: l }) => (
    <LoanRow
      l={l}
      theme={theme}
      accounts={accounts}
      ctx={ctx}
      payingId={payingId}
      paymentAmount={payingId === l.id ? paymentAmount : ""}
      paymentAccount={payingId === l.id ? (paymentAccount || l.account) : null}
      setPayingId={setPayingId}
      setPaymentAmount={setPaymentAmount}
      setPaymentAccount={setPaymentAccount}
      toggleSettled={toggleSettled}
      startEdit={startEdit}
      remove={remove}
      recordPayment={recordPayment}
    />
  ), [theme, accounts, ctx, payingId, paymentAmount, paymentAccount, toggleSettled, startEdit, remove, recordPayment]);

  return (
    <>
    <FlatList
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 12 }}
      data={filtered}
      keyExtractor={(l) => l.id}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={7}
      removeClippedSubviews={Platform.OS === "android"}
      ListEmptyComponent={
        <EmptyState icon={HandCoins} text={statusView === "active" ? `No ${typeView === "lent" ? "lent" : "borrowed"} entries yet.` : "Nothing settled yet."} />
      }
      ListHeaderComponent={
        <>
          <View style={styles.headerRow}>
            <Text style={[styles.h1, { color: theme.text }]}>Borrow tracker</Text>
            <Pressable onPress={startAdd} style={[styles.roundBtn, { backgroundColor: theme.accentDark }]} accessibilityLabel={showForm ? "Close form" : "Add loan entry"}>
              {showForm ? <X size={16} color="#fff" /> : <Plus size={16} color="#fff" />}
            </Pressable>
          </View>

          <View style={styles.typeToggle}>
            <Pressable onPress={() => setTypeView("lent")} style={[styles.typeBtn, { backgroundColor: typeView === "lent" ? ACCENT.leaf : theme.card, borderColor: theme.line }]} accessibilityRole="tab" accessibilityState={{ selected: typeView === "lent" }}>
              <ArrowDownLeft size={14} color={typeView === "lent" ? "#fff" : theme.textMuted} />
              <Text style={[styles.typeBtnText, { color: typeView === "lent" ? "#fff" : theme.text }]}>Owed to me</Text>
            </Pressable>
            <Pressable onPress={() => setTypeView("borrowed")} style={[styles.typeBtn, { backgroundColor: typeView === "borrowed" ? ACCENT.ember : theme.card, borderColor: theme.line }]} accessibilityRole="tab" accessibilityState={{ selected: typeView === "borrowed" }}>
              <ArrowUpRight size={14} color={typeView === "borrowed" ? "#fff" : theme.textMuted} />
              <Text style={[styles.typeBtnText, { color: typeView === "borrowed" ? "#fff" : theme.text }]}>I borrowed</Text>
            </Pressable>
          </View>

          <View style={[styles.heroCard, { backgroundColor: theme.accentDark }]}>
            <Text style={[styles.heroLabel, { color: ACCENT.gold }]}>
              {typeView === "lent" ? "Total owed to you" : "Total you owe"}
            </Text>
            <Text style={styles.heroValue}>{peso(activeTotal)}</Text>
            <Text style={styles.heroSub}>across active, unsettled entries (includes interest)</Text>
            <View style={styles.heroDivider} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              {typeView === "lent" ? <TrendingUp size={13} color={ACCENT.leaf} /> : <TrendingDown size={13} color={ACCENT.ember} />}
              <Text style={styles.heroFootnote}>
                {typeView === "lent"
                  ? `Interest earned so far: ${peso(interestEarned)}`
                  : `Interest paid so far: ${peso(interestPaid)}`}
              </Text>
            </View>
          </View>

          <SegmentedTabs
            options={[
              { key: "active", label: "Active" },
              { key: "done", label: `Settled (${loans.filter((l) => l.type === typeView && l.settled).length})` },
            ]}
            value={statusView}
            onChange={setStatusView}
          />

          {/* Bills -- moved here from Budget Overview. Given its own
              bordered card (not just a divider line) so it reads as a
              clearly separate section from the loan tracker above,
              rather than blending into the same continuous list. */}
          <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
            <View style={styles.sectionCardHeader}>
              <Receipt size={16} color={ACCENT.gold} />
              <Text style={[styles.h1, { color: theme.text, fontSize: 16 }]}>Bills</Text>
            </View>

            <View style={styles.chipRow}>
              <Chip label={`Unpaid (${unpaidBills.length})`} active={billStatusView === "unpaid"} onPress={() => setBillStatusView("unpaid")} small />
              <Chip label={`Paid (${paidBills.length})`} active={billStatusView === "paid"} onPress={() => setBillStatusView("paid")} small />
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => { setEditingBillId(null); setShowBillForm((s) => !s); }} style={[styles.roundBtn, { backgroundColor: theme.accentDark, width: 28, height: 28 }]} accessibilityLabel={showBillForm ? "Close bill form" : "Add bill"}>
                {showBillForm ? <X size={13} color="#fff" /> : <Plus size={13} color="#fff" />}
              </Pressable>
            </View>

            {billStatusView === "unpaid" && unpaidTotal > 0 && (
              <Text style={[styles.hintText, { color: theme.textMuted }]}>You need <Text style={{ color: ACCENT.ember, fontWeight: "700" }}>{peso(unpaidTotal)}</Text> ready for unpaid bills.</Text>
            )}

            {showBillForm && <BillForm splits={splits} accounts={accounts} initial={editingBill} onSave={saveBill} onCancel={() => { setShowBillForm(false); setEditingBillId(null); }} />}

            {(billStatusView === "unpaid" ? unpaidBills : paidBills).length === 0 ? (
              <EmptyState icon={Receipt} text={billStatusView === "unpaid" ? "No bills tracked yet." : "No paid bills yet."} />
            ) : (
              (billStatusView === "unpaid" ? unpaidBills : paidBills).map((b) => {
                const dleft = daysUntil(b.dueDate);
                const split = splits.find((s) => s.id === b.splitId);
                const account = accounts.find((a) => a.id === b.account);
                const paidSoFar = Number(b.paidAmount || 0);
                const remaining = Number(b.amount) - paidSoFar;
                const isPartial = !b.paid && paidSoFar > 0.005;
                const tags = [];
                if (!b.paid && dleft < 0) tags.push({ key: "overdue", label: `${Math.abs(dleft)}d overdue`, color: ACCENT.ember });
                if (split) tags.push({ key: "split", label: split.label, color: split.color });
                if (account) tags.push({ key: "account", label: account.label, color: account.color });
                if (b.recurring) tags.push({ key: "recurring", label: b.recurring === "monthly" ? "Monthly" : "Weekly", color: ACCENT.plum });
                return (
                  <Reanimated.View key={b.id} layout={ReanimatedLayout.duration(DURATION)} exiting={FadeOut.duration(DURATION * 0.75)}>
                  <View style={[styles.row, { flexDirection: "column", alignItems: "stretch", backgroundColor: theme.bg, borderColor: theme.line, borderWidth: 1, opacity: b.paid ? 0.6 : 1 }]}>
                    {/* Header: icon, name + amount (one line, never
                        wraps), edit/delete -- kept clean and predictable
                        so the action buttons always land in the same
                        place no matter how many tags a bill has. */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                      <Pressable onPress={() => togglePaid(b)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={b.paid ? "Mark unpaid" : "Mark paid in full"}>{b.paid ? <CheckCircle2 size={19} color={ACCENT.leaf} /> : <PiggyBank size={19} color={ACCENT.gold} />}</Pressable>
                      <Pressable style={{ flex: 1 }} onPress={() => !b.paid && startEditBill(b)}>
                        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>{b.name}</Text>
                        <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
                          {b.paid
                            ? `${peso(b.amount)} - paid ${fmtDay(b.paidAt)}`
                            : isPartial
                            ? `${peso(remaining)} left of ${peso(b.amount)}`
                            : `${peso(b.amount)}${dleft === 0 ? " - due today" : dleft > 0 ? ` - in ${dleft}d` : ""}`}
                        </Text>
                      </Pressable>
                      {!b.paid && b.notificationId && <Bell size={11} color={theme.textMuted} />}
                      {!b.paid && <Pressable onPress={() => startEditBill(b)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Edit bill"><Pencil size={14} color={theme.textMuted} /></Pressable>}
                      <Pressable onPress={() => removeBill(b.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Delete bill"><Trash2 size={14} color={theme.textMuted} /></Pressable>
                    </View>

                    {/* Tags: free to wrap onto their own line(s) below,
                        indented to sit under the title rather than the
                        icon -- wrapping here never pushes the header
                        row's buttons out of place. */}
                    {tags.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, marginLeft: 29 }}>
                        {tags.map((tag) => (
                          <View key={tag.key} style={[styles.tag, { backgroundColor: tag.color + "22" }]}>
                            <Text style={[styles.tagText, { color: tag.color }]}>{tag.label}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    {isPartial && (
                      <View style={[styles.progressTrack, { backgroundColor: theme.card, marginTop: 8, marginLeft: 29 }]}>
                        <View style={[styles.progressFill, { width: `${Math.min(100, (paidSoFar / Number(b.amount)) * 100)}%`, backgroundColor: ACCENT.leaf }]} />
                      </View>
                    )}

                    {!b.paid && (
                      <Pressable onPress={() => { setPayingBillId((id) => (id === b.id ? null : b.id)); setPayAmount(""); }} style={{ marginLeft: 29, marginTop: 8 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Pay part of this bill">
                        <Text style={{ fontSize: 10, fontWeight: "700", color: ACCENT.sky }}>Pay part of this bill</Text>
                      </Pressable>
                    )}
                  </View>
                  {payingBillId === b.id && (
                    <View style={[styles.partialPayRow, { backgroundColor: theme.bg, borderColor: theme.line, borderWidth: 1 }]}>
                      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Pay toward "{b.name}" -- {peso(remaining)} left</Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <TextInput
                          value={payAmount}
                          onChangeText={(v) => setPayAmount(v.replace(/[^0-9.]/g, ""))}
                          placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={theme.textMuted}
                          style={[styles.customInput, { backgroundColor: theme.card, color: theme.text }]}
                          autoFocus
                        />
                        <Pressable onPress={() => payPartial(b, payAmount)} style={[styles.customConfirm, { backgroundColor: ACCENT.leaf }]} accessibilityLabel="Confirm partial payment">
                          <Check size={14} color="#fff" />
                        </Pressable>
                      </View>
                      <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
                        <Chip label={`Pay full (${peso(remaining)})`} small color={ACCENT.gold} onPress={() => payPartial(b, String(remaining))} />
                        <Chip label="Cancel" small onPress={() => { setPayingBillId(null); setPayAmount(""); }} />
                      </View>
                    </View>
                  )}
                  </Reanimated.View>
                );
              })
            )}
          </View>
        </>
      }
      renderItem={renderItem}
    />

    {/* Editing a loan entry now opens its own popped-up, blurred sheet --
        same long-press-to-edit pattern as Todo and Spending -- instead of
        an inline form and a separate pencil button on the row. */}
    <EditSheet
      visible={showForm}
      title={editingLoan ? "Edit entry" : "Add loan entry"}
      onClose={() => { setShowForm(false); setEditingId(null); }}
    >
      <LoanForm
        key={editingId || typeView}
        initial={editingLoan}
        type={typeView}
        ctx={ctx}
        accounts={accounts}
        onSave={saveLoan}
        onCancel={() => { setShowForm(false); setEditingId(null); }}
        onDelete={remove}
      />
    </EditSheet>
    </>
  );
}

// Extracted and memoized (same pattern as TodoScreen's TodoRow) so editing
// the add/edit form, typing a payment amount, or toggling one entry doesn't
// force every other row in the list to re-render.
const LoanRow = React.memo(function LoanRow({ l, theme, accounts, ctx, payingId, paymentAmount, paymentAccount, setPayingId, setPaymentAmount, setPaymentAccount, toggleSettled, startEdit, remove, recordPayment }) {
  const dleft = l.dueDate ? daysUntil(l.dueDate) : null;
  const due = loanTotalDue(l);
  const paid = loanTotalPaid(l);
  const remaining = Math.max(0, due - paid);
  const hasPartialPayments = !l.settled && paid > 0;
  const overdue = !l.settled && dleft !== null && dleft < 0;
  const dueSoon = !l.settled && dleft !== null && dleft >= 0 && dleft <= 2;
  const account = accounts.find((a) => a.id === l.account);
  // A border only appears when it's actually signaling something
  // (overdue/due-soon) -- otherwise the card relies on its own background
  // tone, same as Todo and Spending rows.
  const borderColor = overdue ? ACCENT.ember : dueSoon ? ACCENT.gold : "transparent";
  // Paying back money you borrowed takes it OUT of whichever account you
  // pay with; receiving payment for money you lent puts it INTO whichever
  // account you receive it in -- opposite directions, same "which account"
  // question either way.
  const payAmt = Number(paymentAmount) || 0;
  const resultingBalance = paymentAccount != null
    ? computeAccountBalance(paymentAccount, ctx) + (l.type === "lent" ? payAmt : -payAmt)
    : null;
  const { style: pressStyle, pressIn, pressOut, handleLongPress } = useCardPressAnimation(() => !l.settled && startEdit(l));

  const content = (
    <Reanimated.View layout={ReanimatedLayout.duration(DURATION)} exiting={FadeOut.duration(DURATION * 0.75)} style={[styles.row, { backgroundColor: theme.card, borderColor, borderWidth: overdue || dueSoon ? 1.5 : 0, opacity: l.settled ? 0.6 : 1 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => toggleSettled(l)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={l.settled ? "Mark unsettled" : "Mark settled"}>
          {l.settled ? <CheckCircle2 size={20} color={ACCENT.leaf} /> : <Circle size={20} color={theme.textMuted} />}
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: theme.text, textDecorationLine: l.settled ? "line-through" : "none" }]}>{l.person}</Text>
          {l.note ? <Text style={[styles.noteText, { color: theme.textMuted }]}>{l.note}</Text> : null}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            <Text style={[styles.metaText, { color: theme.textMuted }]}>Principal {peso(l.principal)}</Text>
            {Number(l.interestPercent) > 0 && <Text style={[styles.metaText, { color: ACCENT.gold }]}>+{l.interestPercent}% interest</Text>}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" }}>
            <Text style={[styles.totalDueText, { color: theme.text }]}>
              {hasPartialPayments ? `${peso(remaining)} left of ${peso(due)}` : `Total: ${peso(due)}`}
            </Text>
            {l.dueDate && overdue ? (
              <View style={[styles.tag, { backgroundColor: ACCENT.ember + "22" }]}>
                <Text style={[styles.tagText, { color: ACCENT.ember }]}>{Math.abs(dleft)}d overdue</Text>
              </View>
            ) : l.dueDate ? (
              <Text style={[styles.metaText, { color: dueSoon ? ACCENT.gold : theme.textMuted }]}>
                {l.settled ? `settled ${fmtDay(l.settledAt)}` : dleft === 0 ? "due today" : `due in ${dleft}d`}
              </Text>
            ) : null}
            {account && <View style={[styles.tag, { backgroundColor: account.color + "22" }]}><Text style={[styles.tagText, { color: account.color }]}>{account.label}</Text></View>}
          </View>
          {hasPartialPayments && (
            <View style={[styles.progressTrack, { backgroundColor: theme.bg }]}>
              <View style={[styles.progressFill, { width: `${Math.min(100, (paid / due) * 100)}%`, backgroundColor: ACCENT.leaf }]} />
            </View>
          )}
        </View>
        {/* Editing and deleting no longer have their own buttons here --
            long-press the card to open the edit sheet, which has its own
            Delete action. Recording a payment stays a direct tap since
            it's a distinct, frequent action, not an editing one. */}
        {!l.settled && (
          <Pressable onPress={() => { setPayingId(payingId === l.id ? null : l.id); setPaymentAmount(""); setPaymentAccount(l.account); }} style={{ marginRight: 4 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Record a payment">
            <Wallet size={15} color={ACCENT.leaf} />
          </Pressable>
        )}
      </View>

      {payingId === l.id && (
        <View style={{ marginTop: 10 }}>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{l.type === "lent" ? "Receive into" : "Pay using"}</Text>
          <View style={styles.chipWrap}>
            {accounts.map((a) => (
              <Chip key={a.id} label={a.label} color={a.color} active={paymentAccount === a.id} onPress={() => setPaymentAccount(a.id)} small />
            ))}
          </View>
          <View style={styles.paymentRow}>
            <TextInput
              value={paymentAmount}
              onChangeText={(v) => setPaymentAmount(v.replace(/[^0-9.]/g, ""))}
              placeholder={`up to ${peso(remaining)}`}
              placeholderTextColor={theme.textMuted}
              keyboardType="decimal-pad"
              autoFocus
              style={[styles.paymentInput, { backgroundColor: theme.bg, color: theme.text }]}
            />
            <Pressable onPress={() => recordPayment(l, paymentAccount)} disabled={!isPositiveAmount(paymentAmount)} style={[styles.paymentConfirm, { backgroundColor: ACCENT.leaf, opacity: isPositiveAmount(paymentAmount) ? 1 : 0.5 }]} accessibilityLabel="Confirm payment">
              <Check size={14} color="#fff" />
            </Pressable>
          </View>
          {isPositiveAmount(paymentAmount) && resultingBalance != null && (
            <Text style={[styles.metaText, { color: theme.textMuted, marginTop: 6 }]}>
              {peso(resultingBalance)} this will be your balance
            </Text>
          )}
        </View>
      )}

      {hasPartialPayments && (l.payments || []).length > 0 && (
        <Text style={[styles.paymentHistoryText, { color: theme.textMuted }]}>
          {l.payments.length} payment{l.payments.length === 1 ? "" : "s"} logged - last {peso(l.payments[l.payments.length - 1].amount)} on {fmtDay(l.payments[l.payments.length - 1].date)}
        </Text>
      )}
    </Reanimated.View>
  );

  if (l.settled) return content;

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={350} onPressIn={pressIn} onPressOut={pressOut} accessibilityLabel={`"${l.person}" entry`} accessibilityHint="Long press to edit">
      <Reanimated.View style={pressStyle}>{content}</Reanimated.View>
    </Pressable>
  );
});

function BillForm({ initial, onSave, onCancel, splits, accounts }) {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name || "");
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [dueDate, setDueDate] = useState(initial?.dueDate || todayISO());
  const [splitId, setSplitId] = useState(initial?.splitId || splits[0]?.id);
  const [account, setAccount] = useState(initial?.account || accounts[0].id);
  const [recurring, setRecurring] = useState(initial?.recurring || null);
  const [errors, setErrors] = useState({});

  function attemptSave() {
    const { ok, data, errors: fieldErrors } = validate(billSchema, { name, amount, dueDate, splitId, account, recurring });
    setErrors(fieldErrors);
    if (ok) onSave(data);
  }

  return (
    <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.line }]}>
      <TextInput value={name} onChangeText={setName} placeholder="e.g. Parcel COD, rent, load" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text }]} />
      {errors.name && <Text style={styles.fieldError}>{errors.name}</Text>}
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
        <TextInput value={amount} onChangeText={(v) => setAmount(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
        {errors.amount && <Text style={styles.fieldError}>{errors.amount}</Text>}
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={dueDate} onChange={setDueDate} label="Needed by" /></View>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Repeats</Text>
      <View style={styles.chipWrap}>
        <Chip label="One-time" color={ACCENT.teal} active={!recurring} onPress={() => setRecurring(null)} small />
        <Chip label="Weekly" color={ACCENT.sky} active={recurring === "weekly"} onPress={() => setRecurring("weekly")} small />
        <Chip label="Monthly" color={ACCENT.plum} active={recurring === "monthly"} onPress={() => setRecurring("monthly")} small />
      </View>
      {!!recurring && (
        <Text style={[styles.hintText, { color: theme.textMuted, marginBottom: 4 }]}>
          A new {recurring} bill for the same amount will be added automatically once this one's fully paid.
        </Text>
      )}
      <View style={styles.formActions}>
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel"><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable onPress={attemptSave} style={[styles.formBtn, { backgroundColor: ACCENT.gold }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Add bill"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function LoanForm({ initial, type, ctx, accounts, onSave, onCancel, onDelete }) {
  const { theme } = useTheme();
  const [person, setPerson] = useState(initial?.person || "");
  const [note, setNote] = useState(initial?.note || "");
  const [principal, setPrincipal] = useState(initial?.principal != null ? String(initial.principal) : "");
  const [interestPercent, setInterestPercent] = useState(initial?.interestPercent != null ? String(initial.interestPercent) : "0");
  // Most loans between friends/family don't carry interest, so the field
  // stays tucked away behind a small "+ Add interest" toggle instead of
  // always taking up half the Principal row -- it only opens by default
  // when editing an entry that already has interest set.
  const [showInterest, setShowInterest] = useState(!!(initial?.interestPercent && Number(initial.interestPercent) > 0));
  const [dueDate, setDueDate] = useState(initial?.dueDate || todayISO());
  const [account, setAccount] = useState(initial?.account || accounts[0]?.id);
  const [errors, setErrors] = useState({});
  const accountBalance = computeAccountBalance(account, ctx);
  const principalNum = Number(principal) || 0;
  const exceedsBalance = type === "lent" && !initial && principalNum > accountBalance;

  function attemptSave() {
    const { ok, data, errors: fieldErrors } = validate(loanSchema, { person, note, principal, interestPercent, dueDate, account });
    if (exceedsBalance) fieldErrors.principal = `This is more than your current balance (${peso(accountBalance)}).`;
    setErrors(fieldErrors);
    if (ok && !exceedsBalance) onSave({ ...data, dueDate: data.dueDate || null });
  }

  return (
    <View style={styles.formCardBare}>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{type === "lent" ? "Who borrowed from you" : "Who you borrowed from"}</Text>
      <TextInput value={person} onChangeText={setPerson} placeholder="Name" placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, backgroundColor: theme.bg }]} />
      {errors.person && <Text style={styles.fieldError}>{errors.person}</Text>}
      <TextInput value={note} onChangeText={setNote} placeholder='Note, e.g. "for hospital bill" (optional)' placeholderTextColor={theme.textMuted} style={[styles.input, { color: theme.text, backgroundColor: theme.bg }]} />
      <View style={{ flexDirection: "row", gap: 8, marginBottom: showInterest ? 6 : 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Principal (P)</Text>
          <TextInput value={principal} onChangeText={(v) => setPrincipal(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
          {errors.principal && <Text style={styles.fieldError}>{errors.principal}</Text>}
        </View>
        {showInterest && (
          <View style={{ flex: 1 }}>
            <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Interest (%)</Text>
            <TextInput value={interestPercent} onChangeText={(v) => setInterestPercent(v.replace(/[^0-9.]/g, ""))} placeholder="0" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
          </View>
        )}
      </View>
      <Pressable
        onPress={() => { if (showInterest) setInterestPercent("0"); setShowInterest((s) => !s); }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        style={{ marginBottom: 12 }}
      >
        <Text style={{ fontSize: 11, fontWeight: "700", color: showInterest ? theme.textMuted : ACCENT.sky }}>
          {showInterest ? "Remove interest" : "+ Add interest (optional)"}
        </Text>
      </Pressable>
      <Text style={[styles.miniLabel, { color: theme.textMuted }]}>{type === "lent" ? "Take money from" : "Add money to"}</Text>
      <View style={styles.chipWrap}>
        {accounts.map((a) => <Chip key={a.id} label={a.label} color={a.color} active={account === a.id} onPress={() => setAccount(a.id)} small />)}
      </View>
      <View style={{ marginBottom: 12 }}><CalendarPicker value={dueDate} onChange={setDueDate} label="Due date" /></View>

      {principal ? (
        <View style={[styles.previewBox, { backgroundColor: theme.bg }]}>
          <Text style={[styles.previewText, { color: theme.textMuted }]}>Total due: <Text style={{ color: theme.text, fontWeight: "700" }}>{peso(principalNum * (1 + (Number(interestPercent) || 0) / 100))}</Text></Text>
          {!initial && (
            <>
              <Text style={[styles.previewText, { color: theme.textMuted }]}>
                {type === "lent" ? `Will deduct ${peso(principalNum)} from` : `Will add ${peso(principalNum)} to`} {accounts.find((a) => a.id === account)?.label} now
              </Text>
              <Text style={[styles.previewText, { color: theme.textMuted }]}>
                {peso(accountBalance + (type === "lent" ? -principalNum : principalNum))} this will be your balance
              </Text>
            </>
          )}
        </View>
      ) : null}

      <View style={styles.formActions}>
        {initial && onDelete && (
          <Pressable onPress={() => onDelete(initial)} style={[styles.formBtn, styles.formBtnDanger, { borderColor: ACCENT.ember }]} accessibilityLabel="Delete entry">
            <Trash2 size={14} color={ACCENT.ember} />
            <Text style={[styles.formBtnText, { color: ACCENT.ember }]}>Delete</Text>
          </Pressable>
        )}
        {initial && <Pressable onPress={onCancel} style={[styles.formBtn, { backgroundColor: theme.bg }]} accessibilityLabel="Cancel"><Text style={[styles.formBtnText, { color: theme.text }]}>Cancel</Text></Pressable>}
        <Pressable onPress={attemptSave} style={[styles.formBtn, { backgroundColor: ACCENT.gold }]}>
          <Text style={[styles.formBtnText, { color: "#fff" }]}>{initial ? "Save changes" : "Add entry"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  h1: { fontSize: 20, fontWeight: "700" },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  typeToggle: { flexDirection: "row", gap: 8, marginBottom: 12 },
  typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  typeBtnText: { fontSize: 11, fontWeight: "700" },
  heroCard: { borderRadius: 20, padding: 16, marginBottom: 16 },
  heroLabel: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  heroValue: { fontSize: 26, fontWeight: "800", color: "#fff", fontFamily: "monospace", marginTop: 4 },
  heroSub: { fontSize: 10, color: "#ffffff99", marginTop: 2 },
  heroDivider: { height: 1, backgroundColor: "#ffffff22", marginVertical: 10 },
  heroFootnote: { fontSize: 10, color: "#ffffffcc", fontWeight: "600" },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  formCardBare: { paddingTop: 2, paddingBottom: 4 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  amountInput: { fontSize: 13, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace" },
  miniLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  previewBox: { borderRadius: 12, padding: 10, marginBottom: 10, gap: 2 },
  previewText: { fontSize: 11 },
  warnRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 10 },
  warnText: { fontSize: 10, color: ACCENT.ember, flex: 1, lineHeight: 14 },
  fieldError: { color: ACCENT.ember, fontSize: 10.5, marginTop: -6, marginBottom: 8, fontWeight: "600" },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnDanger: { flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, backgroundColor: "transparent" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  row: { borderRadius: 16, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 13, fontWeight: "600" },
  noteText: { fontSize: 10, fontStyle: "italic", marginTop: 1 },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  totalDueText: { fontSize: 11, fontWeight: "700" },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  paymentRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  paymentInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontFamily: "monospace", fontSize: 13 },
  paymentConfirm: { width: 34, height: 34, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  paymentHistoryText: { fontSize: 9, marginTop: 6, fontStyle: "italic" },
  sectionCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 20 },
  sectionCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  hintText: { fontSize: 11, marginBottom: 8 },
  partialPayRow: { borderRadius: 14, padding: 12, marginTop: -4, marginBottom: 8 },
  customInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace", fontSize: 13 },
  customConfirm: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
