import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("manifest uses v3 and limits host access to chatgpt.com", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ["https://chatgpt.com/*"]);
});

test("manifest referenced extension files exist", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const paths = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((script) => [...script.js, ...script.css])
  ];

  for (const path of paths) {
    await access(new URL(`../${path}`, import.meta.url));
  }
});
