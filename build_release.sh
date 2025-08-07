#!/bin/bash
set -e
ver=$(grep -oP '"version"\s*:\s*"\K[^"]+' manifest.json)
zip_name="ytbeatmakercues-$ver.zip"
# exclude git files and previous zips
zip -r "$zip_name" . -x '*.git*' 'ytbeatmakercues-*.zip' 'build_release.sh'

# If Apple's tooling is available, also generate a Safari project
if command -v xcrun >/dev/null 2>&1; then
  rm -rf safari
  xcrun safari-web-extension-converter . --no-open --project-location safari >/dev/null 2>&1
fi
