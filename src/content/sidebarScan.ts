import type { ConversationRecord } from "../shared/types.js";

const CONVERSATION_LIST_IDLE_TIMEOUT_MS = 25000;
const CHAT_STALL_RECOVERY_MS = 8000;
const RECENT_LIST_IDLE_TIMEOUT_MS = 5000;
const SCROLL_SETTLE_MS = 1100;
const SIDEBAR_SCROLL_RATIO = 0.55;

export interface SidebarScannerDeps {
  compareRecordOrder: (left: ConversationRecord, right: ConversationRecord, fallbackOrder?: number) => number;
  extractConversationAnchorTitle: (anchor: HTMLAnchorElement | null | undefined) => string | null;
  extractConversationRecordsFromDocument: (
    documentRef: ParentNode,
    accountId: string,
    syncedAt: number,
    origin: string,
    options?: { requireVisible?: boolean }
  ) => ConversationRecord[];
  formatConversationCount: (count: number, label?: string) => string;
  getAnchorHref: (anchor: HTMLAnchorElement | null | undefined) => string | null;
  locationRef?: Location;
  normalizeConversationUrl: (href: string | null | undefined, origin?: string) => string | null;
  rememberRecentVisibleRecords: (
    visibleRecords: ConversationRecord[],
    foundByUrl: Map<string, ConversationRecord>,
    knownUrls: Set<string>,
    visitedUrls: Set<string>,
    consecutiveKnownCount: number,
    stopThreshold?: number
  ) => { hitKnownLimit: boolean; consecutiveKnownCount: number };
  sleep: (ms: number) => Promise<void>;
  updateSyncDetail: (message: string) => void;
}

export interface SidebarScanner {
  findSidebarScrollContainer(): Element | null;
  getSortedRecords(foundByUrl: Map<string, ConversationRecord>): ConversationRecord[];
  rememberVisibleRecords(
    rootElement: Element,
    foundByUrl: Map<string, ConversationRecord>,
    accountId: string,
    syncedAt: number
  ): void;
  scanConversationList(
    scrollContainer: Element,
    foundByUrl: Map<string, ConversationRecord>,
    accountId: string,
    syncedAt: number,
    isCancelled: () => boolean
  ): Promise<void>;
  scanProjectSections(
    scrollContainer: Element,
    foundByUrl: Map<string, ConversationRecord>,
    accountId: string,
    syncedAt: number,
    isCancelled: () => boolean
  ): Promise<void>;
  scanRecentConversationList(
    scrollContainer: Element,
    foundByUrl: Map<string, ConversationRecord>,
    knownUrls: Set<string>,
    accountId: string,
    syncedAt: number,
    isCancelled: () => boolean,
    stopThreshold: number
  ): Promise<boolean>;
}

