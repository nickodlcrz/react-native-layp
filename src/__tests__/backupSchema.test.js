import { validateBackup } from "../backupSchema";

function validBackup(overrides = {}) {
  return {
    version: 1,
    todos: [],
    bills: [],
    expenses: [],
    moneyLog: [],
    weeklySummaries: [],
    savingsLog: [],
    goals: [],
    loans: [],
    splits: [],
    accounts: [],
    transfers: [],
    dark: false,
    ...overrides,
  };
}

describe("validateBackup", () => {
  test("rejects text that isn't JSON at all", () => {
    const result = validateBackup("{not valid json");
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/valid JSON/);
  });

  test("accepts a minimal, well-formed backup", () => {
    const result = validateBackup(JSON.stringify(validBackup()));
    expect(result.ok).toBe(true);
    expect(result.data.version).toBe(1);
  });

  test("accepts a backup with populated, well-formed financial records", () => {
    const backup = validBackup({
      bills: [{ id: "b1", name: "Rent", amount: 1500, paid: false }],
      expenses: [{ id: "e1", name: "Coffee", amount: 60, date: "2026-09-01" }],
      moneyLog: [{ id: "m1", amount: 5000 }],
      loans: [{ id: "l1", principal: 300, type: "lent" }],
      accounts: [{ id: "a1", label: "Cash" }],
      splits: [{ id: "s1", label: "Needs", percent: 50 }],
      transfers: [{ id: "t1", amount: 100, fromAccount: "a1", toAccount: "a2" }],
    });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
  });

  test("rejects a bill with a non-numeric amount", () => {
    const backup = validBackup({ bills: [{ id: "b1", name: "Rent", amount: "a lot", paid: false }] });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/bills\.0\.amount/);
  });

  test("rejects an expense missing its id", () => {
    const backup = validBackup({ expenses: [{ name: "Coffee", amount: 60, date: "2026-09-01" }] });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/expenses\.0\.id/);
  });

  test("rejects a transfer missing fromAccount/toAccount", () => {
    const backup = validBackup({ transfers: [{ id: "t1", amount: 100 }] });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);
  });

  test("rejects a loan missing its principal", () => {
    const backup = validBackup({ loans: [{ id: "l1", type: "lent" }] });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/loans\.0\.principal/);
  });

  test("accepts a loan with a numeric principal (not `amount`)", () => {
    const backup = validBackup({ loans: [{ id: "l1", principal: 500, type: "borrowed" }] });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
  });

  test("rejects a backup where a required array is missing entirely", () => {
    const backup = validBackup();
    delete backup.expenses;
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);
  });

  test("rejects a backup where dark isn't a boolean", () => {
    const backup = validBackup({ dark: "yes" });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);
  });

  test("accepts extra/unknown fields instead of rejecting the whole backup", () => {
    // A backup from a newer app version might carry a field this schema
    // doesn't know about yet -- that alone shouldn't block a restore.
    const backup = validBackup({ someFutureField: { nested: true } });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
  });

  test("accepts a backup that omits optional school/daily-budget fields", () => {
    const result = validateBackup(JSON.stringify(validBackup()));
    expect(result.ok).toBe(true);
  });
});
