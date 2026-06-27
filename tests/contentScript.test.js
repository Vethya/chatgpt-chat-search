import test from "node:test";
import assert from "node:assert/strict";

let importCounter = 0;

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

test("content script toggles search from the extension shortcut command", async (t) => {
  const harness = await loadContentScript(t, {
    records: [{ title: "First conversation", url: "https://chatgpt.com/c/first", order: 0 }]
  });

  harness.runtimeMessage({ type: "ui:toggleSearch" });
  await waitFor(() => harness.element(".cgcs-modal-backdrop").hidden === false);

  harness.runtimeMessage({ type: "ui:toggleSearch" });

  assert.equal(harness.element(".cgcs-modal-backdrop").hidden, true);
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
    harness.element(".cgcs-toast").textContent,
    'Removed "First conversation" from the local index.'
  );
  assert.equal(harness.element(".cgcs-toast").hidden, false);

  harness.runWindowTimeout(2000);

  assert.equal(harness.element(".cgcs-status").textContent, "1 indexed conversations");
  assert.equal(harness.element(".cgcs-toast").textContent, "");
  assert.equal(harness.element(".cgcs-toast").hidden, true);
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
  assert.deepEqual(harness.sentMessages, []);
});

async function loadContentScript(t, options = {}) {
  const previousChrome = globalThis.chrome;
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousLocation = globalThis.location;
  const previousMutationObserver = globalThis.MutationObserver;
  const previousConfirm = globalThis.confirm;
  const sentMessages = [];
  const messageListeners = [];
  const windowTimeouts = [];
  const elements = createContentScriptElements();
  const documentRef = {
    title: "ChatGPT",
    body: { innerText: "" },
    documentElement: new FakeElement("html"),
    createElement(tagName) {
      if (tagName === "li") return createResultItem();
      if (tagName === "div") {
        return new FakeElement("div", {
          querySelector(selector) {
            return elements.get(selector) || null;
          }
        });
      }
      return new FakeElement(tagName);
    },
    querySelector(selector) {
      if (selector === "[data-account-id], [data-user-id], [data-testid='profile-button']") {
        return options.accountElement === null
          ? null
          : fakeAttributeElement({ "data-account-id": "acct_content" });
      }
      if (selector === "nav" || selector === "aside") return null;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "a[href]") return options.anchors || [];
      if (selector === "script") return [];
      return [];
    },
    addEventListener(type, listener) {
      this.documentElement.listeners.set(type, listener);
    }
  };
  const harness = {
    sentMessages,
    assignedUrl: "",
    element(selector) {
      return elements.get(selector);
    },
    async click(selector) {
      await elements.get(selector).listeners.get("click")();
    },
    dispatch(selector, type, event = {}) {
      return elements.get(selector).listeners.get(type)(event);
    },
    runtimeMessage(message) {
      messageListeners.forEach((listener) => listener(message));
    },
    renderedTitles() {
      return elements.get(".cgcs-results").children.map((item) =>
        item.querySelector(".cgcs-title").textContent
      );
    },
    async clickResultDelete(index) {
      await elements.get(".cgcs-results").children[index].querySelector(".cgcs-delete").listeners.get("click")();
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
  };
  globalThis.window = {
    location: {
      assign(url) {
        harness.assignedUrl = url;
      }
    },
    addEventListener() {},
    clearTimeout(id) {
      const timer = windowTimeouts.find((entry) => entry.id === id);
      if (timer) timer.cleared = true;
    },
    setInterval() {},
    setTimeout(callback, delay) {
      const timer = { id: windowTimeouts.length + 1, callback, delay, cleared: false };
      windowTimeouts.push(timer);
      return timer.id;
    }
  };
  globalThis.MutationObserver = class {
    observe() {}
  };
  globalThis.confirm = () => true;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      getURL(path) {
        return new URL(`../${path}`, import.meta.url).href;
      },
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        }
      },
      sendMessage(message, callback) {
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
    }
  };

  t.after(() => {
    globalThis.chrome = previousChrome;
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
    globalThis.location = previousLocation;
    globalThis.MutationObserver = previousMutationObserver;
    globalThis.confirm = previousConfirm;
  });

  await import(new URL(`../src/contentScript.js?content-script-test=${importCounter++}`, import.meta.url));
  await waitFor(() => messageListeners.length === 1);
  return harness;
}

function createContentScriptElements() {
  return new Map([
    [".cgcs-entry", new FakeElement("button")],
    [".cgcs-modal-backdrop", new FakeElement("div", { hidden: true })],
    [".cgcs-input", new FakeElement("input")],
    [".cgcs-status", new FakeElement("div")],
    [".cgcs-toast", new FakeElement("div", { hidden: true })],
    [".cgcs-results", new FakeElement("ol")],
    [".cgcs-quick-sync", new FakeElement("button")],
    [".cgcs-sync", new FakeElement("button")],
    [".cgcs-import", new FakeElement("button")],
    [".cgcs-export", new FakeElement("button")],
    [".cgcs-reset", new FakeElement("button")],
    [".cgcs-sync-overlay", new FakeElement("div", { hidden: true })],
    [".cgcs-sync-detail", new FakeElement("p")],
    [".cgcs-cancel", new FakeElement("button")]
  ]);
}

function createResultItem() {
  const button = new FakeElement("button");
  const deleteButton = new FakeElement("button");
  const title = new FakeElement("span");
  const meta = new FakeElement("span");
  return new FakeElement("li", {
    querySelector(selector) {
      if (selector === "button" || selector === ".cgcs-result-open") return button;
      if (selector === ".cgcs-delete") return deleteButton;
      if (selector === ".cgcs-title") return title;
      if (selector === ".cgcs-meta") return meta;
      return null;
    }
  });
}

function fakeAttributeElement(attributes) {
  return {
    getAttribute(name) {
      return attributes[name] || null;
    }
  };
}

function keyEvent(key) {
  return {
    key,
    preventDefault() {}
  };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error("Timed out waiting for content script setup.");
}

class FakeElement {
  constructor(tagName, options = {}) {
    this.tagName = tagName;
    this.listeners = new Map();
    this.children = [];
    this.hidden = options.hidden || false;
    this.textContent = "";
    this.value = "";
    this.focused = false;
    this.querySelectorOverride = options.querySelector;
  }

  append(child) {
    this.children.push(child);
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  focus() {
    this.focused = true;
  }

  select() {
    this.selected = true;
  }

  replaceChildren() {
    this.children = [];
  }

  querySelector(selector) {
    return this.querySelectorOverride?.(selector) || null;
  }

  querySelectorAll() {
    return [];
  }

  getAttribute() {
    return null;
  }

  closest() {
    return null;
  }

  getBoundingClientRect() {
    return { width: 100, height: 24, top: 0 };
  }
}
