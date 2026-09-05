package expo.modules.laypalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build

// The bridge between Android's alarm system and LAYP's alarm experience --
// this is what AlarmManager actually launches at the scheduled time, and it
// works whether or not the LAYP UI (or the app at all) is currently open.
class LaypAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val key = intent.getStringExtra(AlarmScheduler.EXTRA_KEY) ?: return
    val alarm = AlarmStore.get(context, key) ?: return

    // Re-arm next week's occurrence immediately -- dismissing (or even
    // just sitting on) today's alarm should never cost next week's.
    AlarmScheduler.rearmIfWeekly(context, alarm)

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
