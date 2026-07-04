import test from "node:test";
import assert from "node:assert/strict";
import { isSearchSurfaceUrl } from "../src/shared/routes.js";

test("recognizes ChatGPT routes where the search surface belongs", () => {
  assert.equal(isSearchSurfaceUrl("https://chatgpt.com/"), true);
  assert.equal(isSearchSurfaceUrl("https://chatgpt.com/c/abc-123?model=gpt-5"), true);
  assert.equal(isSearchSurfaceUrl("https://chatgpt.com/projects/betterdim"), true);
});

test("rejects non-search ChatGPT routes", () => {
  assert.equal(isSearchSurfaceUrl("https://chatgpt.com/codex/settings"), false);
  assert.equal(isSearchSurfaceUrl("https://chatgpt.com/settings"), false);
  assert.equal(isSearchSurfaceUrl("https://example.com/c/abc-123"), false);
});
