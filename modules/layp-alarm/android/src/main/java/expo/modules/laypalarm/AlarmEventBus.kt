package expo.modules.laypalarm

// LaypAlarmReceiver/AlarmActivity/AlarmSoundService can all run without
// LaypAlarmModule (or even the React Native instance) being alive -- a
// class alarm can fire while the app is fully killed. This is a tiny,
// process-local pub/sub so the module can still forward what happened to
// JS as an event whenever it *is* alive to hear about it.
object AlarmEventBus {
  interface Listener {
    fun onFired(alarm: StoredAlarm)
    fun onSnoozed(alarm: StoredAlarm, minutes: Int)
    fun onDismissed(alarm: StoredAlarm)
    fun onSuspended(alarm: StoredAlarm, dateIso: String)
  }

  private val listeners = mutableListOf<Listener>()

  @Synchronized
  fun addListener(listener: Listener) {
    listeners.add(listener)
  }

  @Synchronized
  fun removeListener(listener: Listener) {
    listeners.remove(listener)
  }

  @Synchronized
  fun notifyFired(alarm: StoredAlarm) {
    listeners.forEach { it.onFired(alarm) }
  }

  @Synchronized
  fun notifySnoozed(alarm: StoredAlarm, minutes: Int) {
    listeners.forEach { it.onSnoozed(alarm, minutes) }
  }

  @Synchronized
  fun notifyDismissed(alarm: StoredAlarm) {
    listeners.forEach { it.onDismissed(alarm) }
  }

  // Fired when the person marks "class suspended/cancelled today" right
  // from the native ring screen -- lets JS mirror the same
  // cancelledClasses bookkeeping it already does when suspending from the
  // in-app advance popup (see App.js#handleSuspendClass), so a home-screen
  // "cancelled" badge stays correct no matter which UI the suspend came
  // from.
  @Synchronized
  fun notifySuspended(alarm: StoredAlarm, dateIso: String) {
    listeners.forEach { it.onSuspended(alarm, dateIso) }
  }
}
