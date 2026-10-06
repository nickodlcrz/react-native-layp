package expo.modules.laypwidget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent

// One place to say "the data changed, redraw every widget".
object WidgetRefresh {
  fun all(context: Context) {
    SpendWidgetProvider.refreshAll(context)
    TaskWidgetProvider.refreshAll(context)
    CalendarWidgetProvider.refreshAll(context)
    UpcomingWidgetProvider.refreshAll(context)
    ClassWidgetProvider.refreshAll(context)
  }

  fun installedCount(context: Context): Int =
    SpendWidgetProvider.installedCount(context) +
      TaskWidgetProvider.installedCount(context) +
      CalendarWidgetProvider.installedCount(context) +
      UpcomingWidgetProvider.installedCount(context) +
      ClassWidgetProvider.installedCount(context)
}

object WidgetIntents {
  // Opens LAYP itself.
  fun openApp(context: Context, requestCode: Int): PendingIntent? {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return null
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    return PendingIntent.getActivity(context, requestCode, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  }

  // The "template" for list/stack items: each item adds its own extras with
  // setOnClickFillInIntent, which is why this one must be mutable on Android
  // 12+. It targets WidgetActionActivity, an invisible trampoline.
  fun itemTemplate(context: Context, requestCode: Int): PendingIntent {
    val intent = Intent(context, WidgetActionActivity::class.java).apply {
      action = WidgetActionActivity.ACTION
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    return PendingIntent.getActivity(context, requestCode, intent, flags)
  }
}
