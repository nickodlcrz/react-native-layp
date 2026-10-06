package expo.modules.laypwidget

import android.widget.EditText
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** General Remember quick capture: all fields match RememberList.ReminderForm. */
class AddReminderActivity : WidgetFormActivity() {
  private lateinit var textInput: EditText
  private lateinit var tagsInput: EditText
  private lateinit var hoursInput: EditText
  private var mode = "notification"
  private var kind = "time"
  private var date: String? = null
  private var until: String? = null
  private var time = "09:00"
  private var frequency = "1h"
  private var updateFields: () -> Unit = {}

  override fun buildForm() {
    heading("Remember something")
    textInput = input("What do you want to remember?", multiline = true)
    tagsInput = input("Tags, comma separated (optional)")
    label("Remind me with")
    choices(listOf("none" to "Note only", "notification" to "Notification", "popup" to "App popup", "both" to "Both"), mode) { mode = it; updateFields() }
    lateinit var timeFields: List<android.view.View>
    lateinit var stopFields: List<android.view.View>
    lateinit var intervalFields: List<android.view.View>
    lateinit var customFields: List<android.view.View>
    val scheduleFields = group {
      label("Schedule")
      choices(listOf("time" to "Specific time", "interval" to "Interval"), kind) { kind = it; updateFields() }
      timeFields = group {
        dateButton("Date · clear to repeat daily", date) { date = it; updateFields() }
        timeButton("Time", time) { time = it }
      }
      stopFields = group { dateButton("Stop daily repeats after", until) { until = it } }
      intervalFields = group {
        label("Interval frequency")
        choices(listOf("always" to "Always (popup)", "1h" to "Every hour", "3h" to "Every 3 hours", "custom" to "Custom"), frequency) { frequency = it; updateFields() }
        customFields = group { hoursInput = input("Custom interval in hours", numeric = true).apply { setText("2") } }
      }
    }
    updateFields = {
      visible(scheduleFields, mode != "none")
      visible(timeFields, mode != "none" && kind == "time")
      visible(stopFields, mode != "none" && kind == "time" && date == null)
      visible(intervalFields, mode != "none" && kind == "interval")
      visible(customFields, mode != "none" && kind == "interval" && frequency == "custom")
    }
    updateFields()
    hint("Date, time and stop date apply to Specific time. Interval uses its frequency instead. Open LAYP to activate notifications; app popups appear inside LAYP.")
    finishButtons("Add reminder") { save() }
  }
  private fun save() {
    val text = textInput.text.toString().trim()
    if (text.isEmpty()) { textInput.error = "Enter a reminder"; textInput.requestFocus(); return }
    if (mode != "none" && kind == "interval" && frequency == "always" && mode != "popup") { Toast.makeText(this, "Always is for app popups; choose an interval for notifications", Toast.LENGTH_LONG).show(); return }
    val hours = hoursInput.text.toString().toDoubleOrNull()
    if (mode != "none" && kind == "interval" && frequency == "custom" && (hours == null || !hours.isFinite() || hours < 1.0 / 60 || hours > 8760)) { hoursInput.error = "Enter a positive interval (at least 1 minute)"; return }
    if (mode != "none" && kind == "time" && date == null && until != null && until!! < WidgetStore.today()) { Toast.makeText(this, "Choose a stop date from today onward", Toast.LENGTH_SHORT).show(); return }
    if (mode in listOf("notification", "both") && kind == "time" && date != null && !futureMoment(date!!, time)) { Toast.makeText(this, "Choose a future date and time for the notification", Toast.LENGTH_LONG).show(); return }
    val interval = mode != "none" && kind == "interval"
    val scheduled = mode != "none" && !interval
    val tags = tagsInput.text.toString().split(",").map { it.trim() }.filter { it.isNotEmpty() }.distinct()
    WidgetStore.enqueueReminder(this, JSONObject()
      .put("id", UUID.randomUUID().toString()).put("text", text).put("tags", JSONArray(tags)).put("createdAt", System.currentTimeMillis())
      .put("remindMode", mode).put("scheduleKind", if (interval) "interval" else "time")
      .put("remindDate", if (scheduled) date else JSONObject.NULL).put("remindTime", if (scheduled) time else JSONObject.NULL)
      .put("remindUntil", if (scheduled && date == null) until else JSONObject.NULL)
      .put("remindInterval", if (interval) JSONObject().put("frequency", frequency).put("customHours", if (frequency == "custom") hours else JSONObject.NULL) else JSONObject.NULL))
    WidgetRefresh.all(this)
    Toast.makeText(this, "Reminder saved · open LAYP to activate it", Toast.LENGTH_LONG).show()
    finish()
  }
}
