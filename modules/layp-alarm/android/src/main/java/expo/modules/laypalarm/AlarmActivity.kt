package expo.modules.laypalarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import java.util.Calendar

// The lock-screen alarm experience: shown by LaypAlarmReceiver regardless
// of whether LAYP itself is open, and capable of drawing directly over a
// locked screen the same way a real Android alarm clock does.
class AlarmActivity : Activity() {
  private var alarmKey: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setupWindow()

    alarmKey = intent.getStringExtra(AlarmScheduler.EXTRA_KEY)
    val alarm = alarmKey?.let { AlarmStore.get(this, it) }

    setContentView(buildContentView(alarm))
  }

  private fun setupWindow() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      getSystemService(KeyguardManager::class.java)?.requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
          WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun buildContentView(alarm: StoredAlarm?): LinearLayout {
    val density = resources.displayMetrics.density
    fun dp(v: Int) = (v * density).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER
      setBackgroundColor(Color.parseColor("#14110F"))
      setPadding(dp(32), dp(32), dp(32), dp(32))
    }

    val titleView = TextView(this).apply {
      text = alarm?.title ?: "LAYP Alarm"
      setTextColor(Color.WHITE)
      textSize = 24f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
    }
    val bodyView = TextView(this).apply {
      text = alarm?.body ?: ""
      setTextColor(Color.parseColor("#D9D4CC"))
      textSize = 15f
      gravity = Gravity.CENTER
      setPadding(0, dp(16), 0, dp(48))
    }

    val buttonParams = LinearLayout.LayoutParams(
      LinearLayout.LayoutParams.MATCH_PARENT,
      LinearLayout.LayoutParams.WRAP_CONTENT
    ).also { it.topMargin = dp(12) }

    val snoozeBtn = Button(this).apply {
      text = "Snooze 10 min"
      setOnClickListener { snooze(10) }
    }
    val dismissBtn = Button(this).apply {
      text = "Dismiss"
      setOnClickListener { dismiss() }
    }

    root.addView(titleView)
    root.addView(bodyView)
    root.addView(snoozeBtn, buttonParams)
    root.addView(dismissBtn, buttonParams)
    return root
  }

  private fun snooze(minutes: Int) {
    val key = alarmKey
    val alarm = key?.let { AlarmStore.get(this, it) }
    stopService(Intent(this, AlarmSoundService::class.java))
    if (alarm != null) {
      val cal = Calendar.getInstance().apply { add(Calendar.MINUTE, minutes) }
      val snoozeKey = "${alarm.groupId}#snooze"
      val snoozed = alarm.copy(
        key = snoozeKey,
        requestCode = AlarmStore.requestCodeFor(snoozeKey),
        hour = cal.get(Calendar.HOUR_OF_DAY),
        minute = cal.get(Calendar.MINUTE),
        dayOfWeek = 0,
        oneShotDate = null,
        repeatWeekly = false
      )
      AlarmScheduler.arm(this, snoozed)
      AlarmEventBus.notifySnoozed(alarm, minutes)
    }
    finish()
  }

  private fun dismiss() {
    val key = alarmKey
    val alarm = key?.let { AlarmStore.get(this, it) }
    stopService(Intent(this, AlarmSoundService::class.java))
    if (alarm != null) AlarmEventBus.notifyDismissed(alarm)
    finish()
  }

  // An alarm shouldn't be bypassable with just the back button -- treat it
  // the same as pressing Dismiss instead of leaving it silently ringing
  // behind whatever screen comes up next.
  @Suppress("OVERRIDE_DEPRECATION", "MissingSuperCall")
  override fun onBackPressed() {
    dismiss()
  }
}
