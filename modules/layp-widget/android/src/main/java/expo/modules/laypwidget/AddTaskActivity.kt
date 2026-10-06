package expo.modules.laypwidget

import android.app.Activity
import android.app.DatePickerDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import java.util.UUID

// The "Add task" bottom sheet, opened by the (+) on the Tasks widget.
//
// Fast path: type the title -> Add. Due date defaults to today and category to
// the last one used, the same defaults as the app's own form (which also
// starts on today). Tasks are created with the app's other defaults too (not
// started, a daily 8:00 reminder, no alarm, no subtasks).
//
// Saving only appends to the native queue and shows the task on the widget
// right away; LAYP creates the real task -- and schedules its reminders --
// the next time it runs (see src/widgetSummary.js pendingToTodos), so this
// works with the app closed.
class AddTaskActivity : Activity() {

  companion object {
    const val ACTION = "expo.modules.laypwidget.ADD_TASK"

    // Mirrors CATEGORIES in src/theme.js.
    private val CATEGORIES = listOf(
      "school" to "School",
      "errands" to "Errands",
      "shopping" to "Shopping",
      "other" to "Other"
    )

    private const val DUE_TODAY = "today"
    private const val DUE_TOMORROW = "tomorrow"
    private const val DUE_3_DAYS = "3days"
    private const val DUE_PICK = "pick"
    private const val DUE_NONE = "none"
  }

  private lateinit var p: Palette
  private lateinit var titleInput: EditText
  private lateinit var dueRow: ChipRow
  private lateinit var categoryRow: ChipRow

  private var dueChoice = DUE_TODAY
  private var pickedDate: String? = null
  private var category = "school"

