import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import type { SearchableRecord } from "../src/shared/types.js";

let importCounter = 0;

interface LoadContentScriptOptions {
  accountElement?: unknown;
  anchors?: HTMLAnchorElement[];
  confirmResponse?: boolean;
  htmlClass?: string;
  records?: SearchableRecord[];
}

interface WindowTimeout {
  id: number;
  callback: () => void;
  delay: number;
  cleared: boolean;
}

interface ContentScriptHarness {
  sentMessages: Array<{ type: string }>;
  storageSets: Array<Record<string, unknown>>;
  confirmMessages: string[];
  assignedUrl: string;
  element(selector: string): FakeElement;
  click(selector: string): Promise<void>;
  dispatch(
    selector: string,
    type: string,
    event?: { key?: string; preventDefault?: () => void }
  ): unknown;
  runtimeMessage(message: unknown): void;
  rootMarkup(): string;
  rootAttribute(name: string): string | null;
  renderedTitles(): Array<string | null>;
  clickResultDelete(index: number): Promise<void>;
  runWindowTimeout(delay: number): void;
}

test("content script opens search and renders indexed records", async (t) => {
  const harness = await loadContentScript(t, {
    records: [
      { title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 },
      { title: "Second conversation", url: "https://chatgpt.com/c/second", order: 1 }
    ]
  });

  await harness.click(".cgcs-entry");

  assert.equal(harness.element(".cgcs-modal-backdrop").hidden, false);
  assert.equal(harness.element(".cgcs-input").focused, true);
  assert.equal(harness.element(".cgcs-status").textContent, "2 indexed conversations");
  assert.deepEqual(harness.renderedTitles(), ["First conversation", "Second conversation"]);
});

test("content script comma-separates indexed conversation counts", async (t) => {
  const records = Array.from({ length: 1199 }, (_, index) => ({
    title: `Conversation ${index + 1}`,
    url: `https://chatgpt.com/c/${index + 1}`,
    order: index
  }));
  const harness = await loadContentScript(t, { records });

  await harness.click(".cgcs-entry");

  assert.equal(harness.element(".cgcs-status").textContent, "1,199 indexed conversations");
});

test("content script toggles search from the extension shortcut command", async (t) => {
  const harness = await loadContentScript(t, {
    records: [{ title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 }]
  });

  harness.runtimeMessage({ type: "ui:toggleSearch" });
  await waitFor(() => harness.element(".cgcs-modal-backdrop").hidden === false);

  harness.runtimeMessage({ type: "ui:toggleSearch" });

  assert.equal(harness.element(".cgcs-modal-backdrop").hidden, true);
});

test("content script detects and stores the ChatGPT theme on startup", async (t) => {
  const harness = await loadContentScript(t, {
    htmlClass: "dark",
    records: []
  });

  assert.equal(harness.rootAttribute("data-cgcs-theme"), "dark");
  assert.deepEqual(harness.storageSets, [{ chatgptTheme: "dark" }]);
});

test("content script does not store a fallback when startup theme is ambiguous", async (t) => {
  const harness = await loadContentScript(t, {
    records: []
  });

  assert.equal(harness.rootAttribute("data-cgcs-theme"), null);
  assert.deepEqual(harness.storageSets, []);
});

test("content script explains automatic indexing when the local index is empty", async (t) => {
  const harness = await loadContentScript(t, {
    records: []
  });

  await harness.click(".cgcs-entry");

  assert.equal(harness.element(".cgcs-status").textContent, "");
  assert.equal(
    harness.element(".cgcs-empty-state").textContent,
    "New chats are saved automatically. Use Full sync to bring in your existing sidebar history."
  );
  assert.equal(harness.element(".cgcs-empty-state").hidden, false);
  assert.equal(harness.element(".cgcs-modal").classList.contains("is-empty"), true);
});

