export const peso = (n) =>
  "\u20B1" + (Number(n) || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });

export const uid = () => Math.random().toString(36).slice(2, 10);

// IMPORTANT: never use Date.toISOString() for calendar dates. It converts to
// UTC, which silently shifts the date backward for any timezone ahead of UTC
// (e.g. Philippines, UTC+8) -- local midnight becomes 4pm the *previous* day
// in UTC. This formats using the device's local calendar fields instead.
export function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export const todayISO = () => toLocalISO(new Date());
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

export function daysUntil(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d - now) / 86400000);
}
export function fmtDay(dateStr) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
export function fmtDateLong(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
export function fmtTime12(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
export function getWeekDates(anchor) {
  const d = new Date(anchor);
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(sunday);
    dt.setDate(sunday.getDate() + i);
    return toLocalISO(dt);
  });
}

// Rebalances all other splits proportionally so the total always stays 100.
export function normalizeSplits(splits, changedIdx, newVal) {
  newVal = clamp(Math.round(newVal), 0, 100);
  const old = splits[changedIdx].percent;
  const delta = newVal - old;
  const others = splits.filter((_, i) => i !== changedIdx);
  const othersTotal = others.reduce((s, x) => s + x.percent, 0);
  let updated = splits.map((s, i) => {
    if (i === changedIdx) return { ...s, percent: newVal };
    if (othersTotal <= 0) return s;
    const share = s.percent / othersTotal;
    return { ...s, percent: clamp(Math.round(s.percent - delta * share), 0, 100) };
  });
  const total = updated.reduce((s, x) => s + x.percent, 0);
  const diff = 100 - total;
  if (diff !== 0) {
    const targetIdx = updated.findIndex((s, i) => i !== changedIdx);
    if (targetIdx >= 0) updated[targetIdx].percent = clamp(updated[targetIdx].percent + diff, 0, 100);
  }
  return updated;
}

export function removeSplitAndRedistribute(splits, id) {
  if (splits.length <= 1) return splits;
  const removing = splits.find((s) => s.id === id);
  const rest = splits.filter((s) => s.id !== id);
  const restTotal = rest.reduce((s, x) => s + x.percent, 0);
  let updated;
  if (restTotal <= 0) {
    const even = Math.floor(100 / rest.length);
    updated = rest.map((s, i) => ({ ...s, percent: i === rest.length - 1 ? 100 - even * (rest.length - 1) : even }));
  } else {
    updated = rest.map((s) => ({ ...s, percent: Math.round(s.percent + removing.percent * (s.percent / restTotal)) }));
  }
  const total = updated.reduce((s, x) => s + x.percent, 0);
  const diff = 100 - total;
  if (diff !== 0) updated[0].percent = clamp(updated[0].percent + diff, 0, 100);
  return updated;
}

// --- Borrow tracker math, shared across Budget/Spending/Borrow screens ---

export function loanInterest(loan) {
  return (Number(loan.principal) || 0) * (Number(loan.interestPercent) || 0) / 100;
}
export function loanTotalDue(loan) {
  return Number(loan.principal) + loanInterest(loan);
}

// Net effect a single loan has had on an account's cash balance *right now*,
// given its current settled/unsettled state. Modeled as two discrete
// moments rather than a running ledger:
//   lent, unsettled:     -principal        (cash currently out)
//   lent, settled:       +interest         (principal came back, net gain is the interest)
//   borrowed, unsettled: +principal        (cash currently in hand)
//   borrowed, settled:   -interest         (principal was returned, net cost is the interest)
export function loanNetAdjustment(loan) {
  const interest = loanInterest(loan);
  if (loan.type === "lent") return loan.settled ? interest : -Number(loan.principal);
  if (loan.type === "borrowed") return loan.settled ? -interest : Number(loan.principal);
  return 0;
}

// Savings transfer math: money moved into savings leaves the account it
// came from; money withdrawn back out returns to whichever account it's
// sent to. Kept as its own log (deposit/withdraw entries) rather than
// folded into moneyLog/expenses, so savings stays visibly separate from
// day-to-day income and spending.
export function savingsTotal(savingsLog) {
  return savingsLog.reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
}

// Single source of truth for "how much is actually in this account right
// now", combining money added, regular spending, rolled-up weekly spending,
// the live effect of any lending/borrowing tied to that account, any
// savings transfers in/out of that account, and any transfers to/from
// other accounts.
export function computeAccountBalance(accountId, { moneyLog = [], expenses = [], weeklySummaries = [], loans = [], savingsLog = [], transfers = [] } = {}) {
  const in_ = moneyLog.filter((m) => m.account === accountId).reduce((s, m) => s + Number(m.amount), 0);
  const out = expenses.filter((e) => e.account === accountId).reduce((s, e) => s + Number(e.amount), 0);
  const outRolled = weeklySummaries.reduce((s, w) => s + (w.byAccount?.[accountId] || 0), 0);
  const loanAdj = loans.filter((l) => l.account === accountId).reduce((s, l) => s + loanNetAdjustment(l), 0);
  const savingsAdj = savingsLog
    .filter((s) => s.account === accountId)
    .reduce((sum, s) => sum + (s.type === "withdraw" ? Number(s.amount) : -Number(s.amount)), 0);
  const transferAdj = transfers.reduce((sum, t) => {
    if (t.toAccount === accountId) return sum + Number(t.amount);
    if (t.fromAccount === accountId) return sum - Number(t.amount);
    return sum;
  }, 0);
  return in_ - out - outRolled + loanAdj + savingsAdj + transferAdj;
}

// --- Account management, mirroring how budget splits work ---

export function addAccount(accounts, palette) {
  const color = palette[accounts.length % palette.length];
  return [...accounts, { id: uid(), label: "New account", color }];
}

// Removing an account doesn't touch historical records tagged with its id
// (they just display with a fallback label) -- only blocked if it's the
// last remaining account, since the app always needs somewhere for money
// to live.
export function removeAccount(accounts, id) {
  if (accounts.length <= 1) return accounts;
  return accounts.filter((a) => a.id !== id);
}
