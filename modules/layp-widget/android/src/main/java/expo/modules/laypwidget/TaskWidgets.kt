package expo.modules.laypwidget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.app.PendingIntent
import android.app.AlarmManager
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import android.widget.RemoteViewsService

// The Tasks widget, in two sizes. 4x4 and 4x6 are the same widget with a
// different default height: they share all the code below and only differ
// in the size declared in their res/xml info files, so each shows up
// separately in the launcher's widget picker.
open class TaskWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, TaskRenderer.build(context, id))
    appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetIds, R.id.layp_task_list)
    scheduleNextRefresh(context)
  }

  override fun onAppWidgetOptionsChanged(context: Context, appWidgetManager: AppWidgetManager, appWidgetId: Int, newOptions: Bundle) {
    appWidgetManager.updateAppWidget(appWidgetId, TaskRenderer.build(context, appWidgetId))
    appWidgetManager.notifyAppWidgetViewDataChanged(intArrayOf(appWidgetId), R.id.layp_task_list)
    scheduleNextRefresh(context)
  }

  override fun onDisabled(context: Context) { scheduleNextRefresh(context) }

  // Countdown text updates at minute boundaries; dates roll over at midnight.
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      ACTION_REFRESH -> refreshAll(context)
      Intent.ACTION_DATE_CHANGED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED -> WidgetRefresh.all(context)
    }
  }

  companion object {
    const val ACTION_REFRESH = "expo.modules.laypwidget.TASK_WIDGET_REFRESH"
    private val PROVIDERS = listOf(TaskWidget4x4Provider::class.java, TaskWidget4x6Provider::class.java)

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      for (cls in PROVIDERS) {
        val ids = manager.getAppWidgetIds(ComponentName(context, cls))
        if (ids.isEmpty()) continue
        for (id in ids) manager.updateAppWidget(id, TaskRenderer.build(context, id))
        manager.notifyAppWidgetViewDataChanged(ids, R.id.layp_task_list)
      }
      scheduleNextRefresh(context)
    }

    fun scheduleNextRefresh(context: Context) {
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val intent = Intent(context, TaskWidget4x4Provider::class.java).setAction(ACTION_REFRESH)
      val pi = PendingIntent.getBroadcast(context, 8820, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
      alarm.cancel(pi)
      if (installedCount(context) == 0 || WidgetStore.displayTasks(context).none { TaskDeadline.timestamp(it.due, it.dueTime) != null }) return
      val nextMinute = (System.currentTimeMillis() / 60000 + 1) * 60000 + 1000
      // Best-effort widget updates; Doze may batch these while the phone sleeps.
      alarm.setAndAllowWhileIdle(AlarmManager.RTC, nextMinute, pi)
    }

    fun installedCount(context: Context): Int {
      val manager = AppWidgetManager.getInstance(context)
      return PROVIDERS.sumOf { manager.getAppWidgetIds(ComponentName(context, it)).size }
    }
  }
}

class TaskWidget4x4Provider : TaskWidgetProvider()
class TaskWidget4x6Provider : TaskWidgetProvider()

object TaskRenderer {
  private const val REQUEST_TEMPLATE = 200
  private const val REQUEST_OPEN_APP = 201
  private const val REQUEST_ADD_TASK = 202

