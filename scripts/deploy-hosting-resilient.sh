#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAX_ATTEMPTS="${FIREBASE_HOSTING_DEPLOY_ATTEMPTS:-8}"
UPLOAD_CONCURRENCY="${FIREBASE_HOSTING_UPLOAD_CONCURRENCY:-4}"

cd "$REPO_ROOT"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Missing required command: firebase" >&2
  exit 1
fi

if ! [[ "$MAX_ATTEMPTS" =~ ^[1-9][0-9]*$ ]]; then
  echo "FIREBASE_HOSTING_DEPLOY_ATTEMPTS must be a positive integer." >&2
  exit 2
fi
if ! [[ "$UPLOAD_CONCURRENCY" =~ ^[1-9][0-9]*$ ]]; then
  echo "FIREBASE_HOSTING_UPLOAD_CONCURRENCY must be a positive integer." >&2
  exit 2
fi

# firebase-tools defaults Hosting uploads to 200 concurrent requests. That is
# far too aggressive for Cloud Shell and can exhaust its outbound connection
# budget, producing ConnectTimeoutError / retries exhausted against
# upload-firebasehosting.googleapis.com. Keep the upload fan-out deliberately
# small. firebase-tools has supported this env override for years and still
# supports it on current releases.
export FIREBASE_HOSTING_UPLOAD_CONCURRENCY="$UPLOAD_CONCURRENCY"

echo "=== MathMaster resilient Firebase Hosting deploy (Cloud Shell safe) ==="
echo "Project: $PROJECT"
echo "Upload concurrency: $FIREBASE_HOSTING_UPLOAD_CONCURRENCY"
echo "Retry attempts: $MAX_ATTEMPTS"
echo

# Refuse to publish a build that does not contain current origin/main. The
# stale-dist and live-manifest checks below prove production serves THIS
# commit; they cannot tell whether this commit is current. A checkout left on
# a PR branch (or an unpulled main) deploys cleanly and silently removes every
# PR merged since — see scripts/lib/deployProvenance.mjs.
if ! node scripts/check-deploy-provenance.mjs; then
  echo >&2
  echo "Deploy refused: this checkout is not current main. Nothing was built or uploaded." >&2
  exit 5
fi
echo

# Always build the exact checked-out commit before uploading Hosting. This is
# intentionally part of the deploy command so Cloud Shell can never publish a
# stale dist/ directory left behind by an earlier session.
EXPECTED_SHA="$(git rev-parse --short=12 HEAD)"
echo "Building exact commit: $EXPECTED_SHA"
npm run build:firebase

if [ ! -f dist/mathmaster-build.json ]; then
  echo "Firebase build manifest is missing: dist/mathmaster-build.json" >&2
  exit 3
fi

BUILT_SHA="$(node --input-type=module -e "import fs from 'node:fs'; const m=JSON.parse(fs.readFileSync('dist/mathmaster-build.json','utf8')); process.stdout.write(String(m.gitSha || ''));")"
if [ "$BUILT_SHA" != "$EXPECTED_SHA" ]; then
  echo "Refusing to deploy stale Hosting output." >&2
  echo "Expected commit: $EXPECTED_SHA" >&2
  echo "Built commit:    $BUILT_SHA" >&2
  exit 3
fi

echo "Verified Hosting build commit: $BUILT_SHA"
echo

is_retryable_hosting_failure() {
  local log_file="$1"
  grep -Eqi     'upload-firebasehosting\.googleapis\.com|ConnectTimeoutError|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|retries exhausted|network timeout|fetch failed'     "$log_file"
}

attempt=1
while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  log_file="$(mktemp)"
  echo "--- Hosting deploy attempt $attempt/$MAX_ATTEMPTS ---"

  set +e
  firebase deploy --only hosting --project "$PROJECT" "$@" 2>&1 | tee "$log_file"
  status=${PIPESTATUS[0]}
  set -e

  if [ "$status" -eq 0 ]; then
    rm -f "$log_file"
    echo
    echo "Firebase CLI reported Hosting deploy success."
    echo "Verifying the PUBLIC classroom URL is actually serving commit $BUILT_SHA ..."

    verify_url="https://${PROJECT}.web.app/mathmaster-build.json"
    verified=0
    verify_attempt=1
    live_sha=""
    while [ "$verify_attempt" -le 12 ]; do
      cache_buster="$(date +%s)-$verify_attempt"
      live_manifest="$(curl -fsSL --connect-timeout 10 --max-time 20 -H 'Cache-Control: no-cache' "${verify_url}?v=${cache_buster}" 2>/dev/null || true)"
      live_sha="$(printf '%s' "$live_manifest" | node --input-type=module -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{try{const m=JSON.parse(s); process.stdout.write(String(m.gitSha||''));}catch{}});" 2>/dev/null || true)"
      if [ "$live_sha" = "$BUILT_SHA" ]; then
        verified=1
        break
      fi
      echo "Public site verification $verify_attempt/12: expected $BUILT_SHA, saw ${live_sha:-no manifest yet}."
      sleep 5
      verify_attempt=$((verify_attempt + 1))
    done

    if [ "$verified" -ne 1 ]; then
      echo >&2
      echo "CRITICAL: Firebase CLI said deploy succeeded, but ${PROJECT}.web.app is NOT serving this commit." >&2
      echo "Expected: $BUILT_SHA" >&2
      echo "Live:     ${live_sha:-unknown}" >&2
      echo "Do not treat this deployment as complete until the public build manifest matches." >&2
      exit 4
    fi

    echo "Verified PUBLIC Firebase Hosting commit: $live_sha"
    echo
    echo "=== Firebase Hosting deploy completed and verified ==="
    exit 0
  fi

  if ! is_retryable_hosting_failure "$log_file"; then
    echo >&2
    echo "Hosting deploy failed for a non-network reason. Not retrying automatically." >&2
    echo "Fix the error above, then rerun this command." >&2
    rm -f "$log_file"
    exit "$status"
  fi

  rm -f "$log_file"

  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo >&2
    echo "Hosting upload still failed after $MAX_ATTEMPTS network retries." >&2
    echo "The build is not the problem; the Firebase upload endpoint is still unreachable." >&2
    exit "$status"
  fi

  # Short exponential backoff. Firebase itself already retries each file; this
  # outer retry starts a fresh Hosting version after Cloud Shell's connection
  # pool has had time to recover.
  delay=$(( 5 * (2 ** (attempt - 1)) ))
  if [ "$delay" -gt 60 ]; then delay=60; fi
  echo
  echo "Transient Firebase Hosting network failure detected."
  echo "Waiting ${delay}s, then retrying with concurrency $UPLOAD_CONCURRENCY..."
  sleep "$delay"
  attempt=$((attempt + 1))
done
