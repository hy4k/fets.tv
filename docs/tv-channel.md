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

## Video ads and the ticker (part three)

- **Video ad:** a design of its own in *Add a slide*. Upload an MP4 (up to 50 MB, 16:9). It plays from start to finish across the whole TV, however long it runs, then the loop carries on. A call cuts in at once; the ad pauses under it and picks up where it stopped. A QR code in the corner is optional. *Play its sound* plays the ad's audio once the TV has been tapped after opening (the same tap as the call sound); until then it plays silently. A file that will not play, or stops for 30 seconds, is skipped, never left as a black screen. Showings are counted like any slide.
- **Ticker:** lines that scroll along the bottom of the TV, in the order listed under *Ticker*, whenever nobody is being called (messages and ads included). Each line has the same schedule, on/off switch and "both centres" choice as a slide. Up to 140 characters a line.
- SQL: `supabase/migrations/20261029090000_fets_tv_ads_ticker.sql`, after the TV Channel SQL. It adds the two kinds and raises the TV file bucket to 50 MB. Until it is run, ads and ticker lines cannot be saved; everything else works as before.
