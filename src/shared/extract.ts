import type { ConversationRecord } from "./types.js";

const CONVERSATION_PATH_PATTERN = /\/c\/[a-zA-Z0-9-]+/;

export interface ExtractOptions {
  requireVisible?: boolean;
}

export function extractConversationRecordsFromDocument(
  documentRef: Document,
  accountId: string,
  syncedAt: number,
  origin: string,
  options: ExtractOptions = {}
): ConversationRecord[] {
  const anchors = Array.from(documentRef.querySelectorAll<HTMLAnchorElement>("a[href]"));
  return extractConversationRecordsFromAnchors(anchors, accountId, syncedAt, origin, options);
}

export function extractConversationRecordsFromAnchors(
  anchors: Iterable<HTMLAnchorElement>,
  accountId: string,
  syncedAt: number,
  origin = "https://chatgpt.com",
  options: ExtractOptions = {}
): ConversationRecord[] {
  const records: ConversationRecord[] = [];
  const seen = new Set<string>();

  for (const anchor of anchors) {
    if (!isConversationAnchorCandidate(anchor, options)) continue;

    const url = normalizeConversationUrl(getAnchorHref(anchor), origin);
    if (!url || seen.has(url)) continue;

    const title = extractConversationAnchorTitle(anchor);
    if (!title) continue;

    seen.add(url);
    records.push({
      accountId,
      url,
      title,
      order: records.length,
      syncedAt
    });
  }

  return records;
}

export function normalizeConversationUrl(
  href: string | null | undefined,
  origin = "https://chatgpt.com"
): string | null {
  if (!href) return null;
  if (String(href).trim().startsWith("#")) return null;
  let parsed: URL;
  try {
    parsed = new URL(String(href), origin);
  } catch {
    return null;
  }

  const match = parsed.pathname.match(CONVERSATION_PATH_PATTERN);
  if (!match) return null;
  return `${parsed.origin}${match[0]}`;
}

export function hasConversationLinks(documentRef: Document): boolean {
  return Array.from(documentRef.querySelectorAll<HTMLAnchorElement>("a[href]")).some((anchor) =>
    Boolean(normalizeConversationUrl(getAnchorHref(anchor), location.origin))
  );
}

export function extractConversationAnchorTitle(anchor: HTMLAnchorElement): string | null {
  const values = [
    anchor.getAttribute?.("aria-label"),
    anchor.getAttribute?.("title"),
    anchor.textContent
  ];

  return values
    .map((value) => String(value || "").replace(/\s+/g, " ").trim())
    .find((title) => title && !isNonConversationTitle(title)) || null;
}

export function isNonConversationTitle(title: string | null | undefined): boolean {
  const normalized = String(title || "").replace(/\s+/g, " ").trim().toLowerCase();
  return /^(|chatgpt|new chat|temporary chat|explore gpts|search chats|skip(?:\s+\S+){0,4}\s+content|main content|skip navigation|open sidebar|close sidebar|toggle sidebar)$/.test(normalized);
}

export function getAnchorHref(anchor: HTMLAnchorElement | null | undefined): string | null {
  return anchor?.getAttribute?.("href") || anchor?.href || null;
}

function isConversationAnchorCandidate(anchor: HTMLAnchorElement, options: ExtractOptions): boolean {
  if (!anchor || anchor.closest?.("#cgcs-root")) return false;
  if (options.requireVisible && !isVisible(anchor)) return false;
  return true;
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return false;
  const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
  return !style || (style.visibility !== "hidden" && style.display !== "none");
}
