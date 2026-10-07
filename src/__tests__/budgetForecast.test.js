import { budgetForecast } from "../budgetForecast";
const input = { today: "2026-10-07", balance: 1000, days: 7 };
test("projects partial unpaid bills, scheduled income and additional savings without posting transactions", () => {
  const bills = [{ id: "b", amount: 600, paidAmount: 200, dueDate: "2026-10-08" }, { id: "paid", amount: 900, dueDate: "2026-10-08", paid: true }];
  const result = budgetForecast({ ...input, bills, recurringIncome: [{ id: "i", amount: 500, nextDate: "2026-10-10", frequency: "weekly" }], plannedSavings: 100 });
  expect(result).toMatchObject({ expectedBills: 400, expectedIncome: 500, projectedBalance: 1000, lowestBalance: 500, horizon: "2026-10-13" });
  expect(bills[0].paidAmount).toBe(200);
});
test("detects a shortfall before payday even when the final balance is positive", () => {
  const r = budgetForecast({ ...input, bills: [{ id: "b", amount: 1200, dueDate: "2026-10-08" }], recurringIncome: [{ id: "i", amount: 1000, nextDate: "2026-10-10" }] });
  expect(r.projectedBalance).toBe(800);
  expect(r.shortfallDate).toBe("2026-10-08");
  expect(r.lowestBalance).toBe(-200);
});
test("includes one overdue bill and future recurrence without inventing missed past bills", () => {
  const r = budgetForecast({ ...input, bills: [{ id: "b", amount: 100, dueDate: "2026-09-16", recurring: "weekly" }] });
  expect(r.expectedBills).toBe(200);
  expect(r.payments.map((p) => p.date)).toEqual(["2026-10-07", "2026-10-07"]);
});
test("clips monthly recurrence at February's end and excludes outside-horizon income", () => {
  const r = budgetForecast({ today: "2026-01-31", days: 30, bills: [{ id: "b", amount: 100, dueDate: "2026-01-31", recurring: "monthly" }], recurringIncome: [{ id: "i", amount: 1000, nextDate: "2026-03-02" }] });
  expect(r.expectedBills).toBe(200);
  expect(r.expectedIncome).toBe(0);
});
test("invalid amounts cannot turn the projection into NaN", () => {
  expect(budgetForecast({ ...input, plannedSavings: "oops", bills: [{ amount: "bad", dueDate: "2026-10-07" }] }).projectedBalance).toBe(1000);
});
