package expo.modules.laypwidget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.widget.RemoteViews

/** 2x2 shortcut to the complete General / Remember editor. */
class ReminderWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) { refreshAll(context) }
  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) { refreshAll(context) }
  companion object {
    fun installedCount(context: Context) = AppWidgetManager.getInstance(context).getAppWidgetIds(ComponentName(context, ReminderWidgetProvider::class.java)).size
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      manager.getAppWidgetIds(ComponentName(context, ReminderWidgetProvider::class.java)).forEach { id ->
        val views = RemoteViews(context.packageName, R.layout.layp_widget_reminder)
        val count = WidgetStore.pendingReminderCount(context)
        views.setTextViewText(R.id.layp_reminder_hint, if (count > 0) "$count saved\nOpen LAYP to activate" else "Capture a thought\nChoose when to remember")
        views.setOnClickPendingIntent(R.id.layp_reminder_add, PendingIntent.getActivity(context, 9600 + id, Intent(context, AddReminderActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
        WidgetIntents.openApp(context, 9700 + id)?.let { views.setOnClickPendingIntent(R.id.layp_reminder_title, it) }
        manager.updateAppWidget(id, views)
      }
    }
  }
}
