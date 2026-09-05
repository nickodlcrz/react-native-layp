# layp-alarm (native Android alarm engine)

A local Expo module implementing the Kotlin alarm architecture: React
Native decides *what* to schedule (id, title, body, time, days), and
`LaypAlarm.scheduleAlarm()` hands that to a Kotlin `AlarmManager` engine
that does the actual ringing -- independent of whether LAYP's JS is
running.

```
React Native  ---->  LaypAlarm.scheduleAlarm()
                            |
                            v
                     AlarmScheduler (AlarmManager)
                            |
                            v
                     LaypAlarmReceiver (BroadcastReceiver)
                        /            \
                       v              v
              AlarmSoundService   AlarmActivity
              (tone + vibration)  (full-screen, lock-screen UI,
                                   Snooze / Dismiss)
```

`BootReceiver` re-arms everything after a reboot or app update, since
`AlarmManager` entries don't survive either.

## Android only

This module has no iOS implementation. `modules/layp-alarm/index.js`
handles that gracefully -- every export is a safe no-op when the native
module isn't linked (iOS, Expo Go, or an Android dev client built before
this module existed), so the rest of the app never needs its own
platform checks.

## Building it

Because this project is on the **managed Expo workflow** (no `android/`
folder checked into git), the native code here only gets compiled in when
you run a prebuild-based build:

```sh
npx expo prebuild --clean   # regenerates android/, pulling this module in
npx expo run:android        # or: eas build -p android --profile <profile>
```

Expo's autolinking picks up local modules under `./modules` automatically
-- no extra config needed in `app.json`/`package.json`.

If you're iterating on the Kotlin directly, open the generated `android/`
folder in Android Studio after `expo prebuild` so Gradle sync/edit/run
works normally; re-run `expo prebuild` (or `expo run:android`) after
editing anything under `modules/layp-alarm` from a dev client that
predates the change.

## Permissions this adds

Declared in `android/src/main/AndroidManifest.xml` and merged into the
app's manifest automatically at prebuild:

- `SCHEDULE_EXACT_ALARM` -- exact-time alarms (Android 12+ needs the
  person to also grant this in Settings; see `openExactAlarmSettings()`
  below, wired into the app as an "Alarm reliability" check per the
  original design doc).
- `RECEIVE_BOOT_COMPLETED` -- re-arm alarms after a reboot.
- `USE_FULL_SCREEN_INTENT`, `POST_NOTIFICATIONS` -- the lock-screen alarm
  UI and its backing notification.
- `WAKE_LOCK`, `VIBRATE`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK` -- the ringing foreground service.

## JS API (`modules/layp-alarm/index.js`)

- `isNativeAlarmAvailable()`
- `scheduleAlarm(config)` / `updateAlarm(config)` / `cancelAlarm(id)`
- `getAlarmStatus()` -- exact-alarm permission, notification permission,
  battery-optimization status, for a Settings-side reliability check.
- `openExactAlarmSettings()` / `openBatteryOptimizationSettings()`
- `addAlarmFiredListener(cb)` / `addAlarmSnoozedListener(cb)` /
  `addAlarmDismissedListener(cb)`

`config` shape:

```js
{
  id: "class:<subjectId>:<entryId>", // groups every occurrence; re-used to cancel/update
  title: "\ud83d\udd14 Class starting now",
  body: "ECE 101 \u2014 Engineering Class \u00b7 Room 204",
  hour: 7,
  minute: 30,
  days: [2, 4, 6],       // Expo weekday convention, 1=Sun...7=Sat. Omit for a one-shot alarm.
  date: "2026-09-10",    // one-shot alarms only: pin to a specific date instead of "next hour:minute"
  repeatWeekly: true,    // weekly alarms only, default true
  kind: "class",         // "class" | "task", informational
}
```

See `src/notifications.js` (`rescheduleSubjectNotifications` /
`cancelSubjectNotifications`) for how School's class alarms use this, and
`rescheduleTodoAlarm` / `cancelTodoAlarm` for how a Todo's optional task
alarm does.
