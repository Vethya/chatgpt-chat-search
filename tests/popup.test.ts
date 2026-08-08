import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import type { AccountStatus } from "../src/shared/types.js";

let importCounter = 0;
const NOW = Date.UTC(2026, 5, 27, 16, 5);

interface PopupElement {
  className: string;
  innerHTML: string;
  title: string;
  textContent: string;
  listeners: Map<string, Function>;
  addEventListener(type: string, listener: Function): void;
}

interface LoadPopupOptions {
  accountStatuses?: AccountStatus[];
  activeTab?: { id: number; url: string };
  sendMessageError?: Error;
  storedTheme?: string;
}

interface PopupHarness {
  createdTabs: Array<{ url: string }>;
  sentMessages: Array<{ tabId: number; message: { type: string } }>;
  runtimeMessages: Array<{ type: string }>;
  closed: boolean;
  element(selector: string): PopupElement;
  documentTheme(): string | null;
  click(selector: string): Promise<void>;
}

test("popup reports when no conversations are indexed", async (t) => {
  const harness = await loadPopup(t, {
    accountStatuses: []
  });

  assert.equal(harness.element("#status").textContent, "No indexed conversations yet.");
});

test("popup shows a normal single-account status", async (t) => {
  const harness = await loadPopup(t, {
    accountStatuses: [
      { accountId: "id:acct_123", count: 1199, lastSyncedAt: NOW - 2 * 60 * 60 * 1000 }
    ]
  });

  assert.equal(harness.element("#status").className, "status-card status-card-single");
  assert.match(harness.element("#status").innerHTML, /1,199/);
  assert.match(harness.element("#status").innerHTML, /conversations indexed/);
  assert.match(harness.element("#status").innerHTML, /Last synced 2 hours ago/);
  assert.equal(harness.element("#status").title, "Last synced 2026-06-27 14:05 UTC");
});

test("popup shows multiple account statuses separately", async (t) => {
  const harness = await loadPopup(t, {
    accountStatuses: [
      { accountId: "id:acct_1234567890abcdef", count: 2, lastSyncedAt: NOW - 15 * 60 * 1000 },
      { accountId: "email-sha256:abcdef1234567890abcdef1234567890", count: 1, lastSyncedAt: NOW - 25 * 60 * 60 * 1000 }
    ]
  });

  assert.equal(harness.element("#status").className, "status-card status-card-multiple");
  assert.match(harness.element("#status").innerHTML, /3/);
  assert.match(harness.element("#status").innerHTML, /conversations across 2 accounts/);
  assert.match(harness.element("#status").innerHTML, /acct_123\.\.\.abcdef/);
  assert.match(harness.element("#status").innerHTML, /Last synced 15 minutes ago/);
  assert.match(harness.element("#status").innerHTML, /email hash abcdef12\.\.\.567890/);
  assert.match(harness.element("#status").innerHTML, /Last synced yesterday/);
});

test("popup applies the last detected ChatGPT theme", async (t) => {
  const harness = await loadPopup(t, {
    storedTheme: "dark"
  });

  assert.equal(harness.documentTheme(), "dark");
});

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
  assert.equal(harness.element("#status").className, "status-card status-message is-warning");
  assert.equal(harness.closed, false);
});

async function loadPopup(t: TestContext, options: LoadPopupOptions = {}): Promise<PopupHarness> {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousChrome = globalThis.chrome;
  const previousDateNow = Date.now;
  const elements = new Map<string, PopupElement>();
  const documentElement = createDocumentElement();
  const createdTabs: Array<{ url: string }> = [];
  const sentMessages: Array<{ tabId: number; message: { type: string } }> = [];
  const runtimeMessages: Array<{ type: string }> = [];
  const harness: PopupHarness = {
    createdTabs,
    sentMessages,
    runtimeMessages,
    closed: false,
    element,
    documentTheme() {
      return documentElement.getAttribute("data-theme");
    },
    async click(selector) {
      await element(selector).listeners.get("click")!();
    }
  };

  globalThis.document = {
    documentElement,
    querySelector(selector: string): PopupElement {
      return element(selector);
    }
  } as unknown as Document;
  globalThis.window = {
    matchMedia(query: string) {
      return { matches: query === "(prefers-color-scheme: light)" };
    },
    close() {
      harness.closed = true;
    }
  } as unknown as typeof window;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(message: { type: string }, callback: (response: unknown) => void) {
        runtimeMessages.push(message);
        callback({ ok: true, data: options.accountStatuses || [] });
      }
    },
    storage: {
      local: {
        get(defaults: Record<string, unknown>, callback: (values: Record<string, unknown>) => void) {
          callback({
            ...defaults,
            chatgptTheme: options.storedTheme ?? defaults.chatgptTheme
          });
        }
      }
    },
    tabs: {
      async query(query: unknown) {
        assert.deepEqual(query, { active: true, currentWindow: true });
        return options.activeTab ? [options.activeTab] : [];
      },
      async create(tab: { url: string }) {
        createdTabs.push(tab);
      },
      async sendMessage(tabId: number, message: { type: string }) {
        sentMessages.push({ tabId, message });
        if (options.sendMessageError) throw options.sendMessageError;
      }
    }
  } as unknown as typeof chrome;
  Date.now = () => NOW;

  t.after(() => {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.chrome = previousChrome;
    Date.now = previousDateNow;
  });

  await import(`../src/popup.ts?popup-test=${importCounter++}`);
  await waitFor(() => element("#status").textContent !== "" || element("#status").innerHTML !== "");
  return harness;

  function element(selector: string): PopupElement {
    if (!elements.has(selector)) {
      elements.set(selector, {
        className: "",
        innerHTML: "",
        title: "",
        textContent: "",
        listeners: new Map(),
        addEventListener(type, listener) {
          this.listeners.set(type, listener);
        }
      });
    }
    return elements.get(selector)!;
  }
}

function createDocumentElement() {
  const attributes = new Map<string, string>();
  return {
    dataset: {} as Record<string, string>,
    getAttribute(name: string): string | null {
      return attributes.get(name) || null;
    },
    setAttribute(name: string, value: string) {
      attributes.set(name, String(value));
      if (name === "data-theme") this.dataset.theme = String(value);
    }
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.fail("Timed out waiting for popup state.");
}
