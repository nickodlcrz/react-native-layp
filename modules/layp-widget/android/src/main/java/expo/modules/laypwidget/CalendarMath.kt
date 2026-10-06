package expo.modules.laypwidget

import java.util.Calendar
import java.util.GregorianCalendar
import java.util.Locale
import java.util.TimeZone

// One cell of the month grid. `iso` is its "YYYY-MM-DD" date.
data class GridCell(val day: Int, val inMonth: Boolean, val iso: String)

// A month laid out Sunday-first. `cells` always has 42 entries (6 weeks);
// only the first `weeks` rows (4 to 6) are needed to show the month.
data class MonthGrid(val year: Int, val month0: Int, val weeks: Int, val cells: List<GridCell>)

// All the date arithmetic the widgets need, kept free of Android classes so
// it can be exercised on a plain JVM. English names are hardcoded on
// purpose: the app itself is English-only, and this keeps the widget from
// mixing locales (e.g. "lunes" next to an English title).
object CalendarMath {
  val MONTHS = arrayOf(
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  )
  val WEEKDAYS = arrayOf("Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
  val WEEKDAY_LETTERS = arrayOf("S", "M", "T", "W", "T", "F", "S")

  fun iso(year: Int, month0: Int, day: Int): String =
    String.format(Locale.US, "%04d-%02d-%02d", year, month0 + 1, day)

  // [year, month0, day], or null when the text isn't a "YYYY-MM-DD" date.
  fun parse(iso: String?): IntArray? {
    if (iso == null) return null
    val m = Regex("^(\\d{4})-(\\d{2})-(\\d{2})$").find(iso) ?: return null
    val (y, mo, d) = m.destructured
    val month0 = mo.toInt() - 1
    if (month0 !in 0..11 || d.toInt() !in 1..31) return null
    return intArrayOf(y.toInt(), month0, d.toInt())
  }

  fun todayIso(): String {
    val c = Calendar.getInstance()
    return iso(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
  }

  fun daysInMonth(year: Int, month0: Int): Int =
    GregorianCalendar(year, month0, 1).getActualMaximum(Calendar.DAY_OF_MONTH)

  // 0 = Sunday ... 6 = Saturday
  fun weekdayIndex(year: Int, month0: Int, day: Int): Int =
    GregorianCalendar(year, month0, day).get(Calendar.DAY_OF_WEEK) - 1

  fun shiftMonth(year: Int, month0: Int, delta: Int): Pair<Int, Int> {
    val total = year * 12 + month0 + delta
    return Pair(Math.floorDiv(total, 12), Math.floorMod(total, 12))
  }

  fun monthGrid(year: Int, month0: Int): MonthGrid {
    val first = weekdayIndex(year, month0, 1)
    val dim = daysInMonth(year, month0)
    val prev = shiftMonth(year, month0, -1)
    val next = shiftMonth(year, month0, 1)
    val prevDim = daysInMonth(prev.first, prev.second)
    val cells = ArrayList<GridCell>(42)
    for (i in 0 until 42) {
      val dayNumber = i - first + 1
      cells.add(
        when {
          dayNumber < 1 -> {
            val d = prevDim + dayNumber
            GridCell(d, false, iso(prev.first, prev.second, d))
          }
          dayNumber > dim -> {
            val d = dayNumber - dim
            GridCell(d, false, iso(next.first, next.second, d))
          }
          else -> GridCell(dayNumber, true, iso(year, month0, dayNumber))
        }
      )
    }
    return MonthGrid(year, month0, (first + dim + 6) / 7, cells)
  }

  // Whole days from a to b (negative when b is earlier). UTC midnight on
  // both ends, so daylight-saving changes can't shift the answer.
  fun daysBetween(aIso: String, bIso: String): Int {
    val a = parse(aIso) ?: return 0
    val b = parse(bIso) ?: return 0
    fun millis(p: IntArray): Long {
      val c = GregorianCalendar(TimeZone.getTimeZone("UTC"))
      c.clear()
      c.set(p[0], p[1], p[2], 0, 0, 0)
      return c.timeInMillis
    }
    return ((millis(b) - millis(a)) / 86_400_000L).toInt()
  }

  // The date `days` after (or before, if negative) `iso`, as "YYYY-MM-DD".
  fun addDays(iso: String, days: Int): String {
    val p = parse(iso) ?: return iso
    val c = GregorianCalendar(TimeZone.getTimeZone("UTC"))
    c.clear()
    c.set(p[0], p[1], p[2], 0, 0, 0)
    c.add(Calendar.DAY_OF_MONTH, days)
    return iso(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
  }

  fun weekdayName(iso: String): String {
    val p = parse(iso) ?: return ""
    return WEEKDAYS[weekdayIndex(p[0], p[1], p[2])]
  }

  fun monthTitle(year: Int, month0: Int): String = "${MONTHS[month0]} $year"

  // "Oct 5"
  fun shortDate(iso: String): String {
    val p = parse(iso) ?: return iso
    return "${MONTHS[p[1]].substring(0, 3)} ${p[2]}"
  }

  // "Mon, Oct 5"
  fun weekdayShortDate(iso: String): String {
    val p = parse(iso) ?: return iso
    return "${WEEKDAYS[weekdayIndex(p[0], p[1], p[2])].substring(0, 3)}, ${shortDate(iso)}"
  }

  // How far away a day is, in words.
  fun relative(days: Int): String = when {
    days == 0 -> "Today"
    days == 1 -> "Tomorrow"
    days == -1 -> "Yesterday"
    days > 1 -> "In $days days"
    else -> "${-days} days ago"
  }
}