  fun build(context: Context, widgetId: Int): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.layp_widget_task)
    val summary = WidgetStore.readSummary(context)
    val p = Palette.resolve(context, summary.theme)
    val tasks = WidgetStore.displayTasks(context)

    // Card in the theme's surface color; the header band is the navy
    // gradient with white text (set in the layout).
    views.setInt(R.id.layp_task_root, "setBackgroundResource", p.cardBg)
    views.setInt(R.id.layp_task_header, "setBackgroundResource", p.heroTop)
    views.setTextColor(R.id.layp_task_empty, p.muted)
    views.setTextViewText(R.id.layp_task_count, if (tasks.isEmpty()) "Nothing open" else "${tasks.size} open")

    // "2 due soon": tasks that are red on the app's cards (due tomorrow,
    // today or overdue), so the header says what needs attention first.
    val today = WidgetStore.today()
    val dueSoon = tasks.count { Urgency.tier(it.status, it.due, today) == Tier.RED }
    if (dueSoon > 0) {
      views.setTextViewText(R.id.layp_task_pill, "$dueSoon due soon")
      views.setViewVisibility(R.id.layp_task_pill, View.VISIBLE)
    } else {
      views.setViewVisibility(R.id.layp_task_pill, View.GONE)
    }

    // The list is filled by TaskListService; the intent's data makes it unique
    // per widget so two placed widgets don't share one adapter.
    val service = Intent(context, TaskListService::class.java).apply {
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
    }
    views.setRemoteAdapter(R.id.layp_task_list, service)
    views.setEmptyView(R.id.layp_task_list, R.id.layp_task_empty)
    views.setPendingIntentTemplate(R.id.layp_task_list, WidgetIntents.itemTemplate(context, REQUEST_TEMPLATE))

    WidgetIntents.openApp(context, REQUEST_OPEN_APP)?.let { views.setOnClickPendingIntent(R.id.layp_task_header, it) }

    // (+) in the header: the "Add task" bottom sheet, without opening the app.
    val addIntent = Intent(context, AddTaskActivity::class.java).apply {
      action = AddTaskActivity.ACTION
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    views.setOnClickPendingIntent(
      R.id.layp_task_add,
      PendingIntent.getActivity(context, REQUEST_ADD_TASK, addIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    )
    views.setContentDescription(R.id.layp_task_add, "Add a task")
    WidgetAppearance.apply(context, views, views.layoutId, R.id.layp_task_root)
    return views
  }
}

class TaskListService : RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = TaskListFactory(applicationContext)
}

// Builds one row per open task. onDataSetChanged() re-reads the store each
// time the provider calls notifyAppWidgetViewDataChanged.
class TaskListFactory(private val context: Context) : RemoteViewsService.RemoteViewsFactory {
  private var tasks: List<WidgetTask> = emptyList()
  private var palette: Palette = Palette.LIGHT
  private var today: String = WidgetStore.today()

  override fun onCreate() {}

  override fun onDataSetChanged() {
    val summary = WidgetStore.readSummary(context)
    palette = Palette.resolve(context, summary.theme)
    tasks = WidgetStore.displayTasks(context)
    today = WidgetStore.today()
  }

  override fun onDestroy() {}

  override fun getCount(): Int = tasks.size

