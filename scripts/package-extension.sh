#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required but was not found." >&2
  exit 1
fi

version="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
date_stamp="$(date +%F)"
release_dir="release"
zip_name="chatgpt-conversation-search-${date_stamp}-v${version}.zip"
zip_path="${release_dir}/${zip_name}"

pnpm test
pnpm run check

mkdir -p "$release_dir"
rm -f "$zip_path"

COPYFILE_DISABLE=1 zip -qr "$zip_path" \
  manifest.json \
  dist \
  README.md \
  -x "*.DS_Store" "*.map"

echo "Created shareable extension package:"
echo "$zip_path"
