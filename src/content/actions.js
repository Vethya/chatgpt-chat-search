export const MSG_MISSING_ACCOUNT = "Can't identify this ChatGPT account. Open the account menu, then try again.";

export function createContentActions({
  detectAccountIdentity,
  formatConversationCount,
  formatNumber,
  icon,
  mergeRecentRecords,
  searchConversations,
  sendMessage,
  state,
  ui
}) {
  async function openSearch() {
    ui.modalBackdrop.hidden = false;
    await refreshAccountAndRecords();
    if (!state.accountId) {
      ui.showToast(MSG_MISSING_ACCOUNT, "warning");
    }
    ui.updateSearchClearButton();
    renderResults();
    ui.input.focus();
    ui.input.select();
  }

  function toggleSearch() {
    if (ui.modalBackdrop.hidden) {
      openSearch();
    } else {
      ui.closeSearch();
    }
  }

  function clearSearch() {
    ui.input.value = "";
    state.query = "";
    ui.updateSearchClearButton();
    renderResults();
    ui.input.focus();
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
    ui.resultsList.replaceChildren();
    const hasEmptyIndex = Boolean(state.accountId && state.records.length === 0);
    ui.modal.classList.toggle("is-empty", hasEmptyIndex);
    ui.emptyState.hidden = !hasEmptyIndex;
    ui.emptyState.textContent = "";

    if (!state.accountId) {
      ui.status.textContent = MSG_MISSING_ACCOUNT;
      return;
    }
    if (state.records.length === 0) {
      ui.status.textContent = "";
      ui.emptyState.textContent = "New chats are saved automatically. Use Full sync to bring in your existing sidebar history.";
      return;
    }
    if (state.results.length === 0) {
      ui.status.textContent = "No indexed conversations found.";
      return;
    }

    ui.status.textContent = `${formatNumber(state.records.length)} indexed conversations`;
    for (const [index, result] of state.results.entries()) {
      const item = document.createElement("li");
      item.className = index === state.selectedIndex ? "is-selected" : "";
      item.innerHTML = `
        <button class="cgcs-result-open" type="button">
          <span class="cgcs-title"></span>
          <span class="cgcs-meta"></span>
        </button>
        <button class="cgcs-delete" type="button" title="Remove from local index" aria-label="Remove from local index">${icon.trash}</button>
      `;
      item.querySelector(".cgcs-title").textContent = result.record.title;
      item.querySelector(".cgcs-meta").textContent = `#${(result.record.order ?? index) + 1}`;
      item.querySelector(".cgcs-result-open").addEventListener("click", () => selectResult(index));
      item.querySelector(".cgcs-delete").addEventListener("click", () => deleteResult(index));
      ui.resultsList.append(item);
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

  async function deleteResult(index) {
    const result = state.results[index];
    if (!result || !state.accountId) return;
    if (!confirm(`Remove "${result.record.title}" from the local index?`)) return;

    const response = await sendMessage({
      type: "records:delete",
      accountId: state.accountId,
      url: result.record.url
    });
    state.records = state.records
      .filter((record) => record.url !== result.record.url)
      .map((record, order) => ({ ...record, order }));
    renderResults();
    ui.showToast(response.deleted
      ? `Removed "${result.record.title}" from the local index.`
      : "That conversation was already absent from the local index.");
  }

  async function exportIndex() {
    if (!(await ensureAccount())) return;
    ui.setActionButtonsDisabled(true);
    try {
      const exportData = await sendMessage({ type: "records:export", accountId: state.accountId });
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `chatgpt-conversation-index-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      ui.showToast("Export downloaded.", "success");
    } catch (error) {
      ui.showToast(error.message || "Export failed.", "error");
    } finally {
      ui.setActionButtonsDisabled(false);
    }
  }

  async function importIndex() {
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept = "application/json";
    picker.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      ui.setActionButtonsDisabled(true);
      try {
        const text = await file.text();
        const exportData = JSON.parse(text);
        const result = await sendMessage({ type: "records:import", exportData });
        await refreshAccountAndRecords();
        renderResults();
        const message = `Imported ${formatConversationCount(result.imported, "record")}.`;
        ui.status.textContent = message;
        ui.showToast(message, "success");
      } catch (error) {
        const message = error.message || "Import failed.";
        ui.status.textContent = message;
        ui.showToast(message, "error");
      } finally {
        ui.setActionButtonsDisabled(false);
      }
    });
    picker.click();
  }

  async function resetIndex() {
    if (!(await ensureAccount())) return;
    if (!confirm("Clear the local conversation index for this ChatGPT account?")) return;
    ui.setActionButtonsDisabled(true);
    try {
      await sendMessage({ type: "records:reset", accountId: state.accountId });
      state.records = [];
      renderResults();
      ui.showToast("Local index cleared.", "success");
    } catch (error) {
      ui.showToast(error.message || "Clear index failed.", "error");
    } finally {
      ui.setActionButtonsDisabled(false);
    }
  }

  async function ensureAccount() {
    state.accountId = await detectAccountIdentity(document);
    if (!state.accountId) {
      ui.status.textContent = MSG_MISSING_ACCOUNT;
      ui.showToast(MSG_MISSING_ACCOUNT, "warning");
      return false;
    }
    return true;
  }

  return {
    clearSearch,
    deleteResult,
    ensureAccount,
    exportIndex,
    handleSearchKeydown,
    importIndex,
    openSearch,
    refreshAccountAndRecords,
    renderResults,
    resetIndex,
    selectResult,
    toggleSearch
  };
}
