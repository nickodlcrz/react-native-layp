package expo.modules.laypwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.style.RelativeSizeSpan
import android.view.View
import android.widget.RemoteViews

// The spending widget. It displays today's total plus the most recent expenses
// and provides quick actions for logging, receiving money and searching history.
class SpendWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      appWidgetManager.updateAppWidget(id, WidgetRenderer.build(context, appWidgetManager, id))
    }
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle
  ) {
    appWidgetManager.updateAppWidget(appWidgetId, WidgetRenderer.build(context, appWidgetManager, appWidgetId))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> WidgetRefresh.all(context)
    }
  }

  companion object {
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (id in widgetIds(context, manager)) {
        manager.updateAppWidget(id, WidgetRenderer.build(context, manager, id))
      }
    }

    fun installedCount(context: Context): Int =
      widgetIds(context, AppWidgetManager.getInstance(context)).size

    private fun widgetIds(context: Context, manager: AppWidgetManager): IntArray =
      manager.getAppWidgetIds(ComponentName(context, SpendWidgetProvider::class.java))
  }
}

object WidgetRenderer {
  private val RECENT_ROW_IDS = intArrayOf(
    R.id.layp_widget_recent_0, R.id.layp_widget_recent_1, R.id.layp_widget_recent_2
  )
  private val RECENT_NAME_IDS = intArrayOf(
    R.id.layp_widget_recent_name_0, R.id.layp_widget_recent_name_1, R.id.layp_widget_recent_name_2
  )
  private val RECENT_AMOUNT_IDS = intArrayOf(
    R.id.layp_widget_recent_amount_0, R.id.layp_widget_recent_amount_1, R.id.layp_widget_recent_amount_2
  )

  private const val REQUEST_ADD = 90
  private const val REQUEST_MONEY = 91
  private const val REQUEST_SEARCH = 92
  private const val REQUEST_OPEN_APP = 80
  private const val REQUEST_TRANSPORT = 93
  private const val REQUEST_FOOD = 94
  private const val REQUEST_SCHOOL = 95
  private const val REQUEST_OTHER = 96

  fun build(context: Context, manager: AppWidgetManager, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.layp_widget_spend)
    val summary = WidgetStore.readSummary(context)
    val p = Palette.resolve(context, summary.theme)
    val totals = WidgetStore.todayTotals(context)
    val waiting = WidgetStore.pending(context).size + WidgetStore.pendingMoney(context).size

    views.setInt(R.id.layp_widget_root, "setBackgroundResource", p.heroBg)
    views.setInt(R.id.layp_widget_search, "setColorFilter", Palette.HERO_TEXT)
    views.setInt(R.id.layp_widget_money, "setColorFilter", Palette.HERO_TEXT)

    val count = totals.second
    val countText = when (count) {
      0 -> "Nothing logged yet"
      1 -> "1 expense"
      else -> "$count expenses"
    }
    val syncText = if (waiting > 0) "\u25CF $waiting to sync" else ""
    if (summary.hidden) {
      views.setTextViewText(R.id.layp_widget_amount, "••••••")
      views.setTextViewText(R.id.layp_widget_count, syncText)
    } else {
      views.setTextViewText(R.id.layp_widget_amount, styledAmount(summary.currency, totals.first))
      views.setTextViewText(R.id.layp_widget_count, if (waiting > 0) "$countText  $syncText" else countText)
    }

