# Smart notifications + Log Expense improvements

This is the full cumulative patch since the very first delivery (Recent
Activity / Borrow tabs / minimal interest) -- it supersedes both
`remember-gf-updates.zip` and `gf-updates-v2.zip`. Apply this one only.

## How to apply
- `git apply all-updates.patch` from a clean repo at your original state, OR
- copy every file in this zip into your repo, preserving folders,
  overwriting what's there.
- Delete `src/components/GfRemindPopup.js` if it's still sitting in your
  repo from an earlier delivery -- fully replaced by `RemindPopup.js`.

**One native config change:** `app.json` now sets
`android.softwareKeyboardLayoutMode: "resize"` (part of the keyboard fix
below). If you're using a custom dev client or EAS build rather than
Expo Go, you'll need to rebuild for this to take effect.

## What's new this round

### Todo tab
- **Smart reminders.** A task's daily/weekly/etc. reminder now asks the
  actual question that matters for its stage: while a task is
  "Not starting yet" and has a due date, the reminder asks *"...is due in
  N days. Have you started it?"* with **Yes** / **Not yet** right on the
  notification. Once a "To pass" task is actually overdue, it instead
  asks *"...was due N days ago. Have you passed it already?"* -- **Yes**
  marks it complete, **Not yet** just leaves it be (it'll ask again next
  occurrence). Everything else keeps the plain reminder as before.
- Because a repeating notification's text is fixed the moment it's
  scheduled, the wording is refreshed once per day (whenever the app is
  opened that day) so "due in 3 days" doesn't quietly go stale into "due
  in 3 days" forever -- see the comment on `rescheduleTodoNotifications`
  in `src/notifications.js` if you want the exact reasoning.
- **Glow/blink is much more visible now** -- it pulses the border width
  itself (not just the shadow), which also means it actually reads on
  Android now (Android ignores colored shadows on elevation, so the old
  version was close to invisible there).
- **Completion animation improved** -- checking off a task now gets a
  brief expanding "done" ring behind the checkmark on top of the existing
  bounce, and the row's fade-to-60%-opacity is now a smooth animated
  tween instead of an instant snap.

### Budget tab / Log Expense
- **Fixed: keyboard covering the amount field.** Root cause was
  `EditSheet` (the shared bottom-sheet component used by Log Expense,
  tasks, loans/bills, and Remember) doing nothing at all to avoid the
  keyboard on Android. Fixed there, which fixes every screen that uses
  it, not just this one.
- **Account balance display improved** -- "Paid from" chips are back to
  just the account name (no more `Account - ₱500` crammed into a chip);
  the balance now gets its own clear line.
- **Animated balance -> spend -> remaining bar**, live as you type the
  amount: `Maribank ₱500` with a full bar underneath, then, once you
  start typing an amount, "If you spend ₱200, your account balance will
  be ₱300" with a second bar that visibly shrinks to match, in real time.
- **"Log again" is a search bar now**, not a wall of chips. Closed, it's
  just a single search field; tap the chevron (or start typing) to open
  a scrollable dropdown. Typing searches your *entire* expense history,
  not just the last several -- so a once-off dropoff from months ago is
  still just as findable as "coffee" from yesterday.

## Honest caveats
Same as every round -- I can't run this on a device from here. Test
before trusting it, especially:
- the started/passed Yes/Not-yet buttons actually appearing on a real
  notification (both foreground and locked-screen) and doing the right
  thing on tap
- the keyboard fix on an actual Android device/build (this is the one
  most likely to need the native rebuild mentioned above)
- the balance bar's math when an account is at or near zero
