package expo.modules.laypwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews

// The Calendar widget (4x2): the month takes most of the room, Sunday-first,
// with today in a navy pill and a small mark on each day that has something
// coming up -- a heart for dates, a pencil for school work, a coin for
// payments, a check for tasks, a bell for reminders. Today is also shown as a
// big date on a navy panel at the right. The arrows browse months and tapping
// the title comes back to this one. What gets a mark is chosen in the app's
// Settings > Widgets (the app filters the events it pushes).
class CalendarWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, CalendarRenderer.build(context, id))
  }

  override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    appWidgetManager.updateAppWidget(appWidgetId, CalendarRenderer.build(context, appWidgetId))
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      ACTION_PREV -> browse(context, WidgetStore.calendarOffset(context) - 1)
      ACTION_NEXT -> browse(context, WidgetStore.calendarOffset(context) + 1)
      ACTION_RESET -> browse(context, 0)
      // A new day: snap back to the current month and move "today" along.
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> {
        WidgetStore.setCalendarOffset(context, 0)
        WidgetRefresh.all(context)
      }
    }
  }

  private fun browse(context: Context, offset: Int) {
    // A year back to two years ahead is plenty; keeps a stuck finger from scrolling forever.
    WidgetStore.setCalendarOffset(context, offset.coerceIn(-12, 24))
    refreshAll(context)
  }

  companion object {
    const val ACTION_PREV = "expo.modules.laypwidget.CAL_PREV"
    const val ACTION_NEXT = "expo.modules.laypwidget.CAL_NEXT"
    const val ACTION_RESET = "expo.modules.laypwidget.CAL_RESET"

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (id in manager.getAppWidgetIds(ComponentName(context, CalendarWidgetProvider::class.java))) {
        manager.updateAppWidget(id, CalendarRenderer.build(context, id))
      }
    }

    fun installedCount(context: Context): Int =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, CalendarWidgetProvider::class.java)).size
  }
}

object CalendarRenderer {
  private const val REQUEST_PREV = 300
  private const val REQUEST_NEXT = 301
  private const val REQUEST_RESET = 302
  private const val REQUEST_OPEN_APP = 303

  // A mark on a day: which icon and what color.
  private class Mark(val icon: Int, val color: Int)

  // The (up to two) marks for one day's events. Dates/anniversaries/monthsaries
  // share the heart, so they count as one mark; the most important kinds win.
  private fun marksFor(events: List<WidgetEvent>): List<Mark> {
    val out = ArrayList<Mark>(2)
    val seen = HashSet<Int>()
    for (e in events.sortedBy { EventStyle.markPriority(it.kind) }) {
      val icon = EventStyle.icon(e.kind)
      if (seen.add(icon)) out.add(Mark(icon, EventStyle.color(e.kind)))
      if (out.size == 2) break
    }
    return out
  }

