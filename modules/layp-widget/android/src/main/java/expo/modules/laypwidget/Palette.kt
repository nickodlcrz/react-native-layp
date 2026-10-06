package expo.modules.laypwidget

import android.content.Context
// The widgets and dialogs follow LAYP's own light/dark choice (pushed in
// the summary as "theme"), not just the phone's: someone can run the app in
// dark mode on a light phone. Backgrounds are drawables, so each palette
// names its own set; text/icon colors are applied directly.
// Values mirror src/theme.js.
class Palette(
  val dark: Boolean,
  val surface: Int,
  val chip: Int,
  val line: Int,
  val text: Int,
  val muted: Int,
  val accent: Int,
  val onAccent: Int,
  val warn: Int,
  val error: Int,
  val eventText: Int
) {
  // Out-of-month calendar days: the muted color at ~40% opacity.
  val faint: Int get() = (muted and 0x00FFFFFF) or 0x66000000

  val cardBg: Int get() = R.drawable.layp_widget_glass_dark
  val chipBg: Int get() = R.drawable.layp_widget_chip_bg_dark
  val accentOval: Int get() = R.drawable.layp_widget_accent_dark
  val accentPill: Int get() = R.drawable.layp_widget_pill_dark

  // Liquid Glass surfaces. Android RemoteViews cannot blur the launcher's
  // wallpaper, so these use transparent gradients + specular borders to
  // reproduce the same clear/frosted visual language at very low cost.
  val heroBg: Int get() = R.drawable.layp_widget_glass_dark
  val heroTop: Int get() = R.drawable.layp_widget_glass_top_dark
  val heroPanel: Int get() = R.drawable.layp_widget_glass_panel_dark

  companion object {
    val HERO_TEXT = 0xFFFFFFFF.toInt()
    val HERO_MUTED = 0xB3FFFFFF.toInt()

    val LIGHT = Palette(
      dark = true,
      surface = 0xFF111111.toInt(),
      chip = 0xFF1D1D1D.toInt(),
      line = 0x35FFFFFF,
      text = 0xFFF7F7FA.toInt(),
      muted = 0xB7FFFFFF.toInt(),
      accent = 0xFF8EA7FF.toInt(),
      onAccent = 0xFF08080A.toInt(),
      warn = 0xFFFFC857.toInt(),
      error = 0xFFFF6B65.toInt(),
      eventText = 0xFF9BB1FF.toInt()
    )

    val DARK = Palette(
      dark = true,
      surface = 0xFF111111.toInt(),
      chip = 0xFF1D1D1D.toInt(),
      line = 0x35FFFFFF,
      text = 0xFFF7F7FA.toInt(),
      muted = 0xB7FFFFFF.toInt(),
      accent = 0xFF8EA7FF.toInt(),
      onAccent = 0xFF08080A.toInt(),
      warn = 0xFFFFC857.toInt(),
      error = 0xFFFF6B65.toInt(),
      eventText = 0xFF9BB1FF.toInt()
    )

    // theme is "dark" or "light" from LAYP; anything else (the app hasn't
    // pushed a summary yet) follows the phone.
    fun resolve(context: Context, theme: String): Palette = DARK
  }
}

// A task's work status, in the order the circle steps through them. Mirrors
// STATUS_OPTIONS in TodoScreen.js, including the colors.
object TaskStatus {
  const val NOT_STARTED = "not_started"
  const val WIP = "wip"
  const val TO_PASS = "to_pass"

  val ORDER = listOf(NOT_STARTED, WIP, TO_PASS)

  fun isValid(status: String?): Boolean = status != null && status in ORDER

  fun label(status: String): String = when (status) {
    WIP -> "Work in progress"
    TO_PASS -> "To pass"
    else -> "Not starting yet"
  }

  fun color(status: String, p: Palette): Int = when (status) {
    WIP -> if (p.dark) 0xFF90B5A5.toInt() else 0xFF477464.toInt()
    TO_PASS -> if (p.dark) 0xFF9FC9B5.toInt() else 0xFF4D8469.toInt()
    else -> if (p.dark) 0xFF8C9690.toInt() else 0xFF7A8580.toInt()
  }