  override fun getViewAt(position: Int): RemoteViews {
    val rv = RemoteViews(context.packageName, R.layout.layp_widget_task_row)
    val t = tasks.getOrNull(position) ?: return rv
    val p = palette

    rv.setInt(R.id.layp_task_row, "setBackgroundResource", p.chipBg)

    // The status button is a clean, static ring. Its color/shape changes with
    // the task status, while only the urgency dot keeps its blink animation.
    rv.setImageViewResource(R.id.layp_task_ring_img, TaskStatus.ring(t.status))
    rv.setTextViewText(R.id.layp_task_name, t.title)
    rv.setTextColor(R.id.layp_task_name, p.text)

    // "School · EE 301": the task's category and, for school work, its subject code.
    val meta = listOf(t.categoryLabel, t.subject).filter { it.isNotEmpty() }.joinToString(" \u00B7 ")
    rv.setTextViewText(R.id.layp_task_meta, meta)
    rv.setViewVisibility(R.id.layp_task_meta, if (meta.isEmpty()) View.GONE else View.VISIBLE)
    rv.setTextColor(R.id.layp_task_meta, p.eventText)
    rv.setTextViewText(R.id.layp_task_status, TaskStatus.label(t.status))
    rv.setTextViewText(R.id.layp_task_progress, if (t.subtaskCount > 0) "${t.subtaskDone}/${t.subtaskCount} steps completed · ${t.subtaskDone * 100 / t.subtaskCount}%" else "")
    rv.setViewVisibility(R.id.layp_task_progress, if (t.subtaskCount > 0) View.VISIBLE else View.GONE)
    rv.setViewVisibility(R.id.layp_task_progress_bar, if (t.subtaskCount > 0) View.VISIBLE else View.GONE)
    rv.setProgressBar(R.id.layp_task_progress_bar, 100, if (t.subtaskCount > 0) t.subtaskDone * 100 / t.subtaskCount else 0, false)
    rv.setTextColor(R.id.layp_task_status, p.muted)

    // Same urgency rules as the dot/border on the app's task cards.
    val tier = Urgency.tier(t.status, t.due, today)
    val dueText = Urgency.dueText(t.due, today) + (t.dueTime?.let { " · ${ClassDisplay.time(it)}" } ?: "")
    val countdown = TaskDeadline.text(t.due, t.dueTime)
    rv.setTextViewText(R.id.layp_task_countdown, countdown)
    rv.setTextColor(R.id.layp_task_countdown, Urgency.color(tier, p))
    rv.setViewVisibility(R.id.layp_task_countdown, if (countdown.isBlank()) View.GONE else View.VISIBLE)
    rv.setTextViewText(R.id.layp_task_due, dueText)
    rv.setViewVisibility(R.id.layp_task_due, if (dueText.isEmpty()) View.GONE else View.VISIBLE)
    rv.setTextColor(R.id.layp_task_due, Urgency.color(tier, p))
    // The card's colored edge: urgency when there is any, else the status color.
    rv.setInt(R.id.layp_task_bar, "setColorFilter", if (tier == Tier.NONE) TaskStatus.color(t.status, p) else Urgency.color(tier, p))

    // The blinking dot, at the same speeds as the app's task cards: red is
    // fast, yellow medium, green (To pass) slow. Exactly one of the three
    // flippers is shown; a hidden one doesn't animate.
    val dotColor = Urgency.color(tier, p)
    for (dot in BLINK_DOTS) {
      val show = dot.tier == tier
      rv.setViewVisibility(dot.flipper, if (show) View.VISIBLE else View.GONE)
      if (show) {
        rv.setInt(dot.on, "setColorFilter", dotColor)
        rv.setInt(dot.off, "setColorFilter", dotColor)
      }
    }

    // The circle moves the task to its next status; the rest of the row opens LAYP.
    rv.setOnClickFillInIntent(
      R.id.layp_task_ring,
      Intent().putExtra(WidgetActionActivity.EXTRA_OP, WidgetActionActivity.OP_ADVANCE).putExtra(WidgetActionActivity.EXTRA_TASK_ID, t.id)
    )
    rv.setOnClickFillInIntent(
      R.id.layp_task_body,
      Intent().putExtra(WidgetActionActivity.EXTRA_OP, WidgetActionActivity.OP_OPEN)
    )
    WidgetAppearance.apply(context, rv, rv.layoutId)
    return rv
  }

  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount(): Int = 1
  override fun getItemId(position: Int): Long = (tasks.getOrNull(position)?.id?.hashCode() ?: position).toLong()
  override fun hasStableIds(): Boolean = true

  // One blinking-dot flipper per urgency tier (see layp_widget_task_row.xml).
  private class BlinkDot(val tier: Tier, val flipper: Int, val on: Int, val off: Int)

  private companion object {
    val BLINK_DOTS = listOf(
      BlinkDot(Tier.RED, R.id.layp_task_blink_fast, R.id.layp_task_dot_fast_on, R.id.layp_task_dot_fast_off),
      BlinkDot(Tier.YELLOW, R.id.layp_task_blink_medium, R.id.layp_task_dot_medium_on, R.id.layp_task_dot_medium_off),
      BlinkDot(Tier.GREEN, R.id.layp_task_blink_slow, R.id.layp_task_dot_slow_on, R.id.layp_task_dot_slow_off)
    )
  }
}
