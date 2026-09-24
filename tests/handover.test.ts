import assert from "node:assert/strict";
import test from "node:test";
import { handoverState, isQuiet } from "../lib/handover.ts";
import type {
  Candidate,
  CandidateBreak,
  CandidateMaterial,
  Incident,
  Walkthrough,
  Workstation,
} from "../lib/types.ts";

const NOW = new Date("2026-09-23T05:00:00Z").getTime();
const at = (iso: string) => new Date(iso).getTime();

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: "c1",
    exam_session_id: "s1",
    center_id: "ct1",
    source_row: null,
    roster_number: "1",
    first_name: "Asha",
    last_name: "Menon",
    part: null,
    phone: null,
    place: null,
    roster_flag: null,
    public_token: "C-1",
    status: "testing",
    scheduled_at: null,
    arrival_at: null,
    id_verified_at: null,
    check_in_at: null,
    locker_key: null,
    called_at: null,
    frisked_at: null,
    biometrics_at: null,
    workstation_id: null,
    lab_entry_at: null,
    testing_started_at: null,
    completed_at: null,
    signed_out_at: null,
    programme_id: "p1",
    exam_started_at: null,
    exam_duration_minutes: null,
    exam_expected_end: null,
    exam_finished_at: null,
    created_at: "2026-09-23T03:00:00Z",
    ...over,
  };
}

function material(over: Partial<CandidateMaterial> = {}): CandidateMaterial {
  return {
    id: "m1",
    center_id: "ct1",
    exam_session_id: "s1",
    candidate_id: "c1",
    kind: "scratch_sheet",
    label: "",
    issued_count: 2,
    returned_count: 0,
    written_off_count: 0,
    written_off_at: null,
    written_off_reason: null,
    first_issued_at: "2026-09-23T04:10:00Z",
    last_issued_at: "2026-09-23T04:10:00Z",
    issued_by: null,
    returned_at: null,
    returned_by: null,
    ...over,
  };
}

function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "i1",
    center_id: "ct1",
    exam_session_id: "s1",
    kind: "workstation",
    severity: "major",
    summary: "Seat 6 screen flickering",
    detail: null,
    candidate_id: null,
    workstation_id: null,
    started_at: "2026-09-23T04:30:00Z",
    resolved_at: null,
    resolution: null,
    minutes_lost: null,
    reportable: true,
    logged_by: null,
    resolved_by: null,
    created_at: "2026-09-23T04:30:00Z",
    ...over,
  };
}

function walk(over: Partial<Walkthrough> = {}): Walkthrough {
  return {
    id: "w1",
    center_id: "ct1",
    exam_session_id: "s1",
    duty_block_id: null,
    post_id: null,
    walked_by: null,
    walked_by_name: "Aysha",
    walked_at: "2026-09-23T04:55:00Z",
    note: null,
    kind: "floor",
    created_at: "2026-09-23T04:55:00Z",
    ...over,
  };
}

const station = (id: string, seat: string): Workstation => ({
  id,
  center_id: "ct1",
  lab_id: "l1",
  lab_name: "Lab 1",
  seat_code: seat,
  status: "active",
  current_candidate_id: null,
});

function run(over: Partial<Parameters<typeof handoverState>[0]> = {}, now = NOW) {
  return handoverState(
    {
      candidates: [],
      incidents: [],
      materials: [],
      materialKinds: [
        { code: "scratch_sheet", label: "Scratch sheet", returnable: true, active: true, sort_order: 1 },
        { code: "pencil", label: "Pencil", returnable: true, active: true, sort_order: 2 },
      ],
      openBreaks: [],
      walkthroughs: [],
      workstations: [],
      walkthroughMinutes: 10,
      timezone: "UTC",
      ...over,
    },
    now,
  );
}

test("a room with nothing in it reads as quiet", () => {
  const s = run();
  assert.equal(isQuiet(s), true);
  assert.equal(s.lastWalk, null);
  assert.equal(s.walkOverdueMinutes, null);
});

