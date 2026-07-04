export type AccountId = string;

export interface ConversationRecord {
  accountId: AccountId;
  url: string;
  title: string;
  order: number;
  syncedAt: number;
}

export type ConversationRecordInput = Partial<ConversationRecord> & {
  accountId?: unknown;
  url?: unknown;
  title?: unknown;
  order?: unknown;
  syncedAt?: unknown;
};

export interface SearchResult {
  record: ConversationRecord;
  score: number;
}

export interface AccountStatus {
  accountId: AccountId;
  count: number;
  lastSyncedAt: number;
}

export interface IndexExport {
  kind: "chatgpt-conversation-search-index";
  version: 1;
  exportedAt: string;
  accountId: AccountId;
  records: ConversationRecord[];
}

export type RuntimeMessage =
  | { type: "records:list"; accountId: AccountId }
  | { type: "records:replace"; accountId: AccountId; records: ConversationRecordInput[] }
  | { type: "records:upsert"; accountId: AccountId; records: ConversationRecordInput[] }
  | { type: "records:delete"; accountId: AccountId; url: string }
  | { type: "records:reset"; accountId: AccountId }
  | { type: "records:export"; accountId: AccountId }
  | { type: "records:import"; exportData: unknown }
  | { type: "status:get"; accountId?: AccountId }
  | { type: "status:listAccounts" }
  | { type: "ui:openSearch" }
  | { type: "ui:toggleSearch" };

export type ServiceWorkerMessage = Exclude<RuntimeMessage, { type: "ui:openSearch" | "ui:toggleSearch" }>;
export type UiMessage = Extract<RuntimeMessage, { type: "ui:openSearch" | "ui:toggleSearch" }>;

export type RuntimeResponse<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type RecordsWriteResult = { count: number };
export type RecordsUpsertResult = { count: number; upserted: number };
export type RecordsDeleteResult = { count: number; deleted: boolean };
export type RecordsImportResult = { imported: number };
export type StatusResult = { count: number; lastSyncedAt?: number };

export type RuntimeMessageResult<T extends RuntimeMessage> =
  T extends { type: "records:list" } ? ConversationRecord[] :
  T extends { type: "records:replace" } ? RecordsWriteResult :
  T extends { type: "records:upsert" } ? RecordsUpsertResult :
  T extends { type: "records:delete" } ? RecordsDeleteResult :
  T extends { type: "records:reset" } ? RecordsWriteResult :
  T extends { type: "records:export" } ? IndexExport :
  T extends { type: "records:import" } ? RecordsImportResult :
  T extends { type: "status:get" } ? StatusResult :
  T extends { type: "status:listAccounts" } ? AccountStatus[] :
  unknown;
