package expo.modules.laypalarm

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import android.view.View
import android.view.animation.OvershootInterpolator

// A drag-to-confirm control, alarm-clock style -- the native counterpart
// of src/components/SlideToConfirm.js, so the ring screen that appears
// when the app is backgrounded/killed matches the in-app popup instead of
// falling back to a plain "Dismiss" button. The thumb has to travel most
// of the way across before it counts (a stray tap or nudge won't dismiss
// a real alarm); letting go early always snaps back to the start.
class SlideToConfirmView(context: Context) : View(context) {
  var accentColor: Int = Color.parseColor("#D9A441")
  var trackColor: Int = Color.parseColor("#22FFFFFF")
  var labelColor: Int = Color.WHITE
  var label: String = "Slide to confirm"
  var onConfirm: (() -> Unit)? = null

  private val density = context.resources.displayMetrics.density
  private fun dp(v: Float) = v * density

  private val thumbRadius = dp(28f)
  private val trackPadding = dp(4f)
  private var thumbX = trackPadding
  private var confirmed = false
  private var dragStartRawX = 0f
  private var dragStartThumbX = 0f
  private var dragging = false

  private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val thumbPaint = Paint(Paint.ANTI_ALIAS_FLAG)
  private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
    textAlign = Paint.Align.CENTER
    isFakeBoldText = true
    textSize = dp(14f)
  }
  private val chevronPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = dp(2.5f); strokeCap = Paint.Cap.ROUND }

  private fun maxDrag(): Float = (width - thumbRadius * 2 - trackPadding * 2).coerceAtLeast(0f)

  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (confirmed) return true
    when (event.action) {
      MotionEvent.ACTION_DOWN -> {
        dragging = true
        dragStartRawX = event.rawX
        dragStartThumbX = thumbX
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (!dragging) return true
        val dx = event.rawX - dragStartRawX
        thumbX = (dragStartThumbX + dx).coerceIn(trackPadding, trackPadding + maxDrag())
        invalidate()
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        dragging = false
        val progress = if (maxDrag() > 0) (thumbX - trackPadding) / maxDrag() else 0f
        if (progress >= 0.88f) {
          confirmed = true
          animateTo(trackPadding + maxDrag()) { onConfirm?.invoke() }
        } else {
          animateTo(trackPadding, null)
        }
        return true
      }
    }
    return super.onTouchEvent(event)
  }

  private fun animateTo(target: Float, onEnd: (() -> Unit)?) {
    ValueAnimator.ofFloat(thumbX, target).apply {
      duration = 180
      interpolator = OvershootInterpolator(0.6f)
      addUpdateListener {
        thumbX = it.animatedValue as Float
        invalidate()
      }
      if (onEnd != null) {
        addListener(object : android.animation.AnimatorListenerAdapter() {
          override fun onAnimationEnd(animation: android.animation.Animator) {
            onEnd()
          }
        })
      }
      start()
    }
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val h = height.toFloat()
    val w = width.toFloat()
    val r = h / 2f

    trackPaint.color = trackColor
    canvas.drawRoundRect(RectF(0f, 0f, w, h), r, r, trackPaint)

    val fillRight = (thumbX + thumbRadius * 2).coerceAtMost(w)
    fillPaint.color = accentColor
    fillPaint.alpha = 70
    canvas.drawRoundRect(RectF(0f, 0f, fillRight, h), r, r, fillPaint)

    labelPaint.color = labelColor
    val labelY = h / 2f - (labelPaint.descent() + labelPaint.ascent()) / 2f
    canvas.drawText(label, w / 2f, labelY, labelPaint)

    thumbPaint.color = accentColor
    val cx = thumbX + thumbRadius
    val cy = h / 2f
    canvas.drawCircle(cx, cy, thumbRadius, thumbPaint)

    // Simple double-chevron ">>" glyph drawn as two short strokes, instead
    // of pulling in an icon font just for this one glyph.
    chevronPaint.color = Color.WHITE
    val cs = thumbRadius * 0.32f
    for (offset in floatArrayOf(-cs * 0.9f, cs * 0.9f)) {
      val path = Path()
      path.moveTo(cx + offset - cs * 0.5f, cy - cs)
      path.lineTo(cx + offset + cs * 0.5f, cy)
      path.lineTo(cx + offset - cs * 0.5f, cy + cs)
      canvas.drawPath(path, chevronPaint)
    }
  }

  init {
    setWillNotDraw(false)
  }
}
