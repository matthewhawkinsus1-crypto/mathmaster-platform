#!/usr/bin/env bash
set -euo pipefail

# Target only the two client-facing persistence callables. Never redeploy the
# full function fleet for this guardrail release.
firebase deploy --project "${FIREBASE_PROJECT:-mathmaster-aleks}" \
  --only functions:ingestStudentSubmissions,functions:reportStudentDeviceQueue
npm run verify:persistence-production
