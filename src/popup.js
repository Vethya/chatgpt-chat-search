const statusElement = document.querySelector("#status");
const openSearchButton = document.querySelector("#open-search");
const openChatGptButton = document.querySelector("#open-chatgpt");

openSearchButton.addEventListener("click", openSearch);
openChatGptButton.addEventListener("click", () => chrome.tabs.create({ url: "https://chatgpt.com/" }));

refreshStatus();

async function openSearch() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://chatgpt.com/")) {
    await chrome.tabs.create({ url: "https://chatgpt.com/" });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ui:openSearch" });
    window.close();
  } catch {
    renderMessage("Refresh the ChatGPT tab, then try again.");
  }
}

async function refreshStatus() {
  try {
    const statuses = await sendRuntimeMessage({ type: "status:listAccounts" });
    renderAccountStatuses(statuses);
  } catch {
    renderMessage("Open ChatGPT to search or sync conversations.");
  }
}

function renderAccountStatuses(statuses) {
  if (!Array.isArray(statuses) || statuses.length === 0) {
    renderMessage("No indexed conversations yet.");
    return;
  }

  if (statuses.length === 1) {
    const [status] = statuses;
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

function renderMessage(message) {
  statusElement.className = "status-card status-message";
  statusElement.title = "";
  statusElement.textContent = message;
}

function formatConversationLabel(count) {
  const safeCount = Number.isFinite(count) ? count : 0;
  return `conversation${safeCount === 1 ? "" : "s"}`;
}

function formatNumber(value) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat().format(safeValue);
}

function formatRelativeLastSynced(lastSyncedAt, now = Date.now()) {
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

function formatExactLastSynced(lastSyncedAt) {
  if (!lastSyncedAt) return "Never synced";
  return `Last synced ${new Date(lastSyncedAt).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatAccountLabel(accountId) {
  const value = String(accountId || "unknown");
  if (value.startsWith("email-sha256:")) return `email hash ${shorten(value.slice("email-sha256:".length))}`;
  if (value.startsWith("id:")) return shorten(value.slice(3));
  return shorten(value);
}

function shorten(value) {
  if (value.length <= 18) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Extension request failed."));
        return;
      }
      resolve(response.data);
    });
  });
}
