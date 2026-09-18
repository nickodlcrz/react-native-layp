import { z } from "zod";

// Backup restore used to only check that the top-level keys existed and
// were arrays -- it never looked inside them. That meant a backup with,
// say, an expense missing its `amount` field, or a bill with `amount` as
// the string "abc" instead of a number, would sail through validation and
// only blow up later once something tried to add it into a total. Since
// these are financial records, a bad restore silently corrupting a balance
// is exactly the kind of thing worth catching up front instead of at
// whatever screen happens to read the bad field first.
//
// Every schema below uses .passthrough() so a backup from a slightly newer
// or older version of LAYP (with an extra field, or one this file doesn't
// know about yet) isn't rejected just for that -- only missing/malformed
// *required* fields fail validation.

const id = z.string().min(1, "missing id");
const isoDate = z.string().min(1, "missing date"); // kept loose (not a strict date regex) since date formatting has changed once already in this app's history

const todoSchema = z.object({
  id,
  title: z.string(),
  completed: z.boolean().optional(),
}).passthrough();

const billSchema = z.object({
  id,
  name: z.string(),
  amount: z.number({ invalid_type_error: "bill amount must be a number" }),
  paid: z.boolean(),
  paidAmount: z.number().optional(),
}).passthrough();

const expenseSchema = z.object({
  id,
  name: z.string(),
  amount: z.number({ invalid_type_error: "expense amount must be a number" }),
  date: isoDate,
}).passthrough();

const moneyLogEntrySchema = z.object({
  id,
  amount: z.number({ invalid_type_error: "income amount must be a number" }),
}).passthrough();

const weeklySummarySchema = z.object({
  total: z.number(),
}).passthrough();

const savingsLogEntrySchema = z.object({
  id,
}).passthrough();

const goalSchema = z.object({
  id,
  name: z.string().optional(),
}).passthrough();

const loanSchema = z.object({
  id,
  // Loans store their money field as `principal`, not `amount` -- see
  // loanInterest/loanBalance/etc. in utils.ts. This used to check for
  // `amount` here, which meant every real backup (loans never had that
  // field) failed validation with a false "loans.0.amount: Required".
  principal: z.number({ invalid_type_error: "loan principal must be a number" }),
}).passthrough();

const splitSchema = z.object({
  id,
  label: z.string(),
  percent: z.number(),
}).passthrough();

const accountSchema = z.object({
  id,
  label: z.string(),
}).passthrough();

const transferSchema = z.object({
  id,
  amount: z.number({ invalid_type_error: "transfer amount must be a number" }),
  fromAccount: z.string(),
  toAccount: z.string(),
}).passthrough();

const savingsAccountSchema = z.object({
  id,
  name: z.string(),
}).passthrough();

const interestLogEntrySchema = z.object({
  id,
  amount: z.number({ invalid_type_error: "interest amount must be a number" }),
}).passthrough();

// School-related domains are validated more loosely (z.any() items) --
// they don't carry money, so a malformed entry here is an inconvenience
// (a class that fails to render) rather than a corrupted balance. The
// financial arrays above are where strict validation actually earns its
// keep.
export const backupSchema = z.object({
  version: z.number(),
  todos: z.array(todoSchema),
  bills: z.array(billSchema),
  expenses: z.array(expenseSchema),
  moneyLog: z.array(moneyLogEntrySchema),
  weeklySummaries: z.array(weeklySummarySchema),
  savingsLog: z.array(savingsLogEntrySchema),
  goals: z.array(goalSchema),
  loans: z.array(loanSchema),
  splits: z.array(splitSchema),
  accounts: z.array(accountSchema),
  transfers: z.array(transferSchema),
  dark: z.boolean(),
  dailyBudgetSettings: z.object({}).passthrough().optional(),
  dailyBudgetLog: z.array(z.any()).optional(),
  academicPeriods: z.array(z.any()).optional(),
  subjects: z.array(z.any()).optional(),
  scheduleEntries: z.array(z.any()).optional(),
  schoolDefaults: z.object({}).passthrough().optional(),
  savingsAccounts: z.array(savingsAccountSchema).optional(),
  interestLog: z.array(interestLogEntrySchema).optional(),
}).passthrough();

// Parses + validates in one step. Returns { ok: true, data } on success, or
// { ok: false, error } with a short human-readable message pointing at the
// first thing that failed -- specific enough to actually help ("bills.2.amount:
// bill amount must be a number") instead of a generic "backup not recognized"
// for every possible failure.
export function validateBackup(raw) {
  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That doesn't look like valid JSON." };
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first.path.length ? first.path.join(".") : "(top level)";
    return { ok: false, error: `${path}: ${first.message}` };
  }
  return { ok: true, data: result.data };
}
