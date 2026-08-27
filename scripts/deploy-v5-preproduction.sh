#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$REPO_ROOT"

echo "=== MathMaster Assignment V5 pre-production deploy ==="
echo "Project: $PROJECT"
echo

for cmd in git npm firebase curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done

if [ -n "$(git status --porcelain)" ]; then
  echo "This repository has uncommitted changes. Commit, stash, or discard them before deploying." >&2
  git status --short
  exit 1
fi

echo "1/7 Updating to latest main..."
git fetch origin main
git checkout main
git pull --ff-only origin main

echo
echo "2/7 Verifying required Firebase secret..."
if ! firebase functions:secrets:access OPENAI_API_KEY --project "$PROJECT" >/dev/null 2>&1; then
  echo
  echo "OPENAI_API_KEY is not configured or cannot be read."
  echo "Run:"
  echo "  firebase functions:secrets:set OPENAI_API_KEY --project $PROJECT"
  echo "Paste the MathMaster Assignment AI key when Firebase prompts, then run this deploy script again."
  exit 2
fi

echo
echo "3/7 Installing exact dependencies..."
npm ci

echo
echo "4/7 Running Assignment V5 release gates..."
npm run test:authoring-v5
npm run validate:authoring-v5
npm run audit:assignment-authoring-boundary
if npm run | grep -q "audit:no-legacy-assignment-bundle"; then
  npm run audit:no-legacy-assignment-bundle
fi

echo
echo "5/7 Building Firebase Hosting in production execution mode..."
echo "VITE_MATHMASTER_EXECUTION_MODE=firebaseProduction" > .env.production.local
npm run build:firebase

echo
echo "6/7 Deploying Firestore rules and Hosting..."
firebase deploy --only firestore:rules,hosting --project "$PROJECT"

echo
echo "Deploying Cloud Functions in quota-safe groups..."
FIREBASE_PROJECT="$PROJECT" bash scripts/deploy-functions-in-groups.sh

echo
echo "7/7 Verifying deployment..."
echo "--- deployed commit ---"
git log --oneline -1

echo "--- hosting ---"
HTTP_STATUS="$(curl -s -o /dev/null -w "%{http_code}" "https://$PROJECT.web.app")"
echo "HTTP $HTTP_STATUS"
if [ "$HTTP_STATUS" != "200" ]; then
  echo "Hosting did not return HTTP 200." >&2
  exit 3
fi

echo "--- functions ---"
firebase functions:list --project "$PROJECT" | head -20 || true

echo
echo "=== V5 pre-production deploy completed ==="
echo "Next browser step:"
echo "  Administration -> My Math Path content coverage"
echo "  Run: Initialize / refresh built-in starter bank"
echo "Then confirm Path deployment status shows matching web/server releases."
