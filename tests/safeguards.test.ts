import assert from "node:assert/strict";
import test from "node:test";
import { howFar, nameTwins, namesClash, outsideSession } from "../lib/safeguards.ts";

const n = (first_name: string, last_name = "") => ({ first_name, last_name });

test("the incident pair is a name twin", () => {
  assert.ok(namesClash(n("Sana", "Nasrin"), n("Sana Nasrin", "Kulanagar veetiil sulaiman")));
  assert.ok(namesClash(n("SANA NASRIN"), n("sana", "nasrin kulanagar")));
});

test("same first two words, or a near spelling, is a twin", () => {
  assert.ok(namesClash(n("Fathima", "Rinsha K"), n("Fathima Rinsha", "P")));
  assert.ok(namesClash(n("Mohammed", "Ashraf"), n("Muhammed", "Ashraf")));
  assert.ok(namesClash(n("Anjali", "Menon"), n("Anjali", "Menon")));
});

test("different people who only share a first name are not twins", () => {
  assert.ok(!namesClash(n("Sana", "Fathima"), n("Sana", "Nasrin")));
  assert.ok(!namesClash(n("Arun"), n("Arun", "Kumar")));
  assert.ok(!namesClash(n("Rahul", "Das"), n("Rahim", "Das")));
});

test("nameTwins maps both sides and leaves the rest out", () => {
  const list = [
    { id: "a", ...n("Sana", "Nasrin") },
    { id: "b", ...n("Sana Nasrin", "Kulanagar veetiil sulaiman") },
    { id: "c", ...n("Joseph", "Mathew") },
  ];
  const twins = nameTwins(list);
  assert.deepEqual(twins.get("a")?.map((c) => c.id), ["b"]);
  assert.deepEqual(twins.get("b")?.map((c) => c.id), ["a"]);
  assert.equal(twins.has("c"), false);
});

test("a check-in more than an hour from the booking is questioned", () => {
  const now = Date.parse("2026-10-18T05:33:00Z"); // 11:03 IST
  assert.equal(outsideSession("2026-10-18T10:30:00Z", now), 297); // 4:00 PM IST
  assert.equal(outsideSession("2026-10-18T05:30:00Z", now), null); // 11:00 AM IST
  assert.equal(outsideSession("2026-10-18T04:00:00Z", now), -93);
  assert.equal(outsideSession(null, now), null);
});

test("howFar reads naturally", () => {
  assert.equal(howFar(300), "5 hours from now");
  assert.equal(howFar(297), "4 hours 57 minutes from now");
  assert.equal(howFar(-80), "1 hour 20 minutes ago");
});
