---
name: floor-report
description: Build the staff floor report for Calicut and Cochin from fets.online records — how fully each centre recorded every candidate (check-in to sign-out), what was skipped, and what to do next — as a shareable page plus a full-colour PDF. Use when asked for the floor report, staff performance report, or "how did the centres do" for a date range.
---

# Floor report

A short report for exam-floor staff at both centres. It is read on phones and
printed, so it must be brief, plain and in colour.

## Inputs

- **Date range.** Default: from the day after the last report to today (IST).
  If no earlier report is known, use the last 7 days. Days are `exam_sessions.exam_date`.
- "Today" means the last day of the range. If that day is still `live`, call it
  out as still open.

## Data (fets.online, project `ueufcqmdqtwvhjjyudeu`)

Exclude `no_show` candidates. Count from `candidate_events` (columns on
`candidates`, such as `called_at`, are cleared when a day closes).

1. **Per centre, per day, full process.** A candidate completed the full process when
   their events include all of: `candidate.checked_in`, `candidate.locker_issued`,
   `candidate.entered`, `candidate.assigned`, `exam.started`, `exam.finished`,
   `candidate.signed_out`.
2. **Last day's open items, per centre**, from `candidates.status` in that day's
   session: `testing`/`lab_entry`/`assigned` = exam finish not recorded;
   `completed` = finished but not signed out; any earlier step = left at that step;
   session still `live` = day not closed.
3. **Scorecard over the range:** sign-out recorded; materials issued and returned
   (`material.issued` / `material.returned`); phone, place and part present on the
   candidate; walkthroughs, problem reports and duty-block handover notes used.

Query shape (adapt the dates):

```sql
with base as (select c.name center, s.exam_date, k.id, k.status
  from candidates k join exam_sessions s on s.id=k.exam_session_id join centers c on c.id=s.center_id
  where s.exam_date between :from and :to and k.status<>'no_show'),
ev as (select b.*, array_agg(distinct e.event_type) t from base b
  left join candidate_events e on e.candidate_id=b.id group by b.center,b.exam_date,b.id,b.status)
select center, exam_date, count(*) total,
  count(*) filter (where t @> array['candidate.checked_in','candidate.locker_issued','candidate.entered',
    'candidate.assigned','exam.started','exam.finished','candidate.signed_out']::text[]) full_flow
from ev group by 1,2 order by 2,1;
```

Check every number against a second query before writing it down. Never round
a figure up into a better story, and never invent a measure the data does not hold.

## Writing rules (from the owner — follow exactly)

- **Open with the alert.** The first block is red and states the last day's gaps
  per centre in numbers. If the last day is the weakest, say so; if it is not,
  name the actual weakest day. Describe the trend honestly: do not claim a
  steady decline unless the numbers show one.
- **Short and precise.** Header, alert, day-by-day bars, one scorecard table,
  any note that is needed, "From tomorrow", footer. Nothing else.
- **No technical words.** Never mention the database, Supabase, sync, migration,
  code, bug fixes or system internals. Talk about taps, steps and records.
- **Do not include** a "why it matters" section or a "time saved" section.
- **"From tomorrow"** has only the sign-out and close-the-day asks unless the owner
  asks for more: record sign-out for every candidate up to the last one, and make
  sure "Close the day" goes through before leaving.
- **Staff responsibility.** When data was lost through staff action (for example
  refreshing a day's list from fets.live repeatedly), say so plainly and say what to
  do instead. Do not call it "fixed" and do not say lost data can be recovered
  when it cannot. Report the numbers actually on record, not credited estimates.
- Dates as "6 Oct". Centre names: Calicut, Cochin.

## Output

1. Write the page in the scratchpad, starting from `example-report.html` in this
   folder (same layout, tokens and print rules; replace every number and line).
   Keep `print-color-adjust: exact`.
2. Publish it as an Artifact (a new one per report, titled `FETS Floor Report`,
   description naming the date range). Remind the owner it is private until shared.
3. Render the PDF with the renderer in this folder, then send it with
   SendUserFile (`display: attach`). Keep the PDF out of the repository.

```bash
PW=$(npm root -g)/playwright node .claude/skills/floor-report/render-pdf.cjs \
  <report.html> <scratchpad>/FETS_Floor_Report_<range>.pdf <scratchpad>/preview.png
```

Look at `preview.png` once before sending.
