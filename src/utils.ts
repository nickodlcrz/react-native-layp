import * as Crypto from "expo-crypto";
import type {
  Split, Account, Expense, MoneyLogEntry, SavingsLogEntry, Loan,
  Transfer, FinancialContext, DailyBudgetReview, ReviewCategory, Goal,
} from "./types";

export const peso = (n: number | string): string =>
  "\u20B1" + (Number(n) || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 });

// Was Math.random().toString(36).slice(2, 10) -- a 6-character base-36
// string has only ~2 billion possible values and Math.random() isn't
// cryptographically random to begin with, so collisions were a real (if
// rare) risk as records accumulate. randomUUID() gives a proper 122-bit
// random ID with negligible collision odds -- worth it here since these
// IDs are used for financial records (expenses, bills, transfers) where
// two records silently sharing an ID could corrupt totals or overwrite
// each other. expo-crypto works the same on iOS/Android/web, unlike relying
// on a global crypto.randomUUID() that may or may not be polyfilled by the
// JS engine.
export const uid = (): string => Crypto.randomUUID();
export const isPositiveAmount = (value: unknown): boolean => Number.isFinite(Number(value)) && Number(value) > 0;

// IMPORTANT: never use Date.toISOString() for calendar dates. It converts to
// UTC, which silently shifts the date backward for any timezone ahead of UTC
// (e.g. Philippines, UTC+8) -- local midnight becomes 4pm the *previous* day
// in UTC. This formats using the device's local calendar fields instead.
export function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export const todayISO = (): string => toLocalISO(new Date());
export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export function daysUntil(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

// Advances a due date for a recurring bill -- "weekly" just adds 7 days,
// "monthly" moves to the same day-of-month next month. Monthly uses
// setDate/setMonth rather than naive day-arithmetic so a Jan 31 bill lands
// on Feb 28 (or 29) instead of overflowing into March; JS's Date normalizes
// an out-of-range day-of-month for you when you set the month first.
export function nextRecurringDate(dateStr: string, frequency?: "weekly" | "monthly" | null): string {
  const d = new Date(dateStr + "T00:00:00");
  if (frequency === "weekly") {
    d.setDate(d.getDate() + 7);
  } else if (frequency === "monthly") {
    const day = d.getDate();
    d.setDate(1); // avoid skipping a month when the target month is shorter
    d.setMonth(d.getMonth() + 1);
    const daysInTargetMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, daysInTargetMonth));
  } else {
    return dateStr;
  }
  return toLocalISO(d);
}
export function fmtDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}
// "Sep 9" for the current year, "Dec 30, 2025" once the year has actually
// changed -- the year is implied the rest of the time, so spelling it out
// on every single row (fmtDateLong) is just repeated noise.
export function fmtDaySmart(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const isCurrentYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("en-PH", isCurrentYear ? { month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}
export function fmtDateLong(dateStr?: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}
export function fmtTime12(hhmm?: string | null): string {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
export function getWeekDates(anchor: string | Date): string[] {
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
export function normalizeSplits(splits: Split[], changedIdx: number, newVal: number): Split[] {
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

export function removeSplitAndRedistribute(splits: Split[], id: string): Split[] {
  if (splits.length <= 1) return splits;
  const removing = splits.find((s) => s.id === id);
  const rest = splits.filter((s) => s.id !== id);
  const restTotal = rest.reduce((s, x) => s + x.percent, 0);
  let updated: Split[];
  if (restTotal <= 0) {
    const even = Math.floor(100 / rest.length);
    updated = rest.map((s, i) => ({ ...s, percent: i === rest.length - 1 ? 100 - even * (rest.length - 1) : even }));
  } else {
    updated = rest.map((s) => ({ ...s, percent: Math.round(s.percent + (removing?.percent ?? 0) * (s.percent / restTotal)) }));
  }
  const total = updated.reduce((s, x) => s + x.percent, 0);
  const diff = 100 - total;
  if (diff !== 0) updated[0].percent = clamp(updated[0].percent + diff, 0, 100);
  return updated;
}

// --- Borrow tracker math, shared across Budget/Spending/Borrow screens ---

export function loanInterest(loan: Loan): number {
  return (Number(loan.principal) || 0) * (Number(loan.interestPercent) || 0) / 100;
}
export function loanTotalDue(loan: Loan): number {
  return Number(loan.principal) + loanInterest(loan);
}

// How much has actually been paid back against this loan so far. A loan
// marked "settled" is treated as fully resolved regardless of exactly what
// was logged as payments -- settling is the stronger, final signal (covers
// informal write-offs of small remainders, and every loan created before
// partial payments existed, which has no `payments` array at all). While
// still unsettled, it's the running total of whatever's been explicitly
// recorded.
export function loanTotalPaid(loan: Loan): number {
  if (loan.settled) return loanTotalDue(loan);
  return (loan.payments || []).reduce((s, p) => s + Number(p.amount), 0);
}

// Net effect a single loan has had on an account's cash balance *right
// now*, driven by actual payments made rather than a single all-or-nothing
// moment:
//   lent:      paid-so-far minus principal (starts at -principal, rises
//              toward +interest as repayments come in)
//   borrowed:  principal minus paid-so-far (starts at +principal, falls
//              toward -interest as it's paid off)
// This lines up exactly with the old binary settled/unsettled math at both
// endpoints (paid=0, or paid=full total due), so existing loans -- settled
// or not, with no payment history at all -- carry the same balance impact
// they always did.
export function loanNetAdjustment(loan: Loan): number {
  const paid = loanTotalPaid(loan);
  if (loan.type === "lent") return paid - Number(loan.principal);
  if (loan.type === "borrowed") return Number(loan.principal) - paid;
  return 0;
}

// A payment can now optionally record which account it was actually paid
// through/into (payment.account) -- e.g. money borrowed into GoTyme but
// paid back with Cash. loanNetAdjustment above assumes every payment
// happened through the loan's own account, which is exactly right for
// every loan created before this feature (and still the default when a
// payment doesn't specify one); this generalizes it to spread each
// payment's effect across whichever account it actually used, while
// keeping the loan's *own* account's principal effect (the money that
// moved when the loan was first created) separate from that.
function effectivePayments(loan: Loan) {
  const recorded = loan.payments || [];
  const recordedTotal = recorded.reduce((s, p) => s + Number(p.amount), 0);
  const totalDue = loanTotalDue(loan);
  if (loan.settled && recordedTotal < totalDue - 0.005) {
    // Settled with less explicitly logged than the full amount due --
    // either an old-style settle from before partial payments existed (no
    // `payments` array at all), or a remainder that was written off/paid
    // informally without logging a payment for it. Synthesize the gap as
    // one more payment through the loan's own account, which reproduces
    // loanNetAdjustment's historical single-account math exactly for that
    // case (see the test suite for the worked-out numbers).
    return [...recorded, { amount: totalDue - recordedTotal, account: loan.account }];
  }
  return recorded;
}

// This loan's effect on one specific account -- the principal itself
// (money that moved when the loan was created) only counts against
// `loan.account`; each payment counts against whichever account it
// specifies (falling back to `loan.account` when it doesn't, which is
// every payment recorded before this feature existed). Summed across every
// account a loan touches, this always adds up to the same total change in
// net worth loanNetAdjustment would give for the loan's own account alone
// -- this just distributes *where* that change actually landed instead of
// assuming it was all in one place.
export function loanAccountEffect(loan: Loan, accountId: string): number {
  let total = 0;
  if (loan.account === accountId) {
    total += loan.type === "lent" ? -Number(loan.principal) : loan.type === "borrowed" ? Number(loan.principal) : 0;
  }
  for (const p of effectivePayments(loan)) {
    const acc = p.account || loan.account;
    if (acc !== accountId) continue;
    total += loan.type === "lent" ? Number(p.amount) : loan.type === "borrowed" ? -Number(p.amount) : 0;
  }
  return total;
}

// Savings transfer math: money moved into savings leaves the account it
// came from; money withdrawn back out returns to whichever account it's
// sent to. Kept as its own log (deposit/withdraw entries) rather than
// folded into moneyLog/expenses, so savings stays visibly separate from
// day-to-day income and spending.
export function savingsTotal(savingsLog: SavingsLogEntry[]): number {
  return savingsLog.reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
}

// Savings unearmarked toward any specific goal -- what's actually free to
// assign when creating a new goal or topping one up.
export function unallocatedSavings(savingsLog: SavingsLogEntry[]): number {
  return savingsLog
    .filter((x) => !x.goalId)
    .reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
}

// --- Savings accounts (specific interest-bearing destinations, e.g. a
// GoTyme or Maribank savings pocket) ---
//
// Before this, "savings" was one undifferentiated pool -- there was no way
// to say "this ₱3,000 is specifically sitting in GoTyme, earning its own
// interest" versus "this ₱2,000 is in Maribank". A savingsLog entry can
// now optionally carry a `savingsAccountId` tying it to one specific named
// savings account instead. Entries with no savingsAccountId (everything
// recorded before this feature existed, or a deposit someone deliberately
// leaves unassigned) still count toward the overall total via
// savingsTotal above -- they just don't show up under any one account.

function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// This savings account's own balance -- deposits/withdrawals tagged to it,
// plus any interest it's actually been credited so far.
export function savingsAccountBalance(savingsAccountId: string, savingsLog: SavingsLogEntry[], interestLog: any[] = []): number {
  const principal = savingsLog
    .filter((x) => x.savingsAccountId === savingsAccountId)
    .reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
  const interest = interestLog
    .filter((x) => x.savingsAccountId === savingsAccountId)
    .reduce((s, x) => s + Number(x.amount), 0);
  return principal + interest;
}

// Total interest a savings account has actually earned to date -- shown
// next to its balance so the interest rate feels like it's doing
// something, not just a number sitting in a settings field.
export function savingsAccountInterestEarned(savingsAccountId: string, interestLog: any[] = []): number {
  return interestLog
    .filter((x) => x.savingsAccountId === savingsAccountId)
    .reduce((s, x) => s + Number(x.amount), 0);
}

// Works out how many days' worth of daily interest a savings account has
// missed since it last accrued, and returns ONE lump interestLog entry
// covering all of them at once (using the account's *current* balance as
// the base for every one of those days). That's an approximation -- the
// real balance may have moved day to day if money was added or withdrawn
// in between -- but a reasonable one for a personal tracker that isn't
// trying to replicate a bank's own ledger, and it means opening the app
// after a few days away still credits everything that was missed instead
// of only "today". Returns null when there's nothing to accrue (no rate
// set, a zero/negative balance, or it's already been credited today).
export function accrueSavingsAccountInterest(
  account: { id: string; interestRate?: number; lastAccrualDate?: string },
  savingsLog: SavingsLogEntry[],
  interestLog: any[],
  today: string
): { id: string; savingsAccountId: string; amount: number; date: string; days: number } | null {
  const rate = Number(account.interestRate) || 0;
  if (rate <= 0) return null;
  const balance = savingsAccountBalance(account.id, savingsLog, interestLog);
  if (balance <= 0) return null;

  const priorEntries = interestLog.filter((x) => x.savingsAccountId === account.id);
  const mostRecent = priorEntries.reduce((latest: string | null, x) => (!latest || x.date > latest ? x.date : latest), null);
  const lastDate = mostRecent || account.lastAccrualDate || null;
  const days = lastDate ? daysBetween(lastDate, today) : 1;
  if (days <= 0) return null;

  const dailyRate = rate / 100 / 365;
  const amount = Math.round(balance * dailyRate * days * 100) / 100;
  if (amount <= 0) return null;

  return { id: uid(), savingsAccountId: account.id, amount, date: today, days };
}

// Total interest a regular budget account has earned to date -- mirrors
// savingsAccountInterestEarned above, just reading from moneyLog's
// "interest" category instead of a separate interest log, since interest
// on a *budget* account is meant to show up as ordinary income (see
// accrueAccountInterest below).
export function accountInterestEarned(accountId: string, moneyLog: MoneyLogEntry[] = []): number {
  return moneyLog
    .filter((m) => m.account === accountId && m.category === "interest")
    .reduce((s, m) => s + Number(m.amount), 0);
}

// Same daily-catch-up mechanic as accrueSavingsAccountInterest, but for a
// regular budget account (e.g. a Maribank account used for everyday
// spending that still earns interest on whatever's sitting in it, without
// the money ever being moved into a separate savings account). Returns a
// plain moneyLog-shaped entry (category "interest") rather than a
// separate interestLog entry -- that's what makes it show up in the
// account's normal income total instead of needing its own display
// wiring. Returns null when there's nothing to accrue (no rate set, a
// zero/negative balance, or it's already been credited today).
export function accrueAccountInterest(
  account: { id: string; interestRate?: number; lastAccrualDate?: string },
  ctx: Partial<FinancialContext>,
  moneyLog: MoneyLogEntry[],
  today: string
): { id: string; account: string; amount: number; category: string; note: string; date: string; days: number; createdAt: number } | null {
  const rate = Number(account.interestRate) || 0;
  if (rate <= 0) return null;
  const balance = computeAccountBalance(account.id, { ...ctx, moneyLog });
  if (balance <= 0) return null;

  const priorEntries = moneyLog.filter((m) => m.account === account.id && m.category === "interest");
  const mostRecent = priorEntries.reduce((latest: string | null, m: any) => (!latest || m.date > latest ? m.date : latest), null);
  const lastDate = mostRecent || account.lastAccrualDate || null;
  const days = lastDate ? daysBetween(lastDate, today) : 1;
  if (days <= 0) return null;

  const dailyRate = rate / 100 / 365;
  const amount = Math.round(balance * dailyRate * days * 100) / 100;
  if (amount <= 0) return null;

  return { id: uid(), account: account.id, amount, category: "interest", note: "Interest earned", date: today, days, createdAt: Date.now() };
}

// --- Savings goals ---

export function goalCurrentAmount(goalId: string, savingsLog: SavingsLogEntry[]): number {
  return savingsLog
    .filter((x) => x.goalId === goalId)
    .reduce((s, x) => s + (x.type === "withdraw" ? -Number(x.amount) : Number(x.amount)), 0);
}

// Approximate months between today and a target date (min 0), used for the
// "recommended per month" figure -- doesn't need calendar-exact precision,
// just a reasonable planning estimate.
export function monthsUntil(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const days = daysUntil(dateStr);
  return Math.max(0, days / 30.44);
}

export function goalProgress(goal: Goal, savingsLog: SavingsLogEntry[]) {
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
export function computeAccountBalance(accountId: string, ctx: Partial<FinancialContext> = {}): number {
  const { moneyLog = [], expenses = [], weeklySummaries = [], loans = [], savingsLog = [], transfers = [] } = ctx;
  const in_ = moneyLog.filter((m) => m.account === accountId).reduce((s, m) => s + Number(m.amount), 0);
  const out = expenses.filter((e) => e.account === accountId).reduce((s, e) => s + Number(e.amount), 0);
  const outRolled = weeklySummaries.reduce((s, w) => s + (w.byAccount?.[accountId] || 0), 0);
  const loanAdj = loans.reduce((s, l) => s + loanAccountEffect(l, accountId), 0);
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
export function splitKind(split: Pick<Split, "label">): "savings" | "needs" | "wants" | "spend" {
  const label = (split.label || "").toLowerCase();
  if (label.includes("saving")) return "savings";
  if (label.includes("need")) return "needs";
  if (label.includes("want")) return "wants";
  return "spend";
}

interface DailyBudgetReviewInput {
  splits: Split[];
  accounts: Account[];
  moneyLog: MoneyLogEntry[];
  expenses: Expense[];
  weeklySummaries?: FinancialContext["weeklySummaries"];
  loans: Loan[];
  savingsLog: SavingsLogEntry[];
  transfers: Transfer[];
}

export function computeDailyBudgetReview({ splits, accounts, moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers }: DailyBudgetReviewInput): DailyBudgetReview {
  const ctx: FinancialContext = { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers };
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

  const categories: ReviewCategory[] = splits.map((split) => {
    const kind = splitKind(split);
    const recommended = availableMoney * split.percent / 100;
    if (kind === "savings") {
      // Savings is never "spent" -- kept on its own ledger with its own
      // language (saved / remaining to save), never mixed with expenses.
      const remaining = recommended - savedToday;
      // "remaining" is a target computed off the start-of-day pool, so on a
      // day where everything has already been spent it can still be a large
      // positive number even though there's no real money left to move.
      // maxSafeToSave is the amount that can actually be saved right now
      // without pushing the real account balance negative -- never more
      // than what's still sitting in the accounts.
      const maxSafeToSave = Math.max(0, Math.min(remaining, currentBalance));
      return { ...split, kind, isSavings: true, recommended, actual: savedToday, remaining, maxSafeToSave };
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
  let wantsSafeToSpend: number | null = null;
  let wantsReserveNote: string | null = null;
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
    availableMoney, spentToday, savedToday, currentBalance,
    remainingToday: availableMoney - spentToday,
    categories, needs, wants, savings,
    wantsSafeToSpend, wantsReserveNote,
    hasIncome: availableMoney > 0 || moneyLog.length > 0,
    hasSpending: todaysExpenses.length > 0,
  };
}

// A short, neutral status line per category -- guidance, never a pass/fail
// grade ("On track" / "above today's recommendation", not "good"/"failed").
export function categoryStatusText(cat: ReviewCategory): string {
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
export function dailyBudgetNotificationContent(review: DailyBudgetReview): { title: string; body: string } {
  if (!review.hasIncome) {
    return { title: "\ud83c\udf19 Daily budget review", body: "No available budget for today's review yet." };
  }
  if (review.needs && review.needs.remaining < -0.5) {
    return { title: "\u26a0\ufe0f Daily budget review", body: "Your Needs budget is almost exhausted." };
  }
  if (review.wants && review.wants.remaining < -0.5) {
    return { title: "\u26a0\ufe0f Budget review", body: "Your Wants spending is above today's recommended amount." };
  }
  if (review.savings && review.savings.remaining > 0.5) {
    return { title: "\ud83d\udcb0 Savings opportunity", body: `You have ${peso(review.savings.remaining)} available that could be added to savings today.` };
  }
  return { title: "\ud83c\udf19 Daily budget review", body: `You have ${peso(Math.max(0, review.remainingToday))} remaining today.` };
}

// --- Shared UI helpers ---
//
// Destructive confirmations (delete, replace-data, etc.) go through
// src/components/ConfirmModal.js's confirmDelete/confirmAction instead of
// RN's Alert.alert -- that dialog can't be restyled at all (always renders
// as the bare platform AlertDialog), so a themed in-app modal replaced it
// everywhere. See that file for the actual implementation.

// --- Account management, mirroring how budget splits work ---

export function addAccount(accounts: Account[], palette: string[]): Account[] {
  const color = palette[accounts.length % palette.length];
  return [...accounts, { id: uid(), label: "New account", color, interestRate: 0 }];
}

// Removing an account doesn't touch historical records tagged with its id
// (they just display with a fallback label) -- only blocked if it's the
// last remaining account, since the app always needs somewhere for money
// to live.
export function removeAccount(accounts: Account[], id: string): Account[] {
  if (accounts.length <= 1) return accounts;
  return accounts.filter((a) => a.id !== id);
}

// Same idea as addAccount/removeAccount above, for the separate list of
// named *savings* accounts (GoTyme, Maribank, etc.) -- these aren't
// blocked from going to zero, since "no savings accounts" is a perfectly
// normal state (everything just sits in the one undifferentiated savings
// pool, same as before this feature existed).
export function addSavingsAccount(savingsAccounts: any[], palette: string[]): any[] {
  const color = palette[savingsAccounts.length % palette.length];
  return [...savingsAccounts, { id: uid(), name: "New savings account", color, interestRate: 0 }];
}
export function removeSavingsAccount(savingsAccounts: any[], id: string): any[] {
  return savingsAccounts.filter((a) => a.id !== id);
}
