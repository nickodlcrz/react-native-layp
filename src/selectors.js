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
import { SPENDING_LABELS, PALETTE } from "./theme";

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

// A colour for a spending label consistent across calls: matches one of
// the curated SPENDING_LABELS colours by name when possible (case-
// insensitive, since a hand-typed custom label like "Groceries" won't
// exactly match "Food"), otherwise cycles through the general palette so
// two different custom labels still render as visually distinct slices.
function colorForSpendingLabel(label, fallbackIndex) {
  const known = SPENDING_LABELS.find((l) => l.label.toLowerCase() === label.toLowerCase());
  if (known) return known.color;
  return PALETTE[fallbackIndex % PALETTE.length];
}

// Breaks this month's expenses down by their free-text `label` field
// (Food, Transportation, a hand-typed custom label, etc.) rather than by
// budget split -- categoryBreakdown above answers "which slice of my
// income paid for this", this answers "what was it actually for". Expenses
// with no label at all are grouped under "Uncategorized" rather than
// silently dropped, since otherwise a month with a lot of unlabeled
// spending would look smaller than it really was.
export function spendingByLabel(expenses, refDate = new Date()) {
  const inMonth = expenses.filter((e) => isInMonth(e.date, refDate));
  const byLabel = inMonth.reduce((result, e) => {
    const label = (e.label || "").trim() || "Uncategorized";
    result[label] = (result[label] || 0) + Number(e.amount);
    return result;
  }, {});
  return Object.entries(byLabel)
    .map(([label, amount], i) => ({ id: label, label, amount, color: label === "Uncategorized" ? "#9AA0A6" : colorForSpendingLabel(label, i) }))
    .filter((entry) => entry.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

// Surfaces past expenses worth logging again with one tap instead of
// retyping the name and amount every time -- "memory" in the sense of
// remembering what you tend to spend on, not a separate stored list of its
// own. Groups by name alone (case-insensitive) rather than name + exact
// amount, so "Jeepney fare" at P15 one day and P18 the next is still
// recognized as the same thing worth remembering. A name only has to be
// logged ONCE to show up here from then on (previously required 2+
// repeats, which meant the very first time you typed something it was
// never saved for next time -- exactly the "I have to type it over and
// over again" complaint this fixes). Bill-sourced expenses are excluded
// since those already have their own pay-bill flow.
export function frequentExpenseTemplates(expenses, limit = 8) {
  const groups = new Map();
  for (const e of expenses) {
    if (e.source === "bill" || !e.name) continue;
    const key = e.name.trim().toLowerCase();
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      // Keep whichever occurrence was logged most recently as the
      // template, in case the amount/split/account/label used for it has
      // since shifted (e.g. the user switched which account covers coffee
      // runs, or the fare went up).
      if ((e.createdAt || 0) >= existing.lastUsed) {
        existing.lastUsed = e.createdAt || 0;
        existing.template = e;
      }
    } else {
      groups.set(key, { count: 1, lastUsed: e.createdAt || 0, template: e });
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.lastUsed - a.lastUsed || b.count - a.count)
    .slice(0, limit)
    .map((g) => g.template);
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
