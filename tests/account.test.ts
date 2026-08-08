import test from "node:test";
import assert from "node:assert/strict";
import { detectAccountIdentity } from "../src/shared/account.js";

interface FakeDocumentElement {
  getAttribute(name: string): string | null;
}

interface FakeDocumentRefOptions {
  attributeElement?: FakeDocumentElement | null;
  scripts?: Array<{ textContent: string }>;
  innerText?: string;
}

function fakeDocumentRef(options: FakeDocumentRefOptions): Document {
  return {
    querySelector(): FakeDocumentElement | null {
      return options.attributeElement ?? null;
    },
    querySelectorAll(): Array<{ textContent: string }> {
      return options.scripts || [];
    },
    body: { innerText: options.innerText || "" }
  } as unknown as Document;
}

function attributeElement(attributeName: string, value: string): FakeDocumentElement {
  return {
    getAttribute(name) {
      return name === attributeName ? value : null;
    }
  };
}

test("detects stable account id from attributes", async () => {
  const documentRef = fakeDocumentRef({
    attributeElement: attributeElement("data-account-id", "acct_123")
  });

  assert.equal(await detectAccountIdentity(documentRef), "id:acct_123");
});

test("falls back to user id attributes", async () => {
  const documentRef = fakeDocumentRef({
    attributeElement: attributeElement("data-user-id", "user_456")
  });

  assert.equal(await detectAccountIdentity(documentRef), "id:user_456");
});

test("detects account id embedded in scripts", async () => {
  const documentRef = fakeDocumentRef({
    scripts: [{ textContent: '{"viewer":{"id":"acct_script_123"}}' }]
  });

  assert.equal(await detectAccountIdentity(documentRef), "id:acct_script_123");
});

test("hashes visible email instead of returning raw email", async () => {
  const documentRef = fakeDocumentRef({
    innerText: "Signed in as person@example.com"
  });

  const identity = await detectAccountIdentity(documentRef);
  assert.ok(identity);
  assert.match(identity, /^email-sha256:[a-f0-9]{64}$/);
  assert.equal(identity.includes("person@example.com"), false);
});

test("returns null when no identity is present", async () => {
  const documentRef = fakeDocumentRef({
    innerText: "No signed-in account details here"
  });

  assert.equal(await detectAccountIdentity(documentRef), null);
});
