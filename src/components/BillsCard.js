import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { Plus, X, CheckCircle2, Trash2, Check, Receipt, PiggyBank, Pencil, Bell } from "lucide-react-native";
import { useTheme, ACCENT } from "../theme";
import { peso, uid, todayISO, daysUntil, fmtDay, computeAccountBalance, isPositiveAmount, nextRecurringDate } from "../utils";
import Chip from "./Chip";
import EmptyState from "./EmptyState";
import CalendarPicker from "./CalendarPicker";
import { validate, billSchema } from "../validation";
import { cancelTodoNotifications, rescheduleBillNotification } from "../notifications";
import { confirmDelete } from "./ConfirmModal";
import { DURATION } from "../animation";
import { hapticSuccess } from "../haptics";
import Reanimated, { FadeOut, Layout as ReanimatedLayout } from "react-native-reanimated";
import { showAppDialog } from "./AppDialog";

// The Bills card -- unpaid/paid bills, adding/editing, full and partial
// payment, recurring bills, and their reminder notifications. Lives at the
// bottom of the Spending screen (it used to be part of the Borrow tab).
// Paying a bill logs an expense (source: "bill"), which is why it needs
// setExpenses and the same balance ctx the rest of Spending uses.
export default function BillsCard({ bills = [], setBills, setExpenses, accounts, splits = [], ctx }) {
  const { theme } = useTheme();
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBillId, setEditingBillId] = useState(null);
  const [payingBillId, setPayingBillId] = useState(null);
  const [payAmount, setPayAmount] = useState("");
  const [billStatusView, setBillStatusView] = useState("unpaid");

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
        showAppDialog("Not enough money", `This bill needs ${peso(remaining)} more, but the selected account has ${peso(available)} available.`);
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
      showAppDialog("Invalid amount", `Enter an amount up to ${peso(remaining)} -- that's what's left on this bill.`);
      return;
    }
    const available = computeAccountBalance(bill.account, ctx);
    if (amt > available) {
      showAppDialog("Not enough money", `This payment needs ${peso(amt)}, but the selected account has ${peso(available)} available.`);
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

  return (
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
  );
}

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

const styles = StyleSheet.create({
  h1: { fontSize: 20, fontWeight: "700" },
  roundBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  formCard: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  input: { fontSize: 13, fontWeight: "500", marginBottom: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  amountInput: { fontSize: 13, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace" },
  miniLabel: { fontSize: 9, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12, gap: 6 },
  fieldError: { color: ACCENT.ember, fontSize: 10.5, marginTop: -6, marginBottom: 8, fontWeight: "600" },
  formActions: { flexDirection: "row", gap: 8 },
  formBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: "center" },
  formBtnText: { fontSize: 12, fontWeight: "700" },
  row: { borderRadius: 16, padding: 12, marginBottom: 8 },
  rowTitle: { fontSize: 13, fontWeight: "600" },
  metaText: { fontSize: 10, fontFamily: "monospace" },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 9, fontWeight: "700" },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2 },
  // Bottom-of-screen card: a little air above so it doesn't butt up against
  // the activity list right above it.
  sectionCard: { borderWidth: 1, borderRadius: 18, padding: 14, marginTop: 8, marginBottom: 16 },
  sectionCardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" },
  hintText: { fontSize: 11, marginBottom: 8 },
  partialPayRow: { borderRadius: 14, padding: 12, marginTop: -4, marginBottom: 8 },
  customInput: { flex: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontFamily: "monospace", fontSize: 13 },
  customConfirm: { width: 36, height: 36, borderRadius: 12, alignItems: "center", justifyContent: "center" },
});
