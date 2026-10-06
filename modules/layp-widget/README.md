# layp-widget (Android widgets + quiet notification buttons)

Native Kotlin for everything LAYP does outside the app's own screens.

| Widget / feature | What it does |
| --- | --- |
| **Spending** (4x2) | Today's total and your most-used labels as compact quick-log chips with vector icons. Buttons: **+** log an expense, **money** receive/add money, **search** past expenses. |
| **Account budget** (4x2) | Every account’s available balance in a scrollable two-column grid. Hide/Show masks amounts; an app privacy change resets the widget override. |
| **Add reminder** (2x2) | Opens the General / Remember editor with text, tags, note-only/notification/popup/both delivery, dated or daily schedules, daily stop date, and interval/custom-hour schedules. |
| **Tasks** (4x4 and 4x6) | Your open tasks, soonest due first, each with its category and subject code. The **+** opens a task sheet with description, linked subject code, date/time, reminder type/time/days/interval/custom times, and deadline alarm. Both sizes scroll through all open tasks. Tap a task's **circle** to move it to its next status (Not starting yet, Work in progress, To pass, then completed). The circle is a clean static ring and each task has the app's blinking urgency dot: fast red, medium yellow, slow green. |
| **Calendar** (4x2) | The month, maximized, with a small vector mark on each day that has something coming up (heart = dates/anniversaries/monthsaries, pencil = school work, coin = payments and loans, check = other tasks, bell = reminders), and today as a big date on a navy panel. Arrows browse months; the title returns to today. |
| **Upcoming events** (2x2 and 4x2) | A scrollable list of the next 7 days, today included (Monday shows Monday to Sunday, Tuesday shows Tuesday to Monday), sliding forward at midnight. |
| **Quiet notification buttons** | "Yes, started" / "Not yet" / "Yes, passed" / "Save to savings" / "Keep for tomorrow" no longer open the app. |

What the Calendar and Upcoming widgets show is chosen in the app's **gear >
Widgets** tab (per widget: school tasks, other tasks, payments, loans,
reminders, dates, anniversaries, monthsaries). The app filters the events it
pushes, so the widgets stay dumb.

All of it follows LAYP's own light/dark setting (not only the phone's) and
LAYP's hide-money switch.

## Look and feel

Everything is built from the app's own navy accent (`#17203A`, and its
dark-mode blue) on the app's light/dark surfaces:

- **Spending**: a navy gradient hero card with white text, a big amount with
  the peso sign and cents set smaller, translucent round buttons, and compact
  30dp chips (icon + label) that no longer stretch to fill spare height.
- **Tasks**: a surface card with a navy gradient header band (title, open
  count, a "n due soon" pill, the + button) over task cards that each have a
  colored edge (urgency, else status color), a small status ring, title, category
  and subject code, status and due text.
- **Calendar**: the month on a surface card (today in an accent pill) beside a
  navy panel with today's big date.
- **Upcoming**: a compact navy header (title and the 7-day range) over rows
  with a date badge, the event's icon in its type color, the full title, and
  its type and how soon it is.
- **Icons** are vector drawables (SVG-style paths, tinted at runtime), not
  emoji, so they match the theme and render the same on every phone.
- **No "..." anywhere**: single-line text that must fit (amount, chip labels,
  headers) auto-sizes down (`autoSizeTextType`, Android 8+); text that can wrap
  (task titles, event titles) wraps in full.

### Animation in a widget

A widget can't run arbitrary animation code, so the only motion used here is the
urgency dot: a `ViewFlipper` cross-fades between a bright and a dim copy of the
dot (one flipper per speed, 280 / 700 / 1500 ms; only the matching one is
visible). The task status ring is intentionally static and simply changes color
when the task advances to its next status.

### RemoteViews rules (why a widget can say "Can't load widget")

Widget layouts are inflated by the launcher, which only allows a short list of
view classes: `FrameLayout`, `LinearLayout`, `RelativeLayout`, `GridLayout`,
`TextView`, `Button`, `ImageView`, `ImageButton`, `ProgressBar`, `ListView`,
`GridView`, `StackView`, `ViewFlipper`, `AdapterViewFlipper`, `ViewStub` and a
few more. A plain `<View>` (e.g. a divider) or `EditText` makes the whole
widget fail to load. Dividers and bars here are `ImageView`s or backgrounds.
Setters must also match the view (`setTextColor` only on TextViews,
`setColorFilter` only on ImageViews) and target ids that exist in the layout
being inflated; the Kotlin sources were cross-checked for all of this.

## How it fits together

The widgets run while the app doesn't, and the app is React Native, so they
never share a database. They meet in a small SharedPreferences store
(`WidgetStore.kt`):

```
 app (JS)                                   native (Kotlin)
 --------                                   ---------------
 buildWidgetSummary()  --pushSummary-->     summary: today's spend, balances, categories,
                                            accounts, recent expenses, open tasks, events,
                                            theme
 syncWidgetItems()     <--getPending----    durable queues, each entry with its own id:
                       --ackPending--->      expenses, money, taskOps, notifActions, newTasks, classSuspends, newReminders
```

- **Spending dialog** (`QuickLogActivity`, two modes) and **search**
  (`SearchActivity`) are plain-Activity bottom sheets over the home screen.
