package expo.modules.laypwidget

import android.content.Context
import android.util.TypedValue
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.RemoteViews
import android.widget.TextView
import java.util.concurrent.ConcurrentHashMap

/** RemoteViews-safe font sizes and rounded transparent backgrounds. */
object WidgetAppearance {
  private val sizes = ConcurrentHashMap<Int, List<Pair<Int, Float>>>()
  fun apply(context: Context, views: RemoteViews, layout: Int, root: Int? = null) {
    val summary = WidgetStore.readSummary(context)
    val defaults = sizes.getOrPut(layout) {
      val text = mutableListOf<Pair<Int, Float>>()
      fun visit(view: View) {
        if (view is TextView && view.id != View.NO_ID) text.add(view.id to view.textSize / context.resources.displayMetrics.scaledDensity)
        if (view is ViewGroup) for (i in 0 until view.childCount) visit(view.getChildAt(i))
      }
      visit(LayoutInflater.from(context).cloneInContext(context).inflate(layout, null))
      text
    }
    defaults.forEach { (id, sp) -> views.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, sp * summary.fontScale) }
    if (root != null) views.setInt(root, "setBackgroundResource", when {
      summary.opacity < 0.5f -> R.drawable.layp_widget_glass_clear
      summary.opacity > 0.75f -> R.drawable.layp_widget_glass_readable
      else -> R.drawable.layp_widget_glass_dark
    })
  }
}
