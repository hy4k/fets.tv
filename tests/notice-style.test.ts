import assert from "node:assert/strict";
import test from "node:test";
import { cleanStyle, isLight } from "../lib/notice-style.ts";

test("only known style choices survive", () => {
  assert.deepEqual(
    cleanStyle({ font: "display", size: "xl", color: "#F6D68B", background: "aurora", shape: "soft", align: "left", bold: true }),
    { font: "display", size: "xl", color: "#f6d68b", background: "aurora", shape: "soft", align: "left", bold: true },
  );
  assert.deepEqual(cleanStyle({ font: "comic", size: "huge", color: "red", background: "url(x)", evil: 1 }), {});
  assert.deepEqual(cleanStyle(null), {});
  // "By tone" is the absence of a background, not a background.
  assert.deepEqual(cleanStyle({ background: "tone" }), {});
});

test("light colours are told apart from dark ones", () => {
  assert.equal(isLight("#f5f2ec"), true);
  assert.equal(isLight("#1a1a1f"), false);
  assert.equal(isLight(undefined), false);
});
