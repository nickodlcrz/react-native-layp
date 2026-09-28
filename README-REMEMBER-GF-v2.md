# Remember + GF module -- round 2

This is a full cumulative patch on top of the *first* Remember/GF delivery
(the one with App.js, GFScreen.js, RememberList.js, gfImages.js etc.) --
apply this one instead of stacking it on that older zip; it supersedes it.

## How to apply
- `git apply gf-updates-v2.patch` from your repo root, against the same
  state you were at before the first Remember/GF delivery (i.e. right
  after the Recent Activity / Borrow-tab / minimal-interest changes), OR
- copy every file in this zip straight into your repo, preserving
  folders, overwriting what's there.

One file from the first delivery is gone: `src/components/GfRemindPopup.js`
was fully superseded by `src/components/RemindPopup.js` -- delete the old
one if it's still sitting in your repo from the first zip.

## What changed since the last delivery

**Bills moved into the Borrow tab.** Turns out "unpaid and paid" in my
first pass meant the loan status tabs -- what you actually meant was the
Bills section in Budget's Overview. That's fixed: Overview no longer has
a Bills section at all, and Borrow tracker now has one, right below the
loan Active/Settled tabs (unpaid/paid, add/edit/delete, partial payments,
recurring bills, all of it). The loan tabs themselves are back to how
they were originally (Owed to me / I borrowed as primary).

**Fixed a real crash bug.** An earlier pass had started migrating the
"remind me" system to a much better design (see below) but left one
render still pointing at the deleted `GfRemindPopup` component with no
import -- that's an immediate crash the moment the popup would have
fired. Fully rewired now.

**The reminder/popup system was redesigned** (this is the big one):
- Every reminder -- general Remember items and GF Promises -- now picks
  **Notification** or **Popup when app opens**, with an optional date, an
  optional time, and (for a time-only/no-date one) an optional "stop
  repeating after" end date. Leave both date and time off and there's no
  reminder at all, just a note.
- GF Notes get a different, simpler control that matches what you asked
  for: "Pop this up when I open the app" with a frequency --
  **Always / Every hour / Every 3 hours / Custom** -- since a note isn't
  tied to a specific moment the way a promise is.
- The popup itself now checks on every app open *and* every time you
  bring the app back from the background (not just once per session), so
  an hourly note or a daily reminder actually behaves like it says it
  will.
- **Fixed:** the popup could previously appear on top of the PIN lock
  screen, before you'd actually gotten in. It now only ever fires once
  `ready && unlocked`.
- **Fixed:** GFScreen's top padding overlapped the status bar -- now uses
  the device's real safe-area inset.
- **Removed:** the forced 1:1 crop on Likes/Gift Idea photos. Upload
  whatever aspect ratio you want now.
- **Merged:** Likes, Dislikes, and Gift Ideas are now all inside the
  Notes tab (a small chip switcher at the top), rather than their own
  tabs -- GFScreen is down to Notes / Dates / Promises.
- **Editable:** every single list in the GF module (Notes, Likes,
  Dislikes, Gift Ideas, Dates, Promises) and the general Remember list
  now has an explicit edit action, not just add/delete.

## Honest caveats
Same as last time -- I can't run this in a simulator from here. Every
file parses cleanly and I traced the state/prop wiring by hand end to
end (including the crash bug above, which parsing alone would never
have caught), but the notification timing, the AppState resume-check,
and the safe-area fix are exactly the kind of thing that can look right
on paper and still need a real device to confirm. Test it in Expo Go
before trusting it, especially:
- adding a time-only daily reminder and confirming it actually notifies
  daily, and stops after its "until" date
- backgrounding and resuming the app with an hourly GF note pending, to
  confirm the popup re-checks on resume
- the GF panel's top edge on your actual phone (status bar overlap)
