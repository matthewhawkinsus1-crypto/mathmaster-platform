#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# THE COMPLETE PR #247 PERSISTENCE SURFACE, AND NOTHING ELSE.
#
# Two things this script refuses to do.
#
#   1. Deploy only part of the release. The first version shipped two callables
#      while the same release also changed the Classroom passback trigger, the
#      teacher recovery report, a Firestore composite index and the hosted
#      client. A browser on the new contract calling a server on the old one is
#      how a student's Submit becomes a 403.
#
#   2. Deploy the whole fleet. `firebase deploy --only functions` puts every
#      unrelated function through a new revision and a cold start to ship six.
#      That is a far bigger production event than the change being released.
#
# The order below is the order the dependencies demand:
#
#   1. build                     the client this server contract belongs to
#   2. firestore:indexes         the composite index the safety check queries
#   3. GATE                      the index must be ENABLED before step 4
#   4. functions:<exact names>   the persistence functions, individually named
#   5. IAM verification          the client-facing callables are reachable
#   6. hosting                   the client, last, once its server is live
#
# Step 3 is the one that matters. The new
# `studentResponseCheckpoints(studentId, assignmentId, status)` index backs the
# final-grade safety check in `readPersistencePending`. Deploying
# `syncGradeToClassroom` before that index is ENABLED gives you a passback
# trigger that throws FAILED_PRECONDITION on the exact query that decides
# whether an incomplete record may become a final Google Classroom grade.
#
# `firebase deploy --only firestore:indexes` returns when the build has been
# REQUESTED, not when it is usable, and nothing here can reliably wait for
# readiness. So the script STOPS at the gate and tells the operator exactly
# what to run next, rather than deploying a function that will fail its query.
# ============================================================================

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v firebase >/dev/null 2>&1; then
  echo "Missing required command: firebase" >&2
  exit 1
fi

FUNCTION_TARGETS="$(node -e '
  import("./scripts/persistence-deploy-surface.mjs")
    .then((surface) => process.stdout.write(surface.firebaseFunctionTargets()));
')"
INDEX_DEPENDENT="$(node -e '
  import("./scripts/persistence-deploy-surface.mjs")
    .then((surface) => process.stdout.write(surface.indexDependentFunctionNames().join(", ")));
')"

if [ -z "$FUNCTION_TARGETS" ]; then
  echo "Could not resolve the persistence function list. Refusing to deploy a guessed surface." >&2
  exit 1
fi

echo "=== MathMaster Persistence V3 targeted deploy ==="
echo "Project:   $PROJECT"
echo "Functions: $FUNCTION_TARGETS"
echo

# --- 1. Build ---------------------------------------------------------------
echo "--- 1/6 Building the client ---"
npm run build
npm run build:firebase

# --- 2. Firestore indexes ---------------------------------------------------
echo
if [ "${PERSISTENCE_INDEXES_READY:-0}" = "1" ]; then
  echo "--- 2/6 Firestore indexes: already deployed on the earlier run, skipping ---"
else
  echo "--- 2/6 Deploying Firestore indexes ---"
  firebase deploy --project "$PROJECT" --only firestore:indexes
fi

# --- 3. The index gate ------------------------------------------------------
echo
echo "--- 3/6 Checking that the required composite indexes are ENABLED ---"
# PERSISTENCE_INDEXES_READY=1 is the operator saying they have seen the index
# read "Enabled" in the console. It exists because `gcloud` is not always
# available to the person running this, and the alternative to an explicit
# human attestation is a script that guesses. It is never set by default.
if [ "${PERSISTENCE_INDEXES_READY:-0}" = "1" ]; then
  echo "PERSISTENCE_INDEXES_READY=1 — index readiness attested by the operator. Continuing."
elif node scripts/check-persistence-indexes.mjs; then
  echo "Required composite indexes are ENABLED. Continuing."
else
  cat >&2 <<STOP

================================================================================
STOPPED AFTER INDEX DEPLOYMENT — THIS IS NOT A FAILED DEPLOY.

The index build has been REQUESTED and is not usable yet (or its state could
not be read). The build is complete and the indexes are deployed; nothing is
broken and nothing is half-applied.

What is NOT deployed yet: the functions, the IAM check, and hosting.

Deploying now would put $INDEX_DEPENDENT
live against a composite index that does not answer yet, and their query is the
final-grade safety check. A safety check that throws is an outage on the
finalization path, not a safe default.

WHAT TO DO:

  1. Watch the index reach "Enabled":
         https://console.firebase.google.com/project/$PROJECT/firestore/indexes
     or re-run the gate on its own:
         FIREBASE_PROJECT=$PROJECT node scripts/check-persistence-indexes.mjs

  2. When it passes, finish the deploy. This rebuilds the client, skips the
     index deploy and the gate, and picks up at the functions:
         FIREBASE_PROJECT=$PROJECT PERSISTENCE_INDEXES_READY=1 npm run deploy:persistence

Nothing else is required. Re-running the whole script instead is also safe; it
will simply rebuild and re-request the same indexes.
================================================================================
STOP
  exit 2
fi

# --- 4. The persistence functions, by exact name ----------------------------
echo
echo "--- 4/6 Deploying the persistence functions ---"
# NOTE: never `--only functions`. Each function is named individually.
firebase deploy --project "$PROJECT" --only "$FUNCTION_TARGETS"

# --- 5. Client-facing IAM ---------------------------------------------------
echo
echo "--- 5/6 Verifying client-facing callable IAM ---"
FIREBASE_PROJECT="$PROJECT" npm run verify:persistence-production

# --- 6. Hosting -------------------------------------------------------------
echo
echo "--- 6/6 Deploying hosting ---"
FIREBASE_PROJECT="$PROJECT" npm run deploy:hosting

echo
echo "=== Persistence V3 deploy complete: indexes, ${FUNCTION_TARGETS//functions:/}, hosting ==="
