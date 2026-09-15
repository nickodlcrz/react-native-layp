import React, { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, FlatList, StyleSheet, Platform } from "react-native";
import { Plus, X, CheckCircle2, Circle, Trash2, ArrowDownLeft, ArrowUpRight, AlertTriangle, TrendingUp, TrendingDown, Wallet, Check, HandCoins } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { peso, uid, todayISO, daysUntil, fmtDay, loanInterest, loanTotalDue, loanTotalPaid, computeAccountBalance, isPositiveAmount } from "../utils";
import Chip from "../components/Chip";
import SegmentedTabs from "../components/SegmentedTabs";
import EmptyState from "../components/EmptyState";
import CalendarPicker from "../components/CalendarPicker";
import { validate, loanSchema } from "../validation";
import { rescheduleLoanNotification, cancelTodoNotifications } from "../notifications";
import { confirmDelete } from "../components/ConfirmModal";
import EditSheet from "../components/EditSheet";
import { useCardPressAnimation } from "../animation";
import Reanimated from "react-native-reanimated";

export default function BorrowScreen({ loans, setLoans, moneyLog, expenses, weeklySummaries, savingsLog = [], accounts, transfers = [] }) {
  const { theme } = useTheme();
  const [typeView, setTypeView] = useState("lent"); // "lent" = money others owe me, "borrowed" = money I owe others
  const [statusView, setStatusView] = useState("active");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [payingId, setPayingId] = useState(null); // loan currently showing its inline "record payment" input
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentAccount, setPaymentAccount] = useState(null); // which account the payment was made/received through -- defaults to the loan's own account when the row opens

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
    <View style={[styles.row, { backgroundColor: theme.card, borderColor, borderWidth: overdue || dueSoon ? 1.5 : 0, opacity: l.settled ? 0.6 : 1 }]}>
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
    </View>
  );

  if (l.settled) return content;

  return (
    <Pressable onLongPress={handleLongPress} delayLongPress={350} onPressIn={pressIn} onPressOut={pressOut} accessibilityLabel={`"${l.person}" entry`} accessibilityHint="Long press to edit">
      <Reanimated.View style={pressStyle}>{content}</Reanimated.View>
    </Pressable>
  );
});

function LoanForm({ initial, type, ctx, accounts, onSave, onCancel, onDelete }) {
  const { theme } = useTheme();
  const [person, setPerson] = useState(initial?.person || "");
  const [note, setNote] = useState(initial?.note || "");
  const [principal, setPrincipal] = useState(initial?.principal != null ? String(initial.principal) : "");
  const [interestPercent, setInterestPercent] = useState(initial?.interestPercent != null ? String(initial.interestPercent) : "0");
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
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Principal (P)</Text>
          <TextInput value={principal} onChangeText={(v) => setPrincipal(v.replace(/[^0-9.]/g, ""))} placeholder="0.00" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
          {errors.principal && <Text style={styles.fieldError}>{errors.principal}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.miniLabel, { color: theme.textMuted }]}>Interest (%)</Text>
          <TextInput value={interestPercent} onChangeText={(v) => setInterestPercent(v.replace(/[^0-9.]/g, ""))} placeholder="0" keyboardType="decimal-pad" style={[styles.amountInput, { backgroundColor: theme.bg, color: theme.text }]} />
        </View>
      </View>
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
});
