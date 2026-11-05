import { test } from "node:test";
import assert from "node:assert/strict";
import { clearSignedUrlCache, stableSignedUrls } from "../lib/signed-url-cache.ts";

function fakeClient() {
  let n = 0;
  const calls: string[][] = [];
  return {
    calls,
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => {
          calls.push(paths);
          return { data: paths.map((p) => ({ path: p, signedUrl: `${p}?token=${++n}` })), error: null };
        },
      }),
    },
  };
}

test("the same link is handed out again while it has more than half its life left", async () => {
  clearSignedUrlCache();
  const db = fakeClient();
  const a = await stableSignedUrls(db, "b", ["x.png"], 3600, 0);
  const b = await stableSignedUrls(db, "b", ["x.png", "y.png"], 3600, 60_000);
  assert.equal(b.get("x.png"), a.get("x.png"));
  assert.deepEqual(db.calls, [["x.png"], ["y.png"]]);
});

test("a link past half its life is signed afresh", async () => {
  clearSignedUrlCache();
  const db = fakeClient();
  const a = await stableSignedUrls(db, "b", ["x.png"], 3600, 0);
  const b = await stableSignedUrls(db, "b", ["x.png"], 3600, 1_801_000);
  assert.notEqual(b.get("x.png"), a.get("x.png"));
});
