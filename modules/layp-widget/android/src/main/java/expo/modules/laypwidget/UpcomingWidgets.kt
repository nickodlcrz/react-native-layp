package expo.modules.laypwidget

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

// The Upcoming events widget, in 2x2 and 4x2. A scrolling list of what's
// coming in the next 7 days -- today and the six days after it, so on a Monday
// it covers Monday to Sunday and on Tuesday, Tuesday to Monday. The window is
// worked out when the widget is drawn (and the widget is redrawn at midnight),
// so it slides forward on its own. Which kinds of events are listed is chosen
// in the app's Settings > Widgets.
open class UpcomingWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, UpcomingRenderer.build(context, id))
    appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.layp_up_list)
  }

  override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    appWidgetManager.updateAppWidget(appWidgetId, UpcomingRenderer.build(context, appWidgetId))
    appWidgetManager.notifyAppWidgetViewDataChanged(intArrayOf(appWidgetId), R.id.layp_up_list)
  }

  // A new day moves the 7-day window.
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> WidgetRefresh.all(context)
    }
  }

  companion object {
    private val PROVIDERS = listOf(UpcomingWidget2x2Provider::class.java, UpcomingWidget4x2Provider::class.java)

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (cls in PROVIDERS) {
        val ids = manager.getAppWidgetIds(ComponentName(context, cls))
        if (ids.isEmpty()) continue
        for (id in ids) manager.updateAppWidget(id, UpcomingRenderer.build(context, id))
        manager.notifyAppWidgetViewDataChanged(ids, R.id.layp_up_list)
      }
    }

    fun installedCount(context: Context): Int {
      val manager = AppWidgetManager.getInstance(context)
      return PROVIDERS.sumOf { manager.getAppWidgetIds(ComponentName(context, it)).size }
    }
  }
}

class UpcomingWidget2x2Provider : UpcomingWidgetProvider()
class UpcomingWidget4x2Provider : UpcomingWidgetProvider()

object UpcomingRenderer {
  private const val REQUEST_TEMPLATE = 400
  private const val REQUEST_OPEN_APP = 401

  fun build(context: Context, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.layp_widget_upcoming)
    if (AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, UpcomingWidget2x2Provider::class.java)).contains(widgetId)) {
      SquareWidget.apply(context, views, widgetId, R.id.layp_up_square)
    }
    val summary = WidgetStore.readSummary(context)
    val p = Palette.resolve(context, summary.theme)
    val (start, end) = WidgetStore.upcomingRange()

    views.setInt(R.id.layp_up_root, "setBackgroundResource", p.cardBg)
    views.setInt(R.id.layp_up_header, "setBackgroundResource", p.heroTop)
    views.setTextColor(R.id.layp_up_empty, p.muted)
    views.setTextViewText(R.id.layp_up_range, "${CalendarMath.shortDate(start)} \u2013 ${CalendarMath.shortDate(end)}")

    val service = Intent(context, UpcomingListService::class.java).apply {
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
    }
    views.setRemoteAdapter(R.id.layp_up_list, service)
    views.setEmptyView(R.id.layp_up_list, R.id.layp_up_empty)
    views.setPendingIntentTemplate(R.id.layp_up_list, WidgetIntents.itemTemplate(context, REQUEST_TEMPLATE))
    WidgetIntents.openApp(context, REQUEST_OPEN_APP)?.let { views.setOnClickPendingIntent(R.id.layp_up_header, it) }
    return views
  }
}

class UpcomingListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = UpcomingListFactory(applicationContext)
}

class UpcomingListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var events: List<WidgetEvent> = emptyList()
  private var palette: Palette = Palette.LIGHT
  private var today: String = WidgetStore.today()
  private var currency: String = "\u20B1"
  private var hidden: Boolean = false

  override fun onCreate() {}

  override fun onDataSetChanged() {
    val summary = WidgetStore.readSummary(context)
    palette = Palette.resolve(context, summary.theme)
    today = WidgetStore.today()
    currency = summary.currency
    hidden = summary.hidden
    events = WidgetStore.upcomingWindow(context)
  }

  override fun onDestroy() {}

  override fun getCount(): Int = events.size

  override fun getViewAt(position: Int): RemoteViews {
    val rv = RemoteViews(context.packageName, R.layout.layp_widget_upcoming_row)
    val e = events.getOrNull(position) ?: return rv
    val p = palette
    val days = CalendarMath.daysBetween(today, e.date)

    rv.setInt(R.id.layp_up_row, "setBackgroundResource", p.chipBg)

    // The date badge appears on the first event of each day; the rest of that
    // day's events line up under it with the badge left blank. Today's is filled.
    val firstOfDay = position == 0 || events[position - 1].date != e.date
    val isToday = days == 0
    if (firstOfDay) {
      val parts = CalendarMath.parse(e.date)!!
      rv.setTextViewText(R.id.layp_up_dow, CalendarMath.WEEKDAYS[CalendarMath.weekdayIndex(parts[0], parts[1], parts[2])].substring(0, 3).uppercase())
      rv.setTextViewText(R.id.layp_up_day, parts[2].toString())
    } else {
      rv.setTextViewText(R.id.layp_up_dow, "")
      rv.setTextViewText(R.id.layp_up_day, "")
    }
    rv.setInt(R.id.layp_up_badge, "setBackgroundResource", if (firstOfDay && isToday) R.drawable.layp_up_today_badge else 0)
    rv.setTextColor(R.id.layp_up_dow, if (isToday) 0xFFFFFFFF.toInt() else p.muted)
    rv.setTextColor(R.id.layp_up_day, if (isToday) 0xFFFFFFFF.toInt() else p.text)

    // Title in full (it wraps), then the event's type and how soon it is.
    rv.setTextViewText(R.id.layp_up_name, e.title)
    rv.setTextColor(R.id.layp_up_name, p.text)
    val amount = e.amount
    val money = if (amount != null && amount > 0 && !hidden) " \u00B7 ${WidgetStore.formatMoney(currency, amount)}" else ""
    rv.setTextViewText(R.id.layp_up_sub, "${EventStyle.label(e.kind)}$money \u00B7 ${CalendarMath.relative(days)}")
    rv.setTextColor(R.id.layp_up_sub, p.muted)
    rv.setImageViewResource(R.id.layp_up_icon, EventStyle.icon(e.kind))
    rv.setInt(R.id.layp_up_icon, "setColorFilter", EventStyle.color(e.kind))

    rv.setOnClickFillInIntent(R.id.layp_up_row, Intent().putExtra(WidgetActionActivity.EXTRA_OP, WidgetActionActivity.OP_OPEN))
    return rv
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 1
  override fun getItemId(position: Int): Long = position.toLong()
  override fun hasStableIds(): Boolean = false
}
