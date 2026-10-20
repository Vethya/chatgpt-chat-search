export async function detectAccountIdentity(documentRef: Document): Promise<string | null> {
  const attributeId = findAttributeIdentity(documentRef);
  if (attributeId) return `id:${attributeId}`;

  const scriptId = findScriptIdentity(documentRef);
  if (scriptId) return `id:${scriptId}`;

  const email = findVisibleEmail(documentRef);
  if (email) return `email-sha256:${await sha256Hex(email.toLowerCase())}`;

  return null;
}

function findAttributeIdentity(documentRef: Document): string | null {
  const element = documentRef.querySelector("[data-account-id], [data-user-id], [data-testid='profile-button']");
  if (!element) return null;
  return (
    element.getAttribute("data-account-id") ||
    element.getAttribute("data-user-id") ||
    null
  );
}

function findScriptIdentity(documentRef: Document): string | null {
  const scripts = Array.from(documentRef.querySelectorAll("script"));
  for (const script of scripts) {
    const text = script.textContent || "";
    const match = text.match(/"id"\s*:\s*"(user-[^"]+|acct_[^"]+|org-[^"]+)"/);
    if (match) return match[1] ?? null;
  }
  return null;
}

function findVisibleEmail(documentRef: Document): string | null {
  const text = documentRef.body?.innerText || "";
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0] || null;
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
