const statusElement = document.querySelector("#status");
const openSearchButton = document.querySelector("#open-search");
const openChatGptButton = document.querySelector("#open-chatgpt");

openSearchButton.addEventListener("click", openSearch);
openChatGptButton.addEventListener("click", () => chrome.tabs.create({ url: "https://chatgpt.com/" }));

async function openSearch() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://chatgpt.com/")) {
    await chrome.tabs.create({ url: "https://chatgpt.com/" });
    return;
  }

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "ui:openSearch" });
    window.close();
  } catch {
    statusElement.textContent = "Refresh the ChatGPT tab, then try again.";
  }
}
