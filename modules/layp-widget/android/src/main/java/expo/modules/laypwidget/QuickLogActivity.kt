package expo.modules.laypwidget

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
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

// The bottom sheet opened from the spending widget, in two modes:
//   expense -- "Log expense": amount, note, label, budget category, account
//   money   -- "Receive money": amount, note, source, account
// It's a plain Activity with a floating, transparent-window theme (see
// styles.xml) that draws its own rounded card, so the person never leaves
// the home screen, and it follows LAYP's light/dark choice (Palette).
//
// Fast path: amount -> Save. Account, category and label default to what was
// used last, and a chip tap on the widget pre-selects its label.
//
// Spending can never go past an account's balance: the Save button is
// disabled and the amount flagged while the amount is more than what's left
// (WidgetStore.availableBalance counts what was already logged from the
// widget). Saving only appends to the native queue; LAYP absorbs it next
// time it opens (and re-checks the balance then), so this works with the app
// closed.
class QuickLogActivity : Activity() {

  companion object {
    const val ACTION = "expo.modules.laypwidget.QUICK_LOG"
    const val EXTRA_LABEL = "label"
    const val EXTRA_MODE = "mode"
    const val MODE_EXPENSE = "expense"
    const val MODE_MONEY = "money"
    private val AMOUNT_PATTERN = Regex("^\\d{0,9}([.]\\d{0,2})?$")
    private val QUICK_ADD = listOf(20, 50, 100, 500)
  }

  private lateinit var summary: WidgetSummary
  private lateinit var p: Palette
  private var isMoney = false

  private lateinit var amountInput: EditText
  private lateinit var nameInput: EditText
  private lateinit var balanceNote: TextView
  private lateinit var saveButton: TextView
  private var labelRow: ChipRow? = null
  private var splitRow: ChipRow? = null
  private var accountRow: ChipRow? = null
  private var sourceRow: ChipRow? = null

