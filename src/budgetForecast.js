import { nextRecurringDate } from "./utils";
import { shiftDate } from "./planner";

const money = (value) => Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
const round = (n) => Math.round(n * 100) / 100;
export function budgetForecast({ balance = 0, bills = [], recurringIncome = [], today, days = 30, plannedSavings = 0 }) {
  const horizon = shiftDate(today, Math.max(1, Math.min(90, Math.floor(Number(days) || 30))) - 1);
  const payments = []; const income = [];
  for (const b of bills.filter((b) => !b.paid && b.dueDate)) {
    let date = b.dueDate;
    for (let i = 0; i < 366 && date <= horizon; i++) {
      if (i === 0 || date >= today) payments.push({ id: `${b.id}:${date}`, date: date < today ? today : date, label: b.name || "Bill", amount: i === 0 ? Math.max(0, money(b.amount) - money(b.paidAmount)) : money(b.amount) });
      const next = nextRecurringDate(date, b.recurring);
      if (next <= date) break;
      date = next;
    }
  }
  for (const r of recurringIncome.filter((r) => r.nextDate && r.enabled !== false)) {
    let date = r.nextDate;
    for (let i = 0; i < 366 && date <= horizon; i++) {
      if (date >= today) income.push({ id: `${r.id}:${date}`, date, label: r.label || "Scheduled income", amount: money(r.amount) });
      const next = nextRecurringDate(date, r.frequency);
      if (next <= date) break;
      date = next;
    }
  }
  const expectedIncome = round(income.reduce((s, i) => s + i.amount, 0));
  const expectedBills = round(payments.reduce((s, i) => s + i.amount, 0));
  const reserve = money(plannedSavings);
  const opening = Number.isFinite(Number(balance)) ? Number(balance) : 0;
  let running = opening - reserve; let lowest = running; let shortfallDate = running < 0 ? today : null;
  const events = [...payments.map((i) => ({ ...i, change: -i.amount })), ...income.map((i) => ({ ...i, change: i.amount }))]
    .sort((a, b) => a.date.localeCompare(b.date) || b.change - a.change);
  for (const event of events) {
    running += event.change;
    lowest = Math.min(lowest, running);
    if (running < 0 && !shortfallDate) shortfallDate = event.date;
  }
  return { horizon, expectedIncome, expectedBills, plannedSavings: reserve, projectedBalance: round(opening + expectedIncome - expectedBills - reserve), lowestBalance: round(lowest), shortfallDate, payments, income };
}
