import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outdir = path.join(root, "dist");
const srcDir = path.join(root, "src");

const common = {
  bundle: true,
  sourcemap: true,
  target: "es2022",
  logLevel: "info"
};

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

await build({
  ...common,
  entryPoints: { contentScript: path.join(srcDir, "contentScript.js") },
  format: "iife",
  outdir
});

await build({
  ...common,
  entryPoints: {
    serviceWorker: path.join(srcDir, "serviceWorker.js"),
    popup: path.join(srcDir, "popup.js")
  },
  format: "esm",
  outdir
});

await cp(path.join(srcDir, "popup.html"), path.join(outdir, "popup.html"));
await cp(path.join(srcDir, "popup.css"), path.join(outdir, "popup.css"));
await cp(path.join(srcDir, "content/styles"), path.join(outdir, "content/styles"), { recursive: true });

console.log(`Built extension into ${path.relative(root, outdir)}/`);
