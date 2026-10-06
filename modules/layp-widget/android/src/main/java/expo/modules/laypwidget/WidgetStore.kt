package expo.modules.laypwidget

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.util.Locale
import java.util.UUID

// A selectable option in the dialogs: a budget category ("Needs"), an income
// source ("Allowance") or an account ("Cash"). balance is only known for accounts.
data class Choice(val id: String, val label: String, val balance: Double?)

data class RecentExpense(val id: String, val name: String, val label: String, val amount: Double, val date: String, val account: String)

// categoryLabel ("School") and subject (the subject code, e.g. "EE 301") are
// what the Tasks widget shows under the title.
data class WidgetTask(
  val id: String,
  val title: String,
  val status: String,
  val due: String?,
  val category: String,
  val categoryLabel: String = "",
  val subject: String = ""
)

data class WidgetEvent(val date: String, val title: String, val kind: String, val amount: Double?)

data class WidgetClass(
  val entryId: String,
  val subjectId: String,
  val code: String,
  val description: String,
  val room: String,
  val start: String,
  val end: String,
  val startMin: Int,
  val endMin: Int,
  val dayLabel: String
)

// What LAYP (JS) last told the widgets about the world -- see
// src/widgetSummary.js for how it's built. Everything here is already
// computed by the app; Kotlin only displays it.
data class WidgetSummary(
  val appliedWidgetIds: Set<String>,
  val date: String,          // "YYYY-MM-DD" the spending totals are for
  val todaySpent: Double,
  val todayCount: Int,
  val hidden: Boolean,       // mirrors the app's "hide money" switch
  val currency: String,
  val theme: String,         // "dark" | "light" (LAYP's own setting)
  val labels: List<String>,  // most-used spending labels, best first
  val splits: List<Choice>,
  val accounts: List<Choice>,
  val incomeCategories: List<Choice>,
  val recent: List<RecentExpense>,
  val tasks: List<WidgetTask>,
  val events: List<WidgetEvent>,    // marked on the Calendar widget
  val upcoming: List<WidgetEvent>,  // listed in the Upcoming events widget
  val subjects: List<Choice>,
  val classes: List<WidgetClass>
)

// An expense logged from the widget that the app hasn't absorbed yet.
// `id` is generated here and reused as the expense's id inside LAYP, which
// is what makes absorbing it idempotent.
data class PendingExpense(
  val id: String,
  val amount: Double,
  val name: String,
  val label: String,
  val splitId: String,
  val account: String,
  val date: String,
  val createdAt: Long
)

// Money received/added from the widget, not yet absorbed.
data class PendingMoney(
  val id: String,
  val amount: Double,
  val note: String,
  val category: String,
  val account: String,
  val date: String,
  val createdAt: Long
)

// A task created from the Tasks widget's (+) button, not yet created in the
// app. The id becomes the task's id in LAYP.
data class PendingTask(
  val id: String,
  val title: String,
  val category: String,
  val due: String?,
  val createdAt: Long,
  val description: String = "",
  val subjectId: String? = null,
  val dueTime: String? = null,
  val alarmEnabled: Boolean = false,
  val reminderEnabled: Boolean = true,
  val notify: JSONObject = JSONObject().put("type", "daily").put("time", "08:00")
)

// A task action waiting for the app: a status change or completion, from a
// tap on the Tasks widget or a notification button. Absolute (set this
// status / complete), so applying one twice is harmless.
data class TaskOp(
  val id: String,
  val taskId: String,
  val status: String?,    // new status, when not completing
  val onlyIf: String?,    // only apply while the task is currently this status
  val complete: Boolean,
  val at: Long
)

