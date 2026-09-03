#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# `firebase deploy` loads the whole Functions codebase in a child process to
# build its manifest, then polls itself over localhost. Both halves of that fail
# on a small Cloud Shell VM with the single unhelpful line
# "Failed to list functions for <project>". Raise the budget, and make sure an
# inherited proxy never intercepts the CLI's own loopback request.
export FUNCTIONS_DISCOVERY_TIMEOUT="${FUNCTIONS_DISCOVERY_TIMEOUT:-180}"
export NO_PROXY="${NO_PROXY:+$NO_PROXY,}localhost,127.0.0.1"
export no_proxy="$NO_PROXY"

cd "$REPO_ROOT"

echo "=== MathMaster Assignment V5 focused deploy ==="
echo "Project: $PROJECT"
echo "Surfaces: Hosting + authorAssignmentWithAI + repairAssignmentQuestionWithAI + assignmentAiSelfTest + hydrateAssignmentCcmr"
echo "Everything else stays on its current deployed version, so this is minutes, not an hour."
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

echo "1/7 Confirming this checkout is current main..."
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
echo "2/7 Verifying Assignment AI secret..."
if ! firebase functions:secrets:access OPENAI_API_KEY --project "$PROJECT" >/dev/null 2>&1; then
  echo "OPENAI_API_KEY is not configured or cannot be read." >&2
  echo "Run: firebase functions:secrets:set OPENAI_API_KEY --project $PROJECT" >&2
  exit 3
fi

echo
echo "3/7 Installing exact dependencies..."
npm ci
npm ci --prefix functions

echo
echo "4/7 Running the focused Assignment V5 regression suite..."
npm run test:assignment-v5-followup

echo
echo "5/7 Proving the Functions codebase is discoverable before deploying..."
echo "If this step passes but firebase still cannot list functions, the problem is"
echo "the deploy environment, not this code."
node scripts/verify-functions-discovery.mjs \
  authorAssignmentWithAI \
  repairAssignmentQuestionWithAI \
  assignmentAiSelfTest \
  hydrateAssignmentCcmr

echo
echo "6/7 Deploying only the surfaces changed by this upgrade..."
echo "Firebase will run the normal Hosting and Functions predeploy hooks."
if ! firebase deploy --only hosting,functions:authorAssignmentWithAI,functions:repairAssignmentQuestionWithAI,functions:assignmentAiSelfTest,functions:hydrateAssignmentCcmr --project "$PROJECT"; then
  echo >&2
  echo "The deploy failed. Step 5 already proved this codebase loads and defines" >&2
  echo "every function being deployed, so if the CLI reported" >&2
  echo "  Error: Failed to list functions for $PROJECT" >&2
  echo "the failure is in the deploy environment. In order:" >&2
  echo "  1. npm install -g firebase-tools    # an old CLI uses a short discovery budget" >&2
  echo "  2. export FUNCTIONS_DISCOVERY_TIMEOUT=300 && rerun this script" >&2
  echo "  3. firebase login --reauth --project $PROJECT" >&2
  exit 7
fi

echo
echo "7/7 Verifying live Hosting and callable registration..."
HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "https://$PROJECT.web.app")"
echo "Hosting: HTTP $HTTP_STATUS"
if [ "$HTTP_STATUS" != "200" ]; then
  echo "Hosting did not return HTTP 200." >&2
  exit 4
fi

FUNCTION_LIST="$(firebase functions:list --project "$PROJECT")"
for NAME in authorAssignmentWithAI repairAssignmentQuestionWithAI assignmentAiSelfTest hydrateAssignmentCcmr; do
  echo "$FUNCTION_LIST" | grep -F "$NAME" >/dev/null || {
    echo "$NAME was not found in the deployed function list." >&2
    exit 5
  }
  echo "  registered: $NAME"
done

echo
echo "Deployed commit:"
git log --oneline -1

echo
echo "=== Focused Assignment V5 deploy complete ==="
echo "Refresh MathMaster with a hard reload before testing the student assignment experience."
echo
echo "NEXT: sign in as the root administrator and open"
echo "  Administration -> Assignment AI health -> Run AI connection check"
echo "That one check names the cause if the AI still will not build:"
echo "  credential, model entitlement, OpenAI billing quota, or network egress."
