// Turns the Spending screen's combined ledger (money in + money out, day by
// day) into a CSV file's text. Pure -- no React Native or Expo imports -- so
// it can be unit tested on its own; the screen does the actual file writing
// and sharing.

const HEADER = ["Date", "Type", "Description", "Label", "Category", "Account", "Amount"];

// Quotes a field only when it needs it (comma, quote, or newline), doubling
// any embedded quotes -- the standard CSV escaping rule.
export function csvField(value) {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function amountText(n) {
  const num = Number(n) || 0;
  return num.toFixed(2);
}

// ledger: [{ date, kind: "in" | "out", name?, note?, label?, splitId?, category?, account, amount }]
// weeklySummaries: [{ startDate, endDate, count, total }] -- older
//   transactions the app has already rolled up into one line per week.
// Money in is exported as a positive amount and money out as negative, so
// summing the Amount column in a spreadsheet gives the net change.
// Newest first, same as the on-screen list.
export function buildLedgerCsv(ledger, weeklySummaries = [], { splits = [], accounts = [], incomeCategories = [] } = {}) {
  const splitLabel = (id) => splits.find((s) => s.id === id)?.label || "";
  const accountLabel = (id) => accounts.find((a) => a.id === id)?.label || "";
  const incomeLabel = (id) => incomeCategories.find((c) => c.id === id)?.label || "";

  const rows = [...ledger]
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0))
    .map((item) => {
      const isIn = item.kind === "in";
      const category = isIn ? incomeLabel(item.category) : splitLabel(item.splitId);
      const description = item.name || item.note || (isIn ? "Money added" : "");
      const signed = isIn ? Number(item.amount) : -Number(item.amount);
      return [item.date, isIn ? "Money in" : "Money out", description, item.label || "", category, accountLabel(item.account), amountText(signed)];
    });

  const summaryRows = [...weeklySummaries]
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))
    .map((w) => [
      w.startDate, "Weekly summary",
      `Week of ${w.startDate} to ${w.endDate} (${w.count} entries)`,
      "", "", "", amountText(-Number(w.total)),
    ]);

  return [HEADER, ...rows, ...summaryRows].map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}
