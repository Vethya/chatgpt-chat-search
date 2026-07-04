import type { RuntimeMessage, RuntimeMessageResult, RuntimeResponse } from "../types.js";

export function sendMessage<T extends RuntimeMessage>(message: T): Promise<RuntimeMessageResult<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: RuntimeResponse<RuntimeMessageResult<T>>) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "Extension request failed."));
        return;
      }
      resolve(response.data);
    });
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
