import { computeDailyBudgetReview, todayISO } from "../utils";

const splits = [
  { id: "needs", label: "Needs", percent: 50 },
  { id: "wants", label: "Wants", percent: 30 },
  { id: "savings", label: "Savings", percent: 20 },
];
const accounts = [{ id: "gcash", label: "GCash" }];

function baseCtx(overrides = {}) {
  return {
    splits,
    accounts,
    moneyLog: [],
    expenses: [],
    weeklySummaries: [],
    loans: [],
    savingsLog: [],
    transfers: [],
    ...overrides,
  };
}

describe("computeDailyBudgetReview -- savings suggestion vs. real balance", () => {
  test("regression: never suggests saving more than what's actually left in the accounts", () => {
    // 1000 received, but 1000 already spent today -- there is truly
    // nothing left, even though the day's theoretical 20% savings split
    // (200) is still a positive number.
    const ctx = baseCtx({
      moneyLog: [{ account: "gcash", amount: 1000, date: todayISO() }],
      expenses: [{ account: "gcash", amount: 1000, splitId: "needs", date: todayISO() }],
    });
    const review = computeDailyBudgetReview(ctx);
    const savings = review.categories.find((c) => c.isSavings);

    expect(review.currentBalance).toBe(0);
    // The old bug: this was `recommended - savedToday`, still positive here.
    expect(savings.remaining).toBeGreaterThan(0);
    // The fix: the amount actually safe to move into savings is capped to
    // what's really left (0), regardless of the theoretical recommendation.
    expect(savings.maxSafeToSave).toBe(0);
  });

  test("caps the safe-to-save amount at current balance even when it's less than the recommendation", () => {
    // 1000 received, 850 spent -- only 150 left, but 20% of 1000 (200)
    // would be the naive recommendation.
    const ctx = baseCtx({
      moneyLog: [{ account: "gcash", amount: 1000, date: todayISO() }],
      expenses: [{ account: "gcash", amount: 850, splitId: "needs", date: todayISO() }],
    });
    const review = computeDailyBudgetReview(ctx);
    const savings = review.categories.find((c) => c.isSavings);

    expect(review.currentBalance).toBe(150);
    expect(savings.remaining).toBeCloseTo(200);
    expect(savings.maxSafeToSave).toBeCloseTo(150);
  });

  test("allows the full recommended amount when there's plenty left over", () => {
    const ctx = baseCtx({
      moneyLog: [{ account: "gcash", amount: 1000, date: todayISO() }],
      expenses: [{ account: "gcash", amount: 100, splitId: "needs", date: todayISO() }],
    });
    const review = computeDailyBudgetReview(ctx);
    const savings = review.categories.find((c) => c.isSavings);

    expect(savings.remaining).toBeCloseTo(200);
    expect(savings.maxSafeToSave).toBeCloseTo(200);
  });

  test("already-saved amount today reduces both the recommendation gap and the safe-to-save cap consistently", () => {
    const ctx = baseCtx({
      moneyLog: [{ account: "gcash", amount: 1000, date: todayISO() }],
      savingsLog: [{ account: "gcash", amount: 50, type: "deposit", date: todayISO(), splitId: "savings" }],
    });
    const review = computeDailyBudgetReview(ctx);
    const savings = review.categories.find((c) => c.isSavings);

    // recommended 200, already saved 50 -> 150 remaining target
    expect(savings.remaining).toBeCloseTo(150);
    // balance is 1000 - 50 (already moved to savings) = 950, plenty left
    expect(savings.maxSafeToSave).toBeCloseTo(150);
  });
});
