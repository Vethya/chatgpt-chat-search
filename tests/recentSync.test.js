import test from "node:test";
import assert from "node:assert/strict";

import {
  RECENT_KNOWN_STOP_THRESHOLD,
  rememberRecentVisibleRecords
} from "../src/shared/recentSync.js";

test("recent sync does not stop at the first known conversation", () => {
  const foundByUrl = new Map();
  const knownUrls = new Set(["https://chatgpt.com/c/known"]);
  const visitedUrls = new Set();

  const result = rememberRecentVisibleRecords(
    [
      record("known", "Known"),
      record("new", "New from mobile")
    ],
    foundByUrl,
    knownUrls,
    visitedUrls,
    0
  );

  assert.equal(result.hitKnownLimit, false);
  assert.equal(result.consecutiveKnownCount, 0);
  assert.deepEqual([...foundByUrl.values()].map((item) => item.title), ["New from mobile"]);
});

test("recent sync stops after ten distinct known conversations in a row", () => {
  const foundByUrl = new Map();
  const knownUrls = new Set(
    Array.from({ length: RECENT_KNOWN_STOP_THRESHOLD }, (_, index) => `https://chatgpt.com/c/known-${index}`)
  );
  const visitedUrls = new Set();

  const result = rememberRecentVisibleRecords(
    Array.from({ length: RECENT_KNOWN_STOP_THRESHOLD }, (_, index) => record(`known-${index}`, `Known ${index}`)),
    foundByUrl,
    knownUrls,
    visitedUrls,
    0
  );

  assert.equal(result.hitKnownLimit, true);
  assert.equal(result.consecutiveKnownCount, RECENT_KNOWN_STOP_THRESHOLD);
  assert.equal(foundByUrl.size, 0);
});

test("recent sync ignores repeated visible known conversations", () => {
  const foundByUrl = new Map();
  const knownUrls = new Set(["https://chatgpt.com/c/known"]);
  const visitedUrls = new Set();

  let result = rememberRecentVisibleRecords(
    [record("known", "Known")],
    foundByUrl,
    knownUrls,
    visitedUrls,
    0
  );
  result = rememberRecentVisibleRecords(
    [record("known", "Known")],
    foundByUrl,
    knownUrls,
    visitedUrls,
    result.consecutiveKnownCount
  );

  assert.equal(result.hitKnownLimit, false);
  assert.equal(result.consecutiveKnownCount, 1);
});

function record(id, title) {
  return {
    accountId: "id:user",
    url: `https://chatgpt.com/c/${id}`,
    title,
    order: 0,
    syncedAt: 20
  };
}
