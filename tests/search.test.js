import test from "node:test";
import assert from "node:assert/strict";
import { searchConversations } from "../src/shared/search.js";

const records = [
  { title: "Building a Chrome extension", url: "https://chatgpt.com/c/1", order: 3 },
  { title: "IndexedDB schema migrations", url: "https://chatgpt.com/c/2", order: 1 },
  { title: "Conversation search ranking", url: "https://chatgpt.com/c/3", order: 2 }
];

test("fuzzy search tolerates partial words", () => {
  const [first] = searchConversations(records, "indx mig");
  assert.equal(first.record.title, "IndexedDB schema migrations");
});

test("fuzzy search tolerates a small typo", () => {
  const [first] = searchConversations(records, "conversaton");
  assert.equal(first.record.title, "Conversation search ranking");
});

test("empty search returns sidebar order", () => {
  const results = searchConversations(records, "");
  assert.deepEqual(results.map((result) => result.record.title), [
    "IndexedDB schema migrations",
    "Conversation search ranking",
    "Building a Chrome extension"
  ]);
});
