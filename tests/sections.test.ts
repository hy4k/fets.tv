import assert from "node:assert/strict";
import test from "node:test";
import { currentSection, sectionsFor } from "../lib/sections.ts";
import type { Candidate, CandidateSection, ProgrammeSection } from "../lib/types.ts";

const START = "2026-09-23T04:00:00Z";
const ms = (iso: string) => new Date(iso).getTime();

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: "c1",
    exam_session_id: "s1",
    center_id: "ct1",
    source_row: null,
    roster_number: "1",
    first_name: "A",
    last_name: "B",
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
    exam_started_at: START,
    exam_duration_minutes: 180,
    exam_expected_end: null,
    exam_finished_at: null,
    created_at: START,
    ...over,
  };
}

const plan: ProgrammeSection[] = [
  { id: "s1", programme_id: "p1", position: 1, name: "Tutorial", minutes: 5, kind: "tutorial", created_at: START },
  { id: "s2", programme_id: "p1", position: 2, name: "Listening", minutes: 50, kind: "section", created_at: START },
  { id: "s3", programme_id: "p1", position: 3, name: "Reading", minutes: 55, kind: "section", created_at: START },
];

function confirmed(over: Partial<CandidateSection>): CandidateSection {
  return {
    id: Math.random().toString(36).slice(2),
    candidate_id: "c1",
    center_id: "ct1",
    exam_session_id: "s1",
    programme_section_id: null,
    position: 1,
    name: "Tutorial",
    minutes: 5,
    kind: "tutorial",
    started_at: START,
    ended_at: null,
    note: null,
    recorded_by: null,
    created_at: START,
    ...over,
  };
}

test("the estimate runs from the candidate's own start, part after part", () => {
  const views = sectionsFor(candidate(), plan, []);
  assert.equal(views.length, 3);
  assert.equal(views[0].estimatedStart, ms("2026-09-23T04:00:00Z"));
  assert.equal(views[0].estimatedEnd, ms("2026-09-23T04:05:00Z"));
  assert.equal(views[1].estimatedStart, ms("2026-09-23T04:05:00Z"));
  assert.equal(views[1].estimatedEnd, ms("2026-09-23T04:55:00Z"));
  assert.equal(views[2].estimatedEnd, ms("2026-09-23T05:50:00Z"));
});

test("nothing is estimated for somebody who has not started", () => {
  assert.deepEqual(sectionsFor(candidate({ exam_started_at: null }), plan, []), []);
});

test("a confirmation records the drift against the plan", () => {
  const views = sectionsFor(candidate(), plan, [
    confirmed({ position: 2, name: "Listening", minutes: 50, kind: "section", started_at: "2026-09-23T04:17:00Z" }),
  ]);
  // Planned 04:05, actually 04:17 — twelve minutes late.
  assert.equal(views[1].driftMinutes, 12);
  assert.equal(views[0].driftMinutes, null);
});

test("a part confirmed early reads as negative drift, not as zero", () => {
  const views = sectionsFor(candidate(), plan, [
    confirmed({ position: 2, started_at: "2026-09-23T04:02:00Z", name: "Listening", minutes: 50 }),
  ]);
  assert.equal(views[1].driftMinutes, -3);
});

test("the observed name survives an edit to the plan", () => {
  const edited: ProgrammeSection[] = [
    { ...plan[0] },
    { ...plan[1], name: "Hearing", minutes: 99 },
    { ...plan[2] },
  ];
  const views = sectionsFor(candidate(), edited, [
    confirmed({ position: 2, name: "Listening", minutes: 50, kind: "section" }),
  ]);
  assert.equal(views[1].name, "Listening");
  assert.equal(views[1].minutes, 50);
});

test("the exam finishing closes the last part that was left open", () => {
  const views = sectionsFor(
    candidate({ exam_finished_at: "2026-09-23T06:02:00Z" }),
    plan,
    [
      confirmed({ position: 2, started_at: "2026-09-23T04:06:00Z", ended_at: "2026-09-23T05:00:00Z" }),
      confirmed({ position: 3, started_at: "2026-09-23T05:00:00Z" }),
    ],
  );
  assert.equal(views[2].actualEnd, ms("2026-09-23T06:02:00Z"));
  // and it does not reach back to one already closed
  assert.equal(views[1].actualEnd, ms("2026-09-23T05:00:00Z"));
});

test("an open part with no finish stays open rather than being invented", () => {
  const views = sectionsFor(candidate(), plan, [confirmed({ position: 3, started_at: "2026-09-23T05:00:00Z" })]);
  assert.equal(views[2].actualEnd, null);
});

test("what somebody confirmed beats where the clock thinks they are", () => {
  const views = sectionsFor(candidate(), plan, [
    confirmed({ position: 2, name: "Listening", started_at: "2026-09-23T04:06:00Z" }),
  ]);
  // The clock says Reading by now; the floor says they are still in Listening.
  const at = ms("2026-09-23T05:30:00Z");
  const current = currentSection(views, at);
  assert.equal(current?.section.name, "Listening");
  assert.equal(current?.confirmed, true);
});

test("with nothing confirmed it falls back to the plan, and says so", () => {
  const views = sectionsFor(candidate(), plan, []);
  const current = currentSection(views, ms("2026-09-23T04:30:00Z"));
  assert.equal(current?.section.name, "Listening");
  assert.equal(current?.confirmed, false);
});

test("past the end of the plan there is no current part", () => {
  const views = sectionsFor(candidate(), plan, []);
  assert.equal(currentSection(views, ms("2026-09-23T09:00:00Z")), null);
});

test("a part removed from the plan keeps the observation of it", () => {
  // The admin deleted Reading after somebody had already sat it.
  const shortened = plan.slice(0, 2);
  const views = sectionsFor(candidate(), shortened, [
    confirmed({ position: 3, name: "Reading", minutes: 55, kind: "section", started_at: "2026-09-23T05:04:00Z" }),
  ]);
  assert.equal(views.length, 3);
  assert.equal(views[2].name, "Reading");
  assert.equal(views[2].inPlan, false);
  assert.equal(views[0].inPlan, true);
});

test("a part still in the plan is marked as such", () => {
  const views = sectionsFor(candidate(), plan, []);
  assert.deepEqual(views.map((v) => v.inPlan), [true, true, true]);
});

test("an observation off the end of the plan still gets an estimate slot", () => {
  const views = sectionsFor(candidate(), plan.slice(0, 1), [
    confirmed({ position: 2, name: "Listening", minutes: 50, kind: "section" }),
  ]);
  // Tutorial 5 min from 04:00, then the observed Listening's own 50 minutes.
  assert.equal(views[1].estimatedStart, ms("2026-09-23T04:05:00Z"));
  assert.equal(views[1].estimatedEnd, ms("2026-09-23T04:55:00Z"));
});
