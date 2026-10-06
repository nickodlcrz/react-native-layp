package expo.modules.laypwidget

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
        SquareWidget.apply(context, views, id, R.id.layp_reminder_square)
        val service = Intent(context, ReminderListService::class.java).apply {
          putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id)
          data = android.net.Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
        }
        views.setRemoteAdapter(R.id.layp_reminder_list, service)
        views.setPendingIntentTemplate(R.id.layp_reminder_list, WidgetIntents.itemTemplate(context, 9600 + id))
        manager.updateAppWidget(id, views)
        manager.notifyAppWidgetViewDataChanged(intArrayOf(id), R.id.layp_reminder_list)
      }
    }
  }
}

class ReminderListService : android.widget.RemoteViewsService() {
  override fun onGetViewFactory(intent: Intent): RemoteViewsFactory = ReminderListFactory(applicationContext)
}
class ReminderListFactory(private val context: Context) : android.widget.RemoteViewsService.RemoteViewsFactory {
  private var count = 0
  override fun onCreate() {}
  override fun onDataSetChanged() { count = WidgetStore.pendingReminderCount(context) }
  override fun onDestroy() {}
  override fun getCount() = 1
  override fun getViewAt(position: Int): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.layp_widget_reminder_row)
    v.setTextViewText(R.id.layp_reminder_hint, if (count > 0) "$count saved\nOpen LAYP to activate" else "Capture a thought\nChoose when to remember")
    v.setOnClickFillInIntent(R.id.layp_reminder_add, Intent().putExtra(WidgetActionActivity.EXTRA_OP, WidgetActionActivity.OP_ADD_REMINDER))
    v.setOnClickFillInIntent(R.id.layp_reminder_title, Intent().putExtra(WidgetActionActivity.EXTRA_OP, WidgetActionActivity.OP_OPEN))
    return v
  }
  override fun getLoadingView(): RemoteViews? = null
  override fun getViewTypeCount() = 1
  override fun getItemId(position: Int) = 0L
  override fun hasStableIds() = true
}
