# Changelog

All notable changes to LAYP are documented here. Newest entries first.

## [Unreleased]

### Added — Upcoming events widget, gear settings, Google Drive + weekly backup; widget redesign
- **Upcoming events widget** (2x2 and 4x2): scrollable, only the next 7 days with today included (Mon shows Mon to Sun, Tue shows Tue to Mon), sliding forward at midnight; full titles, no "...".
- **Calendar widget**: the upcoming-events pane is gone; the month is maximized and each day with something coming up gets a vector mark (heart / pencil / coin / check / bell) next to its number, plus today's big date.
- **Spending widget**: SVG vector icons instead of emoji, compact fixed-height chips (no more stretching), and text that auto-sizes instead of being cut off ("Transp..."); short names for long labels.
- **Tasks widget**: shows each task's category and subject code; titles wrap instead of ending in "...".
- **Gear button** replaces the Summary and Sun/Moon header buttons. Settings has General (Light/Dark, lock screen timeout), Widgets (what the Calendar and Upcoming widgets show, per widget) and Summary (the improved summary with backup).
- **Backup**: connect a Google account (Drive `drive.file` scope, a "LAYP Backups" folder), automatic backup every 7 days (checked when LAYP opens) to the phone, optionally a folder you choose, and to Drive; Back up now; newest 8 kept. Needs a one-time Google Cloud client ID: see docs/GOOGLE_DRIVE_SETUP.md. New dependency `@react-native-google-signin/google-signin` (requires a fresh native build).
- New tested logic: `src/backupSchedule.js`, `src/googleDrive.js` (against a mocked fetch), `src/backupService.js`, `src/widgetPrefsLogic.js`.

### Added — add-task button, animated task circle and blinking dot on the Tasks widget
- A **+** in the Tasks widget header opens an "Add task" sheet (title, due date: today / tomorrow / in 3 days / pick / none, category) that works without opening the app. The task shows on the widget at once; LAYP creates it on its next run with the in-app form's defaults and reminders (`pendingToTodos`, tested).
- The status circle is animated (spinning arc while "Work in progress", breathing halo at "To pass") and task rows now have the app's blinking urgency dot at the same speeds: fast red, medium yellow, slow green. Built from ViewFlipper cross-fades and an animated-rotate spinner, since widgets can't run animation code.

### Fixed / changed — Calendar widget loading, widget redesign
- Fix: the Calendar widget said "Can't load widget" because its layout contained a plain `<View>` (the divider), which a widget can't inflate. Removed; all widget layouts are now checked against the allowed view classes.
- Redesign of all three widgets in the app's navy theme: spending hero card (gradient, large amount with smaller peso sign and cents), Tasks header band with a "due soon" pill and task cards with a colored status/urgency edge, Calendar with accent/soft pills on the month and gradient pages for today and upcoming events. Bottom sheets get a grab handle.

### Added — Tasks and Calendar widgets, widget search/money, quiet notification buttons, GF repeats
- **Tasks widget** (4x4 and 4x6): open tasks with a tappable circle that steps the status (Not starting yet, Work in progress, To pass, completed) like the app's circle; urgency dot/colors follow the app's rules. **Calendar widget** (4x2): month grid, today as a big date, and a swipeable stack of upcoming task deadlines, bills, loans, reminders and GF dates.
- **Spending widget**: search past expenses, receive/add money, dark mode that follows LAYP's own theme, and spending can no longer go past an account's balance (blocked in the dialog and re-checked when LAYP absorbs it; rejected ones are reported).
- **Notification buttons** (task "Have you started/passed?", daily budget save/keep) no longer open the app. On Android a native receiver (`LaypNotificationsService`) saves the answer in a durable queue and dismisses the notification; LAYP applies it next time it runs. Class alarm buttons are unchanged.
- **GF dates**: "Every month" repeat (monthsaries; reminders re-armed on each launch) and an "Anniversary" type with its own heart badge. New pure helpers in `src/gfDates.js`, `src/widgetEvents.js`.
- Fix: the task card's urgency dot sits in its own slot beside the dropdown arrow instead of on top of it, with no layout shift.
- Native module now needs `expo-notifications` at build time; requires a fresh native build.

### Added — Android home-screen spending widget
- New native module `modules/layp-widget` (Kotlin): a 4x2 widget showing today's spending with quick-log chips for your most-used labels, and a bottom-sheet "Log expense" dialog (amount, quick +20/+50/+100/+500, note, label, budget category, account) that works without opening LAYP.
- Expenses logged from the widget are queued natively and absorbed into LAYP on launch/foreground (de-duplicated by id); the app pushes today's total, balances, categories and accounts back to the widget. Honors the hide-money switch and dark mode.
- New `src/widgetSummary.js` (+ tests) and a small sync block in `App.js`. Requires a fresh native build.