// The widgets and the app never share a database: the app is React Native
// (AsyncStorage), the widgets are separate native surfaces that run while the
// app doesn't. They meet in this small SharedPreferences store:
//   app    -> widgets : `summary`                        (pushSummary)
//   widgets -> app    : four queues of things that happened while the app
//                       was closed (getPending / ack):
//                       expenses, money, task actions, notification answers
object WidgetStore {
  private const val PREFS = "layp_widget_store"
  private const val KEY_SUMMARY = "summary"
  private const val Q_EXPENSES = "pending"
  private const val Q_MONEY = "pending_money"
  private const val Q_TASK_OPS = "task_ops"
  private const val Q_NOTIF = "notif_actions"
  private const val Q_NEW_TASKS = "new_tasks"
  private const val Q_REMINDERS = "new_reminders"
  private const val KEY_BUDGET_HIDDEN = "budget_hidden_override"
  private const val Q_CLASS_SUSPENDS = "class_suspends"
  private const val KEY_LAST_TASK_CATEGORY = "last_task_category"
  private const val KEY_LAST_SPLIT = "last_split"
  private const val KEY_LAST_ACCOUNT = "last_account"
  private const val KEY_LAST_INCOME = "last_income"
  private const val KEY_CAL_OFFSET = "cal_offset"
  private val QUEUES = listOf(Q_EXPENSES, Q_MONEY, Q_TASK_OPS, Q_NOTIF, Q_NEW_TASKS, Q_CLASS_SUSPENDS, Q_REMINDERS)

  // Shown on the widget until the app has pushed a real summary.
  val DEFAULT_LABELS = listOf("Food", "Transportation", "School", "Shopping")

  // The app's own SPENDING_LABELS, in the dialog's fallback order.
  val ALL_LABELS = listOf(
    "Food", "Transportation", "School", "Bills", "Shopping", "Entertainment", "Health", "Other"
  )

  val DEFAULT_INCOME = listOf(
    Choice("allowance", "Allowance", null),
    Choice("salary", "Salary", null),
    Choice("gift", "Gift", null),
    Choice("refund", "Refund", null)
  )

  private fun prefs(context: Context) =
    context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun today(): String = CalendarMath.todayIso()

  fun formatMoney(currency: String, amount: Double): String {
    val df = DecimalFormat("#,##0.00", DecimalFormatSymbols(Locale.US))
    return currency + df.format(amount)
  }

  // --- summary (app -> widgets) ---

  private fun strings(arr: JSONArray?): List<String> {
    val out = mutableListOf<String>()
    if (arr == null) return out
    for (i in 0 until arr.length()) {
      val s = arr.optString(i, "").trim()
      if (s.isNotEmpty()) out.add(s)
    }
    return out
  }

  private fun objects(arr: JSONArray?): List<JSONObject> {
    val out = mutableListOf<JSONObject>()
    if (arr == null) return out
    for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { out.add(it) }
    return out
  }

  private fun choices(arr: JSONArray?): List<Choice> = objects(arr).mapNotNull { o ->
    val id = o.optString("id", "")
    if (id.isEmpty()) null
    else Choice(id, o.optString("label", id), if (o.has("balance") && !o.isNull("balance")) o.optDouble("balance") else null)
  }

  private fun parseSummary(o: JSONObject): WidgetSummary = WidgetSummary(
    appliedWidgetIds = strings(o.optJSONArray("appliedWidgetIds")).toSet(),
    date = o.optString("date", ""),
    todaySpent = o.optDouble("todaySpent", 0.0),
    todayCount = o.optInt("todayCount", 0),
    hidden = o.optBoolean("hidden", false),
    currency = o.optString("currency", "\u20B1"),
    theme = o.optString("theme", ""),
    labels = strings(o.optJSONArray("labels")),
    splits = choices(o.optJSONArray("splits")),
    accounts = choices(o.optJSONArray("accounts")),
    incomeCategories = choices(o.optJSONArray("incomeCategories")),
    recent = objects(o.optJSONArray("recent")).map {
      RecentExpense(
        it.optString("id", ""), it.optString("name", ""), it.optString("label", ""),
        it.optDouble("amount", 0.0), it.optString("date", ""), it.optString("account", "")
      )
    },
    tasks = objects(o.optJSONArray("tasks")).mapNotNull {
      val id = it.optString("id", "")
      if (id.isEmpty()) null
      else WidgetTask(
        id, it.optString("title", "Untitled task"),
        it.optString("status", TaskStatus.NOT_STARTED).let { s -> if (TaskStatus.isValid(s)) s else TaskStatus.NOT_STARTED },
        if (it.isNull("due")) null else it.optString("due", "").ifEmpty { null },
        it.optString("category", ""),
        it.optString("categoryLabel", ""),
        it.optString("subject", "")
      )
    },
    events = events(o.optJSONArray("events")),
    upcoming = events(o.optJSONArray("upcoming")),
    subjects = choices(o.optJSONArray("subjects")),
    classes = objects(o.optJSONArray("classes")).map {
      WidgetClass(
        it.optString("entryId", ""), it.optString("subjectId", ""),
        it.optString("code", "Class"), it.optString("description", ""), it.optString("room", ""),
        it.optString("start", ""), it.optString("end", ""),
        it.optInt("startMin", 0), it.optInt("endMin", 0), it.optString("dayLabel", "Today")
      )
    }
  )

