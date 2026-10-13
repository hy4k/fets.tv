import assert from "node:assert/strict";
import test from "node:test";
import { callAnnouncement, HOME_DEFAULTS, homeView, visiblePieces } from "../lib/home-screen.ts";

const floor = { exams: [], seats_total: 20, seats_in_use: 5, seats_free: 15 };

test("never saved: the room, no welcome, standard wording", () => {
  const v = homeView(null, "Calicut");
  assert.equal(v.showWelcome, false);
  assert.equal(v.showSeats, true);
  assert.equal(v.earlyText, HOME_DEFAULTS.early_text);
  assert.equal(v.callSound, "voice");
  assert.deepEqual(visiblePieces(v, floor), { welcome: false, lines: false, seats: true, exams: true, early: true, any: true });
});

test("a row saved before the switches keeps its old look", () => {
  const welcomeOnly = homeView({ layout: "welcome", title: "Hello", subtitle: "", show_exams: true, show_early: true });
  assert.equal(welcomeOnly.showWelcome, true);
  assert.equal(welcomeOnly.showSeats, false);
  assert.equal(welcomeOnly.showExams, false);
  assert.equal(welcomeOnly.showEarly, false);
  const roomOnly = homeView({ layout: "room", title: "", subtitle: "", show_exams: false, show_early: true });
  assert.equal(roomOnly.showWelcome, false);
  assert.equal(roomOnly.showExams, false);
  assert.equal(roomOnly.showEarly, true);
});

test("each piece follows its own switch and wording", () => {
  const v = homeView(
    {
      layout: "both",
      title: "",
      subtitle: "",
      show_welcome: true,
      show_seats: false,
      show_exams: true,
      show_early: false,
      exams_label: "Now sitting",
      lines: ["  Lockers on the left ", "", "Water by the window"],
    },
    "Cochin",
  );
  assert.equal(v.title, "Welcome to FETS Cochin");
  assert.equal(v.examsLabel, "Now sitting");
  assert.deepEqual(v.lines, ["Lockers on the left", "Water by the window"]);
  const p = visiblePieces(v, floor);
  assert.equal(p.seats, false);
  assert.equal(p.early, false);
  assert.equal(p.exams, true);
});

test("everything off shows nothing; no seats set up hides the seat pieces", () => {
  const off = homeView({ layout: "room", title: "", subtitle: "", show_welcome: false, show_seats: false, show_exams: false, show_early: false });
  assert.equal(visiblePieces(off, floor).any, false);
  const noSeats = visiblePieces(homeView(null), { ...floor, seats_total: 0, seats_free: 0, seats_in_use: 0 });
  assert.equal(noSeats.seats, false);
  assert.equal(noSeats.early, false);
});

test("the spoken call reads the name in plain case and the room in words", () => {
  assert.equal(
    callAnnouncement({ name: "SHEZIN ASHIQUE", room: "Security & Biometrics" }),
    "Shezin Ashique. Please proceed to Security and Biometrics.",
  );
  assert.equal(callAnnouncement({ name: "anu o'neil", room: "Frisking · Gate 1" }), "Anu O'Neil. Please proceed to Frisking, Gate 1.");
  assert.equal(callAnnouncement({ name: "Ravi", room: null }), "Ravi. Please proceed.");
  assert.equal(callAnnouncement({ name: null, room: "Gate" }), null);
});
