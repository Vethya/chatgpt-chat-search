import test from "node:test";
import assert from "node:assert/strict";

let importCounter = 0;

test("stores replacement records and lists them by order", async (t) => {
  const worker = await loadServiceWorker(t);

  assert.deepEqual(await worker.send({
    type: "records:replace",
    accountId: "id:user",
    records: [
      record({ accountId: "wrong", url: "https://chatgpt.com/c/2", title: "Second", order: 2, syncedAt: 20 }),
      record({ accountId: "wrong", url: "https://chatgpt.com/c/1", title: "First", order: 1, syncedAt: 10 })
    ]
  }), { count: 2 });

  const records = await worker.send({ type: "records:list", accountId: "id:user" });
  assert.deepEqual(records.map((item) => item.title), ["First", "Second"]);
  assert.deepEqual(records.map((item) => item.accountId), ["id:user", "id:user"]);
});

test("upserts recent records and reports status", async (t) => {
  const worker = await loadServiceWorker(t);

  await worker.send({
    type: "records:replace",
    accountId: "id:user",
    records: [
      record({ url: "https://chatgpt.com/c/known", title: "Known", order: 0, syncedAt: 10 }),
      record({ url: "https://chatgpt.com/c/older", title: "Older", order: 1, syncedAt: 8 })
    ]
  });
  assert.deepEqual(await worker.send({
    type: "records:upsert",
    accountId: "id:user",
    records: [
      record({ url: "https://chatgpt.com/c/known", title: "Known renamed", order: 0, syncedAt: 30 }),
      record({ url: "https://chatgpt.com/c/new", title: "New", order: 1, syncedAt: 20 })
    ]
  }), { count: 3, upserted: 2 });

  const records = await worker.send({ type: "records:list", accountId: "id:user" });
  assert.deepEqual(records.map((item) => item.title), ["Known renamed", "New", "Older"]);
  assert.deepEqual(records.map((item) => item.order), [0, 1, 2]);
  assert.deepEqual(await worker.send({ type: "status:get", accountId: "id:user" }), {
    count: 3,
    lastSyncedAt: 30
  });
});

test("deletes one account record and reorders the rest", async (t) => {
  const worker = await loadServiceWorker(t);

  await worker.send({
    type: "records:replace",
    accountId: "id:user",
    records: [
      record({ url: "https://chatgpt.com/c/first", title: "First", order: 0 }),
      record({ url: "https://chatgpt.com/c/second", title: "Second", order: 1 })
    ]
  });

  assert.deepEqual(await worker.send({
    type: "records:delete",
    accountId: "id:user",
    url: "https://chatgpt.com/c/first"
  }), { count: 1, deleted: true });

  const records = await worker.send({ type: "records:list", accountId: "id:user" });
  assert.deepEqual(records.map((item) => item.title), ["Second"]);
  assert.deepEqual(records.map((item) => item.order), [0]);
});

test("exports, imports, and resets account records", async (t) => {
  const worker = await loadServiceWorker(t);

  await worker.send({
    type: "records:replace",
    accountId: "id:source",
    records: [record({ accountId: "id:source", url: "https://chatgpt.com/c/1", title: "Exported", syncedAt: 10 })]
  });

  const exported = await worker.send({ type: "records:export", accountId: "id:source" });
  assert.equal(exported.kind, "chatgpt-conversation-search-index");
  assert.equal(exported.records[0].title, "Exported");

  exported.records.push(record({
    accountId: "id:other",
    url: "https://chatgpt.com/c/other",
    title: "Other account",
    syncedAt: 15
  }));
  assert.deepEqual(await worker.send({ type: "records:import", exportData: exported }), { imported: 2 });
  assert.deepEqual(
    (await worker.send({ type: "records:list", accountId: "id:other" })).map((item) => item.title),
    ["Other account"]
  );

  assert.deepEqual(await worker.send({ type: "records:reset", accountId: "id:source" }), { count: 0 });
  assert.deepEqual(await worker.send({ type: "records:list", accountId: "id:source" }), []);
});

test("lists grouped account statuses", async (t) => {
  const worker = await loadServiceWorker(t);

  await worker.send({
    type: "records:replace",
    accountId: "id:first",
    records: [
      record({ accountId: "id:first", url: "https://chatgpt.com/c/1", title: "One", syncedAt: 10 }),
      record({ accountId: "id:first", url: "https://chatgpt.com/c/2", title: "Two", syncedAt: 30 })
    ]
  });
  await worker.send({
    type: "records:replace",
    accountId: "email-sha256:abcdef",
    records: [
      record({ accountId: "email-sha256:abcdef", url: "https://chatgpt.com/c/3", title: "Three", syncedAt: 20 })
    ]
  });

  assert.deepEqual(await worker.send({ type: "status:listAccounts" }), [
    { accountId: "id:first", count: 2, lastSyncedAt: 30 },
    { accountId: "email-sha256:abcdef", count: 1, lastSyncedAt: 20 }
  ]);
});

test("returns structured errors for invalid messages", async (t) => {
  const worker = await loadServiceWorker(t);

  assert.deepEqual(await worker.sendRaw({ type: "records:list" }), {
    ok: false,
    error: "Missing account identity."
  });
  assert.deepEqual(await worker.sendRaw({ type: "missing:type" }), {
    ok: false,
    error: "Unknown message type: missing:type"
  });
  assert.deepEqual(await worker.send({ type: "status:get" }), { count: 0 });
  assert.deepEqual(await worker.send({ type: "records:upsert", accountId: "id:user", records: [] }), {
    count: 0,
    upserted: 0
  });
});

