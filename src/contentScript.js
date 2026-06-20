(async () => {
  const CONVERSATION_LIST_IDLE_TIMEOUT_MS = 25000;
  const CHAT_STALL_RECOVERY_MS = 8000;
  const SCROLL_SETTLE_MS = 1100;
  const SIDEBAR_SCROLL_RATIO = 0.55;

  const [{ searchConversations }, extractModule, accountModule, syncIntegrityModule] = await Promise.all([
    import(chrome.runtime.getURL("src/shared/search.js")),
    import(chrome.runtime.getURL("src/shared/extract.js")),
    import(chrome.runtime.getURL("src/shared/account.js")),
    import(chrome.runtime.getURL("src/shared/syncIntegrity.js"))
  ]);

  const { extractConversationRecordsFromDocument } = extractModule;
  const { detectAccountIdentity } = accountModule;
  const { isSuspiciouslySmallSync } = syncIntegrityModule;

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
      rememberVisibleRecords(foundByUrl, state.accountId, syncedAt);

      await scanConversationList(scrollContainer, foundByUrl, state.accountId, syncedAt, () => cancelled);

      await scanProjectSections(scrollContainer, foundByUrl, state.accountId, syncedAt, () => cancelled);

      const records = [...foundByUrl.values()].sort((left, right) => left.order - right.order);
      if (records.length === 0) throw new Error("Sync could not find sidebar conversations.");
      if (isSuspiciouslySmallSync(state.records.length, records.length)) {
        throw new Error(`Sync found only ${records.length} conversations, but the current index has ${state.records.length}.`);
      }
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

  function rememberVisibleRecords(foundByUrl, accountId, syncedAt) {
    const visibleRecords = extractConversationRecordsFromDocument(document, accountId, syncedAt, location.origin);
    for (const record of visibleRecords) {
      const existing = foundByUrl.get(record.url);
      foundByUrl.set(record.url, existing ? { ...existing, title: record.title, syncedAt } : { ...record, order: foundByUrl.size });
    }
  }

  async function scanConversationList(scrollContainer, foundByUrl, accountId, syncedAt, isCancelled) {
    scrollToSection(scrollContainer, "chats");
    await sleep(SCROLL_SETTLE_MS);

    let lastNewConversationAt = Date.now();
    let lastRecoveryAt = 0;

    while (Date.now() - lastNewConversationAt < CONVERSATION_LIST_IDLE_TIMEOUT_MS) {
      if (isCancelled()) throw new Error("Sync canceled.");

      const beforeRecords = foundByUrl.size;
      await expandShowMoreControls(scrollContainer);
      rememberVisibleRecords(foundByUrl, accountId, syncedAt);
      if (foundByUrl.size > beforeRecords) {
        lastNewConversationAt = Date.now();
        lastRecoveryAt = 0;
      }

      const idleSeconds = Math.floor((Date.now() - lastNewConversationAt) / 1000);
      syncDetail.textContent = `Finding conversations... ${foundByUrl.size} indexed. ${idleSeconds}/25s idle`;

      if (Date.now() - lastNewConversationAt >= CHAT_STALL_RECOVERY_MS && Date.now() - lastRecoveryAt >= CHAT_STALL_RECOVERY_MS) {
        lastRecoveryAt = Date.now();
        await recoverStalledConversationScroll(scrollContainer, isCancelled);
        continue;
      }

      scrollContainer.scrollTop += getSidebarScrollStep(scrollContainer);
      await sleep(SCROLL_SETTLE_MS);
    }
  }

  async function expandShowMoreControls(scrollContainer) {
    const controls = Array.from(scrollContainer.querySelectorAll("button, [role='button'], summary"));
    let expandedCount = 0;

    for (const control of controls) {
      if (!isShowMoreControl(control)) continue;
      control.click();
      expandedCount += 1;
      await sleep(120);
    }

    return expandedCount;
  }

  async function scanProjectSections(scrollContainer, foundByUrl, accountId, syncedAt, isCancelled) {
    const visitedProjects = new Set();
    scrollContainer.scrollTop = 0;
    await sleep(300);

    let quietPasses = 0;
    while (quietPasses < 4) {
      if (isCancelled()) throw new Error("Sync canceled.");
      const beforeRecords = foundByUrl.size;
      const clickedProjects = await clickVisibleProjectControls(scrollContainer, visitedProjects);
      rememberVisibleRecords(foundByUrl, accountId, syncedAt);

      syncDetail.textContent = `Checking projects... ${foundByUrl.size} indexed.`;
      quietPasses = clickedProjects === 0 && foundByUrl.size === beforeRecords ? quietPasses + 1 : 0;
      scrollContainer.scrollTop += getSidebarScrollStep(scrollContainer);
      await sleep(SCROLL_SETTLE_MS);
    }
  }

  function getSidebarScrollStep(scrollContainer) {
    return Math.max(160, Math.floor(scrollContainer.clientHeight * SIDEBAR_SCROLL_RATIO));
  }

  async function recoverStalledConversationScroll(scrollContainer, isCancelled) {
    syncDetail.textContent = "Finding conversations... nudging sidebar to load more.";
    const scrollStep = getSidebarScrollStep(scrollContainer);

    scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - Math.floor(scrollStep * 0.8));
    await sleep(SCROLL_SETTLE_MS);
    if (isCancelled()) throw new Error("Sync canceled.");

    scrollContainer.scrollTop += scrollStep;
    await sleep(SCROLL_SETTLE_MS);
    if (isCancelled()) throw new Error("Sync canceled.");

    scrollContainer.scrollTop += Math.floor(scrollStep * 0.35);
    await sleep(SCROLL_SETTLE_MS);
  }

  function scrollToSection(scrollContainer, sectionName) {
    const heading = findVisibleSectionHeading(scrollContainer, [sectionName]);
    if (!heading) return false;

    const headingTop = heading.getBoundingClientRect().top;
    const containerTop = scrollContainer.getBoundingClientRect().top;
    scrollContainer.scrollTop += headingTop - containerTop;
    return true;
  }

  async function clickVisibleProjectControls(scrollContainer, visitedProjects) {
    const controls = Array.from(scrollContainer.querySelectorAll("a[href], button, [role='button']"));
    let clicked = 0;

    for (const control of controls) {
      if (!isProjectControl(control, scrollContainer)) continue;
      const key = control.getAttribute("href") || compactText(control.textContent);
      if (!key || visitedProjects.has(key)) continue;
      visitedProjects.add(key);
      control.click();
      clicked += 1;
      await sleep(450);
    }

    return clicked;
  }

  function isShowMoreControl(control) {
    if (!control || control.closest("#cgcs-root")) return false;
    if (control.closest("a[href*='/c/']")) return false;
    if (!isVisible(control)) return false;

    const text = compactText(control.textContent);
    const label = compactText(control.getAttribute("aria-label"));
    const isShowMore = text === "show more" || label === "show more";
    const opensMenu = control.getAttribute("aria-haspopup") === "menu";
    const menuLike = /^(more|options|edit|delete|share)$/i.test(text || label);

    return isShowMore && !opensMenu && !menuLike;
  }

  function isProjectControl(control, scrollContainer) {
    if (!control || control.closest("#cgcs-root")) return false;
    if (!isVisible(control)) return false;
    if (control.closest("a[href*='/c/']")) return false;

    const text = compactText(control.textContent);
    const label = compactText(control.getAttribute("aria-label"));
    const href = control.getAttribute("href") || "";
    const opensMenu = control.getAttribute("aria-haspopup") === "menu";
    const blocked = /^(|projects|chats|pinned|show more|more|options|edit|delete|share)$/i.test(text || label);
    const sidebarAction = /^(new chat|search chats|apps)$/i.test(text || label);

    if (opensMenu || blocked || sidebarAction) return false;
    if (href && !isProjectHref(href)) return false;
    if (!isInsideProjectsArea(control, scrollContainer) && !isInsidePinnedArea(control, scrollContainer)) return false;

    const rect = control.getBoundingClientRect();
    return rect.width >= 48 && rect.height >= 20;
  }

  function isInsideProjectsArea(element, scrollContainer) {
    return isInsideSectionArea(element, scrollContainer, ["projects"], ["chats"]);
  }

  function isInsidePinnedArea(element, scrollContainer) {
    return isInsideSectionArea(element, scrollContainer, ["pinned"], ["projects", "chats"]);
  }

  function isInsideSectionArea(element, scrollContainer, startSections, endSections) {
    const elementTop = element.getBoundingClientRect().top;
    const labels = getVisibleSectionLabels(scrollContainer);
    const sectionHeadings = labels.filter((label) => startSections.includes(label.text) && label.top <= elementTop);
    if (sectionHeadings.length === 0) return false;

    const latestSectionTop = Math.max(...sectionHeadings.map((label) => label.top));
    const nextEndHeading = labels.find((label) => endSections.includes(label.text) && label.top > latestSectionTop);
    return !nextEndHeading || elementTop < nextEndHeading.top;
  }

  function findVisibleSectionHeading(scrollContainer, sectionNames) {
    return Array.from(scrollContainer.querySelectorAll("div, span, h2, h3, p"))
      .filter(isVisible)
      .find((node) => sectionNames.includes(compactText(node.textContent)));
  }

  function getVisibleSectionLabels(scrollContainer) {
    return Array.from(scrollContainer.querySelectorAll("div, span, h2, h3, p"))
      .filter(isVisible)
      .map((node) => ({
        text: compactText(node.textContent),
        top: node.getBoundingClientRect().top
      }));
  }

  function isProjectHref(href) {
    return /project|\/g\//i.test(href);
  }

  function compactText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
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
