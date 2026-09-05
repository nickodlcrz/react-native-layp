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

  fun all(context: Context): MutableMap<String, StoredAlarm> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_ALARMS, null) ?: return mutableMapOf()
    val map = mutableMapOf<String, StoredAlarm>()
    val arr = JSONArray(raw)
    for (i in 0 until arr.length()) {
      val o = arr.getJSONObject(i)
      val alarm = StoredAlarm(
        key = o.getString("key"),
        groupId = o.getString("groupId"),
        requestCode = o.getInt("requestCode"),
        title = o.getString("title"),
        body = o.optString("body", ""),
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
}
