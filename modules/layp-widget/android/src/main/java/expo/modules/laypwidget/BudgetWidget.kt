package expo.modules.laypwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService

/** 4x2 account balances, with a scrollable two-column collection and privacy toggle. */
class BudgetWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { refreshAll(context) }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { refreshAll(context) }
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == TOGGLE) { WidgetStore.toggleBudgetHidden(context); refreshAll(context) }
  }
  companion object {
    const val TOGGLE = "expo.modules.laypwidget.BUDGET_HIDE"
    fun installedCount(context: Context) = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, BudgetWidgetProvider::class.java)).size
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, BudgetWidgetProvider::class.java))
      ids.forEach { id ->
        val summary = WidgetStore.readSummary(context)
        val hidden = WidgetStore.budgetHidden(context)
        val views = RemoteViews(context.packageName, R.layout.layp_widget_budget)
        val total = WidgetStore.totalAvailableBalance(context)
        views.setTextViewText(R.id.layp_budget_total, if (hidden) "••••" else total?.let { WidgetStore.formatMoney(summary.currency, it) } ?: "Sync needed")
        views.setTextColor(R.id.layp_budget_total, if (!hidden && (total ?: 0.0) < 0) Palette.DARK.error else Palette.DARK.text)
        views.setTextViewText(R.id.layp_budget_privacy, if (hidden) "Show" else "Hide")
        views.setContentDescription(R.id.layp_budget_privacy, if (hidden) "Show account balances" else "Hide account balances")
        views.setTextViewText(R.id.layp_budget_empty, if (summary.accounts.isEmpty()) "Open LAYP to sync accounts" else "No accounts selected\nChoose accounts in Settings")
        views.setEmptyView(R.id.layp_budget_grid, R.id.layp_budget_empty)
        views.setRemoteAdapter(R.id.layp_budget_grid, Intent(context, BudgetListService::class.java).apply {
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id); data = Uri.parse("layp://budget/$id")
        })
        views.setPendingIntentTemplate(R.id.layp_budget_grid, WidgetIntents.itemTemplate(context, 9200 + id))
        views.setOnClickPendingIntent(R.id.layp_budget_privacy, PendingIntent.getBroadcast(context, 9300 + id, Intent(context, BudgetWidgetProvider::class.java).setAction(TOGGLE), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        WidgetIntents.openApp(context, 9400 + id)?.let { views.setOnClickPendingIntent(R.id.layp_budget_title, it) }
        WidgetAppearance.apply(context, views, R.layout.layp_widget_budget, R.id.layp_budget_root)
        manager.updateAppWidget(id, views)
      }
      if (ids.isNotEmpty()) manager.notifyAppWidgetViewDataChanged(ids, R.id.layp_budget_grid)
    }
  }
}
class BudgetListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = BudgetListFactory(applicationContext)
}
class BudgetListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var accounts: List<Choice> = emptyList()
  private var hidden = false
  private var currency = "₱"
  override fun onCreate() {}
  override fun onDataSetChanged() {
    val summary = WidgetStore.readSummary(context)
    accounts = summary.accounts.filter { summary.budgetAccountIds == null || it.id in summary.budgetAccountIds }.map { it.copy(balance = WidgetStore.availableBalance(context, it.id)) }
    hidden = WidgetStore.budgetHidden(context); currency = summary.currency
  }
  override fun onDestroy() {}
  override fun getCount() = accounts.size
  override fun getViewAt(position: Int): RemoteViews {
    val rv = RemoteViews(context.packageName, R.layout.layp_widget_budget_account)
    val account = accounts.getOrNull(position) ?: return rv
    rv.setTextViewText(R.id.layp_budget_account_name, account.label)
    rv.setTextViewText(R.id.layp_budget_account_amount, if (hidden) "••••" else account.balance?.let { WidgetStore.formatMoney(currency, it) } ?: "Sync needed")
    rv.setTextColor(R.id.layp_budget_account_amount, if (!hidden && (account.balance ?: 0.0) < 0) Palette.DARK.error else Palette.DARK.text)
    rv.setOnClickFillInIntent(R.id.layp_budget_account, Intent().putExtra(WidgetActionActivity.EXTRA_OP, WidgetActionActivity.OP_OPEN))
    WidgetAppearance.apply(context, rv, R.layout.layp_widget_budget_account)
    return rv
  }
  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount() = 1
  override fun getItemId(position: Int) = (accounts.getOrNull(position)?.id?.hashCode() ?: position).toLong()
  override fun hasStableIds() = true
}
