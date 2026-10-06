package expo.modules.laypwidget

import android.widget.EditText
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Full task quick capture, using the same parameters as the in-app editor. */
class AddTaskActivity : WidgetFormActivity() {
  companion object { const val ACTION = "expo.modules.laypwidget.ADD_TASK" }
  private lateinit var titleInput: EditText
  private lateinit var descriptionInput: EditText
  private lateinit var hoursInput: EditText
  private lateinit var timesInput: EditText
  private var category = "school"
  private var subjectId: String? = null
  private var due: String? = WidgetStore.today()
  private var dueTime = "08:00"
  private var alarm = false
  private var reminder = true
  private var notifyType = "daily"
  private var reminderTime = "08:00"
  private var updateFields: () -> Unit = {}
  private val weekdays = mutableSetOf(2, 3, 4, 5, 6)

  override fun buildForm() {
    heading("Add task")
    titleInput = input("What do you need to do?")
    descriptionInput = input("Description or notes (optional)", multiline = true)
    label("Category")
    category = WidgetStore.lastTaskCategory(this)?.takeIf { it in listOf("school", "errands", "shopping", "other") } ?: "school"
    choices(listOf("school" to "School", "errands" to "Errands", "shopping" to "Shopping", "other" to "Other"), category) { category = it; updateFields() }
    val subjectFields = group {
      val subjects = WidgetStore.readSummary(this).subjects
      if (subjects.isNotEmpty()) {
        label("Subject code")
        choices(listOf("" to "None") + subjects.map { it.id to it.label }, "") { subjectId = it.ifEmpty { null } }
      } else hint("Open LAYP to sync your subject codes from School.")
    }
    label("Deadline")
    dateButton("Due date", due) { due = it }
    timeButton("Due time / alarm time", dueTime) { dueTime = it }
    toggle("Ring an alarm at the deadline", false) { alarm = it }
    label("Reminder")
    toggle("Enable task reminders", true) { reminder = it; updateFields() }
    lateinit var timeFields: List<android.view.View>
    lateinit var weeklyFields: List<android.view.View>
    lateinit var intervalFields: List<android.view.View>
    lateinit var customFields: List<android.view.View>
    val reminderFields = group {
      choices(listOf("once" to "Once", "daily" to "Daily", "weekly" to "Weekly", "interval" to "Interval", "custom" to "Custom times"), notifyType) { notifyType = it; updateFields() }
      timeFields = group { timeButton("Reminder time", reminderTime) { reminderTime = it } }
      weeklyFields = group {
        label("Weekly days")
        val names = listOf("Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat")
        val days = android.widget.LinearLayout(this)
        names.forEachIndexed { index, name ->
          days.addView(android.widget.CheckBox(this).apply {
            text = name; textSize = 11f; setTextColor(p.text); isChecked = index + 1 in weekdays
            setOnCheckedChangeListener { _, on -> if (on) weekdays.add(index + 1) else weekdays.remove(index + 1) }
          })
        }
        column.addView(android.widget.HorizontalScrollView(this).apply {
      isVerticalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false; addView(days) }, params())
      }
      intervalFields = group { label("Interval hours"); hoursInput = input("Hours", numeric = true).apply { setText("1") } }
      customFields = group { label("Custom times · 24-hour format"); timesInput = input("08:00, 12:30, 18:00").apply { setText("08:00") } }
    }
    updateFields = {
      visible(subjectFields, category == "school")
      visible(reminderFields, reminder)
      visible(timeFields, reminder && notifyType in listOf("once", "daily", "weekly"))
      visible(weeklyFields, reminder && notifyType == "weekly")
      visible(intervalFields, reminder && notifyType == "interval")
      visible(customFields, reminder && notifyType == "custom")
    }
    updateFields()
    hint("Tasks appear immediately. Open LAYP to activate their notifications and alarms.")
    finishButtons("Add task") { save() }
  }

  private fun save() {
    val title = titleInput.text.toString().trim()
    if (title.isEmpty()) { titleInput.error = "Enter a task"; titleInput.requestFocus(); return }
    if (alarm && due == null) { Toast.makeText(this, "Set a due date for the alarm", Toast.LENGTH_SHORT).show(); return }
    if (alarm && due != null && !futureMoment(due!!, dueTime)) { Toast.makeText(this, "Choose a future deadline for the alarm", Toast.LENGTH_LONG).show(); return }
    if (reminder && notifyType == "once" && due != null && !futureMoment(due!!, reminderTime)) { Toast.makeText(this, "Choose a future time for the one-time reminder", Toast.LENGTH_LONG).show(); return }
    if (reminder && notifyType == "once" && due == null) { Toast.makeText(this, "Set a date for a one-time reminder", Toast.LENGTH_SHORT).show(); return }
    if (reminder && notifyType == "weekly" && weekdays.isEmpty()) { Toast.makeText(this, "Choose at least one weekday", Toast.LENGTH_SHORT).show(); return }
    val hours = hoursInput.text.toString().toDoubleOrNull()
    if (reminder && notifyType == "interval" && (hours == null || !hours.isFinite() || hours < 1 || hours > 24)) { hoursInput.error = "Enter 1–24 hours"; return }
    val times = timesInput.text.toString().split(",").map { it.trim() }.filter { it.isNotEmpty() }.distinct()
    if (reminder && notifyType == "custom" && (times.isEmpty() || times.any { !it.matches(Regex("([01]\\d|2[0-3]):[0-5]\\d")) })) { timesInput.error = "Use times such as 08:00, 17:30"; return }
    val notify = JSONObject().put("type", notifyType).put("time", reminderTime)
      .put("weekdays", JSONArray(weekdays.sorted())).put("intervalHours", hours ?: 1.0).put("times", JSONArray(times))
    WidgetStore.enqueueTask(this, PendingTask(UUID.randomUUID().toString(), title, category, due, System.currentTimeMillis(), descriptionInput.text.toString().trim(), if (category == "school") subjectId else null, if (due != null) dueTime else null, alarm, reminder, notify))
    WidgetStore.saveLastTaskCategory(this, category)
    WidgetRefresh.all(this)
    Toast.makeText(this, "Task saved · open LAYP to activate reminders", Toast.LENGTH_LONG).show()
    finish()
  }
}
