package expo.modules.laypwidget

/** Unknown balances must not look like a complete total; debts reduce the total. */
fun totalAccountBudget(balances: List<Double?>): Double? {
  if (balances.isEmpty() || balances.any { it == null || !it.isFinite() }) return null
  return balances.sumOf { it!! }.takeIf { it.isFinite() }
}
