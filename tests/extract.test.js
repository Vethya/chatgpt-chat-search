import test from "node:test";
import assert from "node:assert/strict";
import {
  extractConversationRecordsFromAnchors,
  normalizeConversationUrl
} from "../src/shared/extract.js";

function anchor(href, text, attrs = {}) {
  return {
    href,
    textContent: text,
    getAttribute(name) {
      if (name === "href") return href;
      return attrs[name] || null;
    }
  };
}

test("extracts unique conversation title records from anchors", () => {
  const records = extractConversationRecordsFromAnchors(
    [
      anchor("/c/abc-123", "First conversation"),
      anchor("https://chatgpt.com/c/def-456?model=gpt-5", "Second conversation"),
      anchor("/c/abc-123", "Duplicate"),
      anchor("/gpts", "Explore GPTs")
    ],
    "id:user-1",
    123,
    "https://chatgpt.com"
  );

  assert.deepEqual(records, [
    {
      accountId: "id:user-1",
      url: "https://chatgpt.com/c/abc-123",
      title: "First conversation",
      order: 0,
      syncedAt: 123
    },
    {
      accountId: "id:user-1",
      url: "https://chatgpt.com/c/def-456",
      title: "Second conversation",
      order: 1,
      syncedAt: 123
    }
  ]);
});

test("normalizes only conversation URLs", () => {
  assert.equal(normalizeConversationUrl("/c/abc", "https://chatgpt.com"), "https://chatgpt.com/c/abc");
  assert.equal(normalizeConversationUrl("/settings", "https://chatgpt.com"), null);
});
