package expo.modules.laypwidget

data class ExpenseRepeatPreset(val name: String, val label: String, val amount: Double, val account: String?, val splitId: String?)

/** Reuse expense details, choosing a valid account/category if an old one was deleted. */
fun expenseRepeatPreset(expense: RecentExpense, accounts: List<Choice>, splits: List<Choice>, lastAccount: String?, lastSplit: String?): ExpenseRepeatPreset {
  fun pick(choices: List<Choice>, original: String, last: String?): String? =
    choices.firstOrNull { it.id == original }?.id ?: choices.firstOrNull { it.id == last }?.id ?: choices.firstOrNull()?.id
  val amount = if (expense.amount.isFinite() && expense.amount > 0 && expense.amount <= 999999999.99) Math.round(expense.amount * 100.0) / 100.0 else 0.0
  return ExpenseRepeatPreset(expense.name, expense.label.trim(), amount, pick(accounts, expense.account, lastAccount), pick(splits, expense.splitId, lastSplit))
}