test("content script filters results and navigates selected conversations", async (t) => {
  const harness = await loadContentScript(t, {
    records: [
      { title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 },
      { title: "Second conversation", url: "https://chatgpt.com/c/second", order: 1 }
    ]
  });

  await harness.click(".cgcs-entry");
  harness.element(".cgcs-input").value = "second";
  harness.dispatch(".cgcs-input", "input");
  harness.dispatch(".cgcs-input", "keydown", keyEvent("Enter"));

  assert.deepEqual(harness.renderedTitles(), ["Second conversation"]);
  assert.equal(harness.assignedUrl, "https://chatgpt.com/c/second");
});

test("content script clears search with a dedicated clear button", async (t) => {
  const harness = await loadContentScript(t, {
    records: [
      { title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 },
      { title: "Second conversation", url: "https://chatgpt.com/c/second", order: 1 }
    ]
  });

  await harness.click(".cgcs-entry");
  harness.element(".cgcs-input").value = "second";
  harness.dispatch(".cgcs-input", "input");

  assert.equal(harness.element(".cgcs-clear-search").hidden, false);
  assert.deepEqual(harness.renderedTitles(), ["Second conversation"]);

  await harness.click(".cgcs-clear-search");

  assert.equal(harness.element(".cgcs-input").value, "");
  assert.equal(harness.element(".cgcs-clear-search").hidden, true);
  assert.equal(harness.element(".cgcs-input").focused, true);
  assert.deepEqual(harness.renderedTitles(), ["First conversation", "Second conversation"]);
});

test("content script deletes a single local record", async (t) => {
  const harness = await loadContentScript(t, {
    records: [
      { title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 },
      { title: "Second conversation", url: "https://chatgpt.com/c/second", order: 1 }
    ]
  });

  await harness.click(".cgcs-entry");
  await harness.clickResultDelete(0);

  assert.deepEqual(harness.renderedTitles(), ["Second conversation"]);
  assert.deepEqual(harness.sentMessages.at(-1), {
    type: "records:delete",
    accountId: "id:acct_content",
    url: "https://chatgpt.com/c/first"
  });
});

test("content script shows a temporary toast after delete", async (t) => {
  const harness = await loadContentScript(t, {
    records: [
      { title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 },
      { title: "Second conversation", url: "https://chatgpt.com/c/second", order: 1 }
    ]
  });

  await harness.click(".cgcs-entry");
  await harness.clickResultDelete(0);

  assert.equal(harness.element(".cgcs-status").textContent, "1 indexed conversations");
  assert.equal(
    harness.element(".cgcs-toast-message").textContent,
    'Removed "First conversation" from the local index.'
  );
  assert.match(harness.element(".cgcs-toast-icon").innerHTML, /<svg/);
  assert.equal(harness.element(".cgcs-toast").hidden, false);

  harness.runWindowTimeout(2000);

  assert.equal(harness.element(".cgcs-status").textContent, "1 indexed conversations");
  assert.equal(harness.element(".cgcs-toast").classList.contains("is-exiting"), true);
  assert.equal(harness.element(".cgcs-toast").hidden, false);

  harness.runWindowTimeout(180);

  assert.equal(harness.element(".cgcs-toast-message").textContent, "");
  assert.equal(harness.element(".cgcs-toast").hidden, true);
  assert.equal(harness.element(".cgcs-toast").classList.contains("is-exiting"), false);
});

test("content script shows a success toast after clearing the local index", async (t) => {
  const harness = await loadContentScript(t, {
    records: [{ title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 }]
  });

  await harness.click(".cgcs-entry");
  await harness.click(".cgcs-reset");

  assert.deepEqual(harness.renderedTitles(), []);
  assert.deepEqual(harness.sentMessages.at(-1), {
    type: "records:reset",
    accountId: "id:acct_content"
  });
  assert.equal(harness.element(".cgcs-toast-message").textContent, "Local index cleared.");
  assert.equal(harness.element(".cgcs-toast").className, "cgcs-toast is-success");
  assert.equal(harness.element(".cgcs-toast").hidden, false);
});

