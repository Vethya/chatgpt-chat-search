import { cp, mkdir, rm } from "node:fs/promises";

const extensionDir = new URL("../dist/extension/", import.meta.url);
const assets = [
  ["../manifest.json", "manifest.json"],
  ["../README.md", "README.md"],
  ["../src/popup.html", "src/popup.html"],
  ["../src/popup.css", "src/popup.css"],
  ["../src/content/styles", "src/content/styles"]
];

await rm(extensionDir, { recursive: true, force: true });
await mkdir(extensionDir, { recursive: true });

for (const [source, destination] of assets) {
  await cp(new URL(source, import.meta.url), new URL(destination, extensionDir), { recursive: true });
}
