import { savingsTotal, unallocatedSavings, goalCurrentAmount, goalProgress, splitKind } from "../utils";

describe("savingsTotal", () => {
  test("sums deposits", () => {
    expect(savingsTotal([{ amount: 100 }, { amount: 50 }])).toBe(150);
  });

  test("subtracts withdrawals", () => {
    expect(savingsTotal([{ amount: 100 }, { type: "withdraw", amount: 30 }])).toBe(70);
  });

  test("returns 0 for an empty log", () => {
    expect(savingsTotal([])).toBe(0);
  });
});

describe("unallocatedSavings", () => {
  const log = [
    { amount: 200 }, // no goalId -- unallocated
    { amount: 100, goalId: "g1" }, // earmarked -- excluded
    { type: "withdraw", amount: 50 }, // unallocated withdrawal
  ];

  test("only counts entries with no goalId", () => {
    expect(unallocatedSavings(log)).toBe(150); // 200 - 50
  });

  test("ignores goal-earmarked entries entirely, not just their sign", () => {
    // If goal-earmarked entries leaked in, this would be 250, not 150.
    expect(unallocatedSavings(log)).not.toBe(250);
  });
});

describe("goalCurrentAmount", () => {
  const log = [
    { goalId: "g1", amount: 500 },
    { goalId: "g1", amount: 200 },
    { goalId: "g1", type: "withdraw", amount: 100 },
    { goalId: "g2", amount: 999 }, // a different goal -- must not leak in
  ];

  test("nets deposits and withdrawals for just the requested goal", () => {
    expect(goalCurrentAmount("g1", log)).toBe(600); // 500 + 200 - 100
  });

  test("returns 0 for a goal with no entries", () => {
    expect(goalCurrentAmount("g-none", log)).toBe(0);
  });
});

describe("goalProgress", () => {
  test("percent is capped at 100 even if saved more than the target", () => {
    const goal = { id: "g1", targetAmount: 1000 };
    const log = [{ goalId: "g1", amount: 1500 }];
    const result = goalProgress(goal, log);
    expect(result.current).toBe(1500);
    expect(result.percent).toBe(100);
    expect(result.remaining).toBe(0);
    expect(result.recommendedMonthly).toBe(0);
  });

  test("recommended monthly is remaining amount spread across months left", () => {
    const goal = { id: "g1", targetAmount: 1000, targetDate: futureDateDaysFromNow(60) }; // ~2 months out
    const log = [{ goalId: "g1", amount: 200 }];
    const result = goalProgress(goal, log);
    expect(result.remaining).toBe(800);
    // ~800 / ~2 months -- allow slack since monthsUntil isn't calendar-exact
    expect(result.recommendedMonthly).toBeGreaterThan(350);
    expect(result.recommendedMonthly).toBeLessThan(450);
  });

  test("with no target date, the whole remaining amount is due now (monthsLeft < 1)", () => {
    const goal = { id: "g1", targetAmount: 1000 };
    const log = [{ goalId: "g1", amount: 0 }];
    const result = goalProgress(goal, log);
    expect(result.recommendedMonthly).toBe(1000);
  });

  test("a goal with no target amount doesn't divide by zero", () => {
    const goal = { id: "g1", targetAmount: 0 };
    const result = goalProgress(goal, []);
    expect(result.percent).toBe(0);
    expect(Number.isFinite(result.percent)).toBe(true);
  });
});

describe("splitKind", () => {
  test("recognizes a savings split regardless of case", () => {
    expect(splitKind({ label: "Savings" })).toBe("savings");
    expect(splitKind({ label: "SAVINGS" })).toBe("savings");
  });

  test("recognizes needs and wants splits", () => {
    expect(splitKind({ label: "Needs" })).toBe("needs");
    expect(splitKind({ label: "Wants" })).toBe("wants");
  });

  test("anything else is treated as a regular spending split", () => {
    expect(splitKind({ label: "Fun money" })).toBe("spend");
    expect(splitKind({ label: "" })).toBe("spend");
  });
});

function futureDateDaysFromNow(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