  private fun events(arr: JSONArray?): List<WidgetEvent> = objects(arr).map {
    WidgetEvent(
      it.optString("date", ""), it.optString("title", ""), it.optString("kind", "date"),
      if (it.has("amount") && !it.isNull("amount")) it.optDouble("amount") else null
    )
  }.filter { CalendarMath.parse(it.date) != null }

  @Synchronized
  fun readSummary(context: Context): WidgetSummary {
    val raw = prefs(context).getString(KEY_SUMMARY, null)
    return try {
      parseSummary(if (raw == null) JSONObject() else JSONObject(raw))
    } catch (e: Exception) {
      parseSummary(JSONObject())
    }
  }

  // Throws on malformed JSON so a bad push never overwrites a good summary.
  @Synchronized
  fun writeSummary(context: Context, json: String) {
    val incoming = JSONObject(json)
    if (incoming.optBoolean("hidden", false) != readSummary(context).hidden) prefs(context).edit().remove(KEY_BUDGET_HIDDEN).apply()
    prefs(context).edit().putString(KEY_SUMMARY, json).apply()
  }

  // --- queues (widgets -> app) ---

  private fun readArray(context: Context, key: String): JSONArray {
    val raw = prefs(context).getString(key, null) ?: return JSONArray()
    return try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
  }

  private fun writeArray(context: Context, key: String, arr: JSONArray) {
    prefs(context).edit().putString(key, arr.toString()).apply()
  }

  @Synchronized
  private fun append(context: Context, key: String, item: JSONObject) {
    val arr = readArray(context, key)
    arr.put(item)
    writeArray(context, key, arr)
  }

  // Removes the given ids from every queue. Only those ids, so anything
  // queued while the app was busy absorbing a batch is kept for next time.
  @Synchronized
  fun ack(context: Context, ids: Collection<String>) {
    val drop = ids.toSet()
    for (key in QUEUES) {
      val arr = readArray(context, key)
      val kept = JSONArray()
      var changed = false
      for (i in 0 until arr.length()) {
        val o = arr.optJSONObject(i)
        if (o != null && o.optString("id", "") in drop) changed = true else if (o != null) kept.put(o)
      }
      if (changed) writeArray(context, key, kept)
    }
  }

  // Everything waiting for the app, as one JSON object.
  @Synchronized
  fun pendingAllJson(context: Context): String = JSONObject()
    .put("expenses", readArray(context, Q_EXPENSES))
    .put("money", readArray(context, Q_MONEY))
    .put("taskOps", readArray(context, Q_TASK_OPS))
    .put("notifActions", readArray(context, Q_NOTIF))
    .put("newTasks", readArray(context, Q_NEW_TASKS))
    .put("classSuspends", readArray(context, Q_CLASS_SUSPENDS))
    .put("newReminders", readArray(context, Q_REMINDERS))
    .toString()

  fun enqueue(context: Context, e: PendingExpense) = append(
    context, Q_EXPENSES,
    JSONObject().put("id", e.id).put("amount", e.amount).put("name", e.name).put("label", e.label)
      .put("splitId", e.splitId).put("account", e.account).put("date", e.date).put("createdAt", e.createdAt)
  )

  fun enqueueMoney(context: Context, m: PendingMoney) = append(
    context, Q_MONEY,
    JSONObject().put("id", m.id).put("amount", m.amount).put("note", m.note).put("category", m.category)
      .put("account", m.account).put("date", m.date).put("createdAt", m.createdAt)
  )