- **Spending never goes past an account's balance.** The dialog disables Save
  and flags the amount while it's more than what's left (it counts what was
  already logged from the widget). When LAYP absorbs the queue it re-checks
  against the real balance; anything that doesn't fit is dropped and an alert
  says which. Money added from the widget counts toward the balance first.
- **Tasks added from the widget** are queued with their own id, shown on the
  widget immediately, and created by LAYP on its next run with the same
  defaults and reminder scheduling as the in-app form (`pendingToTodos`).
- **Task taps** are queued as absolute operations (set this status / complete
  this task) and shown on the widget immediately. LAYP applies them on its next
  run, and finishing a task also cancels its reminders and alarm.
- **Notification buttons** are caught by `LaypNotificationsService`, which
  extends expo-notifications' `NotificationsService`. expo sends every
  notification event to the highest-priority receiver registered for its event
  action, so the manifest registers this one at priority 100 (expo's own is
  -1). It saves the answer in the durable queue, dismisses the notification and
  forwards everything else (class alarm buttons, plain taps) to expo
  untouched. Without it, a tap on a no-foreground button while the app is
  closed would be kept only in memory and lost. Verified against
  expo-notifications 0.28.19; if you upgrade Expo, re-check that
  `NotificationsService.onReceiveNotificationResponse` and
  `findDesignatedBroadcastReceiver` still behave the same.
- **Safety net:** the app reads a queue, saves, and only then acknowledges it
  (after an explicit successful storage flush). Every entry has
  its own id, so if the app is killed in between, the next sync skips what was
  already saved instead of duplicating it.

## Files

| Kotlin | Job |
| --- | --- |
| `WidgetStore.kt` | summary + queues, balance availability, task list with queued taps applied |
| `Palette.kt` | light/dark colors, task status steps, urgency tiers, event colors |
| `CalendarMath.kt` | month grid and date arithmetic (pure, no Android classes) |
| `SpendWidgetProvider.kt`, `TaskWidgets.kt`, `CalendarWidget.kt`, `UpcomingWidgets.kt` | the widgets |
| `QuickLogActivity.kt`, `SearchActivity.kt`, `AddTaskActivity.kt` | bottom sheets |
| `WidgetActionActivity.kt` | invisible trampoline for list/stack taps |
| `LaypNotificationsService.kt` | quiet notification buttons |
| `LaypWidgetModule.kt`, `index.js` | the JS bridge |

JS: `src/widgetSummary.js`, `src/widgetEvents.js`, `src/gfDates.js` (all pure
and unit tested), plus the sync block in `App.js`.

## Building it

Like `layp-alarm`, this is a local native module, so it only exists in a build
made after it was added. It also depends on `expo-notifications` (already in
the app).

```
npm install
npx expo prebuild --platform android --clean   # or: eas build -p android
```

Expo Go and old dev-client builds don't have it: the app behaves exactly as
before there (notification buttons then reach the app's own listener, without
bringing it to the foreground).

Add a widget: long-press the home screen, **Widgets**, then **LAYP Spending**,
**LAYP Tasks (4x4 / 4x6)**, **LAYP Calendar**, **LAYP Upcoming (2x2 / 4x2)**, **LAYP Account Budget (4x2)**, or **LAYP Add Reminder (2x2)**. Settings > Widgets also offers launcher pin requests.

## Limits worth knowing

- Android only (iOS would need a separate WidgetKit extension).
- A launcher refreshes widgets on its own at most every 30 minutes; LAYP pushes
  fresh data within about half a second of any change, and acting on a widget
  updates it instantly. Midnight rolls everything over.
- Answers given on a notification while the app is closed are applied the next
  time LAYP runs (the widgets show task changes right away).
- Class alarm buttons still open the app on purpose: they act on a ringing
  alarm right now.
- Expenses logged from the widget skip the in-app "80% of this category"
  notification, which only runs when logging inside the app.
- Calendar markers cover the next 120 days; the Recent list for search is the
  last ~300 expenses.
- GF dates appear on the Calendar and Upcoming widgets by the label you typed,
  so they show on the home screen. Switch Dates / Anniversaries / Monthsaries
  off in gear > Widgets to keep them off.


## Capture and cancellation behavior

- Class cancellation is queued natively and read by the JavaScript bridge’s `classSuspends` field. It updates the shared `cancelledClasses` state used by Home and School on launch/foreground (or within two seconds while LAYP is active). The native ringing alarm is marked skipped immediately, even if the app is closed; the recurring schedule is preserved.
- New task and reminder drafts are durable and idempotent. Scheduling uses the same app notification/alarm functions as the in-app forms. **Open LAYP after capture to activate scheduled notifications and alarms.** The widget editors display this requirement; popup delivery always requires LAYP to run. Expo Go cannot display the native widgets.
- Calendar event days have a subtle highlighted background. Larger widgets show event icons; shorter placements prioritize readable date numbers. All surfaces remain dark and transparent.
- Budget calculations include pending widget income and expenses, without counting an absorbed transaction twice while acknowledgement is pending.
- Rebuild/install the Android app to register the two new providers and editors. JavaScript reload alone cannot update native widgets.
