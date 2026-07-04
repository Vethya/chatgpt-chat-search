(async () => {
  const { startContentScript } = await import(chrome.runtime.getURL("src/content/bootstrap.js"));
  await startContentScript();
})();
