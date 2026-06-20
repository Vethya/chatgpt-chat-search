(async () => {
  const [{ searchConversations }, extractModule, accountModule] = await Promise.all([
    import(chrome.runtime.getURL("src/shared/search.js")),
    import(chrome.runtime.getURL("src/shared/extract.js")),
    import(chrome.runtime.getURL("src/shared/account.js"))
  ]);

  const {
    extractConversationRecordsFromDocument,
    hasConversationLinks
  } = extractModule;
  const { detectAccountIdentity } = accountModule;

  const state = {
    accountId: null,
    records: [],
    results: [],
    selectedIndex: 0,
    query: "",
    syncCancel: null
  };

  const root = document.createElement("div");
  root.id = "cgcs-root";
  root.innerHTML = `
    <button class="cgcs-entry" type="button" title="Search conversations">Search</button>
    <div class="cgcs-modal-backdrop" hidden>
      <section class="cgcs-modal" role="dialog" aria-modal="true" aria-label="Conversation search">
        <div class="cgcs-toolbar">
          <input class="cgcs-input" type="search" placeholder="Search conversations" autocomplete="off" />
          <button class="cgcs-small cgcs-sync" type="button">Sync</button>
        </div>
        <div class="cgcs-status"></div>
        <ol class="cgcs-results"></ol>
        <div class="cgcs-actions">
          <button class="cgcs-small cgcs-import" type="button">Import</button>
          <button class="cgcs-small cgcs-export" type="button">Export</button>
          <button class="cgcs-small cgcs-reset" type="button">Clear</button>
        </div>
      </section>
    </div>
    <div class="cgcs-sync-overlay" hidden>
      <div class="cgcs-sync-card">
        <strong class="cgcs-sync-title">Syncing conversations</strong>
        <p class="cgcs-sync-detail">Preparing...</p>
        <button class="cgcs-cancel" type="button">Cancel</button>
      </div>
    </div>
  `;
  document.documentElement.append(root);

  const entryButton = root.querySelector(".cgcs-entry");
  const modalBackdrop = root.querySelector(".cgcs-modal-backdrop");
  const input = root.querySelector(".cgcs-input");
  const status = root.querySelector(".cgcs-status");
  const resultsList = root.querySelector(".cgcs-results");
  const syncButton = root.querySelector(".cgcs-sync");
  const importButton = root.querySelector(".cgcs-import");
  const exportButton = root.querySelector(".cgcs-export");
  const resetButton = root.querySelector(".cgcs-reset");
  const syncOverlay = root.querySelector(".cgcs-sync-overlay");
  const syncDetail = root.querySelector(".cgcs-sync-detail");
  const cancelButton = root.querySelector(".cgcs-cancel");

  entryButton.addEventListener("click", openSearch);
  syncButton.addEventListener("click", runConversationSync);
  importButton.addEventListener("click", importIndex);
  exportButton.addEventListener("click", exportIndex);
  resetButton.addEventListener("click", resetIndex);
  cancelButton.addEventListener("click", () => state.syncCancel?.());
  input.addEventListener("input", () => {
    state.query = input.value;
    renderResults();
  });
  input.addEventListener("keydown", handleSearchKeydown);

  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openSearch();
    } else if (event.key === "Escape" && !modalBackdrop.hidden) {
      closeSearch();
    }
  });

  modalBackdrop.addEventListener("click", (event) => {
    if (event.target === modalBackdrop) closeSearch();
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "ui:openSearch") openSearch();
  });

  async function openSearch() {
    modalBackdrop.hidden = false;
    await refreshAccountAndRecords();
    renderResults();
    input.focus();
    input.select();
  }

  function closeSearch() {
    modalBackdrop.hidden = true;
  }

  async function refreshAccountAndRecords() {
    state.accountId = await detectAccountIdentity(document);
    if (!state.accountId) {
      state.records = [];
      return;
    }
    const response = await sendMessage({ type: "records:list", accountId: state.accountId });
    state.records = response;
  }

  function renderResults() {
    state.results = searchConversations(state.records, state.query, 30);
    state.selectedIndex = Math.min(state.selectedIndex, Math.max(0, state.results.length - 1));
    resultsList.replaceChildren();

    if (!state.accountId) {
      status.textContent = "Can't identify this ChatGPT account. Open the account menu, then try again.";
      return;
    }
    if (state.records.length === 0) {
      status.textContent = "No synced conversations yet. Run Sync to build the local index.";
      return;
    }
    if (state.results.length === 0) {
      status.textContent = "No indexed conversations found.";
      return;
    }

    status.textContent = `${state.records.length} indexed conversations`;
    for (const [index, result] of state.results.entries()) {
      const item = document.createElement("li");
      item.className = index === state.selectedIndex ? "is-selected" : "";
      item.innerHTML = `
        <button type="button">
          <span class="cgcs-title"></span>
          <span class="cgcs-meta"></span>
        </button>
      `;
      item.querySelector(".cgcs-title").textContent = result.record.title;
      item.querySelector(".cgcs-meta").textContent = `#${(result.record.order ?? index) + 1}`;
      item.querySelector("button").addEventListener("click", () => selectResult(index));
      resultsList.append(item);
    }
  }

  function handleSearchKeydown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      state.selectedIndex = Math.min(state.selectedIndex + 1, state.results.length - 1);
      renderResults();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
      renderResults();
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectResult(state.selectedIndex);
    }
  }

  function selectResult(index) {
    const result = state.results[index];
    if (!result) return;
    window.location.assign(result.record.url);
  }

  async function runConversationSync() {
    state.accountId = await detectAccountIdentity(document);
    if (!state.accountId) {
      status.textContent = "Can't identify this ChatGPT account. Open the account menu, then try again.";
      return;
    }
    if (!hasConversationLinks(document)) {
      status.textContent = "Open the ChatGPT sidebar, then try sync again.";
      return;
    }

    const scrollContainer = findSidebarScrollContainer();
    if (!scrollContainer) {
      status.textContent = "Open the ChatGPT sidebar, then try sync again.";
      return;
    }

    const syncedAt = Date.now();
    const foundByUrl = new Map();
    let cancelled = false;
    state.syncCancel = () => {
      cancelled = true;
    };

    try {
      syncOverlay.hidden = false;
      scrollContainer.scrollTop = 0;
      await sleep(500);
      let quietPasses = 0;

      while (quietPasses < 4) {
        if (cancelled) throw new Error("Sync canceled.");
        const before = foundByUrl.size;
        const visibleRecords = extractConversationRecordsFromDocument(document, state.accountId, syncedAt, location.origin);
        for (const record of visibleRecords) {
          const existing = foundByUrl.get(record.url);
          foundByUrl.set(record.url, existing ? { ...existing, title: record.title, syncedAt } : { ...record, order: foundByUrl.size });
        }

        syncDetail.textContent = `Finding conversations... ${foundByUrl.size} indexed.`;
        quietPasses = foundByUrl.size === before ? quietPasses + 1 : 0;
        scrollContainer.scrollTop += Math.max(240, Math.floor(scrollContainer.clientHeight * 0.85));
        await sleep(650);
      }

      const records = [...foundByUrl.values()].sort((left, right) => left.order - right.order);
      if (records.length === 0) throw new Error("Sync could not find sidebar conversations.");
      await sendMessage({ type: "records:replace", accountId: state.accountId, records });
      state.records = records;
      status.textContent = `Synced ${records.length} conversations.`;
      renderResults();
    } catch (error) {
      status.textContent = error.message === "Sync canceled."
        ? "Sync canceled. Previous index unchanged."
        : `${error.message} Previous index unchanged.`;
    } finally {
      syncOverlay.hidden = true;
      state.syncCancel = null;
    }
  }

  async function exportIndex() {
    if (!(await ensureAccount())) return;
    const exportData = await sendMessage({ type: "records:export", accountId: state.accountId });
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chatgpt-conversation-index-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importIndex() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "application/json";
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      const text = await file.text();
      const exportData = JSON.parse(text);
      const result = await sendMessage({ type: "records:import", exportData });
      await refreshAccountAndRecords();
      renderResults();
      status.textContent = `Imported ${result.imported} records.`;
    });
    picker.click();
  }

  async function resetIndex() {
    if (!(await ensureAccount())) return;
    if (!confirm("Clear the local conversation index for this ChatGPT account?")) return;
    await sendMessage({ type: "records:reset", accountId: state.accountId });
    state.records = [];
    renderResults();
  }

  async function ensureAccount() {
    state.accountId = await detectAccountIdentity(document);
    if (!state.accountId) {
      status.textContent = "Can't identify this ChatGPT account. Open the account menu, then try again.";
      return false;
    }
    return true;
  }

  function findSidebarScrollContainer() {
    const conversationLink = Array.from(document.querySelectorAll("a[href]")).find((anchor) =>
      anchor.href.includes("/c/")
    );
    const candidates = [
      document.querySelector("nav"),
      document.querySelector("aside"),
      conversationLink?.closest("nav"),
      conversationLink?.closest("aside"),
      conversationLink?.parentElement
    ].filter(Boolean);

    let current = conversationLink?.parentElement;
    while (current && current !== document.body) {
      candidates.push(current);
      current = current.parentElement;
    }

    return candidates.find((element) => element.scrollHeight > element.clientHeight + 20) || null;
  }

  function sendMessage(message) {
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
