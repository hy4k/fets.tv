# TV Channel

Slides that take turns on the hall TV between calls. Hall TV → **TV Channel** in the console.

- **Designs:** mock exam promo (QR code to book), next batch, our partners, exam-day tip, full-screen poster (image or video), and *Today at FETS* (the home screen).
- **Schedule per slide:** from/until date, days of the week, from/until time, seconds on screen, and whether it shows at both centres. The TV checks the schedule against its own clock, so a slide comes on and goes off on the minute.
- **What comes first:** a call takes the whole screen, then a message put up from Messages, then the loop. The home screen keeps a turn in the loop unless the playlist places it itself.
- **QR codes** default to `https://fets.in/testdrive/`. The editor can download any slide's QR code as a print-ready PNG.

## Setup

Run `supabase/migrations/20261020090000_fets_tv_channel.sql` once in the fets.online project. Until then the TV and the console behave as before.

Check it locally with `scripts/verify-tv-channel.mjs` (PGlite).

## Counting (part two)

- Every slide has a short code. Its QR code on the TV holds this console's `/go/<code>` link: a scan adds one to the slide's count for the day and sends the phone straight on to the slide's link. Unknown codes go to fets.in.
- The TV counts each time a slide comes on and reports every two minutes (and when the page closes) to `/api/display/<key>/shown`.
- The console shows, per slide and in total: shown and scanned over the last 7 days, and today.
- SQL: `supabase/migrations/20261020120000_fets_tv_channel_stats.sql`, after the TV Channel SQL. Check it with `scripts/verify-tv-channel-stats.mjs`.
- The QR code points at whatever address the TV page is opened on, so the TV must use the public address (fets.online), not a local one.
