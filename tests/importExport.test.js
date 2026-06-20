import test from "node:test";
import assert from "node:assert/strict";
import { createIndexExport, mergeRecordsByUrl, parseIndexExport } from "../src/shared/importExport.js";

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
