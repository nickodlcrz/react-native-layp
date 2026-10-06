package expo.modules.laypwidget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import java.util.Calendar
import java.util.Locale

/** A square, scrolling schedule that focuses on the currently ongoing class. */
class ClassWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { manager.updateAppWidget(it, ClassRenderer.build(context, it)) }
    manager.notifyAppWidgetViewDataChanged(ids, R.id.layp_class_list)
    scheduleNextRefresh(context)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    manager.updateAppWidget(id, ClassRenderer.build(context, id))
    manager.notifyAppWidgetViewDataChanged(intArrayOf(id), R.id.layp_class_list)
    scheduleNextRefresh(context)
  }

  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    if (intent.action == ACTION_REFRESH || intent.action == Intent.ACTION_DATE_CHANGED || intent.action == Intent.ACTION_TIME_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED) {
      refreshAll(context)
      scheduleNextRefresh(context)
    }
  }

  companion object {
    const val ACTION_REFRESH = "expo.modules.laypwidget.CLASS_WIDGET_REFRESH"
    private const val REQUEST_REFRESH = 8801

    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ClassWidgetProvider::class.java))
      if (ids.isEmpty()) return
      ids.forEach { manager.updateAppWidget(it, ClassRenderer.build(context, it)) }
      manager.notifyAppWidgetViewDataChanged(ids, R.id.layp_class_list)
      scheduleNextRefresh(context)
    }

    fun installedCount(context: Context): Int =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, ClassWidgetProvider::class.java)).size

    fun scheduleNextRefresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ClassWidgetProvider::class.java))
      if (ids.isEmpty()) return
      val nowMin = Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }
      val current = ClassDisplay.ongoing(context)
      val nextMinute = if (current != null) {
        // The native countdown runs itself. Redraw at the class end.
        Calendar.getInstance().apply {
          set(Calendar.HOUR_OF_DAY, current.endMin / 60)
          set(Calendar.MINUTE, current.endMin % 60)
          set(Calendar.SECOND, 0)
          set(Calendar.MILLISECOND, 0)
        }.timeInMillis
      } else {
        val next = ClassDisplay.remaining(context).firstOrNull { it.dayLabel == "Today" && it.startMin > nowMin }
        if (next != null) {
          val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, next.startMin / 60)
            set(Calendar.MINUTE, next.startMin % 60)
            set(Calendar.SECOND, 2)
            set(Calendar.MILLISECOND, 0)
          }
          cal.timeInMillis.coerceAtLeast(System.currentTimeMillis() + 5_000L)
        } else {
          // No later class today. Wake around midnight to allow the widget to
          // pick up tomorrow\'s schedule from the latest pushed summary.
          Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 1)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
          }.timeInMillis
        }
      }
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val pi = refreshPendingIntent(context)
      alarm.cancel(pi)
      try {
        if (android.os.Build.VERSION.SDK_INT < 31 || alarm.canScheduleExactAlarms()) {
          alarm.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextMinute, pi)
        } else {
          alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextMinute, pi)
        }
      } catch (_: SecurityException) {
        // The exact-alarm grant can change between checking and scheduling.
        alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextMinute, pi)
      }
    }

    private fun refreshPendingIntent(context: Context): PendingIntent =
      PendingIntent.getBroadcast(
        context,
        REQUEST_REFRESH,
        Intent(context, ClassWidgetProvider::class.java).setAction(ACTION_REFRESH),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
  }
}

internal object ClassDisplay {
  fun remaining(context: Context): List<WidgetClass> {
    val summary = WidgetStore.readSummary(context)
    val suspended = WidgetStore.pendingClassSuspends(context).map { it.second }.toSet()
    val now = Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }
    return summary.classes.filterNot { "${summary.date}|${it.entryId}" in suspended }
      .filter { it.dayLabel != "Today" || (summary.date == WidgetStore.today() && it.endMin > now) }
  }
  fun ongoing(context: Context): WidgetClass? {
    val now = Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }
    return remaining(context).firstOrNull { it.dayLabel == "Today" && now >= it.startMin && now < it.endMin }
  }
  fun time(value: String): String {
    val parts = value.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: return value
    val m = parts.getOrNull(1)?.toIntOrNull() ?: return value
    return String.format(Locale.US, "%d:%02d %s", if (h % 12 == 0) 12 else h % 12, m, if (h < 12) "AM" else "PM")
  }

}

