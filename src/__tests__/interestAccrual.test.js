import { accrueSavingsAccountInterest, dailyInterestForBalance } from "../utils";

describe("dailyInterestForBalance", () => {
  test("flat rate", () => {
    // 10,000 at 3.65% p.a. -> exactly 1/day at 3.65/100/365 * 10000 = 1
    expect(dailyInterestForBalance(10000, 3.65)).toBeCloseTo(1, 5);
  });

  test("tiered rate splits at the bracket boundary, not a cliff", () => {
    const tiers = [{ upTo: 1000000, rate: 3.25 }, { upTo: 999999999999, rate: 3.75 }];
    // 1,200,000: first 1,000,000 at 3.25%, remaining 200,000 at 3.75%
    const expected = 1000000 * (3.25 / 100 / 365) + 200000 * (3.75 / 100 / 365);
    expect(dailyInterestForBalance(1200000, tiers)).toBeCloseTo(expected, 5);
  });

  test("balance entirely under the first bracket never touches the higher rate", () => {
    const tiers = [{ upTo: 1000000, rate: 3.25 }, { upTo: 999999999999, rate: 3.75 }];
    expect(dailyInterestForBalance(500000, tiers)).toBeCloseTo(500000 * (3.25 / 100 / 365), 5);
  });

  test("zero or negative balance earns nothing", () => {
    expect(dailyInterestForBalance(0, 5)).toBe(0);
    expect(dailyInterestForBalance(-100, 5)).toBe(0);
  });
});

describe("accrueSavingsAccountInterest", () => {
  const account = { id: "sa1", interestRate: 3.65 };

  test("first-ever accrual (no lastAccrualDate) prices one day off today's balance", () => {
    const savingsLog = [{ id: "s1", savingsAccountId: "sa1", type: "deposit", amount: 10000, date: "2026-09-01" }];
    const entry = accrueSavingsAccountInterest(account, savingsLog, [], "2026-09-05");
    expect(entry).not.toBeNull();
    expect(entry.days).toBe(1);
    expect(entry.amount).toBeCloseTo(1, 2);
  });

  test("catches up multiple missed days off a steady balance", () => {
    const savingsLog = [{ id: "s1", savingsAccountId: "sa1", type: "deposit", amount: 10000, date: "2026-09-01" }];
    const interestLog = [{ id: "i0", savingsAccountId: "sa1", amount: 1, date: "2026-09-01", days: 1 }];
    const entry = accrueSavingsAccountInterest(account, savingsLog, interestLog, "2026-09-05");
    expect(entry.days).toBe(4);
    expect(entry.amount).toBeCloseTo(4, 2); // steady 10,000 balance -> 1/day * 4 days
  });

  test("prices a mid-gap deposit correctly instead of projecting today's balance backward", () => {
    // 10,000 sitting from day 1, another 10,000 added on day 3 -- naively
    // multiplying TODAY's 20,000 balance by every missed day would
    // over-credit days 1-2, which only ever had 10,000 in them.
    const savingsLog = [
      { id: "s1", savingsAccountId: "sa1", type: "deposit", amount: 10000, date: "2026-09-01" },
      { id: "s2", savingsAccountId: "sa1", type: "deposit", amount: 10000, date: "2026-09-03" },
    ];
    const interestLog = [{ id: "i0", savingsAccountId: "sa1", amount: 1, date: "2026-09-01", days: 1 }];
    const entry = accrueSavingsAccountInterest(account, savingsLog, interestLog, "2026-09-05");
    // day 2 (asOf 09-02): 10,000 balance -> 1
    // day 3 (asOf 09-03): 20,000 balance -> 2
    // day 4 (asOf 09-04): 20,000 balance -> 2
    // day 5 (asOf 09-05, today): 20,000 balance -> 2
    expect(entry.amount).toBeCloseTo(7, 2);
    const naiveOverCredit = 20000 * (3.65 / 100 / 365) * 4; // what the old "today's balance x days" math would have given
    expect(entry.amount).toBeLessThan(naiveOverCredit);
  });

  test("no rate set accrues nothing", () => {
    const savingsLog = [{ id: "s1", savingsAccountId: "sa1", type: "deposit", amount: 10000, date: "2026-09-01" }];
    expect(accrueSavingsAccountInterest({ id: "sa1" }, savingsLog, [], "2026-09-05")).toBeNull();
  });

  test("already credited today accrues nothing further", () => {
    const savingsLog = [{ id: "s1", savingsAccountId: "sa1", type: "deposit", amount: 10000, date: "2026-09-01" }];
    const interestLog = [{ id: "i0", savingsAccountId: "sa1", amount: 5, date: "2026-09-05", days: 4 }];
    expect(accrueSavingsAccountInterest(account, savingsLog, interestLog, "2026-09-05")).toBeNull();
  });
});