test("content script shows a warning toast when sync cannot start", async (t) => {
  const harness = await loadContentScript(t, {
    records: [{ title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 }]
  });

  await harness.click(".cgcs-entry");
  await harness.click(".cgcs-sync");

  assert.equal(harness.element(".cgcs-status").textContent, "Open the ChatGPT sidebar, then try sync again.");
  assert.equal(harness.element(".cgcs-toast-message").textContent, "Open the ChatGPT sidebar, then try sync again.");
  assert.equal(harness.element(".cgcs-toast").className, "cgcs-toast is-warning");
  assert.equal(harness.element(".cgcs-toast").hidden, false);
});

test("content script explains index actions in a help dialog", async (t) => {
  const harness = await loadContentScript(t, {
    records: [{ title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 }]
  });

  await harness.click(".cgcs-entry");
  await harness.click(".cgcs-info");

  assert.equal(harness.element(".cgcs-help-backdrop").hidden, false);
  assert.equal(harness.element(".cgcs-help-close").focused, true);
  assert.equal((harness.rootMarkup().match(/class="cgcs-help-card/g) || []).length, 6);
  assert.match(harness.rootMarkup(), /class="cgcs-help-icon"/);
  assert.match(harness.rootMarkup(), /Automatic indexing/);

  await harness.click(".cgcs-help-close");

  assert.equal(harness.element(".cgcs-help-backdrop").hidden, true);
  assert.equal(harness.element(".cgcs-info").focused, true);
});

test("content script does not clear the local index when confirmation is declined", async (t) => {
  const harness = await loadContentScript(t, {
    confirmResponse: false,
    records: [{ title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 }]
  });

  await harness.click(".cgcs-entry");
  await harness.click(".cgcs-reset");

  assert.deepEqual(harness.confirmMessages, [
    "Clear the local conversation index for this ChatGPT account?"
  ]);
  assert.equal(harness.sentMessages.some((message) => message.type === "records:reset"), false);
});

test("content script reports missing account identity", async (t) => {
  const harness = await loadContentScript(t, {
    accountElement: null,
    records: []
  });

  await harness.click(".cgcs-entry");

  assert.equal(
    harness.element(".cgcs-status").textContent,
    "Can't identify this ChatGPT account. Open the account menu, then try again."
  );
  assert.equal(
    harness.element(".cgcs-toast-message").textContent,
    "Can't identify this ChatGPT account. Open the account menu, then try again."
  );
  assert.equal(harness.element(".cgcs-toast").className, "cgcs-toast is-warning");
  assert.deepEqual(harness.sentMessages, []);
});

async function loadContentScript(t: TestContext, options: LoadContentScriptOptions = {}): Promise<ContentScriptHarness> {
  const previousChrome = globalThis.chrome;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousMutationObserver = globalThis.MutationObserver;
  const previousConfirm = globalThis.confirm;
  const sentMessages: Array<{ type: string }> = [];
  const storageSets: Array<Record<string, unknown>> = [];
  const confirmMessages: string[] = [];
  const messageListeners: Array<(message: unknown) => void> = [];
  const windowTimeouts: WindowTimeout[] = [];
  const elements = createContentScriptElements();
  const rootElement = new FakeElement("html");
  const documentRef = {
    title: "ChatGPT",
    body: { innerText: "" },
    documentElement: rootElement,
    createElement(tagName: string): FakeElement {
      if (tagName === "li") return createResultItem();
      if (tagName === "div") {
        return new FakeElement("div", {
          querySelector(selector: string): FakeElement | null {
            return elements.get(selector) || null;
          }
        });
      }
      return new FakeElement(tagName);
    },
    querySelector(selector: string): FakeElement | null {
      if (selector === "[data-account-id], [data-user-id], [data-testid='profile-button']") {
        return options.accountElement === null
          ? null
          : fakeAttributeElement({ "data-account-id": "acct_content" });
      }
      return null;
    },
    querySelectorAll(selector: string): HTMLAnchorElement[] {
      if (selector === "a[href]") return options.anchors || [];
      return [];
    },
    addEventListener(type: string, listener: Function) {
      rootElement.listeners.set(type, listener);
    }
  } as unknown as Document;
  if (options.htmlClass) rootElement.classList.add(options.htmlClass);
  const harness: ContentScriptHarness = {
    sentMessages,
    storageSets,
    confirmMessages,
    assignedUrl: "",
    element,
    async click(selector) {
      await element(selector).listeners.get("click")!();
    },
    dispatch(selector, type, event = {}) {
      return element(selector).listeners.get(type)!(event);
    },
    runtimeMessage(message) {
      messageListeners.forEach((listener) => listener(message));
    },
    rootMarkup() {
      return rootElement.children.at(-1)?.innerHTML || "";
    },
    rootAttribute(name) {
      return rootElement.children.at(-1)?.getAttribute(name) || null;
    },
    renderedTitles() {
      return element(".cgcs-results").children.map((item) =>
        item.querySelector(".cgcs-title")!.textContent
      );
    },
    async clickResultDelete(index) {
      const item = element(".cgcs-results").children[index];
      if (!item) throw new Error(`Missing result item ${index}.`);
      await item.querySelector(".cgcs-delete")!.listeners.get("click")!();
    },
    runWindowTimeout(delay) {
      const timer = windowTimeouts.findLast((entry) => entry.delay === delay && !entry.cleared);
      assert.ok(timer, `Expected an active window timeout with delay ${delay}.`);
      timer.cleared = true;
      timer.callback();
    }
  };

  globalThis.document = documentRef;
  globalThis.location = {
    href: "https://chatgpt.com/",
    origin: "https://chatgpt.com"
  } as unknown as Location;
  globalThis.window = {
    location: {
      assign(url: string) {
        harness.assignedUrl = url;
      }
    },
    addEventListener() {},
    clearTimeout(id: number) {
      const timer = windowTimeouts.find((entry) => entry.id === id);
      if (timer) timer.cleared = true;
    },
    setInterval() {},
    setTimeout(callback: () => void, delay: number) {
      const timer = { id: windowTimeouts.length + 1, callback, delay, cleared: false };
      windowTimeouts.push(timer);
      return timer.id;
    }
  } as unknown as typeof window;
  globalThis.MutationObserver = (class {
    observe() {}
  }) as unknown as typeof MutationObserver;  globalThis.confirm = ((message: string) => {
    confirmMessages.push(message);
    return options.confirmResponse ?? true;
  }) as unknown as typeof confirm;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener: (message: unknown) => void) {
          messageListeners.push(listener);
        }
      },
      sendMessage(message: { type: string }, callback: (response: unknown) => void) {
        sentMessages.push(message);
        if (message.type === "records:list") {
          callback({ ok: true, data: options.records || [] });
          return;
        }
        if (message.type === "records:delete") {
          callback({ ok: true, data: { count: 1, deleted: true } });
          return;
        }
        callback({ ok: true, data: {} });
      }
    },
    storage: {
      local: {
        set(value: Record<string, unknown>) {
          storageSets.push(value);
        }
      }
    }
  } as unknown as typeof chrome;

  t.after(() => {
    globalThis.chrome = previousChrome;
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.location = previousLocation;
    globalThis.MutationObserver = previousMutationObserver;
    globalThis.confirm = previousConfirm;
  });

  await import(`../src/contentScript.ts?content-script-test=${importCounter++}`);
  await waitFor(() => messageListeners.length === 1);
  return harness;

  function element(selector: string): FakeElement {
    const fake = elements.get(selector);
    if (!fake) throw new Error(`Missing content script element: ${selector}`);
    return fake;
  }
}

