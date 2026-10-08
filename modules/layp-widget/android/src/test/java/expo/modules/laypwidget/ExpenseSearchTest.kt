package expo.modules.laypwidget

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.widget.ListView
import android.widget.TextView
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExpenseSearchTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private val snapshot = """{"date":"2026-10-01","currency":"₱","accounts":[{"id":"cash","label":"Cash","balance":500},{"id":"bank","label":"Bank","balance":200}],"splits":[{"id":"needs","label":"Needs"},{"id":"wants","label":"Wants"}],"recent":[{"id":"old","name":"Coffee","label":"Food","amount":85.5,"date":"2026-10-01","account":"bank","splitId":"wants"}]}"""

  @Before fun seed() { WidgetStore.writeSummary(context, snapshot) }

  private fun descendants(view: View): List<View> = listOf(view) + if (view is ViewGroup) (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()
  private fun views(activity: Activity) = descendants(activity.findViewById(android.R.id.content))
  private fun tapSearch(search: SearchActivity) {
    val list = views(search).filterIsInstance<ListView>().single()
    assertTrue(list.performItemClick(list.adapter.getView(0, null, list), 0, 0))
  }

  @Test fun searchTapAndSaveCreatesANewTodayExpenseWithOriginalChoices() {
    val searchController = Robolectric.buildActivity(SearchActivity::class.java).setup()
    val search = searchController.get()
    tapSearch(search)
    val intent = shadowOf(search).nextStartedActivity
    assertEquals(QuickLogActivity::class.java.name, intent.component!!.className)
    val formController = Robolectric.buildActivity(QuickLogActivity::class.java, intent).setup()
    val form = formController.get()
    views(form).filterIsInstance<TextView>().single { it.text.toString() == "Save expense" }.performClick()
    val expense = WidgetStore.pending(context).single()
    assertNotEquals("old", expense.id)
    assertEquals(WidgetStore.today(), expense.date)
    assertEquals("Coffee", expense.name)
    assertEquals("Food", expense.label)
    assertEquals("bank", expense.account)
    assertEquals("wants", expense.splitId)
    assertEquals(85.5, expense.amount, 0.001)
    assertEquals(614.5, WidgetStore.totalAvailableBalance(context)!!, 0.001)
    assertEquals(2, WidgetStore.searchableExpenses(context).size)
    searchController.pause().resume()
    assertEquals(2, views(search).filterIsInstance<ListView>().single().adapter.count)
    formController.destroy(); searchController.pause().stop().destroy()
  }

  @Test fun cancellingThePrefilledFormDoesNotLogAnything() {
    val searchController = Robolectric.buildActivity(SearchActivity::class.java).setup()
    tapSearch(searchController.get())
    val intent = shadowOf(searchController.get()).nextStartedActivity
    val formController = Robolectric.buildActivity(QuickLogActivity::class.java, intent).setup()
    views(formController.get()).filterIsInstance<TextView>().single { it.text.toString() == "Cancel" }.performClick()
    assertTrue(WidgetStore.pending(context).isEmpty())
    formController.destroy(); searchController.pause().stop().destroy()
  }

  @Test fun repeatStillCannotSpendBeyondTheAccountBalance() {
    WidgetStore.writeSummary(context, snapshot.replace("\"balance\":200", "\"balance\":20"))
    val searchController = Robolectric.buildActivity(SearchActivity::class.java).setup()
    tapSearch(searchController.get())
    val intent = shadowOf(searchController.get()).nextStartedActivity
    val formController = Robolectric.buildActivity(QuickLogActivity::class.java, intent).setup()
    views(formController.get()).filterIsInstance<TextView>().single { it.text.toString() == "Save expense" }.performClick()
    assertTrue(WidgetStore.pending(context).isEmpty())
    formController.destroy(); searchController.pause().stop().destroy()
  }

  @Test fun totalUsesAllAccountsAndPendingMoneyWithoutDoubleCountingAppliedEntries() {
    val json = JSONObject(snapshot).put("budgetAccountIds", org.json.JSONArray().put("cash"))
    WidgetStore.writeSummary(context, json.toString())
    WidgetStore.enqueueMoney(context, PendingMoney("income", 100.0, "", "", "bank", WidgetStore.today(), 1))
    WidgetStore.enqueue(context, PendingExpense("expense", 25.0, "Food", "", "needs", "cash", WidgetStore.today(), 2))
    assertEquals(775.0, WidgetStore.totalAvailableBalance(context)!!, 0.001)
    json.getJSONArray("accounts").getJSONObject(0).put("balance", 475)
    json.getJSONArray("accounts").getJSONObject(1).put("balance", 300)
    json.put("appliedWidgetIds", org.json.JSONArray().put("income").put("expense"))
    WidgetStore.writeSummary(context, json.toString())
    assertEquals(775.0, WidgetStore.totalAvailableBalance(context)!!, 0.001)
  }
}
