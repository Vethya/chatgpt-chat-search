import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

test("manifest uses v3 and limits host access to chatgpt.com", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
    manifest_version: number;
    host_permissions: string[];
  };
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.host_permissions, ["https://chatgpt.com/*"]);
});

test("manifest referenced extension files exist", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
    background: { service_worker: string };
    action: { default_popup: string };
    content_scripts: Array<{ js: string[]; css: string[] }>;
  };
  const paths = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts.flatMap((script) => [...script.js, ...script.css])
  ];

  for (const path of paths) {
    await access(new URL(`../${path}`, import.meta.url));
  }
});

test("manifest exposes no web accessible resources", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8")) as {
    web_accessible_resources?: unknown;
  };
  assert.equal(manifest.web_accessible_resources, undefined);
});
