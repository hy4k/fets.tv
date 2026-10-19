import assert from "node:assert/strict";
import test from "node:test";
import { correctionRequest } from "../lib/live-corrections.ts";

const row = {
  id: "c1",
  roster_number: " 8890000003480889 ",
  live_provider: "PROMETRIC",
  exam_date: "2026-10-19",
  center_name: "Calicut",
  full_name: "Sana Nasrin Kulanagar veetiil sulaiman",
  phone: "9847000000",
  place: "Malappuram",
  part: null,
};

test("a correction finds the fets.live record by centre, day, provider and number", () => {
  const r = correctionRequest(row)!;
  assert.equal(r.query.get("branch_location"), "eq.calicut");
  assert.equal(r.query.get("roster_number"), "eq.8890000003480889");
  assert.equal(r.query.get("client_name"), "ilike.PROMETRIC");
  assert.equal(r.query.get("and"), "(exam_date.gte.2026-10-19T00:00:00+05:30,exam_date.lt.2026-10-20T00:00:00+05:30)");
});

test("only details with a value are sent; place goes to fets.live's address", () => {
  assert.deepEqual(correctionRequest(row)!.body, {
    full_name: "Sana Nasrin Kulanagar veetiil sulaiman",
    phone: "9847000000",
    address: "Malappuram",
  });
});

test("a candidate that cannot be matched, or has nothing to send, is skipped", () => {
  assert.equal(correctionRequest({ ...row, center_name: "Bangalore" }), null);
  assert.equal(correctionRequest({ ...row, roster_number: "  " }), null);
  assert.equal(correctionRequest({ ...row, full_name: null, phone: " ", place: null, part: null }), null);
});
