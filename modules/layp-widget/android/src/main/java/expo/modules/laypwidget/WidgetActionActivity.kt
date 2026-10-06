package expo.modules.laypwidget

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import java.util.UUID

// An invisible trampoline for taps on list/stack items (Tasks and Calendar
// widgets). Collection widgets can only attach one PendingIntent "template"
// to all their items, so this single no-UI activity receives every tap and
// decides what it means:
//   advance -> move a task to its next status (or complete it), no app launch
//   open    -> open LAYP
// It finishes before it ever draws anything.
class WidgetActionActivity : Activity() {

  companion object {
    const val ACTION = "expo.modules.laypwidget.WIDGET_ACTION"
    const val EXTRA_OP = "op"
    const val EXTRA_TASK_ID = "taskId"
    const val OP_ADVANCE = "advance"
    const val OP_OPEN = "open"
    const val OP_ADD_REMINDER = "addReminder"
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      when (intent.getStringExtra(EXTRA_OP)) {
        OP_ADD_REMINDER -> startActivity(Intent(this, AddReminderActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        OP_ADVANCE -> advanceTask(intent.getStringExtra(EXTRA_TASK_ID))
        else -> openApp()
      }
    } finally {
      finish()
    }
  }

  // Mirrors tapping a task's circle in the app: each tap steps the status
  // forward (Not starting yet -> Work in progress -> To pass), and the tap
  // after "To pass" completes the task. Queued for the app (which also
  // cancels the task's reminders when it completes) and shown on the widget
  // right away.
  private fun advanceTask(taskId: String?) {
    if (taskId == null) return
    val task = WidgetStore.displayTasks(this).firstOrNull { it.id == taskId }
    if (task == null) {
      WidgetRefresh.all(this)
      return
    }
    val next = TaskStatus.next(task.status)
    val now = System.currentTimeMillis()
    val op = if (next == null) {
      TaskOp(UUID.randomUUID().toString(), taskId, null, null, true, now)
    } else {
      TaskOp(UUID.randomUUID().toString(), taskId, next, null, false, now)
    }
    WidgetStore.enqueueTaskOp(this, op)
    WidgetRefresh.all(this)
    val message = if (next == null) "Completed: ${task.title}" else "${task.title}: ${TaskStatus.label(next)}"
    Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
  }

  private fun openApp() {
    packageManager.getLaunchIntentForPackage(packageName)?.let {
      it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
      startActivity(it)
    }
  }
}