  private val wrap = ViewGroup.LayoutParams.WRAP_CONTENT
  private val match = ViewGroup.LayoutParams.MATCH_PARENT

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    p = Palette.resolve(this, WidgetStore.readSummary(this).theme)
    setFinishOnTouchOutside(true)
    window.setGravity(Gravity.BOTTOM)
    setContentView(buildContent())
    window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    titleInput.requestFocus()
  }

  // singleTask: tapping (+) again while the sheet is open just re-focuses it.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    titleInput.requestFocus()
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

  private fun rounded(color: Int, radiusDp: Int) = GradientDrawable().apply {
    setColor(color)
    cornerRadius = dp(radiusDp).toFloat()
  }

  private fun params(width: Int, height: Int, top: Int = 0, end: Int = 0) =
    LinearLayout.LayoutParams(width, height).apply {
      topMargin = dp(top)
      marginEnd = dp(end)
    }

  private fun buildContent(): View {
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(18), dp(20), dp(20))
    }

    // Grab handle
    column.addView(View(this).apply { background = rounded(p.line, 3) }, LinearLayout.LayoutParams(dp(40), dp(4)).apply {
      gravity = Gravity.CENTER_HORIZONTAL
      bottomMargin = dp(14)
    })

    // Title + close
    column.addView(LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(TextView(this@AddTaskActivity).apply {
        text = "Add task"
        textSize = 20f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(p.text)
      }, LinearLayout.LayoutParams(0, wrap, 1f))
      addView(TextView(this@AddTaskActivity).apply {
        text = "\u2715"
        textSize = 18f
        setTextColor(p.muted)
        setPadding(dp(10), dp(4), dp(2), dp(4))
        contentDescription = "Close"
        setOnClickListener { finish() }
      })
    })

    // The task itself
    titleInput = EditText(this).apply {
      hint = "What do you need to do?"
      textSize = 18f
      setTextColor(p.text)
      setHintTextColor(p.muted)
      background = rounded(p.chip, 14)
      setPadding(dp(14), dp(14), dp(14), dp(14))
      setSingleLine(true)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      imeOptions = EditorInfo.IME_ACTION_DONE
      setOnEditorActionListener { _, actionId, _ ->
        if (actionId == EditorInfo.IME_ACTION_DONE) { save(); true } else false
      }
    }
    column.addView(titleInput, params(match, wrap, top = 14))

    // Due date
    column.addView(sectionLabel("DUE"))
    dueRow = ChipRow(
      listOf(DUE_TODAY to "Today", DUE_TOMORROW to "Tomorrow", DUE_3_DAYS to "In 3 days", DUE_PICK to "Pick a date", DUE_NONE to "No date"),
      DUE_TODAY
    ) { choice ->
      if (choice == DUE_PICK) openDatePicker() else dueChoice = choice
    }
    column.addView(dueRow.view, params(match, wrap, top = 6))

    // Category
    category = CATEGORIES.firstOrNull { it.first == WidgetStore.lastTaskCategory(this) }?.first ?: "school"
    column.addView(sectionLabel("CATEGORY"))
    categoryRow = ChipRow(CATEGORIES, category) { category = it }
    column.addView(categoryRow.view, params(match, wrap, top = 6))

    // Cancel + Add
    val cancel = TextView(this).apply {
      text = "Cancel"
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(p.muted)
      setPadding(dp(16), dp(14), dp(16), dp(14))
      setOnClickListener { finish() }
    }
    val add = TextView(this).apply {
      text = "Add task"
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(p.onAccent)
      background = rounded(p.accent, 14)
      setPadding(dp(16), dp(14), dp(16), dp(14))
      setOnClickListener { save() }
    }
    column.addView(LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      addView(cancel, LinearLayout.LayoutParams(wrap, wrap))
      addView(add, LinearLayout.LayoutParams(0, wrap, 1f))
    }, params(match, wrap, top = 20))

    val radius = dp(26).toFloat()
    return ScrollView(this).apply {
      background = GradientDrawable().apply {
        setColor(p.surface)
        cornerRadii = floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
      }
      isVerticalScrollBarEnabled = false
      addView(column)
    }
  }

  private fun sectionLabel(text: String) = TextView(this).apply {
    this.text = text
    textSize = 11f
    typeface = Typeface.DEFAULT_BOLD
    letterSpacing = 0.08f
    setTextColor(p.muted)
    layoutParams = params(wrap, wrap, top = 18)
  }

  // "Pick a date" opens the system date picker; once a date is chosen the chip
  // shows it ("Oct 12"). Cancelling the picker leaves the previous choice.
  private fun openDatePicker() {
    val start = CalendarMath.parse(pickedDate ?: WidgetStore.today())!!
    val dialog = DatePickerDialog(this, { _, y, m, d ->
      pickedDate = CalendarMath.iso(y, m, d)
      dueChoice = DUE_PICK
      dueRow.rename(DUE_PICK, CalendarMath.weekdayShortDate(pickedDate!!))
      dueRow.select(DUE_PICK, notify = false)
    }, start[0], start[1], start[2])
    dialog.setOnCancelListener { dueRow.select(dueChoice, notify = false) }
    dialog.show()
  }

  private fun resolveDue(): String? = when (dueChoice) {
    DUE_TODAY -> WidgetStore.today()
    DUE_TOMORROW -> CalendarMath.addDays(WidgetStore.today(), 1)
    DUE_3_DAYS -> CalendarMath.addDays(WidgetStore.today(), 3)
    DUE_PICK -> pickedDate
    else -> null
  }

  private fun save() {
    val title = titleInput.text.toString().trim()
    if (title.isEmpty()) {
      titleInput.error = "Enter a task"
      titleInput.requestFocus()
      return
    }
    WidgetStore.enqueueTask(
      this,
      PendingTask(UUID.randomUUID().toString(), title, category, resolveDue(), System.currentTimeMillis())
    )
    WidgetStore.saveLastTaskCategory(this, category)
    WidgetRefresh.all(this)
    Toast.makeText(this, "Task added", Toast.LENGTH_SHORT).show()
    finish()
  }

  // A horizontally scrolling row of single-select chips.
  private inner class ChipRow(
    options: List<Pair<String, String>>,
    initial: String,
    private val onChange: (String) -> Unit
  ) {
    val view = HorizontalScrollView(this@AddTaskActivity)
    private val chips = LinkedHashMap<String, TextView>()
    private var selected: String = initial

    init {
      view.isHorizontalScrollBarEnabled = false
      val row = LinearLayout(this@AddTaskActivity).apply { orientation = LinearLayout.HORIZONTAL }
      for ((id, text) in options) {
        val chip = TextView(this@AddTaskActivity).apply {
          this.text = text
          textSize = 13f
          typeface = Typeface.DEFAULT_BOLD
          setPadding(dp(14), dp(8), dp(14), dp(8))
          setSingleLine(true)
          setOnClickListener { select(id, notify = true) }
        }
        chips[id] = chip
        row.addView(chip, params(wrap, wrap, end = 8))
      }
      view.addView(row)
      select(initial, notify = false)
    }

    fun rename(id: String, text: String) { chips[id]?.text = text }

    fun select(id: String, notify: Boolean) {
      selected = id
      for ((chipId, chip) in chips) {
        val on = chipId == selected
        chip.background = rounded(if (on) p.accent else p.chip, 18)
        chip.setTextColor(if (on) p.onAccent else p.text)
      }
      if (notify) onChange(id)
    }
  }
}