private object ClassRenderer {
  fun build(context: Context, widgetId: Int): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.layp_widget_class)
    SquareWidget.apply(context, v, widgetId, R.id.layp_class_square)
    val ongoing = ClassDisplay.ongoing(context)
    val classes = ClassDisplay.remaining(context)
    v.setTextViewText(R.id.layp_class_header_state, if (ongoing != null) "LIVE" else classes.firstOrNull()?.dayLabel.orEmpty())
    v.setTextColor(R.id.layp_class_header_state, if (ongoing != null) 0xFF9CE8CC.toInt() else 0xCCFFFFFF.toInt())
    v.setViewVisibility(R.id.layp_class_list, if (classes.isNotEmpty()) View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.layp_class_empty, if (classes.isEmpty()) View.VISIBLE else View.GONE)
    v.setTextViewText(R.id.layp_class_empty, "No more classes today")
    val service = Intent(context, ClassListService::class.java).apply {
      putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
      data = android.net.Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
    }
    v.setRemoteAdapter(R.id.layp_class_list, service)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    v.setPendingIntentTemplate(R.id.layp_class_list, PendingIntent.getActivity(context, 890000 + widgetId, Intent(context, ClassWidgetActionActivity::class.java).setAction(ClassWidgetActionActivity.ACTION), flags))
    WidgetIntents.openApp(context, 896000 + widgetId)?.let { v.setOnClickPendingIntent(R.id.layp_class_header, it) }
    return v
  }
}

class ClassListService : android.widget.RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = ClassListFactory(applicationContext)
}

class ClassListFactory(private val context: Context) : android.widget.RemoteViewsService.RemoteViewsFactory {
  private var classes: List<WidgetClass> = emptyList()
  private var ongoing: WidgetClass? = null
  override fun onCreate() {}
  override fun onDataSetChanged() {
    ongoing = ClassDisplay.ongoing(context)
    classes = ongoing?.let { listOf(it) } ?: ClassDisplay.remaining(context)
  }
  override fun onDestroy() {}
  override fun getCount() = classes.size
  override fun getViewAt(position: Int): RemoteViews {
    val live = ongoing
    if (live != null) {
      val v = RemoteViews(context.packageName, R.layout.layp_widget_class_live)
      v.setTextViewText(R.id.layp_class_live_title, "${live.code} is ongoing right now")
      v.setTextViewText(R.id.layp_class_live_time, "${ClassDisplay.time(live.start)} – ${ClassDisplay.time(live.end)}")
      val end = Calendar.getInstance().apply { set(Calendar.HOUR_OF_DAY, live.endMin / 60); set(Calendar.MINUTE, live.endMin % 60); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }.timeInMillis
      v.setChronometerCountDown(R.id.layp_class_remaining, true)
      v.setChronometer(R.id.layp_class_remaining, android.os.SystemClock.elapsedRealtime() + end - System.currentTimeMillis(), null, true)
      v.setOnClickFillInIntent(R.id.layp_class_live_cancel, Intent().putExtra(ClassWidgetActionActivity.EXTRA_ENTRY_ID, live.entryId).putExtra(ClassWidgetActionActivity.EXTRA_DATE, WidgetStore.today()))
      return v
    }
    val v = RemoteViews(context.packageName, R.layout.layp_widget_class_row)
    val c = classes.getOrNull(position) ?: return v
    v.setTextViewText(R.id.layp_class_row_name, c.code)
    v.setTextViewText(R.id.layp_class_row_time, "${ClassDisplay.time(c.start)} – ${ClassDisplay.time(c.end)}")
    v.setTextViewText(R.id.layp_class_row_room, listOf(c.dayLabel.takeIf { it != "Today" }.orEmpty(), c.room).filter { it.isNotBlank() }.joinToString(" · "))
    v.setViewVisibility(R.id.layp_class_row_room, if (c.room.isNotBlank() || c.dayLabel != "Today") View.VISIBLE else View.GONE)
    v.setViewVisibility(R.id.layp_class_row_cancel, if (c.dayLabel == "Today") View.VISIBLE else View.GONE)
    v.setOnClickFillInIntent(R.id.layp_class_row_cancel, Intent().putExtra(ClassWidgetActionActivity.EXTRA_ENTRY_ID, c.entryId).putExtra(ClassWidgetActionActivity.EXTRA_DATE, WidgetStore.today()))
    return v
  }
  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount() = 2
  override fun getItemId(position: Int) = classes.getOrNull(position)?.entryId?.hashCode()?.toLong() ?: position.toLong()
  override fun hasStableIds() = true
}

// Tapping "Cancel" on the Today's Classes widget opens this small confirmation
// popup instead of suspending straight away. Only the red "Cancel class"
// button actually queues the suspension; "Keep class", tapping outside or the
// back button all leave the class alone.
class ClassWidgetActionActivity : android.app.Activity() {
  companion object {
    const val ACTION = "expo.modules.laypwidget.CLASS_WIDGET_ACTION"
    const val EXTRA_ENTRY_ID = "entryId"
    const val EXTRA_DATE = "date"
  }

  private fun dp(v: Int): Int = (v * resources.displayMetrics.density + 0.5f).toInt()

