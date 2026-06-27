import test from "node:test";
import assert from "node:assert/strict";
import {
  extractConversationRecordsFromAnchors,
  extractConversationRecordsFromDocument,
  hasConversationLinks,
  normalizeConversationUrl
} from "../src/shared/extract.js";

function anchor(href, text, attrs = {}) {
  return {
    href: attrs.resolvedHref || href,
    textContent: text,
    getAttribute(name) {
      if (name === "href") return href;
      return attrs[name] || null;
    },
    closest() {
      return null;
    },
    getBoundingClientRect() {
      return attrs.hidden
        ? { width: 0, height: 0 }
        : { width: 120, height: 24 };
    },
    ownerDocument: {
      defaultView: {
        getComputedStyle() {
          return { display: "block", visibility: "visible" };
        }
      }
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
  assert.equal(normalizeConversationUrl("#content", "https://chatgpt.com/c/abc"), null);
  assert.equal(normalizeConversationUrl("http://[", "https://chatgpt.com"), null);
  assert.equal(normalizeConversationUrl("https://chatgpt.com/c/abc/share", "https://chatgpt.com"), "https://chatgpt.com/c/abc");
});

test("extracts project conversation links when they are visible", () => {
  const records = extractConversationRecordsFromAnchors(
    [
      anchor("/projects/betterdim", "BetterDim"),
      anchor("/c/project-1", "Set app name"),
      anchor("/c/project-2", "Free Version Features")
    ],
    "id:user-1",
    456,
    "https://chatgpt.com"
  );

  assert.deepEqual(records.map((record) => record.title), ["Set app name", "Free Version Features"]);
});

test("skips generic accessibility links before the real conversation title", () => {
  const records = extractConversationRecordsFromAnchors(
    [
      anchor("/c/abc-123", "Skip to main content"),
      anchor("/c/abc-123", "Skip to content"),
      anchor("/c/abc-123", "Skip directly to content"),
      anchor("/c/abc-123", "Actual chat title")
    ],
    "id:user-1",
    789,
    "https://chatgpt.com"
  );

  assert.deepEqual(records.map((record) => record.title), ["Actual chat title"]);
});

test("ignores hash-only skip links that resolve to the current conversation URL", () => {
  const records = extractConversationRecordsFromAnchors(
    [
      anchor("#content", "Skip to content", {
        resolvedHref: "https://chatgpt.com/c/abc-123#content"
      }),
      anchor("/c/abc-123", "Actual chat title")
    ],
    "id:user-1",
    789,
    "https://chatgpt.com/c/abc-123"
  );

  assert.deepEqual(records.map((record) => record.title), ["Actual chat title"]);
});

test("can require visible conversation anchors", () => {
  const records = extractConversationRecordsFromAnchors(
    [
      anchor("/c/hidden", "Hidden chat", { hidden: true }),
      anchor("/c/visible", "Visible chat")
    ],
    "id:user-1",
    789,
    "https://chatgpt.com",
    { requireVisible: true }
  );

  assert.deepEqual(records.map((record) => record.title), ["Visible chat"]);
});

test("prefers accessible titles and collapses whitespace", () => {
  const records = extractConversationRecordsFromAnchors(
    [
      anchor("/c/a11y", " Visible\ntext ", {
        "aria-label": "  Better   accessible title  ",
        title: "Title attribute"
      })
    ],
    "id:user-1",
    789,
    "https://chatgpt.com"
  );

  assert.equal(records[0].title, "Better accessible title");
});

test("filters non-conversation sidebar labels", () => {
  const records = extractConversationRecordsFromAnchors(
    [
      anchor("/c/new", "New Chat"),
      anchor("/c/chatgpt", "ChatGPT"),
      anchor("/c/explore", "Explore GPTs"),
      anchor("/c/real", "Real conversation")
    ],
    "id:user-1",
    111,
    "https://chatgpt.com"
  );

  assert.deepEqual(records.map((record) => record.title), ["Real conversation"]);
});

test("extracts records from document-like objects", () => {
  const documentRef = {
    querySelectorAll(selector) {
      assert.equal(selector, "a[href]");
      return [anchor("/c/doc-1", "From document")];
    }
  };

  const records = extractConversationRecordsFromDocument(documentRef, "id:user-1", 222, "https://chatgpt.com");
  assert.equal(records[0].url, "https://chatgpt.com/c/doc-1");
});

test("detects whether a document has conversation links", () => {
  const previousLocation = globalThis.location;
  globalThis.location = { origin: "https://chatgpt.com" };

  try {
    assert.equal(hasConversationLinks({
      querySelectorAll() {
        return [anchor("/settings", "Settings"), anchor("/c/has-link", "Has link")];
      }
    }), true);
    assert.equal(hasConversationLinks({
      querySelectorAll() {
        return [anchor("/settings", "Settings")];
      }
    }), false);
  } finally {
    globalThis.location = previousLocation;
  }
});
