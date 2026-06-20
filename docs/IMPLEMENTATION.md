# Implementation Plan

## Goal

Build a Chromium-only unpacked extension that adds fast local search for ChatGPT Conversations by syncing visible sidebar titles into a browser-local IndexedDB database.

## V1 Scope

- In-page modal Search Surface on `https://chatgpt.com/*`
- Manual Conversation Sync from the visible ChatGPT sidebar
- Full resync that rebuilds the current Account Index only after successful completion
- URL-based Conversation identity with title, account identity, sidebar order, and sync time
- IndexedDB Conversation Database with explicit schema versioning
- Fuzzy title search with match quality first and sidebar order as recency tiebreaker
- Keyboard-driven search: open, type, move through results, select
- Sync progress overlay that blurs/blocks the page and shows phase plus discovered count
- Cancelable sync that discards partial results
- Failed sync that preserves the previous Account Index
- Account-separated indexes using internal account id when available or hashed email fallback
- Index reset, export, and merge-by-URL import
- Minimal extension popup with status and a route to ChatGPT

## Architecture

- Content Script:
  - renders the Search Surface and Sync State
  - detects sidebar availability
  - extracts visible Conversation titles and links from the ChatGPT DOM
  - scrolls the sidebar during Conversation Sync
  - builds the in-memory fuzzy search index from Stored Conversation Records
  - navigates the current tab on Result Selection

- Service Worker:
  - owns IndexedDB access and migrations
  - stores Account Index records
  - handles import/export/reset
  - provides records to the Content Script

## Build Order

1. Scaffold Manifest V3 extension structure.
2. Add IndexedDB wrapper with versioned schema and tests.
3. Add message protocol between Content Script and Service Worker.
4. Implement account identity detection and blocked Account Unknown State.
5. Implement sidebar detection and Conversation extraction helper.
6. Implement manual full Conversation Sync with progress, cancel, completion, and failure handling.
7. Implement Search Surface with fuzzy title search and keyboard navigation.
8. Implement Result Selection in the current ChatGPT tab.
9. Implement Index Reset, Export, and Import.
10. Implement minimal Extension Popup.
11. Add unit tests for database, search ranking, import merge, and extraction helpers.
12. Manually verify against live ChatGPT.

## Non-Goals

- Full conversation content indexing
- ChatGPT native search fallback
- Backend sync or cloud storage
- Firefox/Safari support
- Chrome Web Store packaging
- Full automated testing against live ChatGPT
