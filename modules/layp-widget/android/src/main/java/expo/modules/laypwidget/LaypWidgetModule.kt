package expo.modules.laypwidget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// The React Native <-> Kotlin bridge for LAYP's widgets. The app does two
// things here: push the data the widgets should show, and collect what
// happened while it was closed (expenses and money logged from the widget,
// task taps, answered notification buttons).
class LaypWidgetModule : Module() {

  private val context: Context
    get() = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("LaypWidget: no React context available")

  override fun definition() = ModuleDefinition {
    Name("LaypWidget")

    // json: the summary built by src/widgetSummary.js. Re-renders every
    // placed widget straight away.
    AsyncFunction("pushSummary") { json: String ->
      WidgetStore.writeSummary(context, json)
      WidgetRefresh.all(context)
    }

    // One JSON object: { expenses, money, taskOps, notifActions }, each an
    // array, oldest first. Read-only: nothing is removed until ackPending, so
    // a crash between "read" and "saved into LAYP" can never lose anything.
    AsyncFunction("getPending") {
      WidgetStore.pendingAllJson(context)
    }

    // Removes the given ids from every queue.
    AsyncFunction("ackPending") { ids: List<String> ->
      WidgetStore.ack(context, ids)
      WidgetRefresh.all(context)
    }

    AsyncFunction("getInstalledCount") {
      WidgetRefresh.installedCount(context)
    }

    // Asks the launcher to offer pinning a widget (Android 8+ and only on
    // launchers that support it). kind: "spend" | "tasks4x4" | "tasks4x6" |
    // "calendar" | "upcoming2x2" | "upcoming4x2". Returns whether the request
    // was sent.
    AsyncFunction("requestPinWidget") { kind: String ->
      val manager = AppWidgetManager.getInstance(context)
      val target = when (kind) {
        "tasks4x4" -> TaskWidget4x4Provider::class.java
        "tasks4x6" -> TaskWidget4x6Provider::class.java
        "budget4x2" -> BudgetWidgetProvider::class.java
        "reminder2x2" -> ReminderWidgetProvider::class.java
        "calendar" -> CalendarWidgetProvider::class.java
        "upcoming2x2" -> UpcomingWidget2x2Provider::class.java
        "upcoming4x2" -> UpcomingWidget4x2Provider::class.java
        "classes2x2" -> ClassWidgetProvider::class.java
        else -> SpendWidgetProvider::class.java
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.isRequestPinAppWidgetSupported) {
        manager.requestPinAppWidget(ComponentName(context, target), null, null)
      } else {
        false
      }
    }
  }
}
