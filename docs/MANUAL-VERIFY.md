# Manual Verification

Use this after loading the repository as an unpacked Chromium extension.

1. Open `https://chatgpt.com/`.
2. Click the extension's in-page Search button or press `Cmd+Shift+.` / `Ctrl+Shift+.`.
3. If the account cannot be detected, open the ChatGPT account menu and try again.
4. Run Sync with the sidebar visible.
5. Confirm the page is blurred, progress shows a phase plus count, and Cancel leaves the previous index unchanged.
6. Confirm Conversations nested under Projects are included after Sync.
7. Confirm Sync does not replace a large existing index if the discovered count is unexpectedly tiny.
8. Search for a remembered title with a partial or misspelled query.
9. Use arrow keys and Enter to open a result in the current tab.
10. Start a new ChatGPT Conversation, send a message, wait for ChatGPT to assign a title, and confirm the title appears in extension search without full Sync.
11. Create or expose several recent Conversations, run Quick, and confirm it stops after reaching an already-indexed Conversation.
12. Confirm generic navigation labels such as "Skip to main content" are not added as Conversation titles.
13. Remove one search result from the local index and confirm the rest of the index remains.
14. Rename or delete a Conversation in ChatGPT, run Sync again, and confirm the index updates.
15. Export the index, clear it, import the export, and confirm records return without duplicates.
