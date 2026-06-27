import test from "node:test";
import assert from "node:assert/strict";
import {
  createIndexExport,
  mergeRecentRecords,
  mergeRecordsByUrl,
  parseIndexExport,
  sanitizeRecord
} from "../src/shared/importExport.js";

test("creates and parses index export without raw email", () => {
  const exported = createIndexExport("email-sha256:abc", [
    {
      accountId: "email-sha256:abc",
      url: "https://chatgpt.com/c/1",
      title: "One",
      order: 0,
      syncedAt: 10
    }
  ], "2026-01-01T00:00:00.000Z");

  const parsed = parseIndexExport(JSON.stringify(exported));
  assert.equal(parsed.accountId, "email-sha256:abc");
  assert.equal(JSON.stringify(parsed).includes("@"), false);
});

test("merges imported records by URL and keeps newer title", () => {
  const merged = mergeRecordsByUrl(
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "Old title",
        order: 0,
        syncedAt: 1
      }
    ],
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "Renamed title",
        order: 0,
        syncedAt: 2
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, "Renamed title");
});

test("keeps existing imported record when incoming duplicate is older", () => {
  const merged = mergeRecordsByUrl(
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "Current title",
        order: 3,
        syncedAt: 10
      }
    ],
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "Stale title",
        order: 0,
        syncedAt: 2
      }
    ]
  );

  assert.equal(merged[0].title, "Current title");
});

test("rejects malformed exports", () => {
  assert.throws(() => parseIndexExport({ kind: "other", version: 1, records: [] }), /not a ChatGPT/);
  assert.throws(() => parseIndexExport({ kind: "chatgpt-conversation-search-index", version: 999, records: [] }), /Unsupported/);
  assert.throws(() => parseIndexExport({ kind: "chatgpt-conversation-search-index", version: 1 }), /missing records/);
  assert.throws(() => parseIndexExport("{bad json"), SyntaxError);
});

test("sanitizes record fields and rejects missing required values", () => {
  const sanitized = sanitizeRecord({
    accountId: 123,
    url: "https://chatgpt.com/c/1",
    title: "Title",
    order: Number.NaN,
    syncedAt: Number.NaN
  });

  assert.equal(sanitized.accountId, "123");
  assert.equal(sanitized.order, 0);
  assert.equal(Number.isFinite(sanitized.syncedAt), true);
  assert.throws(() => sanitizeRecord({ accountId: "id:user" }), /missing required/);
});

test("merges recent records at the top and preserves older order", () => {
  const merged = mergeRecentRecords(
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/known-1",
        title: "Known one",
        order: 0,
        syncedAt: 10
      },
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/known-2",
        title: "Known two",
        order: 1,
        syncedAt: 10
      }
    ],
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/new-1",
        title: "New one",
        order: 0,
        syncedAt: 20
      },
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/new-2",
        title: "New two",
        order: 1,
        syncedAt: 20
      }
    ]
  );

  assert.deepEqual(merged.map((record) => record.url), [
    "https://chatgpt.com/c/new-1",
    "https://chatgpt.com/c/new-2",
    "https://chatgpt.com/c/known-1",
    "https://chatgpt.com/c/known-2"
  ]);
  assert.deepEqual(merged.map((record) => record.order), [0, 1, 2, 3]);
});

test("recent merge promotes an existing conversation with the newer title", () => {
  const merged = mergeRecentRecords(
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "Old title",
        order: 5,
        syncedAt: 10
      },
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/2",
        title: "Second",
        order: 6,
        syncedAt: 10
      }
    ],
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "New title",
        order: 0,
        syncedAt: 20
      }
    ]
  );

  assert.deepEqual(merged.map((record) => record.title), ["New title", "Second"]);
  assert.deepEqual(merged.map((record) => record.order), [0, 1]);
});

test("recent merge dedupes incoming records by newest synced time", () => {
  const merged = mergeRecentRecords(
    [],
    [
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "Older duplicate",
        order: 0,
        syncedAt: 10
      },
      {
        accountId: "id:user",
        url: "https://chatgpt.com/c/1",
        title: "Newer duplicate",
        order: 1,
        syncedAt: 20
      }
    ]
  );

  assert.deepEqual(merged.map((record) => record.title), ["Newer duplicate"]);
  assert.deepEqual(merged.map((record) => record.order), [0]);
});