    // Keep the four shortcuts visible. Use one recent item at compact 2x2
    // height and two when the launcher gives the widget more vertical room.
    val minHeight = manager.getAppWidgetOptions(widgetId)
      .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 116)
    // The fixed rows above (title, amount, shortcuts, padding) use ~116dp, so
    // recent rows only appear once the launcher gives the widget more room;
    // otherwise they would be clipped and look like cut-off buttons.
    val visibleRecent = when {
      minHeight >= 190 -> 3
      minHeight >= 160 -> 2
      minHeight >= 136 -> 1
      else -> 0
    }
    val recent = summary.recent.take(visibleRecent)
    for (i in RECENT_ROW_IDS.indices) {
      if (i < recent.size) {
        val expense = recent[i]
        val rawName = expense.name.trim()
        val rawLabel = expense.label.trim()
        val title = if (rawName.isNotEmpty() && !rawName.equals("null", ignoreCase = true)) rawName else if (rawLabel.isNotEmpty() && !rawLabel.equals("null", ignoreCase = true)) rawLabel else "Expense"
        val amount = if (summary.hidden) "••••" else WidgetStore.formatMoney(summary.currency, expense.amount)
        views.setViewVisibility(RECENT_ROW_IDS[i], View.VISIBLE)
        views.setTextViewText(RECENT_NAME_IDS[i], title)
        views.setTextViewText(RECENT_AMOUNT_IDS[i], amount)
        views.setOnClickPendingIntent(RECENT_ROW_IDS[i], searchIntent(context))
      } else {
        views.setViewVisibility(RECENT_ROW_IDS[i], View.GONE)
      }
    }

    views.setOnClickPendingIntent(R.id.layp_widget_add, logIntent(context, QuickLogActivity.MODE_EXPENSE, null, REQUEST_ADD))
    views.setContentDescription(R.id.layp_widget_add, "Log an expense")
    views.setOnClickPendingIntent(R.id.layp_widget_money, logIntent(context, QuickLogActivity.MODE_MONEY, null, REQUEST_MONEY))
    views.setContentDescription(R.id.layp_widget_money, "Receive or add money")
    views.setOnClickPendingIntent(R.id.layp_widget_search, searchIntent(context))
    views.setContentDescription(R.id.layp_widget_search, "Search past expenses")

    // Category shortcuts open the existing quick-log sheet with the label
    // preselected, so these remain true one-tap shortcuts instead of decorative chips.
    views.setOnClickPendingIntent(
      R.id.layp_widget_shortcut_transport,
      logIntent(context, QuickLogActivity.MODE_EXPENSE, "Transportation", REQUEST_TRANSPORT)
    )
    views.setContentDescription(R.id.layp_widget_shortcut_transport, "Log transportation expense")
    views.setOnClickPendingIntent(
      R.id.layp_widget_shortcut_food,
      logIntent(context, QuickLogActivity.MODE_EXPENSE, "Food", REQUEST_FOOD)
    )
    views.setContentDescription(R.id.layp_widget_shortcut_food, "Log food expense")
    views.setOnClickPendingIntent(
      R.id.layp_widget_shortcut_school,
      logIntent(context, QuickLogActivity.MODE_EXPENSE, "School", REQUEST_SCHOOL)
    )
    views.setContentDescription(R.id.layp_widget_shortcut_school, "Log school expense")
    views.setOnClickPendingIntent(
      R.id.layp_widget_shortcut_other,
      logIntent(context, QuickLogActivity.MODE_EXPENSE, "Other", REQUEST_OTHER)
    )
    views.setContentDescription(R.id.layp_widget_shortcut_other, "Log other expense")

    WidgetIntents.openApp(context, REQUEST_OPEN_APP)?.let { views.setOnClickPendingIntent(R.id.layp_widget_root, it) }
    return views
  }

  private fun styledAmount(currency: String, amount: Double): CharSequence {
    val full = WidgetStore.formatMoney(currency, amount)
    val styled = SpannableString(full)
    if (currency.isNotEmpty()) {
      styled.setSpan(RelativeSizeSpan(0.62f), 0, currency.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    val dot = full.lastIndexOf('.')
    if (dot > 0) styled.setSpan(RelativeSizeSpan(0.62f), dot, full.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return styled
  }

  private fun logIntent(context: Context, mode: String, label: String?, requestCode: Int): PendingIntent {
    val intent = Intent(context, QuickLogActivity::class.java).apply {
      action = QuickLogActivity.ACTION
      putExtra(QuickLogActivity.EXTRA_MODE, mode)
      if (label != null) putExtra(QuickLogActivity.EXTRA_LABEL, label)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun searchIntent(context: Context): PendingIntent {
    val intent = Intent(context, SearchActivity::class.java).apply {
      action = SearchActivity.ACTION
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    return PendingIntent.getActivity(context, REQUEST_SEARCH, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }
}
