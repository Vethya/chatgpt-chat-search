(async () => {
  const { startContentScript } = await import("./content/bootstrap.js");
  await startContentScript();
})();
