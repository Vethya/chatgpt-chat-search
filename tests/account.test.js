import test from "node:test";
import assert from "node:assert/strict";
import { detectAccountIdentity } from "../src/shared/account.js";

test("detects stable account id from attributes", async () => {
  const documentRef = {
    querySelector() {
      return {
        getAttribute(name) {
          return name === "data-account-id" ? "acct_123" : null;
        }
      };
    },
    querySelectorAll() {
      return [];
    },
    body: { innerText: "" }
  };

  assert.equal(await detectAccountIdentity(documentRef), "id:acct_123");
});

test("hashes visible email instead of returning raw email", async () => {
  const documentRef = {
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    body: { innerText: "Signed in as person@example.com" }
  };

  const identity = await detectAccountIdentity(documentRef);
  assert.match(identity, /^email-sha256:[a-f0-9]{64}$/);
  assert.equal(identity.includes("person@example.com"), false);
});