  private var selectedLabel: String? = null
  private var selectedSplit: String? = null
  private var selectedAccount: String? = null
  private var selectedSource: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    summary = WidgetStore.readSummary(this)
    p = Palette.resolve(this, summary.theme)
    isMoney = intent.getStringExtra(EXTRA_MODE) == MODE_MONEY
    setFinishOnTouchOutside(true)
    window.setGravity(Gravity.BOTTOM)
    setContentView(buildContent(intent.getStringExtra(EXTRA_LABEL)))
    window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
    window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    amountInput.requestFocus()
  }

  // singleTask: tapping a different chip while the sheet is already open
  // lands here instead of stacking a second sheet.
  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    if (!isMoney) intent.getStringExtra(EXTRA_LABEL)?.let { labelRow?.select(it, notify = true) }
  }

  // ---------------------------------------------------------------- UI

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

  private fun roundedBackground(color: Int, radiusDp: Int): GradientDrawable =
    GradientDrawable().apply {
      setColor(color)
      cornerRadius = dp(radiusDp).toFloat()
    }

  private fun params(width: Int, height: Int, top: Int = 0, bottom: Int = 0, end: Int = 0) =
    LinearLayout.LayoutParams(width, height).apply {
      topMargin = dp(top)
      bottomMargin = dp(bottom)
      marginEnd = dp(end)
    }

  private val wrap = ViewGroup.LayoutParams.WRAP_CONTENT
  private val match = ViewGroup.LayoutParams.MATCH_PARENT

  private fun buildContent(presetLabel: String?): View {
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(18), dp(20), dp(20))
    }

    // Grab handle: reads as a pull-up sheet
    column.addView(View(this).apply { background = roundedBackground(p.line, 3) }, LinearLayout.LayoutParams(dp(40), dp(4)).apply {
      gravity = Gravity.CENTER_HORIZONTAL
      bottomMargin = dp(14)
    })

    // Title + close
    column.addView(LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(TextView(this@QuickLogActivity).apply {
        text = if (isMoney) "Receive money" else "Log expense"
        textSize = 20f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(p.text)
      }, LinearLayout.LayoutParams(0, wrap, 1f))
      addView(TextView(this@QuickLogActivity).apply {
        text = "\u2715"
        textSize = 18f
        setTextColor(p.muted)
        setPadding(dp(10), dp(4), dp(2), dp(4))
        contentDescription = "Close"
        setOnClickListener { finish() }
      })
    })

    // Amount: currency symbol + big numeric field
    amountInput = EditText(this).apply {
      hint = "0.00"
      textSize = 34f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(p.text)
      setHintTextColor(p.muted)
      background = null
      setPadding(dp(6), 0, 0, 0)
      inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
      imeOptions = EditorInfo.IME_ACTION_NEXT
      // At most 9 digits and 2 decimals, so "12.345" or "1.2.3" can't be typed.
      filters = arrayOf(InputFilter { source, start, end, dest, dstart, dend ->
        val before = dest.toString().substring(0, dstart)
        val after = dest.toString().substring(dend)
        val next = before + source.subSequence(start, end) + after
        if (AMOUNT_PATTERN.matches(next)) null else ""
      })
      addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(s: Editable?) {
          error = null
          updateBalanceNote()
        }
      })
    }
    column.addView(LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(TextView(this@QuickLogActivity).apply {
        text = summary.currency
        textSize = 30f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(p.muted)
      })
      addView(amountInput, LinearLayout.LayoutParams(0, wrap, 1f))
    }, params(match, wrap, top = 12))

    // Quick add: +20 +50 +100 +500 add to whatever is typed
    column.addView(HorizontalScrollView(this).apply {
      isVerticalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false
      addView(LinearLayout(this@QuickLogActivity).apply {
        orientation = LinearLayout.HORIZONTAL
        for (step in QUICK_ADD) {
          val chip = makeChip("+$step")
          styleChip(chip, selected = false)
          chip.setOnClickListener { addToAmount(step) }
          addView(chip, params(wrap, wrap, end = 8))
        }
      })
    }, params(match, wrap, top = 6))

    // Note (optional)
    nameInput = EditText(this).apply {
      hint = if (isMoney) "From who? e.g. Mom, salary (optional)" else "What for? (optional)"
      textSize = 15f
      setTextColor(p.text)
      setHintTextColor(p.muted)
      background = roundedBackground(p.chip, 14)
      setPadding(dp(14), dp(12), dp(14), dp(12))
      setSingleLine(true)
      inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
      imeOptions = EditorInfo.IME_ACTION_DONE
      setOnEditorActionListener { _, actionId, _ ->
        if (actionId == EditorInfo.IME_ACTION_DONE) { save(); true } else false
      }
    }
    column.addView(nameInput, params(match, wrap, top = 14))

    if (isMoney) {
      // Source of the money
      val sources = summary.incomeCategories.ifEmpty { WidgetStore.DEFAULT_INCOME }
      val lastIncome = WidgetStore.lastIncome(this)
      selectedSource = sources.firstOrNull { it.id == lastIncome }?.id ?: sources.first().id
      column.addView(sectionLabel("SOURCE"))
      sourceRow = ChipRow(sources.map { it.id to it.label }, selectedSource, allowClear = false) { selectedSource = it }
      column.addView(sourceRow!!.view, params(match, wrap, top = 6))
    } else {
      // Label: this widget's chips first, then the rest of the app's labels
      val labelOptions = linkedMapOf<String, String>()
      val preset = presetLabel?.trim().orEmpty()
      for (l in listOf(preset) + summary.labels + WidgetStore.ALL_LABELS) {
        if (l.isNotEmpty() && labelOptions.keys.none { it.equals(l, ignoreCase = true) }) labelOptions[l] = l
      }
      selectedLabel = if (preset.isNotEmpty()) preset else null
      column.addView(sectionLabel("LABEL"))
      labelRow = ChipRow(labelOptions.entries.map { it.key to it.value }, selectedLabel, allowClear = true) { selectedLabel = it }
      column.addView(labelRow!!.view, params(match, wrap, top = 6))

      // Budget category -- only once the app has told us what they are
      if (summary.splits.isNotEmpty()) {
        val lastSplit = WidgetStore.lastSplit(this)
        selectedSplit = summary.splits.firstOrNull { it.id == lastSplit }?.id ?: summary.splits.first().id
        column.addView(sectionLabel("BUDGET CATEGORY"))
        splitRow = ChipRow(summary.splits.map { it.id to it.label }, selectedSplit, allowClear = false) { selectedSplit = it }
        column.addView(splitRow!!.view, params(match, wrap, top = 6))
      }
    }

    // Account
    if (summary.accounts.isNotEmpty()) {
      val lastAccount = WidgetStore.lastAccount(this)
      selectedAccount = summary.accounts.firstOrNull { it.id == lastAccount }?.id ?: summary.accounts.first().id
      column.addView(sectionLabel(if (isMoney) "GOES INTO" else "ACCOUNT"))
      accountRow = ChipRow(summary.accounts.map { it.id to it.label }, selectedAccount, allowClear = false) {
        selectedAccount = it
        updateBalanceNote()
      }
      column.addView(accountRow!!.view, params(match, wrap, top = 6))
    }

    balanceNote = TextView(this).apply {
      textSize = 12f
      visibility = View.GONE
    }
    column.addView(balanceNote, params(match, wrap, top = 8))

    // Cancel + Save
    val cancel = TextView(this).apply {
      text = "Cancel"
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(p.muted)
      setPadding(dp(16), dp(14), dp(16), dp(14))
      setOnClickListener { finish() }
    }
    saveButton = TextView(this).apply {
      text = if (isMoney) "Add money" else "Save expense"
      textSize = 15f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(p.onAccent)
      background = roundedBackground(p.accent, 14)
      setPadding(dp(16), dp(14), dp(16), dp(14))
      setOnClickListener { save() }
    }
    column.addView(LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      addView(cancel, LinearLayout.LayoutParams(wrap, wrap))
      addView(saveButton, LinearLayout.LayoutParams(0, wrap, 1f))
    }, params(match, wrap, top = 18))

    updateBalanceNote()

    // Rounded-top sheet; scrolls if the keyboard leaves too little room.
    val radius = dp(26).toFloat()
    return ScrollView(this).apply {
      isVerticalScrollBarEnabled = false
      isHorizontalScrollBarEnabled = false
      background = GradientDrawable().apply {
        setColor(p.surface)
        cornerRadii = floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
      }
      isVerticalScrollBarEnabled = false
      addView(column)
    }
  }

  private fun sectionLabel(text: String): TextView = TextView(this).apply {
    this.text = text
    textSize = 11f
    typeface = Typeface.DEFAULT_BOLD
    letterSpacing = 0.08f
    setTextColor(p.muted)
    layoutParams = params(wrap, wrap, top = 16)
  }

  private fun makeChip(text: String): TextView = TextView(this).apply {
    this.text = text
    textSize = 13f
    typeface = Typeface.DEFAULT_BOLD
    setPadding(dp(14), dp(8), dp(14), dp(8))
    setSingleLine(true)
  }

  private fun styleChip(chip: TextView, selected: Boolean) {
    chip.background = roundedBackground(if (selected) p.accent else p.chip, 18)
    chip.setTextColor(if (selected) p.onAccent else p.text)
  }

  // A horizontally scrolling row of chips where one can be picked.
  // `allowClear` lets a second tap on the picked chip deselect it (used for
  // the optional label; category, source and account always keep one selected).
  private inner class ChipRow(
    options: List<Pair<String, String>>,
    initial: String?,
    private val allowClear: Boolean,
    private val onChange: (String?) -> Unit
  ) {
    val view = HorizontalScrollView(this@QuickLogActivity)
    private val chips = LinkedHashMap<String, TextView>()
    private var selected: String? = null

    init {
      view.isHorizontalScrollBarEnabled = false
      val row = LinearLayout(this@QuickLogActivity).apply { orientation = LinearLayout.HORIZONTAL }
      for ((id, text) in options) {
        val chip = makeChip(text)
        chip.setOnClickListener {
          select(if (selected == id && allowClear) null else id, notify = true)
        }
        chips[id] = chip
        row.addView(chip, params(wrap, wrap, end = 8))
      }
      view.addView(row)
      select(initial, notify = false)
    }

    fun select(id: String?, notify: Boolean) {
      val match = chips.keys.firstOrNull { it.equals(id, ignoreCase = true) }
      selected = if (id == null) null else match
      for ((chipId, chip) in chips) styleChip(chip, chipId == selected)
      if (notify) onChange(selected)
    }
  }

  // ------------------------------------------------------------ behavior

  private fun typedAmount(): Double = amountInput.text.toString().toDoubleOrNull() ?: 0.0

  private fun addToAmount(step: Int) {
    val next = typedAmount() + step
    val text = if (next % 1.0 == 0.0) next.toLong().toString() else String.format(java.util.Locale.US, "%.2f", next)
    amountInput.setText(text)
    amountInput.setSelection(amountInput.text.length)
  }

  private fun accountLabel(): String = summary.accounts.firstOrNull { it.id == selectedAccount }?.label ?: "this account"

  // What's left in the chosen account right now, or null when unknown.
  private fun available(): Double? = selectedAccount?.let { WidgetStore.availableBalance(this, it) }

  // Expense mode only: is the typed amount more than what's left?
  private fun overBudget(): Boolean {
    if (isMoney) return false
    val left = available() ?: return false
    return typedAmount() > left + 0.0001
  }

  // Under the account chips: what's left (or what it will be after adding
  // money), and a clear "not enough" message when an expense is too big. The
  // Save button greys out in that case, and save() refuses as well.
  private fun updateBalanceNote() {
    if (!::balanceNote.isInitialized) return
    val left = available()
    val blocked = overBudget()
    if (left == null || (summary.hidden && !blocked)) {
      balanceNote.visibility = View.GONE
    } else {
      balanceNote.visibility = View.VISIBLE
      val money = { v: Double -> WidgetStore.formatMoney(summary.currency, v) }
      when {
        blocked -> {
          balanceNote.text = if (summary.hidden) "Not enough in ${accountLabel()}." else "Not enough in ${accountLabel()}. Only ${money(maxOf(left, 0.0))} available."
          balanceNote.setTextColor(p.error)
        }
        isMoney -> {
          val added = typedAmount()
          balanceNote.text = if (added > 0) "${accountLabel()} will be ${money(left + added)}" else "${accountLabel()} balance: ${money(left)}"
          balanceNote.setTextColor(p.muted)
        }
        else -> {
          balanceNote.text = "${accountLabel()} available: ${money(left)}"
          balanceNote.setTextColor(p.muted)
        }
      }
    }
    if (::saveButton.isInitialized) {
      saveButton.alpha = if (blocked) 0.4f else 1f
    }
  }

  private fun save() {
    val parsed = amountInput.text.toString().toDoubleOrNull()
    if (parsed == null || parsed <= 0.0) {
      amountInput.error = "Enter an amount"
      amountInput.requestFocus()
      return
    }
    if (overBudget()) {
      amountInput.error = "More than ${accountLabel()} has"
      amountInput.requestFocus()
      return
    }
    val amount = Math.round(parsed * 100.0) / 100.0
    val typedName = nameInput.text.toString().trim()
    val now = System.currentTimeMillis()

    if (isMoney) {
      WidgetStore.enqueueMoney(
        this,
        PendingMoney(UUID.randomUUID().toString(), amount, typedName, selectedSource.orEmpty(), selectedAccount.orEmpty(), WidgetStore.today(), now)
      )
      WidgetStore.saveLastIncome(this, selectedSource, selectedAccount)
      WidgetRefresh.all(this)
      val shown = if (summary.hidden) "Money" else WidgetStore.formatMoney(summary.currency, amount)
      Toast.makeText(this, "Added $shown to ${accountLabel()}", Toast.LENGTH_SHORT).show()
      finish()
      return
    }

    val label = selectedLabel.orEmpty()
    val name = if (typedName.isNotEmpty()) typedName else if (label.isNotEmpty()) label else "Quick expense"
    WidgetStore.enqueue(
      this,
      PendingExpense(UUID.randomUUID().toString(), amount, name, label, selectedSplit.orEmpty(), selectedAccount.orEmpty(), WidgetStore.today(), now)
    )
    WidgetStore.saveLastChoice(this, selectedSplit, selectedAccount)
    WidgetRefresh.all(this)
    val shown = if (summary.hidden) "Expense" else WidgetStore.formatMoney(summary.currency, amount)
    Toast.makeText(this, "Logged $shown \u00B7 ${if (label.isNotEmpty()) label else name}", Toast.LENGTH_SHORT).show()
    finish()
  }
}
