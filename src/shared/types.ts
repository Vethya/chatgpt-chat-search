export type Theme = "light" | "dark";

export interface ConversationRecord {
  accountId: string;
  url: string;
  title: string;
  order: number;
  syncedAt: number;
}

export type SearchableRecord = Pick<ConversationRecord, "title" | "url"> & { order?: number };

export interface SearchResult {
  record: SearchableRecord;
  score: number;
}

export interface ContentScriptState {
  accountId: string | null;
  records: ConversationRecord[];
  results: SearchResult[];
  selectedIndex: number;
  query: string;
  syncCancel: (() => void) | null;
  autoIndexTimer: number | null;
  lastAutoIndexedKey: string;
  currentConversationUrl: string;
  conversationUrlChangedAt: number;
  lastDocumentTitle: string;
  documentTitleChangedAt: number;
}

export interface AccountStatus {
  accountId: string;
  count: number;
  lastSyncedAt: number;
}

export interface IndexExport {
  kind: "chatgpt-conversation-search-index";
  version: number;
  exportedAt: string;
  accountId: string;
  records: ConversationRecord[];
}

export type ServiceWorkerRequest =
  | { type: "records:list"; accountId: string }
  | { type: "records:replace"; accountId: string; records: ConversationRecord[] }
  | { type: "records:upsert"; accountId: string; records: ConversationRecord[] }
  | { type: "records:delete"; accountId: string; url: string }
  | { type: "records:reset"; accountId: string }
  | { type: "records:export"; accountId: string }
  | { type: "records:import"; exportData: IndexExport | string }
  | { type: "status:get"; accountId: string }
  | { type: "status:listAccounts" };

export interface ServiceWorkerResultMap {
  "records:list": ConversationRecord[];
  "records:replace": { count: number };
  "records:upsert": { count: number; upserted: number };
  "records:delete": { count: number; deleted: boolean };
  "records:reset": { count: number };
  "records:export": IndexExport;
  "records:import": { imported: number };
  "status:get": { count: number; lastSyncedAt: number };
  "status:listAccounts": AccountStatus[];
}

export type ServiceResponse<T> = { ok: true; data: T } | { ok: false; error: string };

export type UiMessage = { type: "ui:openSearch" } | { type: "ui:toggleSearch" };

export function isUiMessage(value: unknown): value is UiMessage {
  return typeof value === "object" && value !== null &&
    ((value as { type?: unknown }).type === "ui:openSearch" ||
      (value as { type?: unknown }).type === "ui:toggleSearch");
}

const SERVICE_WORKER_REQUEST_TYPES: ReadonlySet<string> = new Set([
  "records:list",
  "records:replace",
  "records:upsert",
  "records:delete",
  "records:reset",
  "records:export",
  "records:import",
  "status:get",
  "status:listAccounts"
]);

export function isServiceWorkerRequest(value: unknown): value is ServiceWorkerRequest {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && SERVICE_WORKER_REQUEST_TYPES.has(type);
}