  fun ring(status: String): Int = when (status) {
    WIP -> R.drawable.layp_task_ring_1
    TO_PASS -> R.drawable.layp_task_ring_2
    else -> R.drawable.layp_task_ring_0
  }

  // The next status, or null when the next tap completes the task.
  fun next(status: String): String? {
    val i = ORDER.indexOf(status)
    return if (i < 0) WIP else if (i >= ORDER.size - 1) null else ORDER[i + 1]
  }
}

// How urgent a task looks, by the same rules as the border/dot on the
// app's task cards: "To pass" is green; otherwise red when due tomorrow,
// today or overdue, yellow when due in 2 days, nothing further out.
enum class Tier { NONE, GREEN, YELLOW, RED }

object Urgency {
  fun tier(status: String, due: String?, today: String): Tier {
    if (status == TaskStatus.TO_PASS) return Tier.GREEN
    if (due == null || CalendarMath.parse(due) == null) return Tier.NONE
    val days = CalendarMath.daysBetween(today, due)
    return when {
      days <= 1 -> Tier.RED
      days == 2 -> Tier.YELLOW
      else -> Tier.NONE
    }
  }

  fun color(tier: Tier, p: Palette): Int = when (tier) {
    Tier.RED -> p.error
    Tier.YELLOW -> p.warn
    Tier.GREEN -> 0xFF3E7C59.toInt()
    Tier.NONE -> p.muted
  }

  // "Overdue 2d", "Due today", "Due tomorrow", "Due Oct 12"
  fun dueText(due: String?, today: String): String {
    if (due == null || CalendarMath.parse(due) == null) return ""
    val days = CalendarMath.daysBetween(today, due)
    return when {
      days < 0 -> "Overdue ${-days}d"
      days == 0 -> "Due today"
      days == 1 -> "Due tomorrow"
      else -> "Due ${CalendarMath.shortDate(due)}"
    }
  }
}

// Task category ids (CATEGORIES in src/theme.js) to their display names.
object TaskMeta {
  fun categoryLabel(id: String): String = when (id) {
    "school" -> "School"
    "errands" -> "Errands"
    "shopping" -> "Shopping"
    else -> "Other"
  }
}

// Calendar event kinds (see src/widgetEvents.js): label, accent color and the
// small vector icon used to mark them.
object EventStyle {
  // Dates, anniversaries and monthsaries share the heart, school work gets a
  // pencil, bills and loans a coin, other tasks a check, reminders a bell.
  fun icon(kind: String): Int = when (kind) {
    "school" -> R.drawable.layp_ic_pencil
    "task" -> R.drawable.layp_ic_check
    "bill", "loan" -> R.drawable.layp_ic_payment
    "reminder" -> R.drawable.layp_ic_bell
    else -> R.drawable.layp_ic_heart
  }

  // Which mark wins when a day has several things (lower = shown first).
  fun markPriority(kind: String): Int = when (kind) {
    "anniversary" -> 0
    "monthsary" -> 1
    "date" -> 2
    "school" -> 3
    "bill" -> 4
    "loan" -> 5
    "task" -> 6
    else -> 7
  }

  fun label(kind: String): String = when (kind) {
    "school" -> "School task"
    "task" -> "Task deadline"
    "bill" -> "Payment day"
    "loan" -> "Loan due"
    "reminder" -> "Reminder"
    "anniversary" -> "Anniversary"
    "monthsary" -> "Monthsary"
    else -> "Special date"
  }

  fun color(kind: String): Int = when (kind) {
    "school" -> 0xFF3E63D1.toInt()
    "task" -> 0xFF2F9E9E.toInt()
    "bill" -> 0xFFD9A441.toInt()
    "loan" -> 0xFFD1573F.toInt()
    "reminder" -> 0xFF8B5FBF.toInt()
    else -> 0xFFD1477F.toInt()
  }
}
