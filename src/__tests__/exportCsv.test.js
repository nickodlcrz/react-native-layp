import { buildLedgerCsv, csvField } from "../exportCsv";

const splits = [{ id: "needs", label: "Needs" }];
const accounts = [{ id: "cash", label: "Cash" }];
const incomeCategories = [{ id: "allowance", label: "Allowance" }];

describe("csvField", () => {
  test("leaves plain text alone", () => {
    expect(csvField("Coffee")).toBe("Coffee");
  });
  test("quotes fields with commas, quotes, or newlines and doubles embedded quotes", () => {
    expect(csvField("Rice, adobo")).toBe('"Rice, adobo"');
    expect(csvField('The "big" one')).toBe('"The ""big"" one"');
    expect(csvField("a\nb")).toBe('"a\nb"');
  });
  test("null/undefined become empty", () => {
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });
});

describe("buildLedgerCsv", () => {
  const ledger = [
    { id: "1", date: "2026-09-01", kind: "out", name: "Lunch, jeep", label: "Food", splitId: "needs", account: "cash", amount: 120, createdAt: 1 },
    { id: "2", date: "2026-09-02", kind: "in", note: "Weekly", category: "allowance", account: "cash", amount: 500, createdAt: 2 },
  ];

  test("has a header, newest first, money out negative and money in positive", () => {
    const lines = buildLedgerCsv(ledger, [], { splits, accounts, incomeCategories }).trim().split("\r\n");
    expect(lines[0]).toBe("Date,Type,Description,Label,Category,Account,Amount");
    expect(lines[1]).toBe("2026-09-02,Money in,Weekly,,Allowance,Cash,500.00");
    expect(lines[2]).toBe('2026-09-01,Money out,"Lunch, jeep",Food,Needs,Cash,-120.00');
  });

  test("appends weekly summaries as negative rows", () => {
    const csv = buildLedgerCsv([], [{ startDate: "2026-08-03", endDate: "2026-08-09", count: 12, total: 800 }], { splits, accounts });
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toBe("2026-08-03,Weekly summary,Week of 2026-08-03 to 2026-08-09 (12 entries),,,,-800.00");
  });

  test("empty ledger still yields just the header", () => {
    expect(buildLedgerCsv([], []).trim()).toBe("Date,Type,Description,Label,Category,Account,Amount");
  });
});
