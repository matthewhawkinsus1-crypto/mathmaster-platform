#!/usr/bin/env bash
set -euo pipefail

PROJECT="mathmaster-aleks"
REPO_URL="https://github.com/matthewhawkinsus1-crypto/mathmaster-platform.git"
LIVE_MANIFEST="https://mathmaster-aleks.web.app/mathmaster-build.json"

workdir="$(mktemp -d -t mathmaster-firebase-recovery-XXXXXX)"
trap 'rm -rf "$workdir"' EXIT

echo "============================================================"
echo "MathMaster emergency Firebase Hosting recovery"
echo "This ignores every old local checkout and deploys fresh main."
echo "============================================================"

git clone --depth 1 --branch main "$REPO_URL" "$workdir/repo"
cd "$workdir/repo"

EXPECTED_SHA="$(git rev-parse --short=12 HEAD)"
echo "Fresh GitHub main commit: $EXPECTED_SHA"

npm ci --no-audit --no-fund

# firebase.json runs build:firebase as Hosting's predeploy.
export FIREBASE_HOSTING_UPLOAD_CONCURRENCY="\${FIREBASE_HOSTING_UPLOAD_CONCURRENCY:-4}"

echo
echo "Deploying fresh main to Firebase project $PROJECT ..."
npx firebase deploy --only hosting --project "$PROJECT"

if [ ! -f dist/mathmaster-build.json ]; then
  echo "ERROR: Firebase production build manifest was not created." >&2
  exit 20
fi

BUILT_SHA="$(node --input-type=module -e "import fs from 'node:fs'; const m=JSON.parse(fs.readFileSync('dist/mathmaster-build.json','utf8')); process.stdout.write(String(m.gitSha||''));")"
echo "Built commit: $BUILT_SHA"
if [ "$BUILT_SHA" != "$EXPECTED_SHA" ]; then
  echo "ERROR: build does not match the fresh GitHub checkout." >&2
  exit 21
fi

echo
echo "Checking the actual classroom URL, not Vercel ..."
live_sha=""
for attempt in {1..18}; do
  ts="$(date +%s)-$attempt"
  body="$(curl -fsSL --connect-timeout 10 --max-time 20 -H 'Cache-Control: no-cache' "\${LIVE_MANIFEST}?ts=\${ts}" 2>/dev/null || true)"
  live_sha="$(printf '%s' "$body" | node --input-type=module -e "let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{try{const m=JSON.parse(s); process.stdout.write(String(m.gitSha||''));}catch{}});" 2>/dev/null || true)"
  if [ "$live_sha" = "$EXPECTED_SHA" ]; then
    echo
    echo "============================================================"
    echo "SUCCESS: Firebase classroom site is serving $live_sha"
    echo "URL: https://mathmaster-aleks.web.app/"
    echo "============================================================"
    exit 0
  fi
  echo "Verification $attempt/18: expected $EXPECTED_SHA; live reports \${live_sha:-OLD BUILD / NO MANIFEST}"
  sleep 5
done

echo >&2
echo "============================================================" >&2
echo "DEPLOYMENT DID NOT REACH THE CLASSROOM SITE." >&2
echo "Expected commit: $EXPECTED_SHA" >&2
echo "Live commit:     \${live_sha:-no Firebase build manifest}" >&2
echo "Do not troubleshoot student math code until this is resolved." >&2
echo "============================================================" >&2
exit 22
