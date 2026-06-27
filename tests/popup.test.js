import test from "node:test";
import assert from "node:assert/strict";

let importCounter = 0;

test("open ChatGPT button opens chatgpt.com", async (t) => {
  const harness = await loadPopup(t);

  await harness.click("#open-chatgpt");

  assert.deepEqual(harness.createdTabs, [{ url: "https://chatgpt.com/" }]);
});

test("open search button opens ChatGPT when active tab is not ChatGPT", async (t) => {
  const harness = await loadPopup(t, {
    activeTab: { id: 1, url: "https://example.com/" }
  });

  await harness.click("#open-search");

  assert.deepEqual(harness.createdTabs, [{ url: "https://chatgpt.com/" }]);
  assert.deepEqual(harness.sentMessages, []);
});

test("open search button messages active ChatGPT tab and closes popup", async (t) => {
  const harness = await loadPopup(t, {
    activeTab: { id: 7, url: "https://chatgpt.com/c/abc" }
  });

  await harness.click("#open-search");

  assert.deepEqual(harness.sentMessages, [{ tabId: 7, message: { type: "ui:openSearch" } }]);
  assert.equal(harness.closed, true);
});

test("open search button reports when the content script is unavailable", async (t) => {
  const harness = await loadPopup(t, {
    activeTab: { id: 7, url: "https://chatgpt.com/" },
    sendMessageError: new Error("No receiver")
  });

  await harness.click("#open-search");

  assert.equal(harness.element("#status").textContent, "Refresh the ChatGPT tab, then try again.");
  assert.equal(harness.closed, false);
});

async function loadPopup(t, options = {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousChrome = globalThis.chrome;
  const elements = new Map();
  const createdTabs = [];
  const sentMessages = [];
  const harness = {
    createdTabs,
    sentMessages,
    closed: false,
    element,
    async click(selector) {
      await element(selector).listeners.get("click")();
    }
  };

  globalThis.document = {
    querySelector(selector) {
      return element(selector);
    }
  };
  globalThis.window = {
    close() {
      harness.closed = true;
    }
  };
  globalThis.chrome = {
    tabs: {
      async query(query) {
        assert.deepEqual(query, { active: true, currentWindow: true });
        return options.activeTab ? [options.activeTab] : [];
      },
      async create(tab) {
        createdTabs.push(tab);
      },
      async sendMessage(tabId, message) {
        sentMessages.push({ tabId, message });
        if (options.sendMessageError) throw options.sendMessageError;
      }
    }
  };

  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.chrome = previousChrome;
  });

  await import(new URL(`../src/popup.js?popup-test=${importCounter++}`, import.meta.url));
  return harness;

  function element(selector) {
    if (!elements.has(selector)) {
      elements.set(selector, {
        textContent: "",
        listeners: new Map(),
        addEventListener(type, listener) {
          this.listeners.set(type, listener);
        }
      });
    }
    return elements.get(selector);
  }
}
