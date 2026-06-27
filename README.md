# ChatGPT Conversation Search

Unpacked Chromium extension for local ChatGPT conversation title search.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose "Load unpacked".
4. Select this repository folder.
5. Open `https://chatgpt.com/`, open the extension search, and run Sync.

## Package for sharing

Run:

```sh
npm run package
```

The shareable ZIP will be created in `dist/` with a dated filename, for example:

```text
dist/chatgpt-conversation-search-2026-06-20-v0.1.0.zip
```

## Verify

```sh
npm test
npm run check
```
