package expo.modules.laypwidget

import android.app.Activity
import android.app.Dialog
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.*
import java.util.Locale

/** Shared dark, rounded, keyboard-safe editor for home-screen quick capture. */
abstract class WidgetFormActivity : Activity() {
  protected lateinit var p: Palette
  protected val wrap = ViewGroup.LayoutParams.WRAP_CONTENT
  protected val match = ViewGroup.LayoutParams.MATCH_PARENT
  protected lateinit var column: LinearLayout
  protected fun dp(n: Int) = (n * resources.displayMetrics.density + .5f).toInt()
  protected fun rounded(color: Int, radius: Int = 14) = GradientDrawable().apply {
    setColor(color); cornerRadius = dp(radius).toFloat(); setStroke(dp(1), p.line)
  }
  protected fun params(width: Int = match, height: Int = wrap, top: Int = 10) = LinearLayout.LayoutParams(width, height).apply { topMargin = dp(top) }

  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    p = Palette.resolve(this, WidgetStore.readSummary(this).theme)
    setFinishOnTouchOutside(true)
    window.setGravity(Gravity.BOTTOM)
    window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    column = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(20), dp(16), dp(20), dp(24)) }
    column.addView(View(this).apply { background = rounded(p.line, 3) }, LinearLayout.LayoutParams(dp(40), dp(4)).apply { gravity = Gravity.CENTER_HORIZONTAL; bottomMargin = dp(18) })
    buildForm()
    val scroll = ScrollView(this).apply {
      background = rounded(p.surface, 26)
      isFillViewport = true
      addView(column)
    }
    setContentView(scroll)
    // A finite viewport is essential: the keyboard and long forms must scroll.
    window.setLayout(match, (resources.displayMetrics.heightPixels * .82f).toInt())
    scroll.alpha = 0f; scroll.translationY = dp(24).toFloat()
    if (android.os.Build.VERSION.SDK_INT >= 26 && !android.animation.ValueAnimator.areAnimatorsEnabled()) {
      scroll.alpha = 1f; scroll.translationY = 0f
    } else scroll.animate().alpha(1f).translationY(0f).setDuration(180).start()
  }
  protected fun group(build: () -> Unit): List<View> {
    val start = column.childCount
    build()
    return (start until column.childCount).map { column.getChildAt(it) }
  }
  protected fun futureMoment(date: String, time: String): Boolean {
    val parts = CalendarMath.parse(date) ?: return false
    val clock = time.split(":").map { it.toIntOrNull() ?: 0 }
    return java.util.Calendar.getInstance().apply {
      set(parts[0], parts[1], parts[2], clock[0], clock[1], 0); set(java.util.Calendar.MILLISECOND, 0)
    }.timeInMillis > System.currentTimeMillis()
  }
  protected fun visible(views: List<View>, show: Boolean) { views.forEach { it.visibility = if (show) View.VISIBLE else View.GONE } }
  protected abstract fun buildForm()
  protected fun heading(title: String) {
    column.addView(LinearLayout(this).apply {
      gravity = Gravity.CENTER_VERTICAL
      addView(TextView(this@WidgetFormActivity).apply { text = title; textSize = 22f; typeface = Typeface.DEFAULT_BOLD; setTextColor(p.text) }, LinearLayout.LayoutParams(0, wrap, 1f))
      addView(button("×", false) { finish() }, LinearLayout.LayoutParams(dp(48), dp(48)))
    })
  }
  protected fun label(text: String) = TextView(this).apply {
    this.text = text; textSize = 12f; typeface = Typeface.DEFAULT_BOLD; setTextColor(p.muted)
    column.addView(this, params(top = 18))
  }
  protected fun hint(text: String) {
    column.addView(TextView(this).apply { this.text = text; textSize = 12f; setTextColor(p.muted); setLineSpacing(0f, 1.2f) }, params())
  }
  protected fun input(placeholder: String, multiline: Boolean = false, numeric: Boolean = false): EditText = EditText(this).apply {
    hint = placeholder; textSize = 15f; setTextColor(p.text); setHintTextColor(p.muted)
    background = rounded(p.chip); setPadding(dp(14), dp(12), dp(14), dp(12))
    inputType = if (numeric) InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES or (if (multiline) InputType.TYPE_TEXT_FLAG_MULTI_LINE else 0)
    if (multiline) { minLines = 2; gravity = Gravity.TOP } else setSingleLine(true)
    column.addView(this, params())
  }
  protected fun button(text: String, primary: Boolean = false, action: () -> Unit) = TextView(this).apply {
    this.text = text; textSize = 14f; typeface = Typeface.DEFAULT_BOLD; gravity = Gravity.CENTER
    setTextColor(if (primary) p.onAccent else p.text); background = rounded(if (primary) p.accent else p.chip)
    setPadding(dp(12), dp(12), dp(12), dp(12)); minHeight = dp(48); isFocusable = true; contentDescription = text
    setOnClickListener { action() }
  }
  protected fun toggle(text: String, initial: Boolean, change: (Boolean) -> Unit): Switch = Switch(this).apply {
    this.text = text; textSize = 14f; setTextColor(p.text); isChecked = initial; minHeight = dp(48)
    setOnCheckedChangeListener { _, checked -> change(checked) }; column.addView(this, params())
  }
  protected fun choices(options: List<Pair<String, String>>, initial: String, change: (String) -> Unit): LinearLayout {
    val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
    val chips = linkedMapOf<String, TextView>()
    fun select(key: String) { chips.forEach { (id, view) -> view.background = rounded(if (id == key) p.accent else p.chip, 20); view.setTextColor(if (id == key) p.onAccent else p.text); view.isSelected = id == key } }
    options.forEach { (key, title) ->
      val chip = button(title) { select(key); change(key) }
      chips[key] = chip
      row.addView(chip, LinearLayout.LayoutParams(wrap, wrap).apply { marginEnd = dp(8) })
    }
    select(initial)
    column.addView(HorizontalScrollView(this).apply { isHorizontalScrollBarEnabled = false; addView(row) }, params())
    return row
  }
  protected fun dateButton(title: String, initial: String?, change: (String?) -> Unit): TextView {
    var date = initial
    lateinit var field: TextView
    field = button("$title: ${date ?: "None"}") {
      val parts = CalendarMath.parse(date ?: WidgetStore.today())!!
      val picker = DatePicker(ContextThemeWrapper(this, android.R.style.Theme_Material)).apply { init(parts[0], parts[1], parts[2], null) }
      pickerDialog(title, picker, { change(null); date = null; field.text = "$title: None" }) {
        date = CalendarMath.iso(picker.year, picker.month, picker.dayOfMonth); change(date); field.text = "$title: $date"
      }
    }
    column.addView(field, params()); return field
  }
  protected fun timeButton(title: String, initial: String, change: (String) -> Unit): TextView {
    var time = initial
    lateinit var field: TextView
    field = button("$title: $time") {
      val parts = time.split(":").map { it.toInt() }
      val picker = TimePicker(ContextThemeWrapper(this, android.R.style.Theme_Material)).apply { setIs24HourView(false); hour = parts[0]; minute = parts[1] }
      pickerDialog(title, picker) {
        time = String.format(Locale.US, "%02d:%02d", picker.hour, picker.minute); change(time); field.text = "$title: $time"
      }
    }
    column.addView(field, params()); return field
  }
  private fun pickerDialog(title: String, picker: View, clear: (() -> Unit)? = null, save: () -> Unit) {
    val dialog = Dialog(this)
    val content = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(dp(16), dp(18), dp(16), dp(18)); background = rounded(p.surface, 24) }
    content.addView(TextView(this).apply { text = title; textSize = 18f; typeface = Typeface.DEFAULT_BOLD; setTextColor(p.text) })
    content.addView(picker, params())
    val actions = LinearLayout(this)
    actions.addView(button(if (clear != null) "Clear" else "Cancel") { clear?.invoke(); dialog.dismiss() }, LinearLayout.LayoutParams(0, wrap, 1f))
    actions.addView(button("Done", true) { save(); dialog.dismiss() }, LinearLayout.LayoutParams(0, wrap, 1f).apply { marginStart = dp(8) })
    content.addView(actions, params())
    dialog.setContentView(ScrollView(this).apply { addView(content) })
    dialog.window?.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    dialog.show(); dialog.window?.setLayout((resources.displayMetrics.widthPixels * .92f).toInt(), wrap)
  }
  protected fun finishButtons(title: String, save: () -> Unit) {
    val row = LinearLayout(this)
    row.addView(button("Cancel") { finish() }, LinearLayout.LayoutParams(0, wrap, 1f))
    row.addView(button(title, true, save), LinearLayout.LayoutParams(0, wrap, 2f).apply { marginStart = dp(10) })
    column.addView(row, params(top = 22))
  }
}
