#!/bin/bash
set -e
ver=$(grep -oP '"version"\s*:\s*"\K[^"]+' manifest.json)
zip_name="ytbeatmakercues-$ver.zip"
# exclude git files and previous zips
zip -r "$zip_name" . -x '*.git*' 'ytbeatmakercues-*.zip' 'build_release.sh'
