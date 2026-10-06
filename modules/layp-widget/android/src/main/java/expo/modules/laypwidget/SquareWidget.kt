package expo.modules.laypwidget

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.res.Configuration
import android.widget.RemoteViews

// The launcher controls the cell shape; inset the glass card to a square.
object SquareWidget {
  fun apply(context: Context, views: RemoteViews, widgetId: Int, frameId: Int) {
    val options = AppWidgetManager.getInstance(context).getAppWidgetOptions(widgetId)
    val landscape = context.resources.configuration.orientation == Configuration.ORIENTATION_LANDSCAPE
    val width = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH else AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)
    val height = options.getInt(if (landscape) AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT else AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, width)
    val density = context.resources.displayMetrics.density
    val x = ((width - height).coerceAtLeast(0) * density / 2).toInt()
    val y = ((height - width).coerceAtLeast(0) * density / 2).toInt()
    views.setViewPadding(frameId, x, y, x, y)
  }
}