  private fun broadcast(context: Context, action: String, requestCode: Int): PendingIntent {
    val intent = Intent(context, CalendarWidgetProvider::class.java).setAction(action)
    return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  fun build(context: Context, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.layp_widget_calendar)
    val summary = WidgetStore.readSummary(context)
    val p = Palette.resolve(context, summary.theme)
    val minHeight = AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId).getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 160)
    val compact = minHeight < 180
    val todayIso = WidgetStore.today()
    val today = CalendarMath.parse(todayIso)!!

    // Which month is showing: this one, shifted by the arrows.
    val offset = WidgetStore.calendarOffset(context)
    val shown = CalendarMath.shiftMonth(today[0], today[1], offset)
    val grid = CalendarMath.monthGrid(shown.first, shown.second)
    val monthPrefix = "${shown.first}-${String.format(java.util.Locale.US, "%02d", shown.second + 1)}-"
    val eventsByDay = summary.events.filter { it.date.startsWith(monthPrefix) }.groupBy { it.date }

    views.setInt(R.id.layp_cal_root, "setBackgroundResource", p.cardBg)
    views.setTextViewText(R.id.layp_cal_title, CalendarMath.monthTitle(shown.first, shown.second))
    views.setTextColor(R.id.layp_cal_title, p.text)
    views.setTextColor(R.id.layp_cal_prev, p.muted)
    views.setTextColor(R.id.layp_cal_next, p.muted)
    views.setOnClickPendingIntent(R.id.layp_cal_prev, broadcast(context, CalendarWidgetProvider.ACTION_PREV, REQUEST_PREV))
    views.setOnClickPendingIntent(R.id.layp_cal_next, broadcast(context, CalendarWidgetProvider.ACTION_NEXT, REQUEST_NEXT))
    views.setOnClickPendingIntent(R.id.layp_cal_title, broadcast(context, CalendarWidgetProvider.ACTION_RESET, REQUEST_RESET))

    for (i in 0 until 7) {
      views.setTextViewText(CalendarIds.WEEKDAYS[i], CalendarMath.WEEKDAYS[i].take(2))
      views.setTextColor(CalendarIds.WEEKDAYS[i], p.muted)
    }

    // Only as many week rows as the month needs, so it never shows a blank row.
    for (r in 0 until 6) {
      views.setViewVisibility(CalendarIds.ROWS[r], if (r < grid.weeks) View.VISIBLE else View.GONE)
    }
    for (i in 0 until 42) {
      val cell = grid.cells[i]
      val isToday = cell.iso == todayIso
      val dayEvents = eventsByDay[cell.iso].orEmpty()
      views.setContentDescription(CalendarIds.CELLS[i], "${cell.iso}${if (isToday) ", Today" else ""}${if (dayEvents.isNotEmpty()) ", " + dayEvents.joinToString { it.title } else ""}")
      views.setTextViewText(CalendarIds.TEXTS[i], cell.day.toString())
      when {
        isToday -> {
          views.setInt(CalendarIds.CELLS[i], "setBackgroundResource", R.drawable.layp_cal_today_day)
          views.setTextColor(CalendarIds.TEXTS[i], p.onAccent)
        }
        !cell.inMonth -> {
          views.setInt(CalendarIds.CELLS[i], "setBackgroundResource", 0)
          views.setTextColor(CalendarIds.TEXTS[i], p.faint)
        }
        else -> {
          views.setInt(CalendarIds.CELLS[i], "setBackgroundResource", if (dayEvents.isNotEmpty()) R.drawable.layp_cal_event_day else 0)
          views.setTextColor(CalendarIds.TEXTS[i], if (i % 7 == 0 || i % 7 == 6) 0xFFC6D2FF.toInt() else p.text)
        }
      }

      // The marks. Days from the neighbouring months get none; on today's navy
      // pill they're drawn white so they stay visible.
      val marks = if (cell.inMonth && !compact) marksFor(dayEvents) else emptyList()
      val slots = intArrayOf(CalendarIds.ICON_A[i], CalendarIds.ICON_B[i])
      for (s in slots.indices) {
        val mark = marks.getOrNull(s)
        if (mark == null) {
          views.setViewVisibility(slots[s], View.GONE)
        } else {
          views.setViewVisibility(slots[s], View.VISIBLE)
          views.setImageViewResource(slots[s], mark.icon)
          views.setInt(slots[s], "setColorFilter", if (isToday) p.onAccent else mark.color)
        }
      }
    }

    // Today as a big date, on the navy panel.
    views.setInt(R.id.layp_cal_today_panel, "setBackgroundResource", p.heroPanel)
    views.setTextViewText(R.id.layp_cal_weekday, CalendarMath.WEEKDAYS[CalendarMath.weekdayIndex(today[0], today[1], today[2])])
    views.setTextViewText(R.id.layp_cal_daynum, today[2].toString())
    views.setTextViewText(R.id.layp_cal_monthyear, CalendarMath.monthTitle(today[0], today[1]))

    WidgetIntents.openApp(context, REQUEST_OPEN_APP)?.let { views.setOnClickPendingIntent(R.id.layp_cal_today_panel, it) }
    WidgetAppearance.apply(context, views, views.layoutId, R.id.layp_cal_root)
    CalendarIds.TEXTS.forEach { views.setTextViewTextSize(it, android.util.TypedValue.COMPLEX_UNIT_SP, (if (compact) 10f else 12f) * summary.fontScale) }
    return views
  }
}
