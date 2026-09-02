#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
export FUNCTIONS_DISCOVERY_TIMEOUT="${FUNCTIONS_DISCOVERY_TIMEOUT:-60}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "Deploying only MathMaster Hosting + syncGradeToClassroom"
echo "Firebase function discovery timeout: ${FUNCTIONS_DISCOVERY_TIMEOUT}s"

firebase deploy \
  --only "functions:syncGradeToClassroom,hosting" \
  --project "$PROJECT"

echo
echo "--- DEPLOYED COMMIT ---"
git log --oneline -1
