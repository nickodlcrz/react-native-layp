# Remember + GF module

## How to apply
Either:
- `git apply remember-gf-updates.patch` from your repo root (applies on top of
  the previously-delivered Spending/Borrow changes), or
- copy the files in this zip straight into your repo, preserving folders
  (App.js, package.json, src/..., overwriting the originals).

## One required step after pulling
This adds photo uploads (GF Likes / Gift Ideas), which needs a new native
module not previously in the project:

    npx expo install expo-image-picker

(`npx expo install` — not plain `npm install` — so it resolves the exact
version that matches your Expo SDK.)

## What's new

**Remember (Todo tab)** — a Tasks/Remember toggle at the top of the Todo
screen. Remember is quick-capture notes with an optional reminder
date+time (real local notifications), 10min/1hr/tomorrow snooze, search,
and tag filtering. The next 2-3 upcoming ones are pinned on the Home
Overview.

**GF module** — tap the heart icon next to the dark/light toggle. PIN-gated
on every open (reuses your existing app PIN). Tabs:
- **Likes** — Food/Gifts/Places/Shows, each with an optional photo
- **Dislikes** — flat list, to check before repeating something
- **Dates** — birthdays/anniversaries (stored as recurring, no year),
  auto-reminders 7 days and 1 day before
- **Notes** — quick "things she mentioned", optionally flagged to pop up
  next time you open the app
- **Gifts** — gift ideas with optional photos, mark as given
- **Promises** — "reply in an hour", "call tonight" style promises with a
  due time; once overdue, an in-app "Did you do it?" prompt offers
  Done / +10min / +1hr / Tomorrow. A small red badge on the heart icon
  shows how many are meaningfully overdue (>24h).

Everything above is included in backup export/import.

## Honest caveats
This is a large amount of new, untested surface area — I syntax-checked
every file (all parse cleanly) and traced the prop/state wiring by hand,
but none of it has been run in Expo Go or on a device. Test it there
before trusting it with real data, especially:
- notification scheduling/cancellation timing
- the PIN re-entry gate on the GF panel
- photo picking/persisting (needs the expo-image-picker install above)
