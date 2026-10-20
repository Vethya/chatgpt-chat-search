import type { ServiceResponse, ServiceWorkerRequest, ServiceWorkerResultMap } from "./types.js";

export function sendMessage<K extends ServiceWorkerRequest["type"]>(
  message: Extract<ServiceWorkerRequest, { type: K }>
): Promise<ServiceWorkerResultMap[K]> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const envelope = response as ServiceResponse<ServiceWorkerResultMap[K]> | undefined;
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!envelope?.ok) {
        reject(new Error(envelope?.error || "Extension request failed."));
        return;
      }
      resolve(envelope.data);
    });
  });
}