function createContentScriptElements(): Map<string, FakeElement> {
  return new Map([
    [".cgcs-entry", new FakeElement("button")],
    [".cgcs-modal-backdrop", new FakeElement("div", { hidden: true })],
    [".cgcs-modal", new FakeElement("section")],
    [".cgcs-input", new FakeElement("input")],
    [".cgcs-clear-search", new FakeElement("button", { hidden: true })],
    [".cgcs-status", new FakeElement("div")],
    [".cgcs-empty-state", new FakeElement("div", { hidden: true })],
    [".cgcs-toast", new FakeElement("div", { hidden: true })],
    [".cgcs-toast-icon", new FakeElement("span")],
    [".cgcs-toast-message", new FakeElement("span")],
    [".cgcs-results", new FakeElement("ol")],
    [".cgcs-info", new FakeElement("button")],
    [".cgcs-quick-sync", new FakeElement("button")],
    [".cgcs-sync", new FakeElement("button")],
    [".cgcs-import", new FakeElement("button")],
    [".cgcs-export", new FakeElement("button")],
    [".cgcs-reset", new FakeElement("button")],
    [".cgcs-help-backdrop", new FakeElement("div", { hidden: true })],
    [".cgcs-help-close", new FakeElement("button")],
    [".cgcs-sync-overlay", new FakeElement("div", { hidden: true })],
    [".cgcs-sync-visual", new FakeElement("div")],
    [".cgcs-sync-title", new FakeElement("strong")],
    [".cgcs-sync-summary", new FakeElement("p")],
    [".cgcs-sync-detail", new FakeElement("p")],
    [".cgcs-cancel", new FakeElement("button")]
  ]);
}

