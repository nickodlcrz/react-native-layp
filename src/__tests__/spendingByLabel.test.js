import { spendingByLabel } from "../selectors";

const REF = new Date("2026-09-15T00:00:00");

function expense(overrides = {}) {
  return { id: "e", name: "Something", amount: 100, date: "2026-09-01", ...overrides };
}

describe("spendingByLabel", () => {
  test("groups expenses by their label within the month", () => {
    const expenses = [
      expense({ id: "e1", label: "Food", amount: 100 }),
      expense({ id: "e2", label: "Food", amount: 50 }),
      expense({ id: "e3", label: "Transportation", amount: 30 }),
    ];
    const result = spendingByLabel(expenses, REF);
    const food = result.find((r) => r.label === "Food");
    const transport = result.find((r) => r.label === "Transportation");
    expect(food.amount).toBe(150);
    expect(transport.amount).toBe(30);
  });

  test("expenses with no label are grouped as Uncategorized instead of dropped", () => {
    const expenses = [expense({ id: "e1", label: "", amount: 40 }), expense({ id: "e2", amount: 60 })];
    const result = spendingByLabel(expenses, REF);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Uncategorized");
    expect(result[0].amount).toBe(100);
  });

  test("excludes expenses from other months", () => {
    const expenses = [
      expense({ id: "e1", label: "Food", amount: 100, date: "2026-09-01" }),
      expense({ id: "e2", label: "Food", amount: 500, date: "2026-08-01" }),
    ];
    const result = spendingByLabel(expenses, REF);
    expect(result.find((r) => r.label === "Food").amount).toBe(100);
  });

  test("sorts largest first", () => {
    const expenses = [
      expense({ id: "e1", label: "Small", amount: 10 }),
      expense({ id: "e2", label: "Big", amount: 900 }),
    ];
    const result = spendingByLabel(expenses, REF);
    expect(result[0].label).toBe("Big");
  });

  test("a known label gets its curated color, not a palette fallback", () => {
    const expenses = [expense({ id: "e1", label: "Food", amount: 100 })];
    const result = spendingByLabel(expenses, REF);
    expect(result[0].color).toBe("#D9A441"); // ACCENT.gold, per SPENDING_LABELS
  });

  test("returns an empty array for no expenses", () => {
    expect(spendingByLabel([], REF)).toEqual([]);
  });
});