### Added — clickable links in task descriptions
- Links in a task's description (http://, https:// and www.) are underlined and open in the browser when tapped (new `linkify.js` + `LinkText` component). Trailing punctuation like "." or ")" isn't swallowed into the link, and long-pressing a link still opens the task editor.

### Changed — task indicator colors, blink speeds, dot placement
- **Tasks**: status "To pass" now shows a green border and green dot with a slow blink (this wins over the deadline). Due in 2 days: yellow border, yellow dot, medium blink, and the checkbox circle turns yellow. Due tomorrow/today/overdue: red border, red dot, fast blink. Finished tasks stay default.
- The dot sits further in from the card's upper-right corner (12px instead of 7px).

### Changed — deadline-based task indicators, Remember long press, zoomable gift photos
- **Tasks**: the card border and the blinking dot now follow the deadline only. Due tomorrow, today or overdue: red border + blinking red dot. Due in 2 days: yellow border + blinking yellow dot. 3+ days away, no due date, or finished: default (no colored border, no dot). Status no longer affects either.
- **Remember**: the inline Edit and Delete buttons are gone; long-press a reminder for an Edit / Delete menu (new `LongPressMenu` component).
- **GF gift ideas**: tap a photo to view it full-screen with pinch-to-zoom, pan, double-tap zoom and swipe-down-to-close (new `ImageViewer` component). New photos are saved at higher quality (0.9) so zoomed-in views stay sharp. Android back closes the viewer/menu before the GF screen.

