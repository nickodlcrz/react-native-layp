package expo.modules.laypwidget

import android.content.Context
import android.content.Intent
import expo.modules.notifications.service.NotificationsService
import org.json.JSONObject
import java.util.UUID

// Answers to some LAYP notifications are handled here, in native code,
// instead of by the app's JavaScript.
//
// Why: tapping a notification button normally opens the app so its JS can
// run the response. With the button set to *not* open the app, expo's own
// receiver only hands the response to JS if JS happens to be running; if the
// app was closed, it keeps the response in memory and loses it when the
// process dies. That would silently drop a "Yes, I started" tap.
//
// expo-notifications routes every notification event to the highest-priority
// receiver registered for its event action, and documents extending
// NotificationsService for exactly this. So this receiver (see the manifest)
// takes the buttons below, saves the answer in WidgetStore's durable queue,
// dismisses the notification and refreshes the widgets -- no app launch, no
// JS needed. LAYP applies the queue the next time it runs. Everything else
// (class alarms, tapping the notification itself, ...) falls through to
// expo's normal handling untouched.
//
// The action ids below must match the identifiers in src/notifications.js.
class LaypNotificationsService : NotificationsService() {

  companion object {
    const val TODO_STARTED_YES = "TODO_STARTED_YES"
    const val TODO_STARTED_NOT_YET = "TODO_STARTED_NOT_YET"
    const val TODO_PASSED_YES = "TODO_PASSED_YES"
    const val TODO_PASSED_NOT_YET = "TODO_PASSED_NOT_YET"
    const val DAILY_BUDGET_SAVE = "DAILY_BUDGET_SAVE"
    const val DAILY_BUDGET_KEEP = "DAILY_BUDGET_KEEP"
  }

  override fun onReceiveNotificationResponse(context: Context, intent: Intent) {
    val handled = try {
      handleQuietAction(context, intent)
    } catch (e: Exception) {
      false
    }
    if (!handled) super.onReceiveNotificationResponse(context, intent)
  }

  private fun handleQuietAction(context: Context, intent: Intent): Boolean {
    val response = getNotificationResponseFromBroadcastIntent(intent)
    val actionId = response.actionIdentifier
    val request = response.notification.notificationRequest
    val data: JSONObject = request.content.body ?: JSONObject()
    val now = System.currentTimeMillis()

    when (actionId) {
      // "Have you started?" -> Yes: Work in progress (only if still not started).
      TODO_STARTED_YES -> {
        val taskId = data.optString("todoId", "")
        if (taskId.isEmpty()) return false
        WidgetStore.enqueueTaskOp(context, TaskOp(UUID.randomUUID().toString(), taskId, TaskStatus.WIP, TaskStatus.NOT_STARTED, false, now))
      }
      // "Did you pass it?" -> Yes: the task is done.
      TODO_PASSED_YES -> {
        val taskId = data.optString("todoId", "")
        if (taskId.isEmpty()) return false
        WidgetStore.enqueueTaskOp(context, TaskOp(UUID.randomUUID().toString(), taskId, null, null, true, now))
      }
      // "Not yet": nothing changes, the notification just goes away.
      TODO_STARTED_NOT_YET, TODO_PASSED_NOT_YET -> Unit
      // Daily budget review: the app decides what to do with the leftover.
      DAILY_BUDGET_SAVE, DAILY_BUDGET_KEEP ->
        WidgetStore.enqueueNotifAction(context, actionId, request.identifier, data)
      else -> return false
    }

    NotificationsService.dismiss(context, arrayOf(request.identifier))
    WidgetRefresh.all(context)
    return true
  }
}
