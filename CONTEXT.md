# ChatGPT Conversation Search

This context defines the language for a browser extension that makes saved ChatGPT conversations easier to find.

## Language

**Conversation**:
One saved ChatGPT thread visible in the sidebar, identified by its link and described by its current title.
_Avoid_: Chat

**Search Surface**:
The extension-provided modal interface inside the ChatGPT page for finding Conversations, separate from ChatGPT's native search UI.
_Avoid_: Replacement search

**Native-Feeling UI**:
Extension UI that visually fits ChatGPT while remaining recognizable as the extension's own search tool.
_Avoid_: Unbranded overlay

**Content Script**:
The extension part that reads the ChatGPT page, controls Conversation Sync, and renders in-page UI.
_Avoid_: Page script

**Service Worker**:
The extension part that owns the Conversation Database, import/export, and extension lifecycle.
_Avoid_: Background page

**Extension Popup**:
The browser toolbar popup that shows minimal status and routes the user to ChatGPT.
_Avoid_: Popup search

**Supported Browser**:
The browser family the extension is designed for in the current product scope.
_Avoid_: Cross-browser support

**Host Permission**:
The website access granted to the extension, limited to ChatGPT for the current product scope.
_Avoid_: Broad OpenAI access

**Local Extension**:
The unpacked browser extension used directly by the user before any browser store distribution.
_Avoid_: Store release

**Local MVP**:
The first product version intended to be useful for the owner as an unpacked local extension.
_Avoid_: Public release

**Search Entry Point**:
A user-visible button and keyboard shortcut that open the Search Surface on demand.
_Avoid_: Always-visible search

**Title Index**:
The searchable collection of Conversation titles and links known to the extension.
_Avoid_: Content index, message index

**Local Index**:
The Title Index stored only in the user's browser extension, without sending Conversation data to an external service.
_Avoid_: Cloud index, backend sync

**Conversation Database**:
The browser-local database that stores Conversation records for the extension.
_Avoid_: Extension storage

**Database Migration**:
An intentional change to the Conversation Database structure between extension versions.
_Avoid_: Ad hoc schema change

**Stored Conversation Record**:
The locally stored title, link, account identity, discovered order, and sync time for one Conversation.
_Avoid_: Database row

**Index Reset**:
A user-triggered action that removes the locally stored Title Index from the browser extension.
_Avoid_: Remote delete

**Index Export**:
A user-triggered action that saves the Account Index, including stored account identity but not raw email, to a local file for backup or transfer.
_Avoid_: Cloud backup

**Index Import**:
A user-triggered action that merges a previously exported Account Index into the extension by Conversation link.
_Avoid_: Cloud restore

**Account Index**:
A Local Index scoped to one detected ChatGPT account, so Conversation titles from different accounts are not mixed. Conversation Sync is unavailable when the current account cannot be identified.
_Avoid_: Shared browser index

**Account Identity**:
The stable identifier for the current ChatGPT account, preferably an internal account id and only falling back to a local hash of the email when necessary.
_Avoid_: Display name

**Fuzzy Title Search**:
Search over Conversation titles that can return useful matches even when the query is partial or slightly misspelled.
_Avoid_: Exact search

**In-Memory Search Index**:
The search structure built inside the Search Surface from Stored Conversation Records for fast Fuzzy Title Search.
_Avoid_: Database search

**Search Ranking**:
The ordering of search results, with title match quality prioritized over Conversation recency.
_Avoid_: Recent-first ranking

**Result Metadata**:
Small supporting details shown with a search result, such as Conversation recency when available.
_Avoid_: Result dashboard

**Conversation Order**:
The position of a Conversation in ChatGPT's sidebar during a Completed Sync, used as the v1 recency signal.
_Avoid_: Extracted date

**No Results State**:
The Search Surface state shown when no indexed Conversation matches the query.
_Avoid_: Native search fallback

**First-Run State**:
The Search Surface state shown before the current Account Index has any synced Conversations.
_Avoid_: Empty index search

**Account Unknown State**:
The blocked state shown when the extension cannot identify the current ChatGPT account and cannot safely sync.
_Avoid_: Unknown account index

**Result Selection**:
The act of choosing a Conversation from the Search Surface and navigating the current ChatGPT tab to it.
_Avoid_: Open in new tab

**Keyboard Navigation**:
Using the keyboard to open the Search Surface, move through results, and select a Conversation.
_Avoid_: Mouse-only search

**Conversation Sync**:
A user-triggered refresh that discovers all visible Conversations from the ChatGPT sidebar and rebuilds the Title Index.
_Avoid_: Background crawl, automatic import

**Visible Conversation Source**:
The ChatGPT sidebar content the user can see and scroll, used as the only source for Conversation Sync.
_Avoid_: Private API source

**Manual ChatGPT Verification**:
Human verification of extension behavior against the live ChatGPT page, used where automated tests would be too brittle.
_Avoid_: Full ChatGPT automation

**Sidebar Available State**:
The state where ChatGPT's sidebar is visible and usable as the source for Conversation Sync.
_Avoid_: Hidden sidebar sync

**Completed Sync**:
A Conversation Sync that finishes without cancellation and replaces the previous Account Index with the Conversations currently visible in ChatGPT.
_Avoid_: Partial sync

**Failed Sync**:
A Conversation Sync that does not complete, explains the likely blocked state, and leaves the previous Account Index unchanged.
_Avoid_: Broken index update

**Sync State**:
The visible state shown while Conversation Sync is running, so the user knows the page is temporarily unavailable for normal use and can cancel the sync.
_Avoid_: Hidden sync

**Sync Progress**:
The phase and discovered Conversation count shown during Conversation Sync.
_Avoid_: Sync percentage

**Sync Completion**:
The point when Conversation Sync has repeatedly searched for more Conversations and found no new ones.
_Avoid_: Sidebar bottom
