#!/usr/bin/env bash
set -u

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
TIMEOUT_SECONDS="${FUNCTION_DEPLOY_TIMEOUT_SECONDS:-900}"
PAUSE_SECONDS="${PAUSE_SECONDS:-75}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-2}"

# These are the only deployed callables that depend on the Assignment V5
# audience helper changed in commit 87b9b36b. The recent UI/compiler fixes
# (#45-#48) do not modify functions/, so a 76-function redeploy is unnecessary
# and puts avoidable pressure on Cloud Build.
FUNCTIONS=(
  storeLessonNotesPdf
  publishAssignmentToClassrooms
  publishAssignmentToClassroom
  submitModelingLab
)

if ! command -v firebase >/dev/null 2>&1; then
  echo "Firebase CLI is not installed or not on PATH."
  exit 1
fi

if ! command -v timeout >/dev/null 2>&1; then
  echo "The 'timeout' command is required in Cloud Shell."
  exit 1
fi

echo "============================================"
echo "Targeted Assignment V5 function deployment"
echo "Project: $PROJECT"
echo "Functions: ${FUNCTIONS[*]}"
echo "Per-attempt timeout: ${TIMEOUT_SECONDS}s"
echo "Pause between attempts/functions: ${PAUSE_SECONDS}s"
echo "============================================"
echo

FAILED=()

for NAME in "${FUNCTIONS[@]}"; do
  echo "=== Deploying $NAME ==="
  ATTEMPT=1
  OK=0

  while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
    echo "--- $NAME attempt $ATTEMPT of $MAX_ATTEMPTS ---"

    # Firebase/Cloud Build can occasionally leave the CLI waiting after the
    # remote build has already been CANCELLED. Bound the wait so recovery can
    # continue automatically instead of hanging indefinitely.
    if timeout --foreground "$TIMEOUT_SECONDS"       firebase deploy --only "functions:$NAME" --project "$PROJECT" --force; then
      OK=1
      echo "✓ $NAME deployed"
      break
    else
      CODE=$?
      if [ "$CODE" -eq 124 ]; then
        echo "!!! $NAME deployment timed out after ${TIMEOUT_SECONDS}s"
      else
        echo "!!! $NAME deployment exited with code $CODE"
      fi
    fi

    ATTEMPT=$((ATTEMPT + 1))
    if [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; then
      echo "    waiting ${PAUSE_SECONDS}s before retrying..."
      sleep "$PAUSE_SECONDS"
    fi
  done

  if [ "$OK" -ne 1 ]; then
    FAILED+=("$NAME")
  fi

  echo
  if [ "$NAME" != "${FUNCTIONS[-1]}" ]; then
    echo "Pausing ${PAUSE_SECONDS}s before the next function..."
    sleep "$PAUSE_SECONDS"
    echo
  fi
done

echo "============================================"
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "All ${#FUNCTIONS[@]} Assignment V5 functions deployed."
  echo
  echo "Hosting check:"
  curl -s -o /dev/null -w "HTTP %{http_code}\n" "https://mathmaster-aleks.web.app"
  exit 0
fi

echo "${#FAILED[@]} function(s) still failed:"
printf '  %s\n' "${FAILED[@]}"
echo
echo "The website/Hosting deployment is independent of these failures."
echo "To inspect the newest Cloud Build failures, run:"
echo "  gcloud builds list --region=us-central1 --project=$PROJECT --limit=8"
echo
echo "Then retry only the failed function(s) after the Cloud Build issue is resolved."
exit 1
