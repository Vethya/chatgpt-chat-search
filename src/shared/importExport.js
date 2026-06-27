export const EXPORT_VERSION = 1;

export function createIndexExport(accountId, records, exportedAt = new Date().toISOString()) {
  return {
    kind: "chatgpt-conversation-search-index",
    version: EXPORT_VERSION,
    exportedAt,
    accountId,
    records: records.map((record) => sanitizeRecord(record))
  };
}

export function parseIndexExport(rawValue) {
  const parsed = typeof rawValue === "string" ? JSON.parse(rawValue) : rawValue;
  if (!parsed || parsed.kind !== "chatgpt-conversation-search-index") {
    throw new Error("That file is not a ChatGPT Conversation Search export.");
  }
  if (parsed.version !== EXPORT_VERSION) {
    throw new Error(`Unsupported export version: ${parsed.version}`);
  }
  if (!Array.isArray(parsed.records)) {
    throw new Error("Export file is missing records.");
  }

  return {
    ...parsed,
    records: parsed.records.map((record) => sanitizeRecord(record))
  };
}

export function mergeRecordsByUrl(existingRecords, incomingRecords) {
  const byUrl = new Map();
  for (const record of existingRecords) byUrl.set(record.url, sanitizeRecord(record));
  for (const record of incomingRecords) {
    const clean = sanitizeRecord(record);
    const previous = byUrl.get(clean.url);
    byUrl.set(clean.url, chooseNewerRecord(previous, clean));
  }
  return [...byUrl.values()].sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export function mergeRecentRecords(existingRecords, incomingRecords) {
  const recent = dedupeRecordsByUrl(incomingRecords).sort(compareByOrder);
  const recentUrls = new Set(recent.map((record) => record.url));
  const older = existingRecords
    .map((record) => sanitizeRecord(record))
    .filter((record) => !recentUrls.has(record.url))
    .sort(compareByOrder);

  return [...recent, ...older].map((record, order) => ({ ...record, order }));
}

export function sanitizeRecord(record) {
  if (!record || !record.accountId || !record.url || !record.title) {
    throw new Error("Conversation record is missing required fields.");
  }
  return {
    accountId: String(record.accountId),
    url: String(record.url),
    title: String(record.title),
    order: Number.isFinite(record.order) ? record.order : 0,
    syncedAt: Number.isFinite(record.syncedAt) ? record.syncedAt : Date.now()
  };
}

function chooseNewerRecord(previous, incoming) {
  if (!previous) return incoming;
  return incoming.syncedAt >= previous.syncedAt ? incoming : previous;
}

function dedupeRecordsByUrl(records) {
  const byUrl = new Map();
  for (const record of records) {
    const clean = sanitizeRecord(record);
    const previous = byUrl.get(clean.url);
    byUrl.set(clean.url, chooseNewerRecord(previous, clean));
  }
  return [...byUrl.values()];
}

function compareByOrder(left, right) {
  return (left.order ?? 0) - (right.order ?? 0);
}
