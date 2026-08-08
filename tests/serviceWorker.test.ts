import test from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import type {
  ConversationRecord,
  IndexExport,
  ServiceResponse,
  ServiceWorkerRequest
} from "../src/shared/types.js";

let importCounter = 0;

type WorkerMessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void
) => boolean | void;

type CommandListener = (command: string) => void | Promise<void>;

interface LoadWorkerOptions {
  activeTabs?: Array<{ id: number; url: string }>;
  failPutTitle?: string;
}

interface WorkerHarness {
  activeTabs: Array<{ id: number; url: string }>;
  sentTabMessages: Array<{ tabId: number; message: { type: string } }>;
  send(message: ServiceWorkerRequest): Promise<unknown>;
  sendRaw(message: unknown): Promise<unknown>;
  runCommand(command: string): Promise<void>;
}

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

  const records = await worker.send({ type: "records:list", accountId: "id:user" }) as ConversationRecord[];
  assert.deepEqual(records.map((item) => item.title), ["First", "Second"]);
  assert.deepEqual(records.map((item) => item.accountId), ["id:user", "id:user"]);
});

test("failed replacement preserves previous account records", async (t) => {
  const worker = await loadServiceWorker(t, { failPutTitle: "Broken" });

  await worker.send({
    type: "records:replace",
    accountId: "id:user",
    records: [
      record({ url: "https://chatgpt.com/c/old", title: "Old", order: 0, syncedAt: 10 })
    ]
  });

  assert.deepEqual(await worker.sendRaw({
    type: "records:replace",
    accountId: "id:user",
    records: [
      record({ url: "https://chatgpt.com/c/new", title: "New", order: 0, syncedAt: 20 }),
      record({ url: "https://chatgpt.com/c/broken", title: "Broken", order: 1, syncedAt: 20 })
    ]
  }), {
    ok: false,
    error: "Simulated put failure."
  });

  const records = await worker.send({ type: "records:list", accountId: "id:user" }) as ConversationRecord[];
  assert.deepEqual(records.map((item) => item.title), ["Old"]);
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

  const records = await worker.send({ type: "records:list", accountId: "id:user" }) as ConversationRecord[];
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

  const records = await worker.send({ type: "records:list", accountId: "id:user" }) as ConversationRecord[];
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

  const exported = await worker.send({ type: "records:export", accountId: "id:source" }) as IndexExport;
  assert.equal(exported.kind, "chatgpt-conversation-search-index");
  assert.equal(exported.records[0]?.title, "Exported");

  exported.records.push(record({
    accountId: "id:other",
    url: "https://chatgpt.com/c/other",
    title: "Other account",
    syncedAt: 15
  }));
  assert.deepEqual(await worker.send({ type: "records:import", exportData: exported }), { imported: 2 });
  assert.deepEqual(
    (await worker.send({ type: "records:list", accountId: "id:other" }) as ConversationRecord[]).map((item) => item.title),
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
    error: "Invalid message: records:list"
  });
  assert.deepEqual(await worker.sendRaw({ type: "missing:type" }), {
    ok: false,
    error: "Invalid message: missing:type"
  });
  assert.deepEqual(await worker.sendRaw({ type: "records:replace", accountId: "id:user" }), {
    ok: false,
    error: "Invalid message: records:replace"
  });
  assert.deepEqual(await worker.sendRaw({ type: "records:delete", accountId: "id:user" }), {
    ok: false,
    error: "Invalid message: records:delete"
  });
  assert.deepEqual(await worker.sendRaw({ type: "records:import", exportData: null }), {
    ok: false,
    error: "Invalid message: records:import"
  });
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
  assert.deepEqual(worker.sentTabMessages, [{ tabId: 11, message: { type: "ui:toggleSearch" } }]);

  worker.activeTabs = [{ id: 12, url: "https://example.com/" }];
  await worker.runCommand("open-search");
  await worker.runCommand("other-command");
  assert.deepEqual(worker.sentTabMessages, [{ tabId: 11, message: { type: "ui:toggleSearch" } }]);
});

