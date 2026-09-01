import { z } from "zod";

// --- Shared field schemas ---
//
// These express the same rules that used to live as inline `canSave`
// booleans in each form (e.g. `name.trim() && isPositiveAmount(amount)`),
// but as one declarative, testable definition per record type instead of
// re-deriving the same checks by hand in every screen. Amount fields
// coerce from string because every form keeps its raw TextInput value as a
// string until save time.

const positiveAmount = z.coerce
  .number({ invalid_type_error: "Enter an amount" })
  .positive("Amount must be greater than 0");

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

export const expenseSchema = z.object({
  name: z.string().trim().min(1, "What did you spend on?"),
  label: z.string().trim().optional(),
  amount: positiveAmount,
  splitId: z.string().min(1, "Choose a budget category"),
  account: z.string().min(1, "Choose an account"),
  date: isoDate,
});

export const billSchema = z.object({
  name: z.string().trim().min(1, "Name this bill"),
  amount: positiveAmount,
  dueDate: isoDate,
  splitId: z.string().min(1, "Choose a budget category"),
  account: z.string().min(1, "Choose an account"),
});

export const loanSchema = z.object({
  person: z.string().trim().min(1, "Who's this with?"),
  note: z.string().trim().optional(),
  principal: positiveAmount,
  interestPercent: z.coerce.number().min(0, "Interest can't be negative").default(0),
  dueDate: isoDate.optional().or(z.literal("")),
  account: z.string().min(1, "Choose an account"),
});

export const goalSchema = z.object({
  name: z.string().trim().min(1, "Name this goal"),
  targetAmount: positiveAmount,
  targetDate: isoDate.optional().or(z.literal("")).or(z.null()),
});

// Runs a schema and returns { ok, errors, data } instead of throwing --
// forms want per-field messages, not a caught exception.
export function validate(schema, values) {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data, errors: {} };
  const errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return { ok: false, data: null, errors };
}
