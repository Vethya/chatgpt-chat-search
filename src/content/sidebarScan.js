const CONVERSATION_LIST_IDLE_TIMEOUT_MS = 25000;
const CHAT_STALL_RECOVERY_MS = 8000;
const RECENT_LIST_IDLE_TIMEOUT_MS = 5000;
const SCROLL_SETTLE_MS = 1100;
const SIDEBAR_SCROLL_RATIO = 0.55;

export function createSidebarScanner({
  compareRecordOrder,
  extractConversationAnchorTitle,
  extractConversationRecordsFromDocument,
  formatConversationCount,
  getAnchorHref,
  locationRef = location,
  normalizeConversationUrl,
  rememberRecentVisibleRecords,
  sleep,
  updateSyncDetail
}) {
  function findSidebarScrollContainer() {
    const conversationLink = Array.from(document.querySelectorAll("a[href]")).find((anchor) =>
      anchor.href.includes("/c/") && isUsableConversationAnchor(anchor)
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

  function rememberVisibleRecords(rootElement, foundByUrl, accountId, syncedAt) {
    const visibleRecords = extractConversationRecordsFromDocument(rootElement, accountId, syncedAt, locationRef.origin, {
      requireVisible: true
    });
    for (const record of visibleRecords) {
      const existing = foundByUrl.get(record.url);
      foundByUrl.set(record.url, existing ? { ...existing, title: record.title, syncedAt } : { ...record, order: foundByUrl.size });
    }
  }

  function rememberVisibleRecentRecords(rootElement, foundByUrl, knownUrls, visitedUrls, accountId, syncedAt, consecutiveKnownCount, stopThreshold) {
    const visibleRecords = extractConversationRecordsFromDocument(rootElement, accountId, syncedAt, locationRef.origin, {
      requireVisible: true
    }).map((record) => ({ ...record, syncedAt }));

    return rememberRecentVisibleRecords(
      visibleRecords,
      foundByUrl,
      knownUrls,
      visitedUrls,
      consecutiveKnownCount,
      stopThreshold
    );
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
      rememberVisibleRecords(scrollContainer, foundByUrl, accountId, syncedAt);
      if (foundByUrl.size > beforeRecords) {
        lastNewConversationAt = Date.now();
        lastRecoveryAt = 0;
      }

      updateSyncDetail(`Scanning your sidebar. Found ${formatConversationCount(foundByUrl.size)} so far.`);

      if (Date.now() - lastNewConversationAt >= CHAT_STALL_RECOVERY_MS && Date.now() - lastRecoveryAt >= CHAT_STALL_RECOVERY_MS) {
        lastRecoveryAt = Date.now();
        await recoverStalledConversationScroll(scrollContainer, isCancelled);
        continue;
      }

      scrollContainer.scrollTop += getSidebarScrollStep(scrollContainer);
      await sleep(SCROLL_SETTLE_MS);
    }
  }

  async function scanRecentConversationList(scrollContainer, foundByUrl, knownUrls, accountId, syncedAt, isCancelled, stopThreshold) {
    scrollToSection(scrollContainer, "chats");
    await sleep(SCROLL_SETTLE_MS);

    let lastNewConversationAt = Date.now();
    let consecutiveKnownCount = 0;
    const visitedUrls = new Set();

    while (Date.now() - lastNewConversationAt < RECENT_LIST_IDLE_TIMEOUT_MS) {
      if (isCancelled()) throw new Error("Sync canceled.");

      const beforeRecords = foundByUrl.size;
      await expandShowMoreControls(scrollContainer);
      const result = rememberVisibleRecentRecords(
        scrollContainer,
        foundByUrl,
        knownUrls,
        visitedUrls,
        accountId,
        syncedAt,
        consecutiveKnownCount,
        stopThreshold
      );
      consecutiveKnownCount = result.consecutiveKnownCount;
      if (result.hitKnownLimit) return true;
      if (foundByUrl.size > beforeRecords) lastNewConversationAt = Date.now();

      updateSyncDetail(foundByUrl.size === 0
        ? "Looking for recent chats to add."
        : `Looking for recent chats. Found ${formatConversationCount(foundByUrl.size)} to add.`);

      scrollContainer.scrollTop += getSidebarScrollStep(scrollContainer);
      await sleep(SCROLL_SETTLE_MS);
    }

    return false;
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
      rememberVisibleRecords(scrollContainer, foundByUrl, accountId, syncedAt);

      updateSyncDetail(`Checking project chats. Found ${formatConversationCount(foundByUrl.size)} so far.`);
      quietPasses = clickedProjects === 0 && foundByUrl.size === beforeRecords ? quietPasses + 1 : 0;
      scrollContainer.scrollTop += getSidebarScrollStep(scrollContainer);
      await sleep(SCROLL_SETTLE_MS);
    }
  }

  function getSortedRecords(foundByUrl) {
    return [...foundByUrl.values()].sort(compareRecordOrder);
  }

  function getSidebarScrollStep(scrollContainer) {
    return Math.max(160, Math.floor(scrollContainer.clientHeight * SIDEBAR_SCROLL_RATIO));
  }

  async function recoverStalledConversationScroll(scrollContainer, isCancelled) {
    updateSyncDetail("Still scanning. Gently nudging the sidebar to load more chats.");
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
    const labels = getVisibleSectionLabels(scrollContainer);
    let clicked = 0;

    for (const control of controls) {
      if (!isProjectControl(control, scrollContainer, labels)) continue;
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

  function isProjectControl(control, scrollContainer, labels) {
    if (!control || control.closest("#cgcs-root")) return false;

    const text = compactText(control.textContent);
    const label = compactText(control.getAttribute("aria-label"));
    const href = control.getAttribute("href") || "";
    const opensMenu = control.getAttribute("aria-haspopup") === "menu";
    const blocked = /^(|projects|chats|pinned|show more|more|options|edit|delete|share)$/i.test(text || label);
    const sidebarAction = /^(new chat|search chats|apps)$/i.test(text || label);

    if (opensMenu || blocked || sidebarAction) return false;
    if (href && !isProjectHref(href)) return false;
    if (control.closest("a[href*='/c/']")) return false;
    if (!isVisible(control)) return false;
    if (!isInsideProjectsArea(control, scrollContainer, labels) && !isInsidePinnedArea(control, scrollContainer, labels)) return false;

    const rect = control.getBoundingClientRect();
    return rect.width >= 48 && rect.height >= 20;
  }

  function isInsideProjectsArea(element, scrollContainer, labels) {
    return isInsideSectionArea(element, scrollContainer, ["projects"], ["chats"], labels);
  }

  function isInsidePinnedArea(element, scrollContainer, labels) {
    return isInsideSectionArea(element, scrollContainer, ["pinned"], ["projects", "chats"], labels);
  }

  function isInsideSectionArea(element, scrollContainer, startSections, endSections, labels) {
    const elementTop = element.getBoundingClientRect().top;
    const activeLabels = labels || getVisibleSectionLabels(scrollContainer);
    const sectionHeadings = activeLabels.filter((label) => startSections.includes(label.text) && label.top <= elementTop);
    if (sectionHeadings.length === 0) return false;

    const latestSectionTop = Math.max(...sectionHeadings.map((label) => label.top));
    const nextEndHeading = activeLabels.find((label) => endSections.includes(label.text) && label.top > latestSectionTop);
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

  function isUsableConversationAnchor(anchor) {
    if (!anchor || anchor.closest("#cgcs-root")) return false;
    if (!isVisible(anchor)) return false;
    if (!normalizeConversationUrl(getAnchorHref(anchor), locationRef.origin)) return false;
    return Boolean(extractConversationAnchorTitle(anchor));
  }

  return {
    findSidebarScrollContainer,
    getSortedRecords,
    rememberVisibleRecords,
    scanConversationList,
    scanProjectSections,
    scanRecentConversationList
  };
}

function isProjectHref(href) {
  return /project|\/g\//i.test(href);
}

export function compactText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isVisible(element) {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
