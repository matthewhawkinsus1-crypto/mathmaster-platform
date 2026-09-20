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
    echo "=== Firebase Hosting deploy completed ==="
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
