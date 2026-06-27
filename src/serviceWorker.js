import {
  createIndexExport,
  mergeRecentRecords,
  mergeRecordsByUrl,
  parseIndexExport,
  sanitizeRecord
} from "./shared/importExport.js";

const DB_NAME = "chatgpt-conversation-search";
const DB_VERSION = 1;
const STORE = "conversations";

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

chrome.commands?.onCommand?.addListener(async (command) => {
  if (command !== "open-search") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && tab.url?.startsWith("https://chatgpt.com/")) {
    await chrome.tabs.sendMessage(tab.id, { type: "ui:openSearch" }).catch(() => {});
  }
});

async function handleMessage(message) {
  switch (message?.type) {
    case "records:list":
      return listRecords(message.accountId);
    case "records:replace":
      return replaceAccountRecords(message.accountId, message.records || []);
    case "records:upsert":
      return upsertAccountRecords(message.accountId, message.records || []);
    case "records:delete":
      return deleteAccountRecord(message.accountId, message.url);
    case "records:reset":
      return resetAccountRecords(message.accountId);
    case "records:export":
      return exportAccountRecords(message.accountId);
    case "records:import":
      return importRecords(message.exportData);
    case "status:get":
      return getStatus(message.accountId);
    case "status:listAccounts":
      return listAccountStatuses();
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}

async function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: ["accountId", "url"] });
        store.createIndex("accountId", "accountId", { unique: false });
        store.createIndex("syncedAt", "syncedAt", { unique: false });
      }
    };
  });
}

async function listRecords(accountId) {
  requireAccountId(accountId);
  const db = await openDb();
  return runTransaction(db, "readonly", (store, resolve, reject) => {
    const index = store.index("accountId");
    const request = index.getAll(accountId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.order - b.order));
  });
}

async function replaceAccountRecords(accountId, records) {
  requireAccountId(accountId);
  const cleanRecords = records.map((record) => sanitizeRecord({ ...record, accountId }));
  const db = await openDb();
  await runTransaction(db, "readwrite", (store, resolve, reject) => {
    const index = store.index("accountId");
    const request = index.openKeyCursor(IDBKeyRange.only(accountId));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        store.delete(cursor.primaryKey);
        cursor.continue();
        return;
      }

      for (const record of cleanRecords) store.put(record);
    };
  });
  return { count: cleanRecords.length };
}

async function upsertAccountRecords(accountId, records) {
  requireAccountId(accountId);
  const cleanRecords = records.map((record) => sanitizeRecord({ ...record, accountId }));
  if (cleanRecords.length === 0) return { count: (await listRecords(accountId)).length, upserted: 0 };

  const existing = await listRecords(accountId);
  const merged = mergeRecentRecords(existing, cleanRecords);
  await replaceAccountRecords(accountId, merged);
  return { count: merged.length, upserted: cleanRecords.length };
}

async function deleteAccountRecord(accountId, url) {
  requireAccountId(accountId);
  if (!url) throw new Error("Missing conversation URL.");

  const existing = await listRecords(accountId);
  const remaining = existing
    .filter((record) => record.url !== url)
    .map((record, order) => ({ ...record, order }));

  if (remaining.length === existing.length) return { count: existing.length, deleted: false };

  await replaceAccountRecords(accountId, remaining);
  return { count: remaining.length, deleted: true };
}

async function resetAccountRecords(accountId) {
  requireAccountId(accountId);
  const db = await openDb();
  await deleteAccountRecords(db, accountId);
  return { count: 0 };
}

async function exportAccountRecords(accountId) {
  const records = await listRecords(accountId);
  return createIndexExport(accountId, records);
}

async function importRecords(exportData) {
  const parsed = parseIndexExport(exportData);
  const db = await openDb();
  const accountIds = [...new Set(parsed.records.map((record) => record.accountId))];
  let imported = 0;

  for (const accountId of accountIds) {
    const existing = await listRecords(accountId);
    const incoming = parsed.records.filter((record) => record.accountId === accountId);
    const merged = mergeRecordsByUrl(existing, incoming);
    await replaceAccountRecords(accountId, merged);
    imported += incoming.length;
  }

  return { imported };
}

async function getStatus(accountId) {
  if (!accountId) return { count: 0 };
  const records = await listRecords(accountId);
  return {
    count: records.length,
    lastSyncedAt: records.reduce((latest, record) => Math.max(latest, record.syncedAt || 0), 0)
  };
}

async function listAccountStatuses() {
  const db = await openDb();
  const records = await runTransaction(db, "readonly", (store, resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
  const byAccountId = new Map();

  for (const record of records) {
    const status = byAccountId.get(record.accountId) || {
      accountId: record.accountId,
      count: 0,
      lastSyncedAt: 0
    };
    status.count += 1;
    status.lastSyncedAt = Math.max(status.lastSyncedAt, record.syncedAt || 0);
    byAccountId.set(record.accountId, status);
  }

  return [...byAccountId.values()].sort((left, right) =>
    right.lastSyncedAt - left.lastSyncedAt || left.accountId.localeCompare(right.accountId)
  );
}

async function deleteAccountRecords(db, accountId) {
  return runTransaction(db, "readwrite", (store, resolve, reject) => {
    const index = store.index("accountId");
    const request = index.openKeyCursor(IDBKeyRange.only(accountId));
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

function runTransaction(db, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    let settled = false;
    transaction.oncomplete = () => {
      if (!settled) resolve();
    };
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
    operation(
      store,
      (value) => {
        settled = true;
        resolve(value);
      },
      reject
    );
  });
}

function requireAccountId(accountId) {
  if (!accountId) throw new Error("Missing account identity.");
}
