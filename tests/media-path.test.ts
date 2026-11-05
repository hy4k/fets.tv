import assert from "node:assert/strict";
import test from "node:test";
import { buildMediaPath, centreOf, extOf, isMediaPath, mediaUrl, parseRange } from "../lib/media-path.ts";

const centre = "01610931-51f3-4391-a5c7-31bcd5ae4bfd";
const id = "6c3829c0-5c85-4e03-9240-e9a04de754fa";

test("paths the app makes are accepted, in the centre's folder or its slides folder", () => {
  const notice = buildMediaPath(centre, "notices", id, "webp");
  const slide = buildMediaPath(centre, "slides", id, "mp4");
  assert.equal(notice, `${centre}/${id}.webp`);
  assert.equal(slide, `${centre}/slides/${id}.mp4`);
  assert.ok(isMediaPath(notice));
  assert.ok(isMediaPath(slide));
  assert.equal(centreOf(slide), centre);
  assert.equal(extOf(slide), "mp4");
});

test("anything else is refused: climbing out, other folders, other types, old Supabase names", () => {
  for (const bad of [
    `${centre}/../${id}.webp`,
    `../${centre}/${id}.webp`,
    `${centre}/other/${id}.webp`,
    `${centre}/${id}.svg`,
    `${centre}/${id}.html`,
    `${centre}/slides/${id}-Gemini_Generated_Image.png`,
    `${centre}/${id}.webp/`,
    `/${centre}/${id}.webp`,
    `${centre.toUpperCase()}/${id}.webp`,
    "",
  ]) {
    assert.equal(isMediaPath(bad), false, bad);
    assert.equal(mediaUrl(bad), null, bad);
  }
  assert.equal(isMediaPath(null), false);
  assert.equal(mediaUrl(undefined), null);
});

test("the browser's address is the app's own /media route", () => {
  assert.equal(mediaUrl(`${centre}/${id}.webp`), `/media/${centre}/${id}.webp`);
});

test("a video player's ranges are honoured, and impossible ones refused", () => {
  assert.equal(parseRange(null, 1000), null);
  assert.deepEqual(parseRange("bytes=0-", 1000), { start: 0, end: 999 });
  assert.deepEqual(parseRange("bytes=100-199", 1000), { start: 100, end: 199 });
  assert.deepEqual(parseRange("bytes=900-5000", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-100", 1000), { start: 900, end: 999 });
  assert.deepEqual(parseRange("bytes=-5000", 1000), { start: 0, end: 999 });
  assert.equal(parseRange("bytes=1000-", 1000), "invalid");
  assert.equal(parseRange("bytes=200-100", 1000), "invalid");
  assert.equal(parseRange("bytes=-0", 1000), "invalid");
  assert.equal(parseRange("bytes=-", 1000), "invalid");
  assert.equal(parseRange("bytes=0-1,5-6", 1000), "invalid");
  assert.equal(parseRange("items=0-1", 1000), "invalid");
});