test("command listener opens search only on active ChatGPT tabs", async (t) => {
  const worker = await loadServiceWorker(t, {
    activeTabs: [{ id: 11, url: "https://chatgpt.com/c/abc" }]
  });

  await worker.runCommand("open-search");
  assert.deepEqual(worker.sentTabMessages, [{ tabId: 11, message: { type: "ui:openSearch" } }]);

  worker.activeTabs = [{ id: 12, url: "https://example.com/" }];
  await worker.runCommand("open-search");
  await worker.runCommand("other-command");
  assert.deepEqual(worker.sentTabMessages, [{ tabId: 11, message: { type: "ui:openSearch" } }]);
});

async function loadServiceWorker(t, options = {}) {
  const previousChrome = globalThis.chrome;
  const previousIndexedDb = globalThis.indexedDB;
  const previousIdbKeyRange = globalThis.IDBKeyRange;
  const messageListeners = [];
  const commandListeners = [];
  const sentTabMessages = [];
  const fakeIndexedDb = createFakeIndexedDb();
  const worker = {
    activeTabs: options.activeTabs || [],
    sentTabMessages,
    async send(message) {
      const response = await this.sendRaw(message);
      assert.equal(response.ok, true, response.error);
      return response.data;
    },
    sendRaw(message) {
      return new Promise((resolve) => {
        const keepAlive = messageListeners[0](message, {}, resolve);
        assert.equal(keepAlive, true);
      });
    },
    async runCommand(command) {
      await commandListeners[0](command);
    }
  };

  globalThis.indexedDB = fakeIndexedDb;
  globalThis.IDBKeyRange = {
    only(value) {
      return { value };
    }
  };
  globalThis.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener) {
          messageListeners.push(listener);
        }
      }
    },
    commands: {
      onCommand: {
        addListener(listener) {
          commandListeners.push(listener);
        }
      }
    },
    tabs: {
      async query(query) {
        assert.deepEqual(query, { active: true, currentWindow: true });
        return worker.activeTabs;
      },
      async sendMessage(tabId, message) {
        sentTabMessages.push({ tabId, message });
      }
    }
  };

  t.after(() => {
    globalThis.chrome = previousChrome;
    globalThis.indexedDB = previousIndexedDb;
    globalThis.IDBKeyRange = previousIdbKeyRange;
  });

  await import(new URL(`../src/serviceWorker.js?service-worker-test=${importCounter++}`, import.meta.url));
  assert.equal(messageListeners.length, 1);
  assert.equal(commandListeners.length, 1);
  return worker;
}

function record(overrides) {
  return {
    accountId: "id:user",
    url: "https://chatgpt.com/c/default",
    title: "Default",
    order: 0,
    syncedAt: 1,
    ...overrides
  };
}

function createFakeIndexedDb() {
  const databases = new Map();

  return {
    open(name) {
      const request = {};
      queueMicrotask(() => {
        let db = databases.get(name);
        const isNew = !db;
        if (!db) {
          db = new FakeDb();
          databases.set(name, db);
        }
        request.result = db;
        if (isNew) request.onupgradeneeded?.();
        queueMicrotask(() => request.onsuccess?.());
      });
      return request;
    }
  };
}

class FakeDb {
  constructor() {
    this.records = new Map();
    this.objectStoreNames = {
      contains: (name) => name === "conversations" && this.hasStore
    };
    this.hasStore = false;
  }

  createObjectStore(name) {
    assert.equal(name, "conversations");
    this.hasStore = true;
    return new FakeObjectStore(this);
  }

  transaction(name) {
    assert.equal(name, "conversations");
    return new FakeTransaction(this);
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    setTimeout(() => this.oncomplete?.(), 0);
  }

  objectStore() {
    return new FakeObjectStore(this.db);
  }
}

class FakeObjectStore {
  constructor(db) {
    this.db = db;
  }

  createIndex() {}

  index(name) {
    assert.equal(name, "accountId");
    return {
      getAll: (accountId) => {
        const request = {};
        queueMicrotask(() => {
          request.result = [...this.db.records.values()]
            .filter((item) => item.accountId === accountId)
            .map((item) => ({ ...item }));
          request.onsuccess?.();
        });
        return request;
      },
      openKeyCursor: (range) => {
        const request = {};
        const keys = [...this.db.records.values()]
          .filter((item) => item.accountId === range.value)
          .map((item) => [item.accountId, item.url]);
        let index = 0;
        const advance = () => {
          const primaryKey = keys[index++];
          request.result = primaryKey
            ? {
                primaryKey,
                continue() {
                  queueMicrotask(advance);
                }
              }
            : null;
          request.onsuccess?.();
        };
        queueMicrotask(advance);
        return request;
      }
    };
  }

  put(item) {
    this.db.records.set(JSON.stringify([item.accountId, item.url]), { ...item });
  }

  getAll() {
    const request = {};
    queueMicrotask(() => {
      request.result = [...this.db.records.values()].map((item) => ({ ...item }));
      request.onsuccess?.();
    });
    return request;
  }

  delete(primaryKey) {
    this.db.records.delete(JSON.stringify(primaryKey));
  }
}
