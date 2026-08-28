#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

echo "=== MathMaster Assignment V5 focused deploy ==="
echo "Project: $PROJECT"
echo "Surfaces: Hosting + authorAssignmentWithAI + hydrateAssignmentCcmr"
echo

for cmd in git npm firebase curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

if [ -n "$(git status --porcelain)" ]; then
  echo "This checkout has uncommitted changes. Use a clean clone before deploying." >&2
  git status --short
  exit 1
fi

echo "1/6 Confirming this checkout is current main..."
git fetch origin main
CURRENT="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [ "$CURRENT" != "$REMOTE" ]; then
  echo "This checkout is not the latest origin/main." >&2
  echo "Run these commands from a clean deployment clone:" >&2
  echo "  git checkout main" >&2
  echo "  git pull --ff-only origin main" >&2
  exit 2
fi

echo
echo "2/6 Verifying Assignment AI secret..."
if ! firebase functions:secrets:access OPENAI_API_KEY --project "$PROJECT" >/dev/null 2>&1; then
  echo "OPENAI_API_KEY is not configured or cannot be read." >&2
  echo "Run: firebase functions:secrets:set OPENAI_API_KEY --project $PROJECT" >&2
  exit 3
fi

echo
echo "3/6 Installing exact dependencies..."
npm ci
npm ci --prefix functions

echo
echo "4/6 Running the focused Assignment V5 regression suite..."
npm run test:assignment-v5-followup

echo
echo "5/6 Deploying only the surfaces changed by this upgrade..."
echo "Firebase will run the normal Hosting and Functions predeploy hooks."
firebase deploy --only hosting,functions:authorAssignmentWithAI,functions:hydrateAssignmentCcmr --project "$PROJECT"

echo
echo "6/6 Verifying live Hosting and callable registration..."
HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "https://$PROJECT.web.app")"
echo "Hosting: HTTP $HTTP_STATUS"
if [ "$HTTP_STATUS" != "200" ]; then
  echo "Hosting did not return HTTP 200." >&2
  exit 4
fi

FUNCTION_LIST="$(firebase functions:list --project "$PROJECT")"
echo "$FUNCTION_LIST" | grep -F "authorAssignmentWithAI" >/dev/null || {
  echo "authorAssignmentWithAI was not found in the deployed function list." >&2
  exit 5
}
echo "$FUNCTION_LIST" | grep -F "hydrateAssignmentCcmr" >/dev/null || {
  echo "hydrateAssignmentCcmr was not found in the deployed function list." >&2
  exit 6
}

echo
echo "Deployed commit:"
git log --oneline -1

echo
echo "=== Focused Assignment V5 deploy complete ==="
echo "Refresh MathMaster with a hard reload before testing the student assignment experience."