test("only candidates mid-exam count as seated", () => {
  const s = run({
    candidates: [
      candidate({ id: "a", exam_started_at: "2026-09-23T04:00:00Z" }),
      candidate({ id: "b", exam_started_at: "2026-09-23T04:00:00Z", exam_finished_at: "2026-09-23T04:50:00Z", status: "completed" }),
      candidate({ id: "c", status: "waiting" }),
      candidate({ id: "d", status: "scheduled" }),
    ],
  });

  assert.deepEqual(
    s.seated.map((x) => x.id),
    ["a"],
  );
  assert.equal(s.inProcess, 1);
  assert.equal(s.notArrived, 1);
  assert.equal(s.awaitingSignOut, 1);
  assert.equal(isQuiet(s), false);
});

test("the seat comes from the workstation, and whoever finishes first is listed first", () => {
  const s = run({
    workstations: [station("w1", "L1-06"), station("w2", "L1-11")],
    candidates: [
      candidate({
        id: "late",
        public_token: "C-2",
        workstation_id: "w2",
        exam_started_at: "2026-09-23T04:00:00Z",
        exam_expected_end: "2026-09-23T07:00:00Z",
      }),
      candidate({
        id: "soon",
        workstation_id: "w1",
        exam_started_at: "2026-09-23T04:00:00Z",
        exam_expected_end: "2026-09-23T05:30:00Z",
      }),
    ],
  });

  assert.deepEqual(
    s.seated.map((x) => x.id),
    ["soon", "late"],
  );
  assert.equal(s.seated[0].seat, "L1-06");
  assert.equal(s.seated[0].endsAt, at("2026-09-23T05:30:00Z"));
  assert.equal(s.seated[0].name, "Asha Menon");
});

test("with no expected end the duration is used, and with neither the clock is unknown and sorts last", () => {
  const s = run({
    candidates: [
      candidate({ id: "nodur", exam_started_at: "2026-09-23T04:00:00Z" }),
      candidate({
        id: "dur",
        exam_started_at: "2026-09-23T04:00:00Z",
        exam_duration_minutes: 180,
      }),
    ],
  });

  assert.deepEqual(
    s.seated.map((x) => x.id),
    ["dur", "nodur"],
  );
  assert.equal(s.seated[0].endsAt, at("2026-09-23T07:00:00Z"));
  assert.equal(s.seated[1].endsAt, null);
});

test("a break shows against the person who is on it, and nobody else", () => {
  const brk: CandidateBreak = {
    id: "b1",
    candidate_id: "a",
    center_id: "ct1",
    kind: "unscheduled",
    started_at: "2026-09-23T04:48:00Z",
    ended_at: null,
    authorised_by: null,
    reason: null,
    created_at: "2026-09-23T04:48:00Z",
  };

  const s = run({
    openBreaks: [brk],
    candidates: [
      candidate({ id: "a", exam_started_at: "2026-09-23T04:00:00Z", exam_duration_minutes: 60 }),
      candidate({ id: "z", exam_started_at: "2026-09-23T04:00:00Z", exam_duration_minutes: 90 }),
    ],
  });

  assert.equal(s.seated[0].onBreak, true);
  assert.equal(s.seated[0].breakSince, at("2026-09-23T04:48:00Z"));
  assert.equal(s.seated[1].onBreak, false);
  assert.equal(s.seated[1].breakSince, null);
});

test("only what is still held is outstanding, and returned or written-off is not", () => {
  const s = run({
    candidates: [candidate({ id: "c1", public_token: "C-9" })],
    materials: [
      material({ id: "held", issued_count: 3, returned_count: 1 }),
      material({ id: "back", kind: "pencil", issued_count: 1, returned_count: 1 }),
      material({ id: "gone", kind: "water", issued_count: 1, written_off_count: 1 }),
    ],
  });

  assert.equal(s.materialsOut.length, 1);
  assert.deepEqual(s.materialsOut[0], {
    token: "C-9",
    name: "Asha Menon",
    label: "Scratch sheet",
    count: 2,
  });
});

test("a free-text material is named by its label, not its kind", () => {
  const s = run({
    candidates: [candidate({ id: "c1" })],
    materials: [material({ kind: "other", label: "Calculator", issued_count: 1 })],
  });
  assert.equal(s.materialsOut[0].label, "Calculator");
});

