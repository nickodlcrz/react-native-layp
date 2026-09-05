package expo.modules.laypalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.Calendar

// The bridge between Android's alarm system and LAYP's alarm experience --
// this is what AlarmManager actually launches at the scheduled time, and it
// works whether or not the LAYP UI (or the app at all) is currently open.
class LaypAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra(AlarmScheduler.EXTRA_KEY) ?: return
    val alarm = AlarmStore.get(context, key) ?: return

    // Re-arm next week's occurrence immediately -- dismissing (or even
    // just sitting on) today's alarm should never cost next week's. Done
    // before the skip check below so a suspended-today class still comes
    // back normally next time it meets.
    AlarmScheduler.rearmIfWeekly(context, alarm)

    val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().time)
    if (AlarmStore.consumeSkipIfToday(context, alarm.groupId, today)) {
      // Marked "class suspended/cancelled" earlier today (from the in-app
      // advance popup, or a previous occurrence's ring screen) -- honor it
      // silently: no sound, no lock-screen activity, nothing for the
      // person to dismiss for a class that isn't actually happening.
      return
    }

    val soundIntent = Intent(context, AlarmSoundService::class.java).apply {
      putExtra(AlarmScheduler.EXTRA_KEY, key)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(soundIntent)
    } else {
      context.startService(soundIntent)
    }

    val activityIntent = Intent(context, AlarmActivity::class.java).apply {
      addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_NO_USER_ACTION or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      )
      putExtra(AlarmScheduler.EXTRA_KEY, key)
    }
    context.startActivity(activityIntent)

    AlarmEventBus.notifyFired(alarm)
  }
}
