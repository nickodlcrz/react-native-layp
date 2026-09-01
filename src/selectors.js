// --- Selectors ---
//
// Pure, side-effect-free functions that turn the raw stored records
// (accounts, moneyLog, expenses, loans, ...) into the derived numbers
// screens actually display (net worth, safe-to-spend, monthly totals).
// Keeping these here instead of inline in a screen component means:
//   - they're unit-testable without rendering anything
//   - a screen can't accidentally compute the same number two different ways
//   - reusing a number (e.g. netWorth) in a second screen is one import,
//     not a copy-pasted block of `.reduce()` calls
//
// Everything here reads from the same ctx shape used throughout the app:
// { moneyLog, expenses, weeklySummaries, loans, savingsLog, transfers }

import { computeAccountBalance, savingsTotal, loanTotalDue } from "./utils";

export function totalBalance(accounts, ctx) {
  return accounts.reduce((sum, a) => sum + computeAccountBalance(a.id, ctx), 0);
}

export function owedToMe(loans) {
  return loans.filter((l) => l.type === "lent" && !l.settled).reduce((s, l) => s + loanTotalDue(l), 0);
}

export function iOwe(loans) {
  return loans.filter((l) => l.type === "borrowed" && !l.settled).reduce((s, l) => s + loanTotalDue(l), 0);
}

// Cash across all accounts + everything in savings + what's owed to the
// user - what the user owes. This is the one true net worth calculation;
// every screen that shows a net worth figure should call this instead of
// re-deriving it.
export function netWorth(accounts, loans, savingsLog, ctx) {
  return totalBalance(accounts, ctx) + savingsTotal(savingsLog) + owedToMe(loans) - iOwe(loans);
}

export function unpaidBillsTotal(bills) {
  return bills.filter((b) => !b.paid).reduce((s, b) => s + Number(b.amount), 0);
}

// What's left to spend once every unpaid bill is accounted for. Never
// negative -- if bills exceed the balance, there's nothing "safe" left.
export function safeToSpend(accounts, bills, ctx) {
  return Math.max(0, totalBalance(accounts, ctx) - unpaidBillsTotal(bills));
}

function isInMonth(dateStr, refDate) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getMonth() === refDate.getMonth() && d.getFullYear() === refDate.getFullYear();
}

// Income received, money spent, and net amount saved/withdrawn for the
// calendar month containing `refDate` (defaults to now). Used by the Home
// dashboard's monthly summary card.
export function monthlySummary({ moneyLog, expenses, savingsLog }, refDate = new Date()) {
  const income = moneyLog.filter((m) => isInMonth(m.date, refDate)).reduce((s, m) => s + Number(m.amount), 0);
  const spent = expenses.filter((e) => isInMonth(e.date, refDate)).reduce((s, e) => s + Number(e.amount), 0);
  const saved = savingsLog
    .filter((s) => isInMonth(s.date, refDate))
    .reduce((sum, s) => sum + (s.type === "withdraw" ? -Number(s.amount) : Number(s.amount)), 0);
  return { income, spent, saved };
}

// Per-account balance after reserving money for that account's unpaid
// bills, for accounts that actually have bills reserved against them.
export function billCoverageByAccount(accounts, bills, ctx) {
  const unpaidBills = bills.filter((b) => !b.paid);
  return accounts
    .map((account) => {
      const reserved = unpaidBills.filter((bill) => bill.account === account.id).reduce((sum, bill) => sum + Number(bill.amount), 0);
      const balance = computeAccountBalance(account.id, ctx);
      return { ...account, reserved, balance, remaining: balance - reserved };
    })
    .filter((account) => account.reserved > 0);
}

// This calendar month's spending broken down by split/category, largest
// first -- the data behind the Activity tab's pie chart (and previously
// duplicated inline in SpendingScreen's analytics footer).
export function categoryBreakdown(expenses, splits, refDate = new Date()) {
  const inMonth = expenses.filter((e) => isInMonth(e.date, refDate));
  const bySplit = inMonth.reduce((result, e) => {
    result[e.splitId] = (result[e.splitId] || 0) + Number(e.amount);
    return result;
  }, {});
  return splits
    .map((split) => ({ ...split, amount: bySplit[split.id] || 0 }))
    .filter((split) => split.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

// Income vs. expenses totals for each of the last `months` calendar months
// (oldest first), for the Activity tab's bar chart.
export function monthlyTrend({ moneyLog, expenses }, months = 6, refDate = new Date()) {
  const out = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
    const income = moneyLog.filter((m) => isInMonth(m.date, d)).reduce((s, m) => s + Number(m.amount), 0);
    const spent = expenses.filter((e) => isInMonth(e.date, d)).reduce((s, e) => s + Number(e.amount), 0);
    out.push({ label: d.toLocaleDateString("en-PH", { month: "short" }), income, spent });
  }
  return out;
}
