# Round 4: layout/animation fixes + GF interval reminders

Full cumulative patch since the first delivery -- supersedes every zip
before it. Apply this one only.

## How to apply
- `git apply all-updates.patch` from your original repo state, OR
- copy every file in this zip into your repo, preserving folders.
- Delete `src/components/GfRemindPopup.js` if it's still around from an
  early delivery -- replaced by `RemindPopup.js`.

## What changed this round

- **Fixed: task border growing during the glow.** The blink was
  animating the border's actual width, which changed the card's real
  size and shifted everything below it. The row's own border is now
  completely fixed -- the glow/blink lives entirely on a separate,
  absolutely-positioned "halo" just outside the card's edges, so it can
  pulse freely without ever touching the row's own layout.
- **Bills is now its own clearly bordered card** inside the Borrow tab,
  instead of just a divider line under the loan tracker -- and each
  bill's own row is restructured (header line, then tags, then progress
  bar, then the "Pay part" link, each on its own line) so it doesn't get
  cramped or misaligned when a bill has several tags.
- **Smoother animation** across the board -- the urgency glow now
  breathes in and out (sine easing) instead of a linear on/off blink,
  the completion ring/pop decelerates naturally, and the account balance
  bar's shrink/grow eases out instead of moving at a constant rate.
- **GF Promises: "Both" reminder mode**, plus a **Specific time /
  Interval** schedule choice. Interval reuses the same Always / Every
  hour / Every 3 hours / Custom options GF Notes already had -- "Always"
  is hidden once a notification is involved, since an OS notification
  needs an actual interval to schedule against, not "every single app
  open". A promise with Notification (or Both) + Interval now arms a
  genuine repeating "every N hours" system notification.

## Honest caveats
Same as always -- untested on a device. I'd specifically want a look at:
- the halo doesn't overlap/clip awkwardly against neighboring rows when
  cards are close together in the list
- the Bills card's new row layout on a narrow phone width
- an interval-mode Promise notification actually firing every N hours
  as expected