function createResultItem(): FakeElement {
  const button = new FakeElement("button");
  const deleteButton = new FakeElement("button");
  const title = new FakeElement("span");
  const meta = new FakeElement("span");
  return new FakeElement("li", {
    querySelector(selector: string): FakeElement | null {
      if (selector === "button" || selector === ".cgcs-result-open") return button;
      if (selector === ".cgcs-delete") return deleteButton;
      if (selector === ".cgcs-title") return title;
      if (selector === ".cgcs-meta") return meta;
      return null;
    }
  });
}

function fakeAttributeElement(attributes: Record<string, string>): FakeElement {
  const element = new FakeElement("div");
  for (const [name, value] of Object.entries(attributes)) {
    element.attributes.set(name, value);
  }
  return element;
}

function keyEvent(key: string): { key: string; preventDefault(): void } {
  return {
    key,
    preventDefault() {}
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for content script setup.");
}

interface FakeElementOptions {
  hidden?: boolean;
  querySelector?: (selector: string) => FakeElement | null;
}

class FakeElement {
  tagName: string;
  className = "";
  innerHTML = "";
  id = "";
  textContent = "";
  title = "";
  value = "";
  hidden: boolean;
  focused = false;
  selected = false;
  disabled = false;
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  listeners = new Map<string, Function>();
  querySelectorOverride?: (selector: string) => FakeElement | null;
  classList: {
    add(name: string): void;
    remove(name: string): void;
    toggle(name: string, force?: boolean): boolean;
    contains(name: string): boolean;
    readonly value: string;
  };

  constructor(tagName: string, options: FakeElementOptions = {}) {
    this.tagName = tagName;
    this.hidden = options.hidden || false;
    this.querySelectorOverride = options.querySelector;
    const classNames = new Set<string>();
    this.classList = {
      add(name: string) {
        classNames.add(name);
      },
      remove(name: string) {
        classNames.delete(name);
      },
      toggle(name: string, force?: boolean) {
        const shouldAdd = force ?? !classNames.has(name);
        if (shouldAdd) {
          classNames.add(name);
        } else {
          classNames.delete(name);
        }
        return shouldAdd;
      },
      contains(name: string) {
        return classNames.has(name);
      },
      get value() {
        return Array.from(classNames).join(" ");
      }
    };
  }

  append(child: FakeElement): void {
    this.children.push(child);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) || null;
  }

  addEventListener(type: string, listener: Function): void {
    this.listeners.set(type, listener);
  }

  focus(): void {
    this.focused = true;
  }

  select(): void {
    this.selected = true;
  }

  replaceChildren(): void {
    this.children = [];
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorOverride?.(selector) || null;
  }

  querySelectorAll(): FakeElement[] {
    return [];
  }

  closest(): FakeElement | null {
    return null;
  }

  getBoundingClientRect(): { width: number; height: number; top: number } {
    return { width: 100, height: 24, top: 0 };
  }
}