test("resolved incidents are not handed over; open ones are, newest first", () => {
  const s = run({
    incidents: [
      incident({ id: "old", started_at: "2026-09-23T04:00:00Z" }),
      incident({ id: "done", resolved_at: "2026-09-23T04:40:00Z" }),
      incident({ id: "new", started_at: "2026-09-23T04:50:00Z" }),
    ],
  });

  assert.deepEqual(
    s.openIncidents.map((i) => i.id),
    ["new", "old"],
  );
});

test("the walk is overdue by the minutes past the interval, and in hand reads as a negative", () => {
  const late = run({ walkthroughs: [walk({ walked_at: "2026-09-23T04:43:00Z" })] });
  assert.equal(late.walkOverdueMinutes, 7);

  const fine = run({ walkthroughs: [walk({ walked_at: "2026-09-23T04:56:00Z" })] });
  assert.equal(fine.walkOverdueMinutes, -6);
  assert.equal(fine.lastWalk?.walked_by_name, "Aysha");
});

test("an open incident alone is enough to make a room not quiet", () => {
  assert.equal(isQuiet(run({ incidents: [incident()] })), false);
  assert.equal(isQuiet(run({ incidents: [incident({ resolved_at: "2026-09-23T04:40:00Z" })] })), true);
});

test("candidates not yet arrived do not on their own make a handover", () => {
  const s = run({ candidates: [candidate({ status: "scheduled" }), candidate({ id: "x", status: "no_show" })] });
  assert.equal(s.notArrived, 1);
  assert.equal(isQuiet(s), true);
});

test("a timestamp that will not parse becomes null rather than an Invalid Date", () => {
  const s = run({
    openBreaks: [
      {
        id: "b1",
        candidate_id: "a",
        center_id: "ct1",
        kind: "unscheduled",
        started_at: "not a date",
        ended_at: null,
        authorised_by: null,
        reason: null,
        created_at: "2026-09-23T04:48:00Z",
      },
    ],
    candidates: [
      candidate({ id: "a", exam_started_at: "2026-09-23T04:00:00Z", exam_expected_end: "also not a date" }),
    ],
  });

  assert.equal(s.seated[0].onBreak, true);
  assert.equal(s.seated[0].breakSince, null);
  assert.equal(s.seated[0].endsAt, null);
});

test("yesterday's last walk is not today's", () => {
  const s = run({
    walkthroughs: [
      walk({ id: "yesterday", walked_at: "2026-09-22T18:00:00Z" }),
      walk({ id: "earlier", walked_at: "2026-09-22T17:00:00Z" }),
    ],
  });
  assert.equal(s.lastWalk, null);
  assert.equal(s.walkOverdueMinutes, null);
});

test("today's newest walk is the one reported, ahead of yesterday's", () => {
  const s = run({
    walkthroughs: [
      walk({ id: "today", walked_at: "2026-09-23T04:52:00Z" }),
      walk({ id: "yesterday", walked_at: "2026-09-22T18:00:00Z" }),
    ],
  });
  assert.equal(s.lastWalk?.id, "today");
  assert.equal(s.walkOverdueMinutes, -2);
});

test("the day is the centre's, not the server's", () => {
  // 23:30 UTC on the 22nd is 05:00 on the 23rd in Calicut and 19:30 on the
  // 22nd in New York, so the same walk is today's in one and yesterday's in
  // the other. The clock is 09:30 and 00:00 respectively.
  const w = [walk({ walked_at: "2026-09-22T23:30:00Z" })];
  const now = new Date("2026-09-23T04:00:00Z").getTime();

  assert.equal(run({ walkthroughs: w, timezone: "Asia/Kolkata" }, now).lastWalk?.id, "w1");
  assert.equal(run({ walkthroughs: w, timezone: "America/New_York" }, now).lastWalk, null);
});

test("a DVR check is not a walk of the floor, however recent", () => {
  const s = run({
    walkthroughs: [
      walk({ id: "dvr", kind: "dvr", walked_at: "2026-09-23T04:58:00Z" }),
      walk({ id: "floor", walked_at: "2026-09-23T04:52:00Z" }),
    ],
  });
  assert.equal(s.lastWalk?.id, "floor");
});
