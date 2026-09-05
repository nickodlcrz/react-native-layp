package expo.modules.laypalarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// One row per scheduled *occurrence*. A weekly class alarm meeting on
// Mon/Wed/Fri produces three of these (same groupId, one per weekday) so
// each day can be independently re-armed or cancelled; a one-shot task
// alarm produces exactly one (dayOfWeek = 0).
data class StoredAlarm(
  val key: String,          // unique per occurrence, e.g. "class:<subjectId>:<entryId>#3" or "task:<todoId>#once"
  val groupId: String,      // the id the JS side passed to scheduleAlarm -- cancelAlarm(groupId) removes every occurrence sharing it
  val requestCode: Int,     // stable AlarmManager/PendingIntent request code derived from `key`
  val title: String,
  val body: String,
  // heading/subheading/details drive the ring screen's rich layout (see
  // AlarmActivity): heading is the big line (a subject code, or a task's
  // title), subheading is the secondary line (e.g. a class description),
  // and details is a short list of extra rows (schedule time, room,
  // instructor, due date, notes, ...) the JS side has already formatted --
  // Kotlin just lays them out, it doesn't know what they mean.
  val heading: String,
  val subheading: String,
  val details: List<String>,
  val hour: Int,
  val minute: Int,
  val dayOfWeek: Int,       // java.util.Calendar.DAY_OF_WEEK (1=Sun...7=Sat), or 0 for a one-shot alarm
  val repeatWeekly: Boolean,
  val oneShotDate: String?, // "YYYY-MM-DD", only used when dayOfWeek == 0
  val kind: String
)

object AlarmStore {
  private const val PREFS = "layp_alarm_store"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_SKIPS = "skip_today"

  fun all(context: Context): MutableMap<String, StoredAlarm> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_ALARMS, null) ?: return mutableMapOf()
    val map = mutableMapOf<String, StoredAlarm>()
    val arr = JSONArray(raw)
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      val details = mutableListOf<String>()
      o.optJSONArray("details")?.let { da ->
        for (j in 0 until da.length()) details.add(da.getString(j))
      }
      val alarm = StoredAlarm(
        key = o.getString("key"),
        groupId = o.getString("groupId"),
        requestCode = o.getInt("requestCode"),
        title = o.getString("title"),
        body = o.optString("body", ""),
        heading = o.optString("heading", o.getString("title")),
        subheading = o.optString("subheading", ""),
        details = details,
        hour = o.getInt("hour"),
        minute = o.getInt("minute"),
        dayOfWeek = o.optInt("dayOfWeek", 0),
        repeatWeekly = o.optBoolean("repeatWeekly", false),
        oneShotDate = if (o.isNull("oneShotDate")) null else o.optString("oneShotDate", null),
        kind = o.optString("kind", "task")
      )
      map[alarm.key] = alarm
    }
    return map
  }

  private fun save(context: Context, map: Map<String, StoredAlarm>) {
    val arr = JSONArray()
    for (alarm in map.values) {
      val o = JSONObject()
      o.put("key", alarm.key)
      o.put("groupId", alarm.groupId)
      o.put("requestCode", alarm.requestCode)
      o.put("title", alarm.title)
      o.put("body", alarm.body)
      o.put("heading", alarm.heading)
      o.put("subheading", alarm.subheading)
      o.put("details", JSONArray(alarm.details))
      o.put("hour", alarm.hour)
      o.put("minute", alarm.minute)
      o.put("dayOfWeek", alarm.dayOfWeek)
      o.put("repeatWeekly", alarm.repeatWeekly)
      o.put("oneShotDate", alarm.oneShotDate)
      o.put("kind", alarm.kind)
      arr.put(o)
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putString(KEY_ALARMS, arr.toString()).apply()
  }

  fun put(context: Context, alarm: StoredAlarm) {
    val map = all(context)
    map[alarm.key] = alarm
    save(context, map)
  }

  fun remove(context: Context, key: String) {
    val map = all(context)
    if (map.remove(key) != null) save(context, map)
  }

  // Removes and returns every occurrence sharing a groupId -- the shape
  // "cancel/update this whole alarm" needs from the JS side.
  fun removeGroup(context: Context, groupId: String): List<StoredAlarm> {
    val map = all(context)
    val removed = map.values.filter { it.groupId == groupId }
    if (removed.isNotEmpty()) {
      removed.forEach { map.remove(it.key) }
      save(context, map)
    }
    return removed
  }

  fun get(context: Context, key: String): StoredAlarm? = all(context)[key]

  // Deterministic so the same logical occurrence always maps back to the
  // same PendingIntent/request code across app restarts.
  fun requestCodeFor(key: String): Int = key.hashCode()

  // --- Skip-today (class suspended/cancelled) ---
  //
  // Keyed by groupId (not by occurrence key) so it survives whichever of
  // the group's per-weekday occurrences happens to fire next, and is a
  // one-shot flag: consuming it (checking whether it applies to *today*)
  // clears it immediately, so the class alarms normally again the
  // following week without anyone having to remember to turn it back on.
  private fun skipMap(context: Context): MutableMap<String, String> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_SKIPS, null) ?: return mutableMapOf()
    val map = mutableMapOf<String, String>()
    val obj = JSONObject(raw)
    obj.keys().forEach { k -> map[k] = obj.getString(k) }
    return map
  }

  private fun saveSkipMap(context: Context, map: Map<String, String>) {
    val obj = JSONObject()
    map.forEach { (k, v) -> obj.put(k, v) }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit().putString(KEY_SKIPS, obj.toString()).apply()
  }

  fun setSkipToday(context: Context, groupId: String, dateIso: String) {
    val map = skipMap(context)
    map[groupId] = dateIso
    saveSkipMap(context, map)
  }

  // Returns true (and clears the flag) if this groupId was marked
  // suspended for exactly `dateIso` -- called right as an occurrence is
  // about to ring so a suspend requested earlier today (from the in-app
  // advance popup, say) is honored even though the underlying
  // AlarmManager entry was never cancelled.
  fun consumeSkipIfToday(context: Context, groupId: String, dateIso: String): Boolean {
    val map = skipMap(context)
    val skipDate = map[groupId] ?: return false
    if (skipDate != dateIso) return false
    map.remove(groupId)
    saveSkipMap(context, map)
    return true
  }
}
