package expo.modules.laypalarm

import android.app.Activity
import android.app.AlertDialog
import android.app.KeyguardManager
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Locale

// The lock-screen alarm experience: shown by LaypAlarmReceiver regardless
// of whether LAYP itself is open, and capable of drawing directly over a
// locked screen the same way a real Android alarm clock does. Mirrors the
// look and behavior of the in-app ClassAlarmScreen (src/components) --
// live clock, a detail card, a "class suspended today?" option, and a
// slide-to-confirm dismiss -- so the experience is the same whether the
// app happens to be open or not.
class AlarmActivity : Activity() {
  private var alarmKey: String? = null
  private var alarm: StoredAlarm? = null
  private lateinit var palette: Palette
  private lateinit var timeView: TextView
  private val clockHandler = Handler(Looper.getMainLooper())
  private var clockRunnable: Runnable? = null

  // A tiny stand-in for src/theme.js's LIGHT/DARK palettes -- kept in sync
  // by hand since Kotlin can't import the JS theme file directly.
  private data class Palette(
    val bg: Int, val card: Int, val text: Int, val textMuted: Int,
    val line: Int, val accent: Int, val trackColor: Int
  )

  private val darkPalette = Palette(
    bg = Color.parseColor("#09090B"), card = Color.parseColor("#151518"),
    text = Color.parseColor("#EDEDF0"), textMuted = Color.parseColor("#94949E"),
    line = Color.parseColor("#242428"), accent = Color.parseColor("#D9A441"),
    trackColor = Color.parseColor("#22FFFFFF")
  )
  private val lightPalette = Palette(
    bg = Color.parseColor("#F3F4F0"), card = Color.parseColor("#FFFFFF"),
    text = Color.parseColor("#17203A"), textMuted = Color.parseColor("#8891A0"),
    line = Color.parseColor("#E4E5DF"), accent = Color.parseColor("#B9822F"),
    trackColor = Color.parseColor("#1417203A")
  )
  private val warnColor = Color.parseColor("#D1573F") // ACCENT.ember, src/theme.js

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setupWindow()

    val nightMode = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    palette = if (nightMode == Configuration.UI_MODE_NIGHT_NO) lightPalette else darkPalette

    alarmKey = intent.getStringExtra(AlarmScheduler.EXTRA_KEY)
    alarm = alarmKey?.let { AlarmStore.get(this, it) }

