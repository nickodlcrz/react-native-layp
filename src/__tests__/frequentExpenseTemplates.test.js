import { frequentExpenseTemplates } from "../selectors";

function expense(overrides = {}) {
  return { id: "e", name: "Coffee", amount: 60, date: "2026-09-01", createdAt: 1000, ...overrides };
}

describe("frequentExpenseTemplates", () => {
  test("a one-off expense doesn't show up (needs 2+ occurrences)", () => {
    const result = frequentExpenseTemplates([expense({ id: "e1" })]);
    expect(result).toHaveLength(0);
  });

  test("the same name+amount logged twice becomes one template", () => {
    const expenses = [
      expense({ id: "e1", createdAt: 1000 }),
      expense({ id: "e2", createdAt: 2000 }),
    ];
    const result = frequentExpenseTemplates(expenses);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Coffee");
  });

  test("matching is case-insensitive on the name", () => {
    const expenses = [
      expense({ id: "e1", name: "coffee" }),
      expense({ id: "e2", name: "COFFEE" }),
    ];
    expect(frequentExpenseTemplates(expenses)).toHaveLength(1);
  });

  test("a different amount for the same name is a different template", () => {
    const expenses = [
      expense({ id: "e1", amount: 60 }),
      expense({ id: "e2", amount: 60 }),
      expense({ id: "e3", amount: 90 }),
      expense({ id: "e4", amount: 90 }),
    ];
    const result = frequentExpenseTemplates(expenses);
    expect(result).toHaveLength(2);
  });

  test("uses the most recently logged occurrence as the template", () => {
    const expenses = [
      expense({ id: "e1", createdAt: 1000, splitId: "s-old", account: "a-old" }),
      expense({ id: "e2", createdAt: 2000, splitId: "s-new", account: "a-new" }),
    ];
    const result = frequentExpenseTemplates(expenses);
    expect(result[0].splitId).toBe("s-new");
    expect(result[0].account).toBe("a-new");
  });

  test("excludes bill-sourced expenses", () => {
    const expenses = [
      expense({ id: "e1", source: "bill" }),
      expense({ id: "e2", source: "bill" }),
    ];
    expect(frequentExpenseTemplates(expenses)).toHaveLength(0);
  });

  test("sorts most-repeated first and respects the limit", () => {
    const expenses = [
      ...[1, 2, 3].map((i) => expense({ id: `a${i}`, name: "Jeepney", amount: 15, createdAt: i })),
      ...[1, 2].map((i) => expense({ id: `b${i}`, name: "Coffee", amount: 60, createdAt: i })),
    ];
    const result = frequentExpenseTemplates(expenses, 1);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Jeepney"); // 3 occurrences beats 2
  });
});