### Changed — GF long-press menus and gift feed, Remember "Both", task borders
- **GF screen**: every item (notes, likes, dislikes, gift ideas, dates, promises) now uses a long press to open an Edit / Delete menu instead of inline pencil/trash icons. Kept promises offer Delete only. Add/edit forms scroll into view when opened.
- **Gift ideas** are now a feed, newest first: an idea with a photo is a big card (photo at its own proportions, clamped to Instagram's 4:5 to 1.91:1, with the caption/title beneath); ideas without a photo stay compact rows.
- **Remember**: reminders can now use "Both" (notification + popup), same as GF Promises. Time-based and interval scheduling already matched.
- **Tasks**: every task card has a thin 1px border in its status color (gray = not started, blue = work in progress, green = to pass / finished).

### Changed — Face unlock removed, Todo dot, Spending rework
- **Removed** the GF section's face unlock (scan screen, enrollment, model, camera permission, and the `expo-camera`, `react-native-fast-tflite`, `jpeg-js`, `expo-image-manipulator` packages). Requires `npm install` and a fresh native build.
- **GF lock** now opens to a blank screen; tapping anywhere 5 times (within 3s of each other) brings up the PIN prompt.
- **Todo urgency**: the glowing/blinking card halo is replaced by a small blinking dot in the card's upper-right corner (absolutely positioned, no layout shift).
- **Bills card** moved from the Borrow tab to the bottom of the Spending screen (now `components/BillsCard.js`).
- **Spending**: main list shows the latest 5 days of activity; a new history button opens an "All activity" popup with every day and an Export (CSV) button. "Money received / added" is now a popup sheet like "Log expense".

### Changed — Accessibility pass
Went through every screen's `Pressable`s looking for ones a screen reader user would get nothing useful from:

- **Todo's task-completion checkbox** (the circle/checkmark next to every task) had no label or role at all — now announces "Mark '<task>' complete/incomplete" with `accessibilityRole="checkbox"` and the checked state.
- **Todo's List/Week view toggle** (icon-only buttons) now announce "List view"/"Week view" with selected state.
- **Todo's subtask toggles** now expose `accessibilityRole="checkbox"` + checked state (they already had visible text, so this adds the semantic role rather than fixing a silent gap).
- **Daily Budget's custom-amount confirm button** (a bare checkmark icon) now announces "Confirm custom amount".
- **Budget's Daily Budget card link** now announces "Open Daily Budget" instead of leaving a screen reader to guess from the trailing "›" glyph.
- **Borrow's Owed-to-me / I-borrowed toggle** now exposes `accessibilityRole="tab"` + selected state.
- **School's subject card** now has a single concise label (subject code + time range) instead of leaving a screen reader to piece together several separately-ordered text nodes.
- Audited every remaining `Pressable` across Borrow, Budget, Daily Budget, Goals, School, Spending, Summary, and Todo: all of them already carry visible text a screen reader announces by default, so no silent icon-only gaps remain anywhere in the app.

### Changed — UI polish pass (checklist-driven)
A full pass through a UI improvement checklist covering consistency, hierarchy, and a few real bugs found along the way:

- **Fixed a real color bug**: `SPENDING_LABELS` had two silent duplicate-color collisions — "School" and "Other" were both plum, and "Bills" and "Health" were both ember — so the by-label pie chart on Activity couldn't visually distinguish them. Added two new accent colors (`ACCENT.rose`, `ACCENT.slate`) and reassigned so all 8 spending labels are now distinct.
- **Unified edit/delete icons everywhere**: every Pencil/Trash2 pair across Borrow, Budget, Goals, School, Spending, Todo, and Daily Budget was a slightly different size (12–15px, inconsistently). All standardized to the same 14px/`theme.textMuted` pair.
- **Brighter secondary text**: dark-mode `textMuted` bumped from `#94949E` to `#A8A8B0` so dates/labels are easier to read at a glance.
- **Less pure black**: dark-mode background changed from `#09090B` to `#12121A` (dark blue-gray) — same OLED-friendly intent, less stark.
- **Fewer blues**: added a `neutralDark` (dark gray) theme token; the app's indigo (`accentDark`) is now reserved for primary buttons and money totals (hero cards, "+"/submit buttons). Everything else that used to reach for that same indigo — Todo's list/week toggle and day picker, School's day-of-week picker — now uses the new neutral gray instead.
- **Cleaner category chips**: `Chip` now renders a neutral border/background with a small colored dot for category/account/split selectors, instead of a colored border per chip. Plain status filters (Active/Unpaid/Paid/etc.) keep their pill shape but fill with the new neutral gray instead of indigo when active.
- **One toggle style, app-wide**: confirmed Todo's Active/Finished and Borrow's Active/Settled already shared the `SegmentedTabs` component; also migrated School's Day/Week/List toggle onto the same component so every section-switcher in the app now looks identical.
- **Highlighted "Safe to Spend"**: now a solid app-blue hero card (same visual weight as the Total Money card), and moved up to be the second card on Overview instead of buried after the monthly summary.
- **Overview card order** reworked to: Total money → Safe to spend → Upcoming tasks (capped at 3, was 5) → Today's Classes → monthly summary/goal/net worth/savings → Bills (now at the very bottom, was mid-screen).
- **Today's Classes** on Overview is now a compact horizontal scroll strip (subject code + start time per class) instead of a full detailed card; tapping still opens the full School schedule.
- **Softer overdue styling**: replaced plain red overdue text with a small red-tinted pill/badge (matching the existing tag style already used for accounts/splits/categories) on Home's tasks & bills, Todo's due-date line, Borrow's loan rows, and Budget's bill rows.
- **Renamed** "Lent (owed to me)" → "Owed to me" on the Borrow screen, which also brings its toggle button back to equal visual weight against "I borrowed" (was noticeably longer).
- **Bigger transaction rows**: Spending screen expense rows now have more padding, a bolder/larger right-weighted amount, and slightly more breathing room between rows.
- **PIN screen**: keys are now real ~70px circular buttons (card background + border) instead of borderless 33%-wide tap zones, and the whole logo/title/dots/keypad group is centered vertically instead of top-pinned with the keypad pushed to the bottom edge.
- **Nicer empty states**: `EmptyState` now shows a small contextual icon in a soft circular badge (Receipt for bills/expenses, PiggyBank for savings/goals, HandCoins for borrowing, GraduationCap for classes, ListTodo for tasks, Search for search results, a pie-chart glyph for the Activity breakdowns) instead of plain text alone.
- **Removed a duplicate "spent" label**: Activity's second pie chart (by spending label) no longer repeats the word "spent" in its center — the section header already says what it's breaking down, and the first chart already said "spent" once.
- **Decluttered the Spending screen**: the always-visible row of 8 category filter chips under the search bar is now tucked behind a "Filter" button (shows the active label as a badge when one's selected) instead of permanently taking up a row on every visit.
- **School screen "Cancel class" is now a long-press** on the class row itself (with a small muted "Long-press to cancel" hint) instead of a permanently visible red Cancel button next to every class.
- Standardized the remaining screen-title (`h1`) inconsistencies — Activity and Goals were `fontWeight: "800"` while every other tab used `"700"` at the same 20px; all now match.

### Fixed
- **Duplicate "Savings opportunity" notifications piling up in the shade** — an earlier version's daily-budget notification could, under a race condition (already guarded against for future reschedules by a debounce + request-token check), leave orphaned repeating notifications on the device that fired every day forever with no way to cancel themselves. The existing startup cleanup only cancelled these *scheduled* duplicates going forward; it never touched copies that had *already fired and delivered* before the cleanup ran, so a device carrying old debris from before that fix could still wake up to half a dozen near-identical delivered notifications at once. Cleanup now also dismisses any already-delivered "dailyBudget"-tagged notifications on launch, since a fresh one gets rescheduled immediately after anyway.

### Added
- **Recurring income** — the "Add money" form now has a Repeats picker (One-time / Weekly / Monthly), same idea as recurring bills. Today's entry still logs immediately; a standing template is created alongside it that posts future occurrences automatically. If the app hasn't been opened in a while, catches up on every occurrence that was due in the meantime (dated correctly, not lumped into one), rather than skipping or guessing. A new "Recurring income" panel on the Spending tab lists active templates with a way to stop one (past entries it already created are kept).
- **Custom per-label spending limits** — a new "Spending limits" panel on the Spending tab lets you set a monthly cap per spending label (e.g. "Food: ₱3,000"), with a progress bar per label and a one-time notification when a label crosses 80% of its limit — independent of the existing automatic 80%-of-budget-split alert, since a label limit and a split's recommended daily amount are two different things to track.
- **Spending-insight chart by label** — the Activity tab already had a category (budget split) breakdown and a 6-month income-vs-spending trend; added a third card, "This month by what it was for," using the new spending labels (Food, Transportation, etc.) instead of the budget split. Unlabeled expenses show up under "Uncategorized" rather than being silently excluded.
- **EAS auto-incrementing version codes** — `eas.json` now sets `cli.appVersionSource: "remote"` and `autoIncrement: true` on the `production` build profile, so Android's `versionCode` bumps itself on every production build instead of needing to be tracked by hand (Google Play rejects a resubmission with a `versionCode` it's already seen). If LAYP has already been published, run `eas build:version:set` once after pulling this in so EAS's remote counter starts from the real current version instead of colliding with it.
- **Recurring bills** — bills can now repeat weekly or monthly. Set from the bill form (One-time / Weekly / Monthly); once a recurring bill is fully paid (in full or via the last partial payment), the next occurrence is created automatically with the same amount/category/account and its due date advanced by one interval, reminder scheduled and all. Monthly correctly handles month-end overflow (e.g. Jan 31 rolls to Feb 28/29, not into March).
- **Haptic feedback** — added `expo-haptics` (new dependency) and a central `src/haptics.js` helper. A success buzz on saving a transfer, finishing a task, or paying a bill (full or partial); an impact buzz on deletions. Wired into `ConfirmModal` itself (one integration point covers every `confirmDelete`/`confirmAction` call across the app) plus the few success paths that don't go through a confirm dialog.
- **Search & filter for expenses** — a search box (matches name or label) plus spending-label filter chips on the Spending tab. Searches across your full expense history, not just what's currently expanded in Today/History, and swaps to a flat results list while a search/filter is active.
- **Notification scheduling error handling** — every call to expo-notifications' scheduler now goes through one wrapper (`safeScheduleNotificationAsync`) that catches failures (permission revoked mid-session, an OS/OEM scheduling restriction, etc.) instead of letting them throw. A failed schedule returns `null` and is filtered out of the ids LAYP stores, so a failed alarm/reminder can no longer be silently recorded as if it were actually armed. Also now warns on launch if notification permission isn't granted at all, since every reminder/bill/class-alarm feature quietly depends on it.
- **Spending labels** — expenses can now be tagged with a quick-pick category (Food, Transportation, School, Bills, Shopping, Entertainment, Health, Other) via chips in the expense form, in addition to the existing free-text custom label. Shown as a small tag on each expense row (this display already existed; there was just no easy way to set it before).
- **"Log again" / memory spending** — a new selector groups past expenses by name + amount and surfaces the ones you've logged 2+ times as one-tap "log again" chips above the add-expense button, reusing the same split/account/label as the most recent matching entry. A short confirm still appears before it's added, so a stray tap can't silently create a duplicate expense.
- **Backup validation with Zod** — restoring a backup used to only check that top-level fields were arrays of *some* kind; it never validated what was inside them. `src/backupSchema.js` now checks every bill/expense/loan/transfer/etc. has its required fields with the right types (amounts must actually be numbers), and rejection messages now point at the specific field that failed instead of a generic "backup not recognized."
- **Debounced saves** — state changes are now batched into a single `AsyncStorage` write roughly 800ms after they settle, instead of one write per keystroke/tap. Flushes immediately if the app is backgrounded so nothing in the debounce window gets lost.
- **Tab bar redesign** — rebuilt as its own component (`src/components/TabBar.js`) with a sliding animated indicator behind the active tab, a floating rounded-card look with a subtle shadow, and a small press-in/press-out bounce per tab. Tap targets bumped to a 48pt minimum height for accessibility.
- **Single source of truth for tabs** — the list of tabs (key, label, icon) now lives in one `TABS` array in `App.js`; the swipe-navigation order (`TAB_ORDER`) is derived from it instead of being a second, separately-maintained list. Adding, removing, or reordering a tab is now a one-line change instead of editing two places that had to be kept in sync by hand.
- **Partial bill payments** — bills now track `paidAmount` separately from `amount`. A new "Pay part" action opens an inline amount field (with a "pay in full" shortcut) and creates an expense for just that amount; a thin progress bar shows how much of the bill is covered so far. "Unpaid total" on the Bills tab now reflects the actual remaining balance, not the original bill amounts.
- **Customizable class check-in** — the "Do you have class today?" heads-up (previously a fixed 60 minutes before class, hardcoded) now has its own enable/disable toggle and a minutes-before picker (30/45/60/90/120), settable both as a school-wide default and per subject.
- **More test coverage** — added unit tests for the new backup schema, the new "log again" selector, and previously-untested savings/goal calculations (`savingsTotal`, `unallocatedSavings`, `goalCurrentAmount`, `goalProgress`, `splitKind`). Test suite is now 57 tests across 5 files, all passing.

### Changed
- **Record IDs** — `uid()` switched from `Math.random().toString(36).slice(2, 10)` to `Crypto.randomUUID()` (expo-crypto). The old scheme had a fairly small space of possible values for what are, in several cases, financial record IDs; collisions were unlikely but not worth the risk as data accumulates.
- **Todo reminder notifications** now include the due date/time, the task's category or linked subject, and subtask progress, instead of just a generic "Reminder" title and a one-line due date. The native full-screen Todo alarm already had this detail; the lighter notification is now brought up to the same standard.
- **Daily Budget review** now allows exactly one decision (save / keep / remind) per calendar day. Once a decision is made, the action buttons are replaced with a "Today's decision: ..." summary; it clears itself automatically at midnight since it's keyed by date, so no separate reset logic was needed.
- **Confirmation dialogs** — the last two screens still using the OS-native `Alert.alert` two-button confirmation (the "Replace current data?" restore prompts in the Summary tab) now use the same in-app `ConfirmModal` used everywhere else in the app.

### Fixed
- **Swipe-gesture "reload" glitch** — swiping right on the Home tab (or left on the last tab) used to animate the whole screen fully off-screen and then teleport it back instantly once the app correctly refused to change tabs, which looked like a flash/reload. `SwipeNavigator` now knows which directions actually have a destination tab, applies rubber-band resistance when dragging toward a dead end, and always eases back smoothly instead of snapping.
- **Keyboard covering form inputs** — `BillForm` and `SavingsTransferForm` (both in the Budget tab) and the custom-amount field in Daily Budget are now wrapped in `KeyboardAvoidingView`, so the amount input isn't left hidden behind the keyboard on smaller phones.

## Earlier (pre-changelog)
Everything before this file was added, going back to the original React Native/Expo build-out: core screens (Home, Todo, School, Budget, Daily Budget, Goals, Borrow, Spending, Activity, Summary), the native Android alarm module (`layp-alarm`), notification scheduling, backup/restore, and the ongoing move toward a Zustand-based store are not itemized here retroactively.

## Not yet done (tracked, not forgotten)
From the reliability/architecture proposal this update was based on:
- Recurring **transfers** specifically (account-to-account, not income) — recurring bills and recurring income are now both done, see above. Data archive/cleanup, CSV export
- Data-model consolidation (Accounts/Transactions/Bills/Loans/Goals/School as a formal layer with shared selectors) and the broader App.js domain-context/reducer refactor
- TypeScript migration
- *(The native Kotlin school-alarm engine was already in place before this changelog started — `scheduleNativeClassAlarm` in `notifications.js` already routes class alarms through `modules/layp-alarm` the same way Todo alarms do.)*
