#!/usr/bin/env bash
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Missing required command: firebase" >&2
  exit 1
fi

FUNCTION_TARGETS="functions:listGradeTransferState,functions:persistGradeTransferSnapshot,functions:confirmGradeTransferUploaded,functions:setStudentSisId,functions:studentSignIn,functions:linkGoogleAccount,functions:createStudentAccount"

echo "=== MathMaster Grade Transfer server deploy ==="
echo "Project:   $PROJECT"
echo "Rules:     firestore:rules"
echo "Functions: $FUNCTION_TARGETS"
echo
echo "Hosting is intentionally NOT part of this command."
echo "Use npm run deploy:hosting separately so a Hosting transport timeout cannot interrupt the server release."
echo

firebase deploy --project "$PROJECT" --only "firestore:rules,$FUNCTION_TARGETS"

echo
echo "=== Grade Transfer server deploy complete ==="
echo "Now hard-refresh MathMaster. If the client also changed, run npm run deploy:hosting separately."
