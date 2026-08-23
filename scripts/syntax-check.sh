#!/usr/bin/env bash
# A real parse gate for the browser bundle.
#
# The npm registry is unreachable in this environment, so there is no vite, no
# babel and no eslint — and the brace-counting checker that filled the gap
# reported four false positives (it mishandles ${} inside template literals and
# regex literals). TypeScript's parser is available globally and understands
# JSX properly, so it does the job honestly.
#
# TYPE errors are not the point and are filtered out: this only asks whether
# every file still parses. TS1xxx are the syntax diagnostics.
set -uo pipefail
cd "$(dirname "$0")/.."

FILES=$(find src -name '*.jsx' -o -name '*.js' | sort)
OUT=$(tsc --noEmit --jsx preserve --allowJs --target esnext --module esnext \
  --moduleResolution bundler --skipLibCheck $FILES 2>&1 | grep -E "error TS1[0-9]{3}" || true)

if [ -n "$OUT" ]; then
  echo "$OUT"
  echo "SYNTAX ERRORS FOUND"
  exit 1
fi
echo "OK — $(echo "$FILES" | wc -l) files parse cleanly"
