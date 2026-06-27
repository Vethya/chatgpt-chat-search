import test from "node:test";
import assert from "node:assert/strict";
import { normalizeText, scoreTitle, searchConversations } from "../src/shared/search.js";

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

test("normalizes accents and punctuation", () => {
  assert.equal(normalizeText("Résumé: GPT-5!"), "resume gpt 5");

  const [first] = searchConversations([
    { title: "Resume GPT 5 notes", url: "https://chatgpt.com/c/4", order: 0 }
  ], "résumé");

  assert.equal(first.record.title, "Resume GPT 5 notes");
});

test("exact title matches outrank typo matches", () => {
  const results = searchConversations([
    { title: "Chorme", url: "https://chatgpt.com/c/4", order: 0 },
    { title: "Chrome", url: "https://chatgpt.com/c/5", order: 1 }
  ], "chrome");

  assert.equal(results[0].record.url, "https://chatgpt.com/c/5");
});

test("scores acronym and subsequence matches", () => {
  assert.equal(scoreTitle("Create Pull Request", "cpr") > 0, true);
  assert.equal(scoreTitle("Chrome extension", "cex") > 0, true);
});

test("respects limits and places records without order last", () => {
  const results = searchConversations([
    { title: "Alpha", url: "https://chatgpt.com/c/a" },
    { title: "Beta", url: "https://chatgpt.com/c/b", order: 0 },
    { title: "Gamma", url: "https://chatgpt.com/c/c", order: 1 }
  ], "", 2);

  assert.deepEqual(results.map((result) => result.record.title), ["Beta", "Gamma"]);
});