interface SectionLabel {
  text: string;
  top: number;
}

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
}: SidebarScannerDeps): SidebarScanner {
  function findSidebarScrollContainer(): Element | null {
    const conversationLink = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]")).find((anchor) =>
      anchor.href.includes("/c/") && isUsableConversationAnchor(anchor)
    );
    const candidates: Element[] = [
      document.querySelector("nav"),
      document.querySelector("aside"),
      conversationLink?.closest("nav"),
      conversationLink?.closest("aside"),
      conversationLink?.parentElement
    ].filter((element): element is HTMLElement => Boolean(element));

    let current = conversationLink?.parentElement;
    while (current && current !== document.body) {
      candidates.push(current);
      current = current.parentElement;
    }

    return candidates.find((element) => element.scrollHeight > element.clientHeight + 20) || null;
  }

  function rememberVisibleRecords(
    rootElement: Element,
    foundByUrl: Map<string, ConversationRecord>,
    accountId: string,
    syncedAt: number
  ): void {
    const visibleRecords = extractConversationRecordsFromDocument(rootElement, accountId, syncedAt, locationRef.origin, {
      requireVisible: true
    });
    for (const record of visibleRecords) {
      const existing = foundByUrl.get(record.url);
      foundByUrl.set(record.url, existing ? { ...existing, title: record.title, syncedAt } : { ...record, order: foundByUrl.size });
    }
  }

  function rememberVisibleRecentRecords(
    rootElement: Element,
    foundByUrl: Map<string, ConversationRecord>,
    knownUrls: Set<string>,
    visitedUrls: Set<string>,
    accountId: string,
    syncedAt: number,
    consecutiveKnownCount: number,
    stopThreshold: number
  ): { hitKnownLimit: boolean; consecutiveKnownCount: number } {
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

  async function scanConversationList(
    scrollContainer: Element,
    foundByUrl: Map<string, ConversationRecord>,
    accountId: string,
    syncedAt: number,
    isCancelled: () => boolean
  ): Promise<void> {
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

  async function scanRecentConversationList(
    scrollContainer: Element,
    foundByUrl: Map<string, ConversationRecord>,
    knownUrls: Set<string>,
    accountId: string,
    syncedAt: number,
    isCancelled: () => boolean,
    stopThreshold: number
  ): Promise<boolean> {
    scrollToSection(scrollContainer, "chats");
    await sleep(SCROLL_SETTLE_MS);

    let lastNewConversationAt = Date.now();
    let consecutiveKnownCount = 0;
    const visitedUrls = new Set<string>();

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

  async function expandShowMoreControls(scrollContainer: Element): Promise<number> {
    const controls = Array.from(scrollContainer.querySelectorAll<HTMLElement>("button, [role='button'], summary"));
    let expandedCount = 0;

    for (const control of controls) {
      if (!isShowMoreControl(control)) continue;
      control.click();
      expandedCount += 1;
      await sleep(120);
    }

    return expandedCount;
  }

  async function scanProjectSections(
    scrollContainer: Element,
    foundByUrl: Map<string, ConversationRecord>,
    accountId: string,
    syncedAt: number,
    isCancelled: () => boolean
  ): Promise<void> {
    const visitedProjects = new Set<string>();
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

  function getSortedRecords(foundByUrl: Map<string, ConversationRecord>): ConversationRecord[] {
    return [...foundByUrl.values()].sort(compareRecordOrder);
  }

  function getSidebarScrollStep(scrollContainer: Element): number {
    return Math.max(160, Math.floor(scrollContainer.clientHeight * SIDEBAR_SCROLL_RATIO));
  }

  async function recoverStalledConversationScroll(scrollContainer: Element, isCancelled: () => boolean): Promise<void> {
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

  function scrollToSection(scrollContainer: Element, sectionName: string): boolean {
    const heading = findVisibleSectionHeading(scrollContainer, [sectionName]);
    if (!heading) return false;

    const headingTop = heading.getBoundingClientRect().top;
    const containerTop = scrollContainer.getBoundingClientRect().top;
    scrollContainer.scrollTop += headingTop - containerTop;
    return true;
  }

  async function clickVisibleProjectControls(scrollContainer: Element, visitedProjects: Set<string>): Promise<number> {
    const controls = Array.from(scrollContainer.querySelectorAll<HTMLElement>("a[href], button, [role='button']"));
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

  function isShowMoreControl(control: HTMLElement): boolean {
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

  function isProjectControl(control: HTMLElement, scrollContainer: Element, labels: SectionLabel[]): boolean {
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

  function isInsideProjectsArea(element: Element, scrollContainer: Element, labels: SectionLabel[]): boolean {
    return isInsideSectionArea(element, scrollContainer, ["projects"], ["chats"], labels);
  }

  function isInsidePinnedArea(element: Element, scrollContainer: Element, labels: SectionLabel[]): boolean {
    return isInsideSectionArea(element, scrollContainer, ["pinned"], ["projects", "chats"], labels);
  }

  function isInsideSectionArea(
    element: Element,
    scrollContainer: Element,
    startSections: string[],
    endSections: string[],
    labels: SectionLabel[]
  ): boolean {
    const elementTop = element.getBoundingClientRect().top;
    const activeLabels = labels || getVisibleSectionLabels(scrollContainer);
    const sectionHeadings = activeLabels.filter((label) => startSections.includes(label.text) && label.top <= elementTop);
    if (sectionHeadings.length === 0) return false;

    const latestSectionTop = Math.max(...sectionHeadings.map((label) => label.top));
    const nextEndHeading = activeLabels.find((label) => endSections.includes(label.text) && label.top > latestSectionTop);
    return !nextEndHeading || elementTop < nextEndHeading.top;
  }

  function findVisibleSectionHeading(scrollContainer: Element, sectionNames: string[]): Element | null {
    return Array.from(scrollContainer.querySelectorAll("div, span, h2, h3, p"))
      .filter(isVisible)
      .find((node) => sectionNames.includes(compactText(node.textContent))) || null;
  }

  function getVisibleSectionLabels(scrollContainer: Element): SectionLabel[] {
    return Array.from(scrollContainer.querySelectorAll("div, span, h2, h3, p"))
      .filter(isVisible)
      .map((node) => ({
        text: compactText(node.textContent),
        top: node.getBoundingClientRect().top
      }));
  }

  function isUsableConversationAnchor(anchor: HTMLAnchorElement): boolean {
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

function isProjectHref(href: string): boolean {
  return /project|\/g\//i.test(href);
}

export function compactText(value: string | null | undefined): string {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}
