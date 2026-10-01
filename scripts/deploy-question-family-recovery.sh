#!/usr/bin/env bash
# Targeted deploy for the Question Family + Practice-based Recovery release.
# Rules first (they pin the new server-only grades fields), then exactly the
# functions in scripts/question-family-recovery-deploy-surface.mjs, then the
# browser-callable IAM check, then Hosting through the resilient wrapper.
set -euo pipefail

PROJECT="${FIREBASE_PROJECT:-mathmaster-aleks}"
REGION="${FUNCTION_REGION:-us-central1}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

for command in firebase gcloud node npm; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

FUNCTION_TARGETS="$(node -e '
  import("./scripts/question-family-recovery-deploy-surface.mjs")
    .then((surface) => process.stdout.write(surface.firebaseFunctionTargets()));
')"
BROWSER_SERVICES="$(node -e '
  import("./scripts/question-family-recovery-deploy-surface.mjs")
    .then((surface) => process.stdout.write(surface.browserCallableServiceIds().join(" ")));
')"

if [ -z "$FUNCTION_TARGETS" ]; then
  echo "Could not resolve the question-family recovery function surface." >&2
  exit 1
fi

echo "=== MathMaster Question Families + Practice-based Recovery targeted deploy ==="
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
echo "--- 3/5 Deploying only this release's functions ---"
firebase deploy --project "$PROJECT" --only "$FUNCTION_TARGETS"

echo
echo "--- 4/5 Verifying browser-callable IAM ---"
for service in $BROWSER_SERVICES; do
  policy="$(gcloud run services get-iam-policy "$service" --project "$PROJECT" --region "$REGION" --format=json)"
  if ! printf '%s' "$policy" | node -e '
    let raw = ""; process.stdin.on("data", (chunk) => { raw += chunk; });
    process.stdin.on("end", () => {
      const policy = JSON.parse(raw || "{}");
      const ok = (policy.bindings || []).some((binding) => binding.role === "roles/run.invoker" && (binding.members || []).includes("allUsers"));
      process.exit(ok ? 0 : 1);
    });
  '; then
    echo "FAIL $service: allUsers -> roles/run.invoker is missing; browsers would get 403." >&2
    exit 1
  fi
  echo "PASS $service: allUsers -> roles/run.invoker"
done

echo
echo "--- 5/5 Deploying hosting ---"
FIREBASE_PROJECT="$PROJECT" npm run deploy:hosting

echo
echo "=== Question Families + Practice-based Recovery deploy complete ==="
