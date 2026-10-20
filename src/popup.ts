import { applyPopupTheme, CHATGPT_THEME_STORAGE_KEY, normalizeTheme } from "./shared/theme.js";
import { formatConversationLabel, formatNumber, getShortcutLabel } from "./utils/format.js";
import { sendMessage } from "./shared/messaging.js";
import type { AccountStatus } from "./shared/types.js";

const statusElement = requiredElement<HTMLElement>("#status");
const openSearchButton = requiredElement<HTMLButtonElement>("#open-search");
const openChatGptButton = requiredElement<HTMLButtonElement>("#open-chatgpt");
const shortcutLabelElement = requiredElement<HTMLElement>("#shortcut-label");

setupTheme();
shortcutLabelElement.textContent = getShortcutLabel();

openSearchButton.addEventListener("click", openSearch);
openChatGptButton.addEventListener("click", () => chrome.tabs.create({ url: "https://chatgpt.com/" }));

refreshStatus();

async function openSearch(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://chatgpt.com/")) {
    await chrome.tabs.create({ url: "https://chatgpt.com/" });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ui:openSearch" });
    window.close();
  } catch {
    renderMessage("Refresh the ChatGPT tab, then try again.", "warning");
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const statuses = await sendMessage({ type: "status:listAccounts" });
    renderAccountStatuses(statuses);
  } catch {
    renderMessage("Open ChatGPT to search or sync conversations.");
  }
}

function renderAccountStatuses(statuses: AccountStatus[]): void {
  if (statuses.length === 0) {
    renderMessage("No indexed conversations yet.");
    return;
  }

  if (statuses.length === 1) {
    const status = statuses[0]!;
    statusElement.className = "status-card status-card-single";
    statusElement.title = formatExactLastSynced(status.lastSyncedAt);
    statusElement.innerHTML = `
      <div class="status-count">${formatNumber(status.count)}</div>
      <div class="status-label">${escapeHtml(formatConversationLabel(status.count))} indexed</div>
      <div class="status-sync">${escapeHtml(formatRelativeLastSynced(status.lastSyncedAt))}</div>
    `;
    return;
  }

  const total = statuses.reduce((sum, status) => sum + status.count, 0);
  const rows = statuses.map((status) => `
    <div class="account-row" title="${escapeAttribute(formatExactLastSynced(status.lastSyncedAt))}">
      <div>
        <div class="account-name">${escapeHtml(formatAccountLabel(status.accountId))}</div>
        <div class="account-sync">${escapeHtml(formatRelativeLastSynced(status.lastSyncedAt))}</div>
      </div>
      <div class="account-count">${formatNumber(status.count)}</div>
    </div>
  `).join("");

  statusElement.className = "status-card status-card-multiple";
  statusElement.title = "";
  statusElement.innerHTML = `
    <div class="status-summary">
      <span class="status-count-inline">${formatNumber(total)}</span>
      <span>${escapeHtml(formatConversationLabel(total))} across ${statuses.length} accounts</span>
    </div>
    <div class="account-list">${rows}</div>
  `;
}

function renderMessage(message: string, tone: "info" | "warning" = "info"): void {
  statusElement.className = `status-card status-message is-${tone}`;
  statusElement.title = "";
  statusElement.textContent = message;
}

function formatRelativeLastSynced(lastSyncedAt: number, now = Date.now()): string {
  if (!lastSyncedAt) return "Never synced";
  const elapsedMs = Math.max(0, now - lastSyncedAt);
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (elapsedMs < minuteMs) return "Last synced just now";
  if (elapsedMs < hourMs) {
    const minutes = Math.floor(elapsedMs / minuteMs);
    return `Last synced ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsedMs < dayMs) {
    const hours = Math.floor(elapsedMs / hourMs);
    return `Last synced ${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsedMs < 2 * dayMs) return "Last synced yesterday";
  if (elapsedMs < 7 * dayMs) {
    const days = Math.floor(elapsedMs / dayMs);
    return `Last synced ${days} days ago`;
  }

  const syncedAt = new Date(lastSyncedAt);
  const month = syncedAt.toLocaleString(undefined, { month: "short", timeZone: "UTC" });
  const day = syncedAt.getUTCDate();
  const year = syncedAt.getUTCFullYear();
  const currentYear = new Date(now).getUTCFullYear();
  return `Last synced ${month} ${day}${year === currentYear ? "" : `, ${year}`}`;
}

function formatExactLastSynced(lastSyncedAt: number): string {
  if (!lastSyncedAt) return "Never synced";
  return `Last synced ${new Date(lastSyncedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatAccountLabel(accountId: string): string {
  const value = String(accountId || "unknown");
  if (value.startsWith("email-sha256:")) return `email hash ${shorten(value.slice("email-sha256:".length))}`;
  if (value.startsWith("id:")) return shorten(value.slice(3));
  return shorten(value);
}

function shorten(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };
  return String(value).replace(/[&<>"']/g, (char) => replacements[char] ?? char);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function setupTheme(): void {
  applyPopupTheme(document, null, window);

  try {
    chrome.storage?.local?.get?.({ [CHATGPT_THEME_STORAGE_KEY]: null }, (values) => {
      if (chrome.runtime?.lastError) return;
      const storedTheme = values?.[CHATGPT_THEME_STORAGE_KEY];
      const theme = normalizeTheme(typeof storedTheme === "string" ? storedTheme : null);
      if (theme) applyPopupTheme(document, theme, window);
    });
  } catch {
    return;
  }
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing popup element: ${selector}`);
  return element;
}
