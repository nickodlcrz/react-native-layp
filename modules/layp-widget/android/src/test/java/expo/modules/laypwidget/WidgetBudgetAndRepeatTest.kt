package expo.modules.laypwidget

import org.junit.Assert.*
import org.junit.Test

class WidgetBudgetAndRepeatTest {
  private val accounts = listOf(Choice("cash", "Cash", 100.0), Choice("bank", "Bank", 200.0))
  private val splits = listOf(Choice("needs", "Needs", null), Choice("wants", "Wants", null))
  private val expense = RecentExpense("old", "Coffee", " Food ", 85.5, "2026-10-01", "bank", "wants")

  @Test fun preservesTheHistoricalExpenseRatherThanLastUsedChoices() {
    val preset = expenseRepeatPreset(expense, accounts, splits, "cash", "needs")
    assertEquals(ExpenseRepeatPreset("Coffee", "Food", 85.5, "bank", "wants"), preset)
  }
  @Test fun deletedChoicesFallBackToRememberedThenFirstChoices() {
    val old = expense.copy(account = "deleted", splitId = "deleted")
    assertEquals("bank", expenseRepeatPreset(old, accounts, splits, "bank", null).account)
    assertEquals("needs", expenseRepeatPreset(old, accounts, splits, "bank", null).splitId)
    assertEquals("cash", expenseRepeatPreset(old, accounts, splits, "deleted", null).account)
    assertNull(expenseRepeatPreset(old, emptyList(), emptyList(), null, null).account)
  }
  @Test fun invalidAmountsAreLeftBlankForCorrection() {
    for (amount in listOf(Double.NaN, Double.POSITIVE_INFINITY, -1.0, 0.0, 1e10)) {
      assertEquals(0.0, expenseRepeatPreset(expense.copy(amount = amount), accounts, splits, null, null).amount, 0.0)
    }
  }
  @Test fun totalIncludesNegativeAndZeroBalances() { assertEquals(125.25, totalAccountBudget(listOf(200.0, -74.75, 0.0))!!, 0.001) }
  @Test fun unknownOrEmptyBalancesNeverProduceAMisleadingPartialTotal() {
    assertNull(totalAccountBudget(emptyList()))
    assertNull(totalAccountBudget(listOf(100.0, null)))
    assertNull(totalAccountBudget(listOf(Double.NaN)))
    assertNull(totalAccountBudget(listOf(Double.POSITIVE_INFINITY)))
  }
}
