#!/usr/bin/env bash
#
# Deploy the Cloud Functions a few at a time instead of all at once.
#
# Why this exists: this project now exports 76 functions from a single
# codebase. `firebase deploy` pushes them in large parallel batches, and Google
# rate-limits the Cloud Functions / Cloud Build APIs per minute per project.
# Past that ceiling the extra functions come back as "failed to deploy" even
# though the code is fine — a retry of exactly the same code succeeds. Rather
# than retrying by hand, this walks the list in small groups, pauses between
# them so the per-minute quota refills, and retries a group that fails.
#
# It reads the function names out of functions/index.js, so it cannot go stale
# when functions are added or removed.
#
# Usage:
#   bash scripts/deploy-functions-in-groups.sh                 # all functions
#   GROUP_SIZE=6 bash scripts/deploy-functions-in-groups.sh    # smaller groups
#   bash scripts/deploy-functions-in-groups.sh nameA nameB     # only these
#
set -uo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
GROUP_SIZE="${GROUP_SIZE:-10}"
PAUSE_SECONDS="${PAUSE_SECONDS:-30}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-3}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INDEX_FILE="$REPO_ROOT/functions/index.js"

if [ ! -f "$INDEX_FILE" ]; then
  echo "Cannot find $INDEX_FILE — run this from inside the repository." >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  NAMES=("$@")
else
  mapfile -t NAMES < <(grep -o '^exports\.[A-Za-z0-9_]*' "$INDEX_FILE" | sed 's/^exports\.//')
fi

TOTAL=${#NAMES[@]}
if [ "$TOTAL" -eq 0 ]; then
  echo "No functions found to deploy." >&2
  exit 1
fi

echo "Deploying $TOTAL functions to $PROJECT in groups of $GROUP_SIZE."
echo "A group that fails is retried up to $MAX_ATTEMPTS times before moving on."
echo

FAILED=()
GROUP_NUMBER=0
INDEX=0

while [ "$INDEX" -lt "$TOTAL" ]; do
  GROUP_NUMBER=$((GROUP_NUMBER + 1))
  GROUP=("${NAMES[@]:INDEX:GROUP_SIZE}")
  INDEX=$((INDEX + GROUP_SIZE))

  TARGET=""
  for NAME in "${GROUP[@]}"; do
    [ -n "$TARGET" ] && TARGET="$TARGET,"
    TARGET="${TARGET}functions:${NAME}"
  done

  echo "=== Group $GROUP_NUMBER (${#GROUP[@]} functions) ==="
  printf '    %s\n' "${GROUP[@]}"

  ATTEMPT=1
  OK=0
  while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    if firebase deploy --only "$TARGET" --project "$PROJECT" --force; then
      OK=1
      break
    fi
    echo "--- group $GROUP_NUMBER attempt $ATTEMPT failed ---"
    ATTEMPT=$((ATTEMPT + 1))
    if [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; then
      echo "    waiting 60s before retrying so the per-minute quota refills"
      sleep 60
    fi
  done

  if [ "$OK" -ne 1 ]; then
    echo "!!! group $GROUP_NUMBER still failing after $MAX_ATTEMPTS attempts"
    FAILED+=("${GROUP[@]}")
  fi

  if [ "$INDEX" -lt "$TOTAL" ]; then
    echo "    pausing ${PAUSE_SECONDS}s before the next group"
    sleep "$PAUSE_SECONDS"
  fi
  echo
done

echo "============================================"
if [ ${#FAILED[@]} -eq 0 ]; then
  echo "All $TOTAL functions deployed."
  exit 0
fi

echo "${#FAILED[@]} function(s) did not deploy:"
printf '    %s\n' "${FAILED[@]}"
echo
echo "These failed repeatedly, so it is probably not rate limiting."
echo "Read the reason with:"
echo "    firebase functions:log --project $PROJECT --only ${FAILED[0]} | tail -40"
echo "and retry just these with:"
RETRY=""
for NAME in "${FAILED[@]}"; do
  [ -n "$RETRY" ] && RETRY="$RETRY "
  RETRY="${RETRY}${NAME}"
done
echo "    bash scripts/deploy-functions-in-groups.sh $RETRY"
exit 1
