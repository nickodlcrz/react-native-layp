# LAYP — Expo/React Native

A personal productivity + budgeting app: tasks with real reminders, a
budget split across E-cash/Physical accounts, spending tracking, a
lend/borrow tracker, and a plain-text summary export.

## Running it

```
npm install
npx expo start
```
Scan the QR code with Expo Go on your phone.

## Building the APK (EAS)

```
npm install -g eas-cli      # if you don't have it yet
eas login
eas build -p android --profile preview
```
`eas.json` already has a `preview` profile that outputs a plain
installable `.apk` (not a Play Store bundle).

## Bug fixes in this version

- **Date off-by-one bug, fixed at the root.** Every date construction was
  using `Date.toISOString()`, which converts to UTC -- for the Philippines
  (UTC+8), local midnight becomes 4pm the *previous day* in UTC, so
  picking Aug 5 silently saved as Aug 4. Replaced every instance with a
  `toLocalISO()` helper in `src/utils.js` that formats from the device's
  local calendar fields instead of converting timezones at all.
- **Dark mode white-on-white text.** Audited every color pairing in the
  app and didn't find a logic bug in the app's own styling -- the more
  likely cause is MIUI's OS-level "force dark" feature overriding colors
  on elements it doesn't recognize as explicitly styled, colliding with
  the app's own theme system. Set `userInterfaceStyle` to `"light"` in
  `app.json` so Android no longer tries to auto-adapt the app's chrome;
  the in-app dark-mode toggle already handles all real theming.
- **Delete not registering reliably.** No logic bug found here either --
  but small icon-only buttons are a common real-device usability problem.
  Added `hitSlop` (a larger invisible touch area) to every delete button
  across the app.

## Feature additions in this version

**Budget**
- Separate **E-cash** and **Physical** balances, each tracked
  independently (money added minus money spent from it), shown
  side-by-side under the current-budget hero card.
- Bills specify which account they'll be paid from, in addition to which
  budget split they count against.

**Spending**
- Log money received/added directly here too (green button, top of the
  tab), not just from Budget -- picks which account it goes into.
- Custom label field on every expense, separate from the required budget
  category -- a free-text tag for your own use.
- Recently added expenses sort to the top (uses a real creation
  timestamp now, not the random ID that was never meant for ordering).
- **Expense history is retained.** New spending entries stay available in
  the ledger instead of being automatically deleted after a week. Existing
  weekly summaries from older app versions remain visible as legacy records.
- **Income & outcome history**: a combined, collapsible ledger of every
  peso that came in and went out, newest first.

**New: Borrow tab**
- Two lists: money **lent** (owed to you) and money **you borrowed**.
- Each entry: name, principal, a customizable interest percentage
  (simple, not compounding), and a due date using the same calendar
  picker as everywhere else.
- Checking an entry as settled moves it into a separate settled list,
  same pattern as bills and finished tasks.

**General**
- Calendar and time pickers are the same reused components everywhere a
  date or time is needed (Todo, Budget, Spending, Borrow).
- Weekday reminder option (Mon-Sun, individually or via presets), on top
  of once/daily/interval/custom.
- Dark mode, your logo as the app icon, subtasks, School-task red
  highlighting, same-day conflict warnings -- all carried over from the
  previous version.

## New: Security (PIN lock)

The app is now locked behind a normal PIN:

- **First launch**: create a 4-digit PIN (enter it twice to confirm).
- **Every launch after that**: enter your PIN, or tap the fingerprint icon
  if biometrics are enrolled on the device -- either unlocks the app the
  same way, no special behavior either way.
- **Auto-lock**: the app immediately re-locks any time it leaves the
  foreground (backgrounded, screen off, app switcher) -- you land back on
  the PIN screen next time you open it. There's also a manual lock icon
  in the header to lock it immediately without switching apps.

The PIN is hashed (SHA-256) and stored in `expo-secure-store`
(hardware-backed encryption where the device supports it), never in
plain text or in the regular AsyncStorage used for the rest of the app's
data.

## New: Savings goals

In the Budget tab, under Savings:

