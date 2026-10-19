# TV Channel

Slides that take turns on the hall TV between calls. Hall TV → **TV Channel** in the console.

- **Designs:** mock exam promo (QR code to book), next batch, our partners, exam-day tip, full-screen poster (image or video), and *Today at FETS* (the home screen).
- **Schedule per slide:** from/until date, days of the week, from/until time, seconds on screen, and whether it shows at both centres. The TV checks the schedule against its own clock, so a slide comes on and goes off on the minute.
- **What comes first:** a call takes the whole screen, then a message put up from Messages, then the loop. The home screen keeps a turn in the loop unless the playlist places it itself.
- **QR codes** default to `https://fets.in/testdrive/`. The editor can download any slide's QR code as a print-ready PNG.

## Setup

Run `supabase/migrations/20261020090000_fets_tv_channel.sql` once in the fets.online project. Until then the TV and the console behave as before.

Check it locally with `scripts/verify-tv-channel.mjs` (PGlite).
