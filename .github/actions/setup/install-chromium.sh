#!/usr/bin/env bash
# Chromium for Playwright, and the system packages it needs, without waiting on
# the Ubuntu mirror.
#
# `npx playwright install --with-deps chromium` apt-installs what the runner
# lacks: nine font packages on ubuntu-24.04. From the mirror that took anything
# from 17 seconds to 16 minutes (PR #513: 6, 7.7, 9.5 and 16 minutes in four
# jobs of one run, at 38 kB/s), while Chromium itself downloads in seconds.
# Here the packages come from a cache of their .deb files, keyed to the runner
# image (../setup/action.yml), and the mirror is used only when the cache
# cannot supply them: once per image. They are the same packages either way,
# so pages render with the same fonts as before.
#
# Writes fetched=true to GITHUB_OUTPUT when it went to the mirror, so the
# action saves what it downloaded.
set -euo pipefail

cache="${PLAYWRIGHT_DEBS:-$HOME/.cache/playwright-debs}"

# What `playwright install-deps chromium` would ask apt for.
wanted="$(npx playwright install-deps --dry-run chromium | sed -n 's/.*--no-install-recommends \([^"]*\)".*/\1/p')"
if [ -z "$wanted" ]; then
  echo "Could not read Playwright's package list; installing the way Playwright does."
  npx playwright install --with-deps chromium
  exit 0
fi

# The wanted packages this runner does not have, sorted, on one line.
missing() {
  local package
  for package in $wanted; do
    dpkg-query -W -f='${Status}\n' "$package" 2>/dev/null | grep -qx 'install ok installed' || echo "$package"
  done | sort | tr '\n' ' ' | sed 's/ $//'
}

need="$(missing)"
if [ -z "$need" ]; then
  echo "Every system package Playwright needs is installed."
elif [ -f "$cache/needed.txt" ] && [ "$(cat "$cache/needed.txt")" = "$need" ] && sudo dpkg -i "$cache"/*.deb >/dev/null; then
  echo "Installed from the cache: $need"
else
  echo "From the Ubuntu mirror: $need"
  # A cached install that failed half way leaves dpkg waiting to be finished.
  sudo dpkg --configure -a || true
  rm -rf "$cache"
  mkdir -p "$cache/partial"
  sudo apt-get update
  # Download into the cache, then install from it: what is saved is exactly
  # what was installed, the wanted packages and whatever they pulled in.
  # shellcheck disable=SC2086
  sudo apt-get install -y --no-install-recommends --download-only -o Dir::Cache::archives="$cache" $need
  # shellcheck disable=SC2086
  sudo apt-get install -y --no-install-recommends -o Dir::Cache::archives="$cache" $need
  sudo rm -rf "$cache/partial" "$cache/lock"
  sudo chown -R "$(id -u):$(id -g)" "$cache"
  printf '%s' "$need" > "$cache/needed.txt"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then echo "fetched=true" >> "$GITHUB_OUTPUT"; fi
fi

still="$(missing)"
if [ -n "$still" ]; then
  echo "Still missing after the install: $still" >&2
  exit 1
fi
npx playwright install chromium