  fun enqueueTask(context: Context, t: PendingTask) = append(
    context, Q_NEW_TASKS,
    JSONObject().put("id", t.id).put("title", t.title).put("category", t.category).put("createdAt", t.createdAt)
      .put("description", t.description).put("subjectId", t.subjectId).put("dueTime", t.dueTime)
      .put("alarmEnabled", t.alarmEnabled).put("reminderEnabled", t.reminderEnabled).put("notify", t.notify)
      .also { o -> if (t.due != null) o.put("dueDate", t.due) }
  )

  fun pendingReminderCount(context: Context): Int = readArray(context, Q_REMINDERS).length()

  fun enqueueReminder(context: Context, reminder: JSONObject) = append(context, Q_REMINDERS, reminder)

  fun enqueueClassSuspend(context: Context, entryId: String, date: String, subjectId: String) = append(
    context, Q_CLASS_SUSPENDS,
    JSONObject().put("id", UUID.randomUUID().toString()).put("entryId", entryId).put("date", date).put("subjectId", subjectId).put("createdAt", System.currentTimeMillis())
  )

  fun enqueueTaskOp(context: Context, op: TaskOp) = append(
    context, Q_TASK_OPS,
    JSONObject().put("id", op.id).put("taskId", op.taskId).put("complete", op.complete).put("at", op.at)
      .also { o ->
        if (op.status != null) o.put("status", op.status)
        if (op.onlyIf != null) o.put("onlyIf", op.onlyIf)
      }
  )

  // An answer to a notification button the app has to act on (e.g. "Save to
  // savings"). `data` is the notification's own payload so the app can
  // handle it exactly as if the response listener had received it.
  fun enqueueNotifAction(context: Context, actionId: String, notifId: String, data: JSONObject) = append(
    context, Q_NOTIF,
    JSONObject().put("id", UUID.randomUUID().toString()).put("actionId", actionId).put("notifId", notifId)
      .put("data", data).put("at", System.currentTimeMillis()).put("date", today())
  )

