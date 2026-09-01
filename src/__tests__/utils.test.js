import { computeAccountBalance, loanNetAdjustment, normalizeSplits, loanTotalDue, loanTotalPaid } from "../utils";

describe("computeAccountBalance", () => {
  const accountId = "gcash";

  test("returns 0 for an account with no activity at all", () => {
    expect(computeAccountBalance(accountId, {})).toBe(0);
  });

  test("adds money received and subtracts expenses on that account", () => {
    const ctx = {
      moneyLog: [{ account: accountId, amount: 1000 }],
      expenses: [{ account: accountId, amount: 350 }],
    };
    expect(computeAccountBalance(accountId, ctx)).toBe(650);
  });

  test("ignores activity tied to a different account", () => {
    const ctx = {
      moneyLog: [{ account: "other", amount: 1000 }],
      expenses: [{ account: accountId, amount: 100 }],
    };
    expect(computeAccountBalance(accountId, ctx)).toBe(-100);
  });

  test("subtracts rolled-up weekly summary spending for the account", () => {
    const ctx = {
      moneyLog: [{ account: accountId, amount: 500 }],
      weeklySummaries: [{ byAccount: { [accountId]: 120 } }, { byAccount: { [accountId]: 30 } }],
    };
    expect(computeAccountBalance(accountId, ctx)).toBe(500 - 120 - 30);
  });

  test("a deposit into savings from this account reduces its balance", () => {
    const ctx = {
      moneyLog: [{ account: accountId, amount: 1000 }],
      savingsLog: [{ account: accountId, amount: 200, type: "deposit" }],
    };
    expect(computeAccountBalance(accountId, ctx)).toBe(800);
  });

  test("a withdrawal from savings back into this account increases its balance", () => {
    const ctx = {
      savingsLog: [{ account: accountId, amount: 200, type: "withdraw" }],
    };
    expect(computeAccountBalance(accountId, ctx)).toBe(200);
  });

  test("transfers move balance between the two accounts involved", () => {
    const ctx = {
      moneyLog: [{ account: accountId, amount: 1000 }],
      transfers: [{ fromAccount: accountId, toAccount: "bank", amount: 300 }],
    };
    expect(computeAccountBalance(accountId, ctx)).toBe(700);
    expect(computeAccountBalance("bank", ctx)).toBe(300);
  });

  test("an unsettled loan lent from this account reduces its balance by the full principal", () => {
    const ctx = { loans: [{ account: accountId, type: "lent", principal: 500, interestPercent: 0, settled: false }] };
    expect(computeAccountBalance(accountId, ctx)).toBe(-500);
  });

  test("a settled 'lent' loan nets out to just the interest earned", () => {
    const ctx = { loans: [{ account: accountId, type: "lent", principal: 500, interestPercent: 10, settled: true }] };
    // paid-in-full (550) minus principal (500) = +50 interest gained
    expect(computeAccountBalance(accountId, ctx)).toBe(50);
  });

  test("a partially paid 'borrowed' loan reduces the outstanding effect proportionally", () => {
    const loan = { account: accountId, type: "borrowed", principal: 1000, interestPercent: 0, settled: false, payments: [{ amount: 400 }] };
    // still owe 600 of the 1000 borrowed -- balance carries +600 (money not yet paid back)
    expect(computeAccountBalance(accountId, { loans: [loan] })).toBe(600);
  });
});

describe("loanNetAdjustment", () => {
  test("an unsettled loan with no payments: lent starts at -principal", () => {
    expect(loanNetAdjustment({ type: "lent", principal: 300, interestPercent: 0, settled: false })).toBe(-300);
  });

  test("an unsettled loan with no payments: borrowed starts at +principal", () => {
    expect(loanNetAdjustment({ type: "borrowed", principal: 300, interestPercent: 0, settled: false })).toBe(300);
  });

  test("a fully settled 'lent' loan nets out to just the interest", () => {
    expect(loanNetAdjustment({ type: "lent", principal: 300, interestPercent: 5, settled: true })).toBeCloseTo(15);
  });

  test("a fully settled 'borrowed' loan nets out to the negative of interest paid beyond principal", () => {
    expect(loanNetAdjustment({ type: "borrowed", principal: 300, interestPercent: 5, settled: true })).toBeCloseTo(-15);
  });

  test("partial payments move a 'lent' loan gradually from -principal toward +interest", () => {
    const loan = { type: "lent", principal: 300, interestPercent: 10, settled: false, payments: [{ amount: 150 }] };
    // paid so far (150) - principal (300) = -150
    expect(loanNetAdjustment(loan)).toBe(-150);
  });

  test("an unknown loan type has no effect on balance", () => {
    expect(loanNetAdjustment({ type: "gift", principal: 300 })).toBe(0);
  });

  test("loanTotalDue includes interest; loanTotalPaid tracks logged payments", () => {
    const loan = { principal: 200, interestPercent: 10, payments: [{ amount: 50 }, { amount: 30 }] };
    expect(loanTotalDue(loan)).toBeCloseTo(220);
    expect(loanTotalPaid(loan)).toBe(80);
  });
});

describe("normalizeSplits", () => {
  const base = () => [
    { id: "needs", percent: 50 },
    { id: "wants", percent: 30 },
    { id: "savings", percent: 20 },
  ];

  test("always sums to exactly 100 after a change", () => {
    const result = normalizeSplits(base(), 0, 70);
    expect(result.reduce((s, x) => s + x.percent, 0)).toBe(100);
  });

  test("sets the changed split to the requested value", () => {
    const result = normalizeSplits(base(), 0, 70);
    expect(result[0].percent).toBe(70);
  });

  test("redistributes the delta across the other splits proportionally", () => {
    // needs 50 -> 70 is +20, taken proportionally from wants(30) and savings(20)
    // in a 30:20 = 3:2 ratio, so wants loses more than savings
    const result = normalizeSplits(base(), 0, 70);
    const wantsLoss = 30 - result[1].percent;
    const savingsLoss = 20 - result[2].percent;
    expect(wantsLoss).toBeGreaterThan(savingsLoss);
  });

  test("clamps the changed value into 0-100 even if given something out of range", () => {
    const result = normalizeSplits(base(), 0, 150);
    expect(result[0].percent).toBe(100);
    expect(result.reduce((s, x) => s + x.percent, 0)).toBe(100);
  });

  test("still sums to 100 when the other splits started at 0", () => {
    const splits = [{ id: "a", percent: 100 }, { id: "b", percent: 0 }, { id: "c", percent: 0 }];
    const result = normalizeSplits(splits, 0, 40);
    expect(result.reduce((s, x) => s + x.percent, 0)).toBe(100);
  });
});
