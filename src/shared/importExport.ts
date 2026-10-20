import { compareRecordOrder } from "./order.js";
import type { ConversationRecord, IndexExport } from "./types.js";

export const EXPORT_VERSION = 1;

export function createIndexExport(
  accountId: string,
  records: ConversationRecord[],
  exportedAt = new Date().toISOString()
): IndexExport {
  return {
    kind: "chatgpt-conversation-search-index",
    version: EXPORT_VERSION,
    exportedAt,
    accountId,
    records: records.map((record) => sanitizeRecord(record))
  };
}

export function parseIndexExport(rawValue: IndexExport | string): IndexExport {
  const parsed = typeof rawValue === "string" ? (JSON.parse(rawValue) as IndexExport) : rawValue;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("That file is not a ChatGPT Conversation Search export.");
  }
  if (parsed.kind !== "chatgpt-conversation-search-index") {
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

export function mergeRecordsByUrl(
  existingRecords: ConversationRecord[],
  incomingRecords: ConversationRecord[]
): ConversationRecord[] {
  const byUrl = new Map<string, ConversationRecord>();
  for (const record of existingRecords) byUrl.set(record.url, sanitizeRecord(record));
  for (const record of incomingRecords) {
    const clean = sanitizeRecord(record);
    const previous = byUrl.get(clean.url);
    byUrl.set(clean.url, chooseNewerRecord(previous, clean));
  }
  return [...byUrl.values()].sort(compareRecordOrder);
}

export function mergeRecentRecords(
  existingRecords: ConversationRecord[],
  incomingRecords: ConversationRecord[]
): ConversationRecord[] {
  const recent = dedupeRecordsByUrl(incomingRecords).sort(compareRecordOrder);
  const recentUrls = new Set(recent.map((record) => record.url));
  const older = existingRecords
    .map((record) => sanitizeRecord(record))
    .filter((record) => !recentUrls.has(record.url))
    .sort(compareRecordOrder);

  return [...recent, ...older].map((record, order) => ({ ...record, order }));
}

export function sanitizeRecord(record: ConversationRecord): ConversationRecord {
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

function chooseNewerRecord(
  previous: ConversationRecord | undefined,
  incoming: ConversationRecord
): ConversationRecord {
  if (!previous) return incoming;
  return incoming.syncedAt >= previous.syncedAt ? incoming : previous;
}

function dedupeRecordsByUrl(records: ConversationRecord[]): ConversationRecord[] {
  const byUrl = new Map<string, ConversationRecord>();
  for (const record of records) {
    const clean = sanitizeRecord(record);
    const previous = byUrl.get(clean.url);
    byUrl.set(clean.url, chooseNewerRecord(previous, clean));
  }
  return [...byUrl.values()];
}
