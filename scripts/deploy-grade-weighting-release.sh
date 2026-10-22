#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
export FUNCTIONS_DISCOVERY_TIMEOUT="${FUNCTIONS_DISCOVERY_TIMEOUT:-60}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Only a clean checkout of current main that has passed CI is deployed
# (scripts/check-deploy-provenance.mjs; its report names the override for a
# deliberate hotfix).
node scripts/check-deploy-provenance.mjs || exit 5

echo "Deploying only syncGradeToClassroom + MathMaster Hosting"
echo "Firebase function discovery timeout: ${FUNCTIONS_DISCOVERY_TIMEOUT}s"

firebase deploy \
  --only "functions:syncGradeToClassroom" \
  --project "$PROJECT"

echo
echo "Deploying Hosting with bounded concurrency and automatic network retries..."
FIREBASE_PROJECT="$PROJECT" bash scripts/deploy-hosting-resilient.sh

echo
echo "--- DEPLOYED COMMIT ---"
git log --oneline -1