  fun pending(context: Context): List<PendingExpense> {
    val out = mutableListOf<PendingExpense>()
    val arr = readArray(context, Q_EXPENSES)
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optString("id", "").isEmpty()) continue
      out.add(
        PendingExpense(
          o.getString("id"), o.optDouble("amount", 0.0), o.optString("name", ""), o.optString("label", ""),
          o.optString("splitId", ""), o.optString("account", ""), o.optString("date", today()),
          o.optLong("createdAt", System.currentTimeMillis())
        )
      )
    }
    return out
  }

  fun pendingMoney(context: Context): List<PendingMoney> {
    val out = mutableListOf<PendingMoney>()
    val arr = readArray(context, Q_MONEY)
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optString("id", "").isEmpty()) continue
      out.add(
        PendingMoney(
          o.getString("id"), o.optDouble("amount", 0.0), o.optString("note", ""), o.optString("category", ""),
          o.optString("account", ""), o.optString("date", today()), o.optLong("createdAt", System.currentTimeMillis())
        )
      )
    }
    return out
  }

  fun pendingTasks(context: Context): List<PendingTask> {
    val out = mutableListOf<PendingTask>()
    val arr = readArray(context, Q_NEW_TASKS)
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optString("id", "").isEmpty() || o.optString("title", "").isBlank()) continue
      out.add(
        PendingTask(
          o.getString("id"), o.getString("title"), o.optString("category", "other"),
          if (o.has("dueDate")) o.optString("dueDate").ifEmpty { null } else null,
          o.optLong("createdAt", 0L),
          o.optString("description", ""), o.optString("subjectId", "").ifEmpty { null },
          o.optString("dueTime", "").ifEmpty { null }, o.optBoolean("alarmEnabled", false),
          o.optBoolean("reminderEnabled", true), o.optJSONObject("notify") ?: JSONObject().put("type", "daily").put("time", "08:00")
        )
      )
    }
    return out
  }

  fun pendingClassSuspends(context: Context): List<Pair<String, String>> {
    val out = mutableListOf<Pair<String, String>>()
    val arr = readArray(context, Q_CLASS_SUSPENDS)
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      val id = o.optString("id", "")
      val entryId = o.optString("entryId", "")
      val date = o.optString("date", "")
      if (id.isNotEmpty() && entryId.isNotEmpty() && date.isNotEmpty()) out.add(id to "$date|$entryId")
    }
    return out
  }

  fun taskOps(context: Context): List<TaskOp> {
    val out = mutableListOf<TaskOp>()
    val arr = readArray(context, Q_TASK_OPS)
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (o.optString("id", "").isEmpty() || o.optString("taskId", "").isEmpty()) continue
      out.add(
        TaskOp(
          o.getString("id"), o.getString("taskId"),
          if (o.has("status")) o.optString("status") else null,
          if (o.has("onlyIf")) o.optString("onlyIf") else null,
          o.optBoolean("complete", false), o.optLong("at", 0L)
        )
      )
    }
    return out
  }

  // --- derived views the widgets display ---

  // Today's spending as the widget should show it right now: the app's last
  // pushed figure (only if it is for today -- after midnight it is stale and
  // counts as zero) plus anything still waiting in the queue.
  fun todayTotals(context: Context): Pair<Double, Int> {
    val summary = readSummary(context)
    val today = today()
    var total = if (summary.date == today) summary.todaySpent else 0.0
    var count = if (summary.date == today) summary.todayCount else 0
    for (p in pending(context)) {
      if (p.date == today && p.id !in summary.appliedWidgetIds) {
        total += p.amount
        count += 1
      }
    }
    return Pair(total, count)
  }

  // What's left in an account right now: the app's last pushed balance, less
  // expenses and plus money added from the widget since. Null when the
  // account isn't known (the app hasn't synced yet), in which case nothing
  // can be enforced.
  fun availableBalance(context: Context, accountId: String): Double? {
    val summary = readSummary(context)
    val account = summary.accounts.firstOrNull { it.id == accountId } ?: return null
    val base = account.balance ?: return null
    val spent = pending(context).filter { it.account == accountId && it.id !in summary.appliedWidgetIds }.sumOf { it.amount }
    val added = pendingMoney(context).filter { it.account == accountId && it.id !in summary.appliedWidgetIds }.sumOf { it.amount }
    return base + added - spent
  }

  // Past expenses for search: what the app pushed plus anything just logged
  // from the widget (skipping ones the app already absorbed), newest first.
  fun searchableExpenses(context: Context): List<RecentExpense> {
    val summary = readSummary(context)
    val known = summary.recent.map { it.id }.toSet()
    val fresh = pending(context).filter { it.id !in known }
      .sortedByDescending { it.createdAt }
      .map { RecentExpense(it.id, it.name, it.label, it.amount, it.date, it.account) }
    return (fresh + summary.recent).sortedByDescending { it.date }
  }

  // The open tasks as the widget should show them now: the app's last
  // snapshot with queued actions applied on top (so a tap shows instantly
  // and survives a refresh before the app has caught up). Same ordering as
  // the app's Active list: soonest due first, undated last.
  fun displayTasks(context: Context): List<WidgetTask> {
    val tasks = readSummary(context).tasks.toMutableList()
    // Tasks just added from the widget, until the app has created them (and
    // pushed a snapshot that includes them).
    val known = tasks.map { it.id }.toSet()
    for (n in pendingTasks(context).sortedBy { it.createdAt }) {
      if (n.id !in known) tasks.add(WidgetTask(n.id, n.title, TaskStatus.NOT_STARTED, n.due, n.category, TaskMeta.categoryLabel(n.category), readSummary(context).subjects.firstOrNull { it.id == n.subjectId }?.label.orEmpty()))
    }
    for (op in taskOps(context).sortedBy { it.at }) {
      val i = tasks.indexOfFirst { it.id == op.taskId }
      if (i < 0) continue
      if (op.complete) {
        tasks.removeAt(i)
      } else if (TaskStatus.isValid(op.status) && (op.onlyIf == null || op.onlyIf == tasks[i].status)) {
        tasks[i] = tasks[i].copy(status = op.status!!)
      }
    }
    return tasks.sortedBy { it.due ?: "9999" }
  }

  // The Upcoming events widget's window: today and the next six days, so on a
  // Monday it covers Monday to Sunday and on Tuesday, Tuesday to Monday. The
  // app pushes a month ahead; the window is applied here, at draw time, so it
  // moves on by itself at midnight even if the app isn't opened.
  fun upcomingRange(): Pair<String, String> {
    val start = today()
    return Pair(start, CalendarMath.addDays(start, 6))
  }

  fun upcomingWindow(context: Context): List<WidgetEvent> {
    val (start, end) = upcomingRange()
    return readSummary(context).upcoming.filter { it.date >= start && it.date <= end }
  }

  // The budget widget has its own privacy override; app hide-money is always respected.
  fun budgetHidden(context: Context): Boolean = prefs(context).getBoolean(KEY_BUDGET_HIDDEN, readSummary(context).hidden)
  fun toggleBudgetHidden(context: Context) {
    prefs(context).edit().putBoolean(KEY_BUDGET_HIDDEN, !budgetHidden(context)).apply()
  }

  // --- calendar month browsing ---

  fun calendarOffset(context: Context): Int = prefs(context).getInt(KEY_CAL_OFFSET, 0)
  fun setCalendarOffset(context: Context, offset: Int) {
    prefs(context).edit().putInt(KEY_CAL_OFFSET, offset).apply()
  }

  // --- remembered defaults, so the common case is "type amount, Save" ---

  fun lastSplit(context: Context): String? = prefs(context).getString(KEY_LAST_SPLIT, null)
  fun lastAccount(context: Context): String? = prefs(context).getString(KEY_LAST_ACCOUNT, null)
  fun lastIncome(context: Context): String? = prefs(context).getString(KEY_LAST_INCOME, null)

  fun saveLastChoice(context: Context, splitId: String?, account: String?) {
    prefs(context).edit().putString(KEY_LAST_SPLIT, splitId).putString(KEY_LAST_ACCOUNT, account).apply()
  }

  fun lastTaskCategory(context: Context): String? = prefs(context).getString(KEY_LAST_TASK_CATEGORY, null)
  fun saveLastTaskCategory(context: Context, category: String?) {
    prefs(context).edit().putString(KEY_LAST_TASK_CATEGORY, category).apply()
  }

  fun saveLastIncome(context: Context, category: String?, account: String?) {
    prefs(context).edit().putString(KEY_LAST_INCOME, category).putString(KEY_LAST_ACCOUNT, account).apply()
  }
}

