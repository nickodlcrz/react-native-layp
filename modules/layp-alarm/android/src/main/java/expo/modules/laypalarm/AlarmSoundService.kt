package expo.modules.laypalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

// Handled natively rather than in JS so the alarm keeps ringing
// independent of the React Native JS runtime -- a continuously-looping
// tone plus a repeating vibration pattern, running as a foreground service
// so Android doesn't kill it mid-ring.
class AlarmSoundService : Service() {
  private var mediaPlayer: MediaPlayer? = null
  private var vibrator: Vibrator? = null

  companion object {
    private const val CHANNEL_ID = "layp_alarm_engine"
    private const val NOTIFICATION_ID = 7301
    private val VIBRATE_PATTERN = longArrayOf(0, 700, 400, 700, 400, 700, 400)
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val key = intent?.getStringExtra(AlarmScheduler.EXTRA_KEY)
    val alarm = key?.let { AlarmStore.get(this, it) }

    startForeground(NOTIFICATION_ID, buildNotification(alarm?.title ?: "LAYP Alarm", alarm?.body ?: ""))
    startSound()
    startVibration()
    return START_NOT_STICKY
  }

  private fun buildNotification(title: String, body: String): Notification {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(NotificationManager::class.java)
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(CHANNEL_ID, "LAYP alarm engine", NotificationManager.IMPORTANCE_HIGH).apply {
          description = "Keeps a ringing LAYP alarm sounding until you snooze or dismiss it."
          // The MediaPlayer below plays the actual alarm tone on loop --
          // giving the channel its own sound too would just layer a second
          // one-shot sound on top.
          setSound(null, null)
        }
        nm.createNotificationChannel(channel)
      }
    }

    val fullScreenIntent = Intent(this, AlarmActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val fullScreenPending = PendingIntent.getActivity(
      this,
      0,
      fullScreenIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return Notification.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setOngoing(true)
      .setCategory(Notification.CATEGORY_ALARM)
      .setFullScreenIntent(fullScreenPending, true)
      .setContentIntent(fullScreenPending)
      .build()
  }

  private fun startSound() {
    try {
      val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_ALARM)
        ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      mediaPlayer = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        setDataSource(this@AlarmSoundService, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (e: Exception) {
      // No alarm tone available on this device -- the vibration pattern
      // below still gets attention on its own.
    }
  }

  private fun startVibration() {
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      vibrator?.vibrate(VibrationEffect.createWaveform(VIBRATE_PATTERN, 0))
    } else {
      @Suppress("DEPRECATION")
      vibrator?.vibrate(VIBRATE_PATTERN, 0)
    }
  }

  private fun stopAll() {
    mediaPlayer?.let {
      try {
        it.stop()
        it.release()
      } catch (e: Exception) {
        // Already stopped/released -- nothing to do.
      }
    }
    mediaPlayer = null
    vibrator?.cancel()
    vibrator = null
  }

  override fun onDestroy() {
    stopAll()
    super.onDestroy()
  }
}
