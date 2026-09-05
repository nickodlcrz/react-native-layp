package expo.modules.laypalarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Calendar

// The React Native <-> Kotlin bridge described by the architecture doc:
// LAYP (JS) decides *what* to schedule, this module hands it to
// AlarmScheduler, and everything downstream (AlarmManager, the receiver,
// the ringing activity) is native and keeps working even if JS isn't
// running at all.
class LaypAlarmModule : Module(), AlarmEventBus.Listener {

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("LaypAlarm: no React context available")

  override fun definition() = ModuleDefinition {
    Name("LaypAlarm")

    Events("onAlarmFired", "onAlarmSnoozed", "onAlarmDismissed")

    OnCreate {
      AlarmEventBus.addListener(this@LaypAlarmModule)
    }

    OnDestroy {
      AlarmEventBus.removeListener(this@LaypAlarmModule)
    }

    // config: { id, title, body?, hour, minute, days?: number[] (1=Sun...7=Sat),
    //           date?: "YYYY-MM-DD", repeatWeekly?: boolean, kind?: string }
    AsyncFunction("scheduleAlarm") { config: Map<String, Any?> ->
      scheduleFromConfig(config)
    }

    AsyncFunction("updateAlarm") { config: Map<String, Any?> ->
      val id = config["id"] as? String ?: return@AsyncFunction
      AlarmScheduler.cancelGroup(context, id)
      scheduleFromConfig(config)
    }

    AsyncFunction("cancelAlarm") { id: String ->
      AlarmScheduler.cancelGroup(context, id)
    }

    // Exposed mainly for a JS-driven snooze (e.g. a notification action
    // button); the in-activity Snooze button talks to AlarmScheduler
    // directly since it doesn't need to round-trip through JS at all.
    AsyncFunction("snoozeAlarm") { id: String, minutes: Int ->
      val cal = Calendar.getInstance().apply { add(Calendar.MINUTE, minutes) }
      val key = "$id#snooze"
      AlarmScheduler.arm(
        context,
        StoredAlarm(
          key = key,
          groupId = id,
          requestCode = AlarmStore.requestCodeFor(key),
          title = "LAYP Alarm",
          body = "Snoozed reminder",
          hour = cal.get(Calendar.HOUR_OF_DAY),
          minute = cal.get(Calendar.MINUTE),
          dayOfWeek = 0,
          repeatWeekly = false,
          oneShotDate = null,
          kind = "task"
        )
      )
    }

    AsyncFunction("dismissAlarm") { id: String ->
      AlarmScheduler.cancelGroup(context, id)
    }

    AsyncFunction("getAlarmStatus") {
      val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val exactAllowed = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val notificationsEnabled = nm.areNotificationsEnabled()
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      val ignoringBatteryOptimizations =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) pm.isIgnoringBatteryOptimizations(context.packageName) else true
      mapOf(
        "exactAlarmsAllowed" to exactAllowed,
        "notificationsEnabled" to notificationsEnabled,
        "ignoringBatteryOptimizations" to ignoringBatteryOptimizations
      )
    }

    AsyncFunction("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
      }
    }

    AsyncFunction("openBatteryOptimizationSettings") {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      try {
        context.startActivity(intent)
      } catch (e: Exception) {
        val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(fallback)
      }
    }
  }

  private fun scheduleFromConfig(config: Map<String, Any?>) {
    val id = config["id"] as? String ?: return
    val title = config["title"] as? String ?: "LAYP Alarm"
    val body = config["body"] as? String ?: ""
    val hour = (config["hour"] as? Number)?.toInt() ?: 8
    val minute = (config["minute"] as? Number)?.toInt() ?: 0
    val kind = config["kind"] as? String ?: "task"
    @Suppress("UNCHECKED_CAST")
    val days = (config["days"] as? List<Any?>)?.mapNotNull { (it as? Number)?.toInt() } ?: emptyList()
    val date = config["date"] as? String
    val repeatWeekly = (config["repeatWeekly"] as? Boolean) ?: true

    // Clears any previous occurrences for this id first, so editing an
    // alarm's time/days never leaves a stale slot armed alongside the new
    // ones.
    AlarmScheduler.cancelGroup(context, id)

    if (days.isEmpty()) {
      val key = "$id#once"
      AlarmScheduler.arm(
        context,
        StoredAlarm(
          key = key, groupId = id, requestCode = AlarmStore.requestCodeFor(key),
          title = title, body = body, hour = hour, minute = minute,
          dayOfWeek = 0, repeatWeekly = false, oneShotDate = date, kind = kind
        )
      )
    } else {
      // Expo's own weekday convention (1=Sun...7=Sat) already lines up
      // exactly with java.util.Calendar.DAY_OF_WEEK, so no conversion is
      // needed going into AlarmScheduler.
      for (weekday in days) {
        val key = "$id#$weekday"
        AlarmScheduler.arm(
          context,
          StoredAlarm(
            key = key, groupId = id, requestCode = AlarmStore.requestCodeFor(key),
            title = title, body = body, hour = hour, minute = minute,
            dayOfWeek = weekday, repeatWeekly = repeatWeekly, oneShotDate = null, kind = kind
          )
        )
      }
    }
  }

  override fun onFired(alarm: StoredAlarm) {
    sendEvent(
      "onAlarmFired",
      mapOf("id" to alarm.groupId, "title" to alarm.title, "body" to alarm.body, "kind" to alarm.kind)
    )
  }

  override fun onSnoozed(alarm: StoredAlarm, minutes: Int) {
    sendEvent("onAlarmSnoozed", mapOf("id" to alarm.groupId, "minutes" to minutes))
  }

  override fun onDismissed(alarm: StoredAlarm) {
    sendEvent("onAlarmDismissed", mapOf("id" to alarm.groupId))
  }
}
