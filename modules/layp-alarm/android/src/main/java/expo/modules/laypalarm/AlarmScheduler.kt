package expo.modules.laypalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar

// The actual alarm engine: LAYP (React Native) decides *what* should ring
// and *when*; everything from here down is Android's own AlarmManager
// doing the ringing, independent of whether LAYP's JS is running at all.
object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.laypalarm.ACTION_FIRE"
  const val EXTRA_KEY = "layp_alarm_key"

  private fun alarmManager(context: Context) =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  private fun pendingIntentFor(context: Context, alarm: StoredAlarm): PendingIntent {
    val intent = Intent(context, LaypAlarmReceiver::class.java).apply {
      action = ACTION_FIRE
      putExtra(EXTRA_KEY, alarm.key)
    }
    return PendingIntent.getBroadcast(
      context,
      alarm.requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }

  fun canScheduleExact(context: Context): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      alarmManager(context).canScheduleExactAlarms()
    } else {
      true
    }
  }

  private fun nextTriggerMillis(alarm: StoredAlarm): Long {
    val now = Calendar.getInstance()
    val trigger = Calendar.getInstance()

    if (alarm.dayOfWeek == 0) {
      // One-shot: a specific calendar date (a task's due date) or, if none
      // was given, the next time hour:minute comes around (today if it
      // hasn't passed yet, otherwise tomorrow).
      if (alarm.oneShotDate != null) {
        val parts = alarm.oneShotDate.split("-").map { it.toInt() }
        trigger.set(parts[0], parts[1] - 1, parts[2], alarm.hour, alarm.minute, 0)
      } else {
        trigger.set(Calendar.HOUR_OF_DAY, alarm.hour)
        trigger.set(Calendar.MINUTE, alarm.minute)
        trigger.set(Calendar.SECOND, 0)
        if (trigger.timeInMillis <= now.timeInMillis) trigger.add(Calendar.DATE, 1)
      }
      trigger.set(Calendar.MILLISECOND, 0)
      return trigger.timeInMillis
    }

    // Weekly: the next occurrence of this Calendar.DAY_OF_WEEK at
    // hour:minute, rolling a week forward if that moment on the matching
    // day has already gone by (including "matches today but today's
    // moment already passed").
    trigger.set(Calendar.HOUR_OF_DAY, alarm.hour)
    trigger.set(Calendar.MINUTE, alarm.minute)
    trigger.set(Calendar.SECOND, 0)
    trigger.set(Calendar.MILLISECOND, 0)
    val currentDow = trigger.get(Calendar.DAY_OF_WEEK)
    var dayDiff = alarm.dayOfWeek - currentDow
    if (dayDiff < 0 || (dayDiff == 0 && trigger.timeInMillis <= now.timeInMillis)) {
      dayDiff += 7
    }
    trigger.add(Calendar.DATE, dayDiff)
    return trigger.timeInMillis
  }

  fun arm(context: Context, alarm: StoredAlarm) {
    AlarmStore.put(context, alarm)
    val triggerAt = nextTriggerMillis(alarm)
    val pi = pendingIntentFor(context, alarm)
    val am = alarmManager(context)
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !am.canScheduleExactAlarms()) {
        // The person hasn't granted "Alarms & reminders" yet -- fall back
        // to an inexact-but-still-doze-proof alarm rather than silently
        // scheduling nothing at all.
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      } else {
        am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
      }
    } catch (e: SecurityException) {
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
    }
  }

  private fun disarmOnly(context: Context, alarm: StoredAlarm) {
    val pi = pendingIntentFor(context, alarm)
    alarmManager(context).cancel(pi)
    pi.cancel()
  }

  fun cancelGroup(context: Context, groupId: String) {
    AlarmStore.removeGroup(context, groupId).forEach { disarmOnly(context, it) }
  }

  // Called right after a weekly alarm fires so next week's occurrence gets
  // armed immediately -- AlarmManager has no built-in "repeat weekly,
  // exactly, and survive Doze" primitive, so the repeat is implemented by
  // re-arming the same slot every time it rings, the same technique real
  // alarm-clock apps use.
  fun rearmIfWeekly(context: Context, alarm: StoredAlarm) {
    if (alarm.dayOfWeek != 0 && alarm.repeatWeekly) {
      arm(context, alarm)
    } else {
      AlarmStore.remove(context, alarm.key)
    }
  }

  // AlarmManager entries don't survive a reboot -- BootReceiver calls this
  // to put everything LAYP still has on record back on the clock.
  fun rearmAll(context: Context) {
    AlarmStore.all(context).values.forEach { arm(context, it) }
  }
}
