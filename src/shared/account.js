export async function detectAccountIdentity(documentRef) {
  const attributeId = findAttributeIdentity(documentRef);
  if (attributeId) return `id:${attributeId}`;

  const scriptId = findScriptIdentity(documentRef);
  if (scriptId) return `id:${scriptId}`;

  const email = findVisibleEmail(documentRef);
  if (email) return `email-sha256:${await sha256Hex(email.toLowerCase())}`;

  return null;
}

function findAttributeIdentity(documentRef) {
  const element = documentRef.querySelector("[data-account-id], [data-user-id], [data-testid='profile-button']");
  if (!element) return null;
  return (
    element.getAttribute("data-account-id") ||
    element.getAttribute("data-user-id") ||
    null
  );
}

function findScriptIdentity(documentRef) {
  const scripts = Array.from(documentRef.querySelectorAll("script"));
  for (const script of scripts) {
    const text = script.textContent || "";
    const match = text.match(/"id"\s*:\s*"(user-[^"]+|acct_[^"]+|org-[^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

function findVisibleEmail(documentRef) {
  const text = documentRef.body?.innerText || "";
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || null;
}

async function sha256Hex(value) {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
