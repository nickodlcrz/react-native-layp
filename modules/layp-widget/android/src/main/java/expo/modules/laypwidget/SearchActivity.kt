package expo.modules.laypwidget

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.BaseAdapter
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import java.util.Locale

// "Search past expenses", opened from the spending widget. A tall bottom
// sheet with a search box over a scrolling list. Every word you type has to
// match somewhere on the expense (name, label, account, date, month, or
// amount), so "food oct" or "coffee 85" both narrow it down. The list is the
// last ~300 expenses LAYP pushed plus anything just logged from the widget.
class SearchActivity : Activity() {

  companion object {
    const val ACTION = "expo.modules.laypwidget.SEARCH"
  }

  private lateinit var summary: WidgetSummary
  private lateinit var p: Palette
  private lateinit var all: List<RecentExpense>
  private lateinit var haystacks: List<String>
  private lateinit var summaryText: TextView
  private val adapter = ResultsAdapter()
  private var results: List<RecentExpense> = emptyList()
  private var query = ""

  private val wrap = ViewGroup.LayoutParams.WRAP_CONTENT
  private val match = ViewGroup.LayoutParams.MATCH_PARENT

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    summary = WidgetStore.readSummary(this)
    p = Palette.resolve(this, summary.theme)
    all = WidgetStore.searchableExpenses(this)
    haystacks = all.map { haystack(it) }
    results = all

