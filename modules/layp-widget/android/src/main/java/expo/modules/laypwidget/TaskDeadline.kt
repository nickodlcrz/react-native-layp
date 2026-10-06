package expo.modules.laypwidget

import java.util.Calendar
import kotlin.math.abs
import kotlin.math.ceil

object TaskDeadline {
  fun timestamp(date: String?, time: String?): Long? {
    val parts = CalendarMath.parse(date) ?: return null
    if (time != null && !time.matches(Regex("(?:[01][0-9]|2[0-3]):[0-5][0-9]"))) return null
    val clock = (time ?: "23:59").split(":").map { it.toInt() }
    return try {
      Calendar.getInstance().apply {
        isLenient = false
        clear()
        set(parts[0], parts[1], parts[2], clock[0], clock[1], 0)
      }.timeInMillis
    } catch (_: IllegalArgumentException) { null }
  }
  fun text(date: String?, time: String?, now: Long = System.currentTimeMillis()): String {
    val delta = (timestamp(date, time) ?: return "") - now
    if (delta == 0L) return "Due now"
    val total = ceil(abs(delta).toDouble() / 60000).toLong()
    val h = total / 60
    val m = total % 60
    val minutes = "${m}min${if (m == 1L) "" else "s"}"
    val duration = if (h > 0) "${h}hr${if (h == 1L) "" else "s"} and $minutes" else minutes
    return if (delta > 0) "$duration until the due date" else "Overdue by $duration"
  }
}
