#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Missing required command: firebase" >&2
  exit 1
fi

FUNCTION_TARGETS="$(node -e '
  import("./scripts/response-inspector-deploy-surface.mjs")
    .then((surface) => process.stdout.write(surface.firebaseFunctionTargets()));
')"

if [ -z "$FUNCTION_TARGETS" ]; then
  echo "Could not resolve the response-inspector function surface." >&2
  exit 1
fi

echo "=== MathMaster Response Inspector targeted deploy ==="
echo "Project:   $PROJECT"
echo "Functions: $FUNCTION_TARGETS"
echo

echo "--- 1/5 Building ---"
npm run build
npm run build:firebase

echo
echo "--- 2/5 Deploying Firestore rules ---"
firebase deploy --project "$PROJECT" --only firestore:rules

echo
echo "--- 3/5 Deploying only the response-inspector functions ---"
firebase deploy --project "$PROJECT" --only "$FUNCTION_TARGETS"

echo
echo "--- 4/5 Verifying browser-callable IAM ---"
FIREBASE_PROJECT="$PROJECT" npm run verify:response-inspector-production

echo
echo "--- 5/5 Deploying hosting ---"
FIREBASE_PROJECT="$PROJECT" npm run deploy:hosting

echo
echo "=== Response Inspector deploy complete ==="