    setFinishOnTouchOutside(true)
    window.setGravity(Gravity.BOTTOM)
    window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)
    setContentView(buildContent())
    window.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, (resources.displayMetrics.heightPixels * 0.88f).toInt())
    window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    refreshSummary()
  }

  private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

  private fun accountLabel(id: String): String = summary.accounts.firstOrNull { it.id == id }?.label ?: ""

  private fun money(v: Double) = WidgetStore.formatMoney(summary.currency, v)

  // Everything about an expense that a search word may match, lowercased.
  private fun haystack(e: RecentExpense): String {
    val parts = CalendarMath.parse(e.date)
    val month = if (parts != null) CalendarMath.MONTHS[parts[1]] else ""
    val plain = if (e.amount % 1.0 == 0.0) e.amount.toLong().toString() else String.format(Locale.US, "%.2f", e.amount)
    return listOf(e.name, e.label, accountLabel(e.account), e.date, CalendarMath.shortDate(e.date), month, plain, money(e.amount))
      .joinToString(" ").lowercase(Locale.US)
  }

  private fun buildContent(): View {
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(20), dp(18), dp(20), dp(8))
    }

    // Grab handle: reads as a pull-up sheet
    column.addView(View(this).apply {
      background = GradientDrawable().apply { setColor(p.line); cornerRadius = dp(3).toFloat() }
    }, LinearLayout.LayoutParams(dp(40), dp(4)).apply {
      gravity = Gravity.CENTER_HORIZONTAL
      bottomMargin = dp(14)
    })

    column.addView(LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      addView(TextView(this@SearchActivity).apply {
        text = "Search expenses"
        textSize = 20f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(p.text)
      }, LinearLayout.LayoutParams(0, wrap, 1f))
      addView(TextView(this@SearchActivity).apply {
        text = "\u2715"
        textSize = 18f
        setTextColor(p.muted)
        setPadding(dp(10), dp(4), dp(2), dp(4))
        contentDescription = "Close"
        setOnClickListener { finish() }
      })
    })

    val input = EditText(this).apply {
      hint = "Name, label, amount or date"
      textSize = 15f
      setTextColor(p.text)
      setHintTextColor(p.muted)
      background = GradientDrawable().apply { setColor(p.chip); cornerRadius = dp(14).toFloat() }
      setPadding(dp(14), dp(12), dp(14), dp(12))
      setSingleLine(true)
      inputType = InputType.TYPE_CLASS_TEXT
      imeOptions = EditorInfo.IME_ACTION_SEARCH
      setOnEditorActionListener { v, actionId, _ ->
        if (actionId == EditorInfo.IME_ACTION_SEARCH) {
          (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(v.windowToken, 0)
          true
        } else false
      }
      addTextChangedListener(object : TextWatcher {
        override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
        override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        override fun afterTextChanged(s: Editable?) {
          query = s?.toString().orEmpty()
          applyFilter()
        }
      })
    }
    column.addView(input, LinearLayout.LayoutParams(match, wrap).apply { topMargin = dp(14) })

    summaryText = TextView(this).apply {
      textSize = 12f
      setTextColor(p.muted)
    }
    column.addView(summaryText, LinearLayout.LayoutParams(match, wrap).apply { topMargin = dp(10); bottomMargin = dp(4) })

    val list = ListView(this).apply {
      divider = ColorDrawable(p.line)
      dividerHeight = 1
      isVerticalScrollBarEnabled = false
      this.adapter = this@SearchActivity.adapter
      setOnScrollListener(object : android.widget.AbsListView.OnScrollListener {
        override fun onScrollStateChanged(view: android.widget.AbsListView?, scrollState: Int) {
          if (scrollState != android.widget.AbsListView.OnScrollListener.SCROLL_STATE_IDLE) {
            (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(input.windowToken, 0)
          }
        }
        override fun onScroll(view: android.widget.AbsListView?, first: Int, visible: Int, total: Int) {}
      })
    }
    column.addView(list, LinearLayout.LayoutParams(match, 0, 1f))
    input.requestFocus()

    val radius = dp(26).toFloat()
    column.background = GradientDrawable().apply {
      setColor(p.surface)
      cornerRadii = floatArrayOf(radius, radius, radius, radius, 0f, 0f, 0f, 0f)
    }
    return column
  }

  private fun applyFilter() {
    val words = query.trim().lowercase(Locale.US).split(Regex("\\s+")).filter { it.isNotEmpty() }
    results = if (words.isEmpty()) all else all.filterIndexed { i, _ -> words.all { w -> haystacks[i].contains(w) } }
    adapter.notifyDataSetChanged()
    refreshSummary()
  }

  private fun refreshSummary() {
    summaryText.text = when {
      all.isEmpty() -> "No expenses yet. They show up here once you log some."
      results.isEmpty() -> "No matches"
      summary.hidden -> "${results.size} ${if (results.size == 1) "expense" else "expenses"}"
      else -> "${results.size} ${if (results.size == 1) "expense" else "expenses"} \u00B7 ${money(results.sumOf { it.amount })} total"
    }
  }

  private class Row(val name: TextView, val sub: TextView, val amount: TextView)

  private inner class ResultsAdapter : BaseAdapter() {
    override fun getCount(): Int = results.size
    override fun getItem(position: Int): Any = results[position]
    override fun getItemId(position: Int): Long = position.toLong()

    override fun getView(position: Int, convertView: View?, parent: ViewGroup?): View {
      val row: Row
      val root: View
      if (convertView == null) {
        val name = TextView(this@SearchActivity).apply {
          textSize = 15f
          typeface = Typeface.DEFAULT_BOLD
          setTextColor(p.text)
          maxLines = 1
          ellipsize = android.text.TextUtils.TruncateAt.END
        }
        val sub = TextView(this@SearchActivity).apply {
          textSize = 12f
          setTextColor(p.muted)
          maxLines = 1
          ellipsize = android.text.TextUtils.TruncateAt.END
        }
        val amount = TextView(this@SearchActivity).apply {
          textSize = 15f
          typeface = Typeface.DEFAULT_BOLD
          setTextColor(p.text)
          setPadding(dp(12), 0, 0, 0)
        }
        val texts = LinearLayout(this@SearchActivity).apply {
          orientation = LinearLayout.VERTICAL
          addView(name)
          addView(sub)
        }
        root = LinearLayout(this@SearchActivity).apply {
          orientation = LinearLayout.HORIZONTAL
          gravity = Gravity.CENTER_VERTICAL
          setPadding(0, dp(11), 0, dp(11))
          addView(texts, LinearLayout.LayoutParams(0, wrap, 1f))
          addView(amount)
        }
        row = Row(name, sub, amount)
        root.tag = row
      } else {
        root = convertView
        row = root.tag as Row
      }
      val e = results[position]
      row.name.text = e.name.ifEmpty { e.label.ifEmpty { "Expense" } }
      row.sub.text = listOf(e.label, accountLabel(e.account), CalendarMath.weekdayShortDate(e.date))
        .filter { it.isNotEmpty() && it != e.name }.joinToString(" \u00B7 ")
      row.amount.text = if (summary.hidden) "\u2022\u2022\u2022\u2022" else money(e.amount)
      return root
    }
  }
}