    setContentView(buildContentView(alarm))
    startClock()
  }

  override fun onDestroy() {
    clockRunnable?.let { clockHandler.removeCallbacks(it) }
    super.onDestroy()
  }

  private fun startClock() {
    val fmt = SimpleDateFormat("h:mm a", Locale.getDefault())
    val r = object : Runnable {
      override fun run() {
        timeView.text = fmt.format(Calendar.getInstance().time)
        clockHandler.postDelayed(this, 1000)
      }
    }
    clockRunnable = r
    r.run()
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

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun pillDrawable(color: Int, radiusDp: Int): GradientDrawable = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radiusDp).toFloat()
  }

  // A translucent color-mix helper (e.g. accent-at-20%) so the ring screen
  // can lean on the alarm's own accent color for depth -- icon halo, card
  // border, divider -- instead of the flat single-color panels the first
  // version used.
  private fun withAlpha(color: Int, alpha: Int): Int =
    (color and 0x00FFFFFF) or (alpha shl 24)

  private fun buildContentView(alarm: StoredAlarm?): android.view.View {
    val root = FrameLayout(this).apply { setBackgroundColor(palette.bg) }

    val scroll = ScrollView(this).apply {
      isFillViewport = true
    }
    val content = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(28), dp(72), dp(28), dp(28))
    }

    val iconWrap = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(withAlpha(palette.accent, 0x22))
        setStroke(dp(2), withAlpha(palette.accent, 0x66))
      }
      layoutParams = LinearLayout.LayoutParams(dp(64), dp(64)).also { it.bottomMargin = dp(18) }
    }
    val iconGlyph = TextView(this).apply {
      text = if (alarm?.kind == "class") "\uD83C\uDF93" else "\u23F0" // 🎓 or ⏰
      textSize = 26f
      gravity = Gravity.CENTER
      layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    }
    iconWrap.addView(iconGlyph)

    // width MATCH_PARENT + explicit center gravity/alignment, rather than
    // leaving this at wrap_content and relying only on the parent
    // LinearLayout's gravity -- with a large monospace digit string, a
    // wrap_content box can measure slightly wider than the visible glyphs
    // (font metrics reserve a little trailing space), which centers the
    // *box* correctly while the *text inside it* still reads as off-center.
    // Pinning the view to the full width and centering the text within
    // that removes the ambiguity entirely.
    timeView = TextView(this).apply {
      setTextColor(palette.text)
      textSize = 46f
      typeface = Typeface.MONOSPACE
      setTypeface(typeface, Typeface.BOLD)
      gravity = Gravity.CENTER
      textAlignment = android.view.View.TEXT_ALIGNMENT_CENTER
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    }

    val headingLabel = TextView(this).apply {
      text = (alarm?.title ?: "LAYP Alarm").uppercase(Locale.getDefault())
      setTextColor(palette.accent)
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      letterSpacing = 0.08f
      gravity = Gravity.CENTER
      textAlignment = android.view.View.TEXT_ALIGNMENT_CENTER
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
      setPadding(0, dp(6), 0, dp(24))
    }

    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(palette.card)
        cornerRadius = dp(20).toFloat()
        setStroke(dp(1), withAlpha(palette.accent, 0x2E))
      }
      setPadding(dp(20), dp(20), dp(20), dp(20))
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    }

    if (!alarm?.heading.isNullOrBlank()) {
      card.addView(TextView(this).apply {
        text = alarm?.heading
        setTextColor(palette.text)
        textSize = 20f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
      })
    }
    if (!alarm?.subheading.isNullOrBlank()) {
      card.addView(TextView(this).apply {
        text = alarm?.subheading
        setTextColor(palette.textMuted)
        textSize = 14f
        gravity = Gravity.CENTER
        setPadding(0, dp(4), 0, 0)
      })
    }
    val details = alarm?.details.orEmpty()
    if (details.isNotEmpty()) {
      val divider = android.view.View(this).apply {
        setBackgroundColor(withAlpha(palette.accent, 0x33))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(1)).also { it.topMargin = dp(14); it.bottomMargin = dp(10) }
      }
      card.addView(divider)
      details.forEachIndexed { i, line ->
        card.addView(TextView(this).apply {
          text = line
          setTextColor(palette.textMuted)
          textSize = 13f
          gravity = Gravity.CENTER
          setPadding(0, if (i == 0) 0 else dp(6), 0, 0)
        })
      }
    }
    // Fallback if the caller didn't supply heading/subheading/details at all
    // (older-format alarm, or a plain snoozed reminder) -- still show *something*.
    if (alarm?.heading.isNullOrBlank() && alarm?.subheading.isNullOrBlank() && details.isEmpty()) {
      card.addView(TextView(this).apply {
        text = alarm?.body ?: ""
        setTextColor(palette.text)
        textSize = 15f
        gravity = Gravity.CENTER
      })
    }

    val suspendBtn = TextView(this).apply {
      text = "\u26A0\uFE0F  Class suspended today?"
      setTextColor(warnColor)
      textSize = 12.5f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(withAlpha(warnColor, 0x1F))
        cornerRadius = dp(30).toFloat()
      }
      setPadding(dp(16), dp(10), dp(16), dp(10))
      isClickable = true
      isFocusable = true
      setOnClickListener { confirmSuspend() }
      visibility = if (alarm?.kind == "class") android.view.View.VISIBLE else android.view.View.GONE
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).also {
        it.topMargin = dp(18); it.gravity = Gravity.CENTER_HORIZONTAL
      }
    }

    val snoozeBtn = TextView(this).apply {
      text = "Snooze 10 min"
      setTextColor(palette.accent)
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(dp(12), dp(18), dp(12), dp(8))
      isClickable = true
      isFocusable = true
      setOnClickListener { snooze(10) }
    }

    val slide = SlideToConfirmView(this).apply {
      accentColor = palette.accent
      trackColor = palette.trackColor
      labelColor = if (isNightPalette()) Color.WHITE else palette.text
      label = "Slide to confirm"
      onConfirm = { dismiss() }
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64)).also { it.topMargin = dp(28) }
    }

    content.addView(iconWrap)
    content.addView(timeView)
    content.addView(headingLabel)
    content.addView(card)
    content.addView(suspendBtn)
    content.addView(snoozeBtn)
    // Pushes the slide-to-confirm to the bottom of the screen even inside a
    // ScrollView, on the (common) case where the card content is short.
    content.addView(android.view.View(this).apply {
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
    })
    content.addView(slide)

    scroll.addView(content, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    root.addView(scroll)
    return root
  }

  private fun isNightPalette() = palette === darkPalette

  private fun confirmSuspend() {
    val a = alarm ?: return
    showModernDialog(
      icon = "\u26A0\uFE0F",
      accent = warnColor,
      title = "Class suspended or cancelled?",
      message = "This turns off today's alarm for ${if (a.heading.isNotBlank()) a.heading else "this class"}. It'll ring normally again next time this class meets.",
      confirmLabel = "Mark suspended",
      onConfirm = { suspendToday() }
    )
  }

  // A themed replacement for AlertDialog.Builder's default dialog (which
  // always renders as the bare platform gray box, unstyled and impossible
  // to match to the rest of the ring screen) -- same rounded-card, palette-
  // driven look as everything else here, built from a plain custom view
  // rather than a system dialog theme.
  private fun showModernDialog(icon: String, accent: Int, title: String, message: String, confirmLabel: String, onConfirm: () -> Unit) {
    val dialog = AlertDialog.Builder(this).create()
    dialog.window?.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.TRANSPARENT))

    val backdrop = FrameLayout(this).apply {
      setBackgroundColor(Color.parseColor("#99000000"))
      setPadding(dp(28), dp(28), dp(28), dp(28))
    }
    val card = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      background = GradientDrawable().apply {
        setColor(palette.card)
        cornerRadius = dp(24).toFloat()
        setStroke(dp(1), palette.line)
      }
      setPadding(dp(22), dp(22), dp(22), dp(22))
      elevation = dp(12).toFloat()
    }

    val iconWrap = FrameLayout(this).apply {
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(withAlpha(accent, 0x26))
      }
      layoutParams = LinearLayout.LayoutParams(dp(44), dp(44)).also { it.bottomMargin = dp(14) }
    }
    iconWrap.addView(TextView(this).apply {
      text = icon
      textSize = 19f
      gravity = Gravity.CENTER
      layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
    })

    val titleView = TextView(this).apply {
      text = title
      setTextColor(palette.text)
      textSize = 17f
      typeface = Typeface.DEFAULT_BOLD
      setPadding(0, 0, 0, dp(6))
    }
    val messageView = TextView(this).apply {
      text = message
      setTextColor(palette.textMuted)
      textSize = 13f
      setLineSpacing(dp(3).toFloat(), 1f)
      setPadding(0, 0, 0, dp(20))
    }

    val buttonRow = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
    }
    val cancelBtn = TextView(this).apply {
      text = "Cancel"
      setTextColor(palette.text)
      typeface = Typeface.DEFAULT_BOLD
      textSize = 14f
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        setColor(Color.TRANSPARENT)
        cornerRadius = dp(14).toFloat()
        setStroke(dp(1), palette.line)
      }
      setPadding(0, dp(12), 0, dp(12))
      isClickable = true
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).also { it.marginEnd = dp(10) }
      setOnClickListener { dialog.dismiss() }
    }
    val confirmBtn = TextView(this).apply {
      text = confirmLabel
      setTextColor(Color.WHITE)
      typeface = Typeface.DEFAULT_BOLD
      textSize = 14f
      gravity = Gravity.CENTER
      background = pillDrawable(accent, 14)
      setPadding(0, dp(12), 0, dp(12))
      isClickable = true
      layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
      setOnClickListener { dialog.dismiss(); onConfirm() }
    }
    buttonRow.addView(cancelBtn)
    buttonRow.addView(confirmBtn)

    card.addView(iconWrap)
    card.addView(titleView)
    card.addView(messageView)
    card.addView(buttonRow)
    backdrop.addView(card, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT).also { it.gravity = Gravity.CENTER })

    dialog.setView(backdrop)
    dialog.setCancelable(true)
    dialog.show()
    // Without this, a custom-view AlertDialog's window is still sized to
    // wrap its content -- the backdrop dim would only cover the card
    // itself instead of the whole ring screen behind it.
    dialog.window?.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT)
  }

  private fun suspendToday() {
    val a = alarm ?: return
    val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Calendar.getInstance().time)
    AlarmStore.setSkipToday(this, a.groupId, today)
    stopService(Intent(this, AlarmSoundService::class.java))
    AlarmEventBus.notifySuspended(a, today)
    finish()
  }

  private fun snooze(minutes: Int) {
    val key = alarmKey
    val a = key?.let { AlarmStore.get(this, it) }
    stopService(Intent(this, AlarmSoundService::class.java))
    if (a != null) {
      val cal = Calendar.getInstance().apply { add(Calendar.MINUTE, minutes) }
      val snoozeKey = "${a.groupId}#snooze"
      val snoozed = a.copy(
        key = snoozeKey,
        requestCode = AlarmStore.requestCodeFor(snoozeKey),
        hour = cal.get(Calendar.HOUR_OF_DAY),
        minute = cal.get(Calendar.MINUTE),
        dayOfWeek = 0,
        oneShotDate = null,
        repeatWeekly = false
      )
      AlarmScheduler.arm(this, snoozed)
      AlarmEventBus.notifySnoozed(a, minutes)
    }
    finish()
  }

  private fun dismiss() {
    val key = alarmKey
    val a = key?.let { AlarmStore.get(this, it) }
    stopService(Intent(this, AlarmSoundService::class.java))
    if (a != null) AlarmEventBus.notifyDismissed(a)
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
