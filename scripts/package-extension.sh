#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required but was not found." >&2
  exit 1
fi

version="$(node -p "JSON.parse(require('fs').readFileSync('package.json', 'utf8')).version")"
date_stamp="$(date +%F)"
dist_dir="dist"
zip_name="chatgpt-conversation-search-${date_stamp}-v${version}.zip"
zip_path="${dist_dir}/${zip_name}"

npm test
npm run check

mkdir -p "$dist_dir"
rm -f "$zip_path"

COPYFILE_DISABLE=1 zip -qr "$zip_path" \
  manifest.json \
  src \
  README.md \
  -x "*.DS_Store"

echo "Created shareable extension package:"
echo "$zip_path"