  private fun rounded(color: Int, radiusDp: Int, strokeColor: Int? = null): android.graphics.drawable.GradientDrawable =
    android.graphics.drawable.GradientDrawable().apply {
      setColor(color)
      cornerRadius = dp(radiusDp).toFloat()
      if (strokeColor != null) setStroke(dp(1), strokeColor)
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val entryId = intent.getStringExtra(EXTRA_ENTRY_ID)
    val date = intent.getStringExtra(EXTRA_DATE) ?: WidgetStore.today()
    if (entryId.isNullOrBlank()) {
      finish()
      return
    }

    val summary = WidgetStore.readSummary(this)
    val p = Palette.resolve(this, summary.theme)
    val cls = summary.classes.firstOrNull { it.entryId == entryId }
    val classLabel = cls?.code?.takeIf { it.isNotBlank() } ?: "this class"
    val detail = cls?.let {
      listOf(it.description, "${it.start}–${it.end}").filter { part -> part.isNotBlank() }.joinToString(" · ")
    }.orEmpty()

    setFinishOnTouchOutside(true)
    setContentView(buildDialog(p, classLabel, detail, entryId, date))
    window.setLayout(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.WRAP_CONTENT)
    window.setGravity(android.view.Gravity.CENTER)
    window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(android.graphics.Color.TRANSPARENT))
  }

  private fun buildDialog(p: Palette, classLabel: String, detail: String, entryId: String, date: String): android.view.View {
    val wrap = android.view.ViewGroup.LayoutParams.WRAP_CONTENT
    val match = android.view.ViewGroup.LayoutParams.MATCH_PARENT

    val card = android.widget.LinearLayout(this).apply {
      orientation = android.widget.LinearLayout.VERTICAL
      setPadding(dp(22), dp(22), dp(22), dp(18))
      background = rounded(p.surface, 24, p.line)
    }

    card.addView(
      android.widget.TextView(this).apply {
        text = "!"
        gravity = android.view.Gravity.CENTER
        textSize = 20f
        typeface = android.graphics.Typeface.DEFAULT_BOLD
        setTextColor(p.error)
        background = rounded((p.error and 0x00FFFFFF) or 0x33000000, 22)
      },
      android.widget.LinearLayout.LayoutParams(dp(44), dp(44)).apply { bottomMargin = dp(14) }
    )

    card.addView(android.widget.TextView(this).apply {
      text = "Cancel $classLabel today?"
      textSize = 18f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      setTextColor(p.text)
    })

    if (detail.isNotBlank()) {
      card.addView(
        android.widget.TextView(this).apply {
          text = detail
          textSize = 12f
          setTextColor(p.muted)
        },
        android.widget.LinearLayout.LayoutParams(match, wrap).apply { topMargin = dp(4) }
      )
    }

    card.addView(
      android.widget.TextView(this).apply {
        text = "The ringing alarm is skipped today. Home and School update when you open LAYP. Your weekly schedule stays."
        textSize = 13f
        setLineSpacing(0f, 1.15f)
        setTextColor(p.muted)
      },
      android.widget.LinearLayout.LayoutParams(match, wrap).apply { topMargin = dp(10) }
    )

    fun button(label: String, bg: Int, fg: Int, onClick: () -> Unit) = android.widget.TextView(this).apply {
      text = label
      gravity = android.view.Gravity.CENTER
      textSize = 14f
      typeface = android.graphics.Typeface.DEFAULT_BOLD
      setTextColor(fg)
      background = rounded(bg, 15)
      minHeight = dp(46)
      isClickable = true
      isFocusable = true
      contentDescription = label
      setOnClickListener { onClick() }
    }

    val row = android.widget.LinearLayout(this).apply { orientation = android.widget.LinearLayout.HORIZONTAL }
    row.addView(
      button("Keep class", p.chip, p.text) { finish() },
      android.widget.LinearLayout.LayoutParams(0, wrap, 1f).apply { marginEnd = dp(10) }
    )
    row.addView(
      button("Cancel class", p.error, 0xFFFFFFFF.toInt()) { confirmCancel(entryId, date) },
      android.widget.LinearLayout.LayoutParams(0, wrap, 1f)
    )
    card.addView(row, android.widget.LinearLayout.LayoutParams(match, wrap).apply { topMargin = dp(20) })

    // Transparent outer frame = the popup's side margins.
    return android.widget.FrameLayout(this).apply {
      setPadding(dp(24), dp(24), dp(24), dp(24))
      addView(card, android.widget.FrameLayout.LayoutParams(match, wrap))
    }
  }

  private fun confirmCancel(entryId: String, date: String) {
    val subjectId = WidgetStore.readSummary(this).classes.firstOrNull { it.entryId == entryId }?.subjectId ?: return
    if (date != WidgetStore.today()) { finish(); return }
    // Silence the native alarm immediately, even while React Native is closed.
    expo.modules.laypalarm.AlarmStore.setSkipToday(this, "class:$subjectId:$entryId", date)
    WidgetStore.enqueueClassSuspend(this, entryId, date, subjectId)
    ClassWidgetProvider.refreshAll(this)
    ClassWidgetProvider.scheduleNextRefresh(this)
    android.widget.Toast.makeText(this, "Class cancelled for today", android.widget.Toast.LENGTH_SHORT).show()
    finish()
  }
}
