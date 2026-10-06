package expo.modules.laypwidget

/** Select a local calendar day from a weekly snapshot, including cancellations. */
object ClassSchedule {
  fun today(schedule: List<WidgetClass>, date: String, weekday: Int, cancelled: Set<String>): List<WidgetClass> =
    schedule.filter { weekday in it.days && "$date|${it.entryId}" !in cancelled }
      .sortedBy { it.startMin }.map { it.copy(dayLabel = "Today") }

  fun remaining(classes: List<WidgetClass>, minute: Int): List<WidgetClass> = classes.filter { it.endMin > minute }
  fun ongoing(classes: List<WidgetClass>, minute: Int): WidgetClass? = classes.firstOrNull { minute >= it.startMin && minute < it.endMin }
}