async function loadServiceWorker(t: TestContext, options: LoadWorkerOptions = {}): Promise<WorkerHarness> {
  const previousChrome = globalThis.chrome;
  const previousIndexedDb = globalThis.indexedDB;
  const previousIdbKeyRange = globalThis.IDBKeyRange;
  const messageListeners: WorkerMessageListener[] = [];
  const commandListeners: CommandListener[] = [];
  const sentTabMessages: Array<{ tabId: number; message: { type: string } }> = [];
  const fakeIndexedDb = createFakeIndexedDb(options);
  const worker: WorkerHarness = {
    activeTabs: options.activeTabs || [],
    sentTabMessages,
    async send(message) {
      const rawResponse = await this.sendRaw(message);
      const response = rawResponse as ServiceResponse<unknown>;
      if (!response.ok) throw new Error(response.error || "Extension request failed.");
      return response.data;
    },
    sendRaw(message: unknown): Promise<unknown> {
      return new Promise((resolve) => {
        const keepAlive = messageListeners[0]!(message, {}, resolve);
        assert.equal(keepAlive, true);
      });
    },
    async runCommand(command) {
      await commandListeners[0]!(command);
    }
  };

  globalThis.indexedDB = fakeIndexedDb as unknown as IDBFactory;
  globalThis.IDBKeyRange = {
    only(value: unknown) {
      return { value };
    }
  } as unknown as typeof IDBKeyRange;
  globalThis.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(listener: WorkerMessageListener) {
          messageListeners.push(listener);
        }
      }
    },
    commands: {
      onCommand: {
        addListener(listener: CommandListener) {
          commandListeners.push(listener);
        }
      }
    },
    tabs: {
      async query(query: unknown) {
        assert.deepEqual(query, { active: true, currentWindow: true });
        return worker.activeTabs;
      },
      async sendMessage(tabId: number, message: { type: string }) {
        sentTabMessages.push({ tabId, message });
      }
    }
  } as unknown as typeof chrome;

  t.after(() => {
    globalThis.chrome = previousChrome;
    globalThis.indexedDB = previousIndexedDb;
    globalThis.IDBKeyRange = previousIdbKeyRange;
  });

  await import(`../src/serviceWorker.ts?service-worker-test=${importCounter++}`);
  assert.equal(messageListeners.length, 1);
  assert.equal(commandListeners.length, 1);
  return worker;
}

function record(overrides: Partial<ConversationRecord>): ConversationRecord {
  return {
    accountId: "id:user",
    url: "https://chatgpt.com/c/default",
    title: "Default",
    order: 0,
    syncedAt: 1,
    ...overrides
  };
}

interface FakeIdbRequest<T> {
  result: T | null;
  onerror?: (() => void) | null;
  onsuccess?: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
}

function createFakeIndexedDb(options: LoadWorkerOptions) {
  const databases = new Map<string, FakeDb>();

  return {
    open(name: string): FakeIdbRequest<FakeDb> {
      const request: FakeIdbRequest<FakeDb> = { result: null };
      queueMicrotask(() => {
        let db = databases.get(name);
        const isNew = !db;
        if (!db) {
          db = new FakeDb(options);
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
  options: LoadWorkerOptions;
  records = new Map<string, ConversationRecord>();
  hasStore = false;
  objectStoreNames = {
    contains: (name: string) => name === "conversations" && this.hasStore
  };

  constructor(options: LoadWorkerOptions) {
    this.options = options;
  }

  createObjectStore(name: string): FakeObjectStore {
    assert.equal(name, "conversations");
    this.hasStore = true;
    return new FakeObjectStore(this);
  }

  transaction(name: string): FakeTransaction {
    assert.equal(name, "conversations");
    return new FakeTransaction(this);
  }
}

interface FakeCursor {
  primaryKey: [string, string];
  continue(): void;
}

class FakeTransaction {
  db: FakeDb;
  snapshot: Map<string, ConversationRecord>;
  error: Error | null = null;
  aborted = false;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor(db: FakeDb) {
    this.db = db;
    this.snapshot = new Map(db.records);
    setTimeout(() => {
      if (!this.aborted) this.oncomplete?.();
    }, 0);
  }

  objectStore(): FakeObjectStore {
    return new FakeObjectStore(this.db, this);
  }

  abort(error: Error) {
    if (this.aborted) return;
    this.aborted = true;
    this.error = error;
    this.db.records = new Map(this.snapshot);
    queueMicrotask(() => this.onabort?.());
  }
}

class FakeObjectStore {
  db: FakeDb;
  transaction: FakeTransaction | null;

  constructor(db: FakeDb, transaction: FakeTransaction | null = null) {
    this.db = db;
    this.transaction = transaction;
  }

  createIndex(): void {}

  index(name: string) {
    assert.equal(name, "accountId");
    return {
      getAll: (accountId: string): FakeIdbRequest<ConversationRecord[]> => {
        const request: FakeIdbRequest<ConversationRecord[]> = { result: null };
        queueMicrotask(() => {
          request.result = [...this.db.records.values()]
            .filter((item) => item.accountId === accountId)
            .map((item) => ({ ...item }));
          request.onsuccess?.();
        });
        return request;
      },
      openKeyCursor: (range: { value: string }): FakeIdbRequest<FakeCursor | null> => {
        const request: FakeIdbRequest<FakeCursor | null> = { result: null };
        const keys: Array<[string, string]> = [...this.db.records.values()]
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

  put(item: ConversationRecord): void {
    if (this.db.options.failPutTitle === item.title) {
      this.transaction?.abort(new Error("Simulated put failure."));
      return;
    }
    this.db.records.set(JSON.stringify([item.accountId, item.url]), { ...item });
  }

  getAll(): FakeIdbRequest<ConversationRecord[]> {
    const request: FakeIdbRequest<ConversationRecord[]> = { result: null };
    queueMicrotask(() => {
      request.result = [...this.db.records.values()].map((item) => ({ ...item }));
      request.onsuccess?.();
    });
    return request;
  }

  delete(primaryKey: [string, string]): void {
    if (this.transaction?.aborted) return;
    this.db.records.delete(JSON.stringify(primaryKey));
  }
}