// The vector icon (SVG-style drawable) and a short name for a spending label,
// for the widget chips. Custom labels the person typed in LAYP get a neutral
// tag icon.
object LabelStyle {
  fun icon(label: String): Int {
    val l = label.lowercase(Locale.US)
    return when {
      l.contains("food") || l.contains("meal") || l.contains("eat") || l.contains("grocer") -> R.drawable.layp_ic_food
      l.contains("transport") || l.contains("commute") || l.contains("fare") || l.contains("gas") || l.contains("fuel") -> R.drawable.layp_ic_transport
      l.contains("school") || l.contains("tuition") || l.contains("print") || l.contains("project") -> R.drawable.layp_ic_school
      l.contains("bill") || l.contains("load") || l.contains("subscri") || l.contains("util") -> R.drawable.layp_ic_bills
      l.contains("shop") -> R.drawable.layp_ic_shopping
      l.contains("entertain") || l.contains("movie") || l.contains("game") -> R.drawable.layp_ic_fun
      l.contains("health") || l.contains("med") || l.contains("pharma") -> R.drawable.layp_ic_health
      l.contains("other") -> R.drawable.layp_ic_other
      else -> R.drawable.layp_ic_tag
    }
  }

  // Shorter names for the longest built-in labels so they stay readable in a
  // narrow chip (the chip also auto-sizes its text as a last resort).
  fun shortName(label: String): String = when {
    label.equals("Transportation", ignoreCase = true) -> "Transport"
    label.equals("Entertainment", ignoreCase = true) -> "Fun"
    else -> label
  }
}
