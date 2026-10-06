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

/**
 * 2x2 Today\'s Classes widget.
 *
 * Before a class starts: show the remaining classes today, with the first one
 * highlighted. While a class is running: show only that class and a soft
 * one-second blink. When it ends, the next class becomes the first/highlighted
 * class. If today is finished, the next scheduled class is shown.
 */
class ClassWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    ids.forEach { manager.updateAppWidget(it, ClassRenderer.build(context, it)) }
    scheduleNextRefresh(context)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    manager.updateAppWidget(id, ClassRenderer.build(context, id))
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
    }

    fun installedCount(context: Context): Int =
      AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, ClassWidgetProvider::class.java)).size

    fun scheduleNextRefresh(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids = manager.getAppWidgetIds(ComponentName(context, ClassWidgetProvider::class.java))
      if (ids.isEmpty()) return
      val summary = WidgetStore.readSummary(context)
      val nowMin = Calendar.getInstance().let { it.get(Calendar.HOUR_OF_DAY) * 60 + it.get(Calendar.MINUTE) }
      val current = summary.classes.firstOrNull { nowMin >= it.startMin && nowMin < it.endMin }
      val nextMinute = if (current != null) {
        // While a class is running, update once a minute so elapsed/remaining
        // time stays live. The animation itself does not need a JS timer.
        System.currentTimeMillis() + 60_000L
      } else {
        val next = summary.classes.firstOrNull { it.startMin > nowMin }
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
      alarm.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextMinute, pi)
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

private object ClassRenderer {
  private val rowIds = intArrayOf(R.id.layp_class_row_0, R.id.layp_class_row_1, R.id.layp_class_row_2, R.id.layp_class_row_3)
  private val nameIds = intArrayOf(R.id.layp_class_name_0, R.id.layp_class_name_1, R.id.layp_class_name_2, R.id.layp_class_name_3)
  private val metaIds = intArrayOf(R.id.layp_class_meta_0, R.id.layp_class_meta_1, R.id.layp_class_meta_2, R.id.layp_class_meta_3)
  private val blinkIds = intArrayOf(R.id.layp_class_blink_0, R.id.layp_class_blink_1, R.id.layp_class_blink_2, R.id.layp_class_blink_3)
  private val actionIds = intArrayOf(R.id.layp_class_action_0, R.id.layp_class_action_1, R.id.layp_class_action_2, R.id.layp_class_action_3)
  private const val REQUEST_BASE = 8900

  fun build(context: Context, widgetId: Int): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.layp_widget_class)
    val summary = WidgetStore.readSummary(context)
    val now = Calendar.getInstance()
    val nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE)
    val pending = WidgetStore.pendingClassSuspends(context)
      .mapNotNull { pair ->
        val parts = pair.second.split("|", limit = 2)
        if (parts.size == 2) parts[0] to parts[1] else null
      }.toSet()

    // How many rows fit: ~44dp for padding + header, ~42dp per row. Showing
    // fewer rows than the launcher has room for is fine; showing more gets
    // the bottom one clipped.
    val minHeight = AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId)
      .getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
    val capacity = ((minHeight - 44) / 42).coerceIn(1, 4)

    val classes = summary.classes.filterNot { c -> pending.contains(summary.date to c.entryId) }
    val ongoing = classes.firstOrNull { nowMin >= it.startMin && nowMin < it.endMin }
    val shown = (
      if (ongoing != null) listOf(ongoing)
      else if (classes.any { it.dayLabel == "Today" }) classes.filter { it.startMin > nowMin }
      else classes.take(1)
    ).take(capacity)

    val stateText = when {
      ongoing != null -> "LIVE"
      shown.isEmpty() -> "Done"
      shown.first().dayLabel != "Today" -> shown.first().dayLabel
      else -> "Today"
    }
    v.setTextViewText(R.id.layp_class_header_state, stateText)
    v.setInt(R.id.layp_class_header_state, "setBackgroundResource", if (ongoing != null) R.drawable.layp_class_pill_live else R.drawable.layp_class_pill)
    v.setTextColor(R.id.layp_class_header_state, if (ongoing != null) 0xFF7CF2A8.toInt() else 0xD9FFFFFF.toInt())

    if (shown.isEmpty()) {
      v.setViewVisibility(R.id.layp_class_empty, View.VISIBLE)
      v.setTextViewText(R.id.layp_class_empty, if (classes.isEmpty()) "No classes scheduled" else "All done for today")
    } else {
      v.setViewVisibility(R.id.layp_class_empty, View.GONE)
    }

    for (i in rowIds.indices) {
      if (i >= shown.size) {
        v.setViewVisibility(rowIds[i], View.GONE)
        continue
      }
      val c = shown[i]
      val isOngoing = ongoing?.entryId == c.entryId
      v.setViewVisibility(rowIds[i], View.VISIBLE)
      v.setInt(
        rowIds[i], "setBackgroundResource",
        when {
          isOngoing -> R.drawable.layp_class_row_live
          i == 0 -> R.drawable.layp_class_row_highlight
          else -> R.drawable.layp_class_row
        }
      )
      v.setTextViewText(nameIds[i], c.code)

      val meta = if (isOngoing) {
        "${elapsedText(nowMin - c.startMin)} elapsed · ${elapsedText(c.endMin - nowMin)} left"
      } else {
        buildString {
          if (c.dayLabel != "Today") append(c.dayLabel).append(" · ")
          append(formatTime(c.start)).append("–").append(formatTime(c.end))
          if (c.room.isNotBlank()) append(" · ").append(c.room)
        }
      }
      v.setTextViewText(metaIds[i], meta)
      v.setViewVisibility(blinkIds[i], if (isOngoing) View.VISIBLE else View.GONE)

      // Every class that is still to come today can be cancelled, not just the
      // first row. Tapping opens a confirmation popup (see
      // ClassWidgetActionActivity) -- nothing is cancelled by the tap itself.
      val cancellable = c.dayLabel == "Today"
      v.setViewVisibility(actionIds[i], if (cancellable) View.VISIBLE else View.GONE)
      if (cancellable) {
        val cancelIntent = Intent(context, ClassWidgetActionActivity::class.java).apply {
          action = ClassWidgetActionActivity.ACTION
          putExtra(ClassWidgetActionActivity.EXTRA_ENTRY_ID, c.entryId)
          putExtra(ClassWidgetActionActivity.EXTRA_DATE, summary.date)
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pi = PendingIntent.getActivity(
          context, REQUEST_BASE + widgetId * 8 + i, cancelIntent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        v.setOnClickPendingIntent(actionIds[i], pi)
        v.setContentDescription(actionIds[i], "Cancel ${c.code} today")
      }
    }
    WidgetIntents.openApp(context, REQUEST_BASE + 7000 + widgetId)?.let { v.setOnClickPendingIntent(R.id.layp_class_header, it) }
    return v
  }

  private fun elapsedText(minutes: Int): String {
    val m = minutes.coerceAtLeast(0)
    return if (m >= 60) "${m / 60}h ${m % 60}m" else "${m}m"
  }

  private fun formatTime(value: String): String {
    val parts = value.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: return value
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
    val am = if (h < 12) "AM" else "PM"
    val hour = when {
      h % 12 == 0 -> 12
      else -> h % 12
    }
    return String.format(Locale.US, "%d:%02d %s", hour, m, am)
  }
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
        text = "It won't send its reminder or ring the alarm again today. This only affects today; the class stays on your schedule."
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
    WidgetStore.enqueueClassSuspend(this, entryId, date)
    ClassWidgetProvider.refreshAll(this)
    ClassWidgetProvider.scheduleNextRefresh(this)
    android.widget.Toast.makeText(this, "Class cancelled for today", android.widget.Toast.LENGTH_SHORT).show()
    finish()
  }
}
