export const peso = (n) =>
  "\u20B1" + (Number(n) || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });

export const uid = () => Math.random().toString(36).slice(2, 10);
export const isPositiveAmount = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

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

// Savings unearmarked toward any specific goal -- what's actually free to
// assign when creating a new goal or topping one up.
export function unallocatedSavings(savingsLog) {
  return savingsLog
    .filter((x) => !x.goalId)
    .reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
}

// --- Savings goals ---

export function goalCurrentAmount(goalId, savingsLog) {
  return savingsLog
    .filter((x) => x.goalId === goalId)
    .reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
}

// Approximate months between today and a target date (min 0), used for the
// "recommended per month" figure -- doesn't need calendar-exact precision,
// just a reasonable planning estimate.
export function monthsUntil(dateStr) {
  if (!dateStr) return 0;
  const days = daysUntil(dateStr);
  return Math.max(0, days / 30.44);
}

export function goalProgress(goal, savingsLog) {
  const current = goalCurrentAmount(goal.id, savingsLog);
  const target = Number(goal.targetAmount) || 0;
  const remaining = Math.max(0, target - current);
  const percent = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const monthsLeft = monthsUntil(goal.targetDate);
  // Goal met, or no target date set -- nothing meaningful to recommend.
  const recommendedMonthly = remaining <= 0 ? 0 : monthsLeft < 1 ? remaining : remaining / monthsLeft;
  return { current, target, remaining, percent, monthsLeft, recommendedMonthly };
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

// --- Daily Budget Review ---
//
// Turns the selected budget model (splits) into a daily guideline +
// recommendation instead of a strict rule. "Available money" is derived
// from the user's actual account balances (not monthly income / 30), so it
// adapts to irregular income, bills, and one-off purchases rather than
// enforcing a fixed daily allowance. Everything here reads from the app's
// existing income/expense/savings/account data -- no separate/duplicated
// balance.

// Classifies a split by what its label suggests, so the review can apply
// Needs/Wants/Savings-specific behavior to presets AND arbitrary custom
// models (e.g. an added "Other" category just falls back to a plain spend
// category with no special cross-category logic).
export function splitKind(split) {
  const label = (split.label || "").toLowerCase();
  if (label.includes("saving")) return "savings";
  if (label.includes("need")) return "needs";
  if (label.includes("want")) return "wants";
  return "spend";
}

export function computeDailyBudgetReview({ splits, accounts, moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers }) {
  const ctx = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };
  const currentBalance = accounts.reduce((s, a) => s + computeAccountBalance(a.id, ctx), 0);
  const today = todayISO();
  const todaysExpenses = expenses.filter((e) => e.date === today);
  const todaysSavings = savingsLog.filter((s) => s.date === today);
  const spentToday = todaysExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const savedToday = todaysSavings.reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
  // "Available money" is the pool this guideline measures against -- the
  // balance as of the start of today (current balance with today's own
  // spending/saving added back), so leftover money from previous days still
  // counts, but today's own actions don't shrink the recommendation they're
  // being measured against. This is what makes it a same-day picture like
  // the spec describes (e.g. 500 available, 320 spent, 180 remaining)
  // rather than a shrinking, circular target.
  const availableMoney = currentBalance + spentToday + savedToday;

  const categories = splits.map((split) => {
    const kind = splitKind(split);
    const recommended = availableMoney * split.percent / 100;
    if (kind === "savings") {
      // Savings is never "spent" -- kept on its own ledger with its own
      // language (saved / remaining to save), never mixed with expenses.
      return { ...split, kind, isSavings: true, recommended, actual: savedToday, remaining: recommended - savedToday };
    }
    const actual = todaysExpenses.filter((e) => e.splitId === split.id).reduce((s, e) => s + Number(e.amount), 0);
    return { ...split, kind, isSavings: false, recommended, actual, remaining: recommended - actual };
  });

  const needs = categories.find((c) => c.kind === "needs");
  const wants = categories.find((c) => c.kind === "wants");
  const savings = categories.find((c) => c.isSavings);

  // Needs and Wants draw from the same real pool of money. Whatever Needs
  // is currently under OR over its recommendation should reduce what's
  // actually safe to spend on Wants -- otherwise the user could spend money
  // that's really still needed for necessities. This is a recommendation,
  // not a restriction: the user can still spend beyond it if they choose.
  let wantsSafeToSpend = null;
  let wantsReserveNote = null;
  if (needs && wants) {
    const reserve = Math.abs(needs.remaining);
    wantsSafeToSpend = Math.max(0, wants.remaining - reserve);
    if (reserve > 0.5 && wants.remaining > 0) {
      wantsReserveNote = needs.remaining >= 0
        ? `${peso(reserve)} is recommended to remain reserved for Needs.`
        : `${peso(reserve)} is being reserved because your Needs budget is currently short.`;
    }
  }

  return {
    availableMoney, spentToday, savedToday,
    remainingToday: availableMoney - spentToday,
    categories, needs, wants, savings,
    wantsSafeToSpend, wantsReserveNote,
    hasIncome: availableMoney > 0 || moneyLog.length > 0,
    hasSpending: todaysExpenses.length > 0,
  };
}

// A short, neutral status line per category -- guidance, never a pass/fail
// grade ("On track" / "above today's recommendation", not "good"/"failed").
export function categoryStatusText(cat) {
  if (cat.isSavings) {
    if (cat.remaining <= 0) return "Today's savings allocation is fully accounted for.";
    return `${peso(cat.remaining)} available for today's savings allocation.`;
  }
  if (cat.remaining < -0.5) return `${cat.label} is ${peso(Math.abs(cat.remaining))} above today's recommendation.`;
  if (cat.recommended > 0 && cat.remaining / cat.recommended <= 0.15) return `${cat.label} budget is almost used up for today.`;
  return `${cat.label} is on track today.`;
}

// Copy for the end-of-day local notification. Kept separate from the
// review screen's body text because a local notification's content is
// fixed at schedule time -- the app re-derives and reschedules this
// whenever the underlying financial data changes (see notifications.js),
// so it stays reasonably current without needing a live background task.
export function dailyBudgetNotificationContent(review) {
  if (!review.hasIncome) {
    return { title: "🌙 Daily budget review", body: "No available budget for today's review yet." };
  }
  if (review.needs && review.needs.remaining < -0.5) {
    return { title: "⚠️ Daily budget review", body: "Your Needs budget is almost exhausted." };
  }
  if (review.wants && review.wants.remaining < -0.5) {
    return { title: "⚠️ Budget review", body: "Your Wants spending is above today's recommended amount." };
  }
  if (review.savings && review.savings.remaining > 0.5) {
    return { title: "💰 Savings opportunity", body: `You have ${peso(review.savings.remaining)} available that could be added to savings today.` };
  }
  return { title: "🌙 Daily budget review", body: `You have ${peso(Math.max(0, review.remainingToday))} remaining today.` };
}

// --- Shared UI helpers ---

// Every destructive delete across the app should use this exact pattern
// (title, message, Cancel/Delete-destructive) -- the same one School's
// subject delete already used, now the standard everywhere instead of only
// there. Native Alert.alert requires RN's Alert module, passed in by the
// caller (kept out of utils.js's own imports to keep this a pure module).
export function confirmDelete(Alert, title, message, onConfirm) {
  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
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