- Create named goals with a target amount and an optional target date
  (e.g. "New laptop, ₱20,000, December 2026").
- Fund a goal by earmarking it when you add to savings -- pick the goal
  from a chip row, or leave it "General" for unallocated savings. This
  reuses the existing savings pool rather than tracking goal money
  separately, so nothing double-counts.
- Each goal shows a progress bar, percentage complete, and (while not yet
  met) a **recommended monthly amount** based on how much is left and how
  much time remains until the target date.
- The Home dashboard features your nearest active goal with its own
  progress bar.

## New: Theme-matched logo + dark mode on the lock screen

- The header logo now swaps between a black-mark and white-mark variant
  depending on light/dark mode, both on a transparent background, so it
  blends into the header instead of sitting in a boxed square.
- The **PIN lock screen now supports dark mode too** -- it used to always
  render in a fixed light theme since it appears before the main app's
  data (including the dark-mode setting) loads. Fixed by storing the
  theme preference in its own small, always-readable key
  (`src/themePreference.js`) separate from the PIN-gated vault data, plus
  a sun/moon toggle right on the lock screen itself.

## New: Home dashboard

A new first tab, now the default landing screen:

- **Total money**, animated -- counts up/down smoothly whenever it
  changes, using React Native's built-in `Animated` API (no extra native
  dependency, no rebuild required), with a per-account breakdown below it.
- **Monthly overview** -- income, spending, and net savings for the
  current calendar month.
- **Safe to spend** -- total money minus unpaid bills, plus a rough
  per-day amount for the rest of the month. Clearly labeled as an
  estimate, not financial advice.
- **Upcoming bills** -- your next 3 unpaid bills.
- **Savings and borrowing** side by side -- total saved, and what's owed
  to you vs. what you owe.

## New: Named accounts + transfers

Accounts are no longer a fixed "E-cash / Physical" pair -- they're fully
user-managed, same pattern as budget splits:

- Add, rename, or remove as many named accounts as you actually use --
  GCash, Maya, GoTyme, Bank, Wallet, whatever matches your real wallets.
- **Transfer** money between two accounts (Budget tab, the swap icon next
  to "Accounts"). Transfers move money from one account to another
  without ever counting as income or spending -- your total money stays
  exactly the same, it just changes which account holds it.
- Every account's balance now correctly reflects money added, spending,
  loans currently out/in, savings moved in/out, and transfers -- all in
  one live number.
- The Summary export now includes a full accounts breakdown and your most
  recent transfers.
- The Summary tab can also copy a complete JSON backup and restore a backup
  after confirmation. Backups contain financial data, so save them privately.

## Known simplification, worth knowing about

The Borrow tab is currently a **standalone tracker** -- lending or
borrowing money doesn't automatically adjust your E-cash/Physical account
balances. Wiring that up fully (e.g. lending ₱500 cash should reduce your
E-cash balance) is a reasonable next step, just scoped out of this pass
to keep the accounts/rollup logic correct and shippable now rather than
risk a half-finished cross-integration.

## Known limitations, worth knowing about

- `expo-notifications`' repeating triggers don't have a native "stop
  after date X" option, so daily/weekly/interval/custom reminders for a
  task keep firing until you complete the task or its due date passes --
  the app checks for this once per launch and cancels stale ones, but
  won't catch it mid-day while the app is closed.
- Date/time entry is a custom in-app picker (calendar grid, hour/minute/
  AM-PM chips) rather than the OS native picker, to match the design
  system and to have one single, fixed implementation reused everywhere.

## Redmi 10 / MIUI notes

MIUI is much more aggressive than stock Android about killing background
apps, which can silently stop scheduled reminders from firing:

1. Settings app -> Apps -> Manage apps -> LAYP -> Battery saver -> **No
   restrictions**
2. Security app -> Permissions -> Autostart -> enable **LAYP**
3. Settings app -> Notifications -> LAYP -> confirm notifications are
   allowed

The Todo tab has an in-app banner that opens the right settings screen
for step 1 directly.
#   r e a c t - n a t i v e - l a y p  
 
