import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Hosting deploys are throttled and retry transient upload failures', async () => {
  const helper = await read('scripts/deploy-hosting-resilient.sh');

  assert.match(helper, /FIREBASE_HOSTING_UPLOAD_CONCURRENCY:-4/);
  assert.match(helper, /FIREBASE_HOSTING_DEPLOY_ATTEMPTS:-8/);
  assert.match(helper, /upload-firebasehosting\\\.googleapis\\\.com/);
  assert.match(helper, /ConnectTimeoutError/);
  assert.match(helper, /firebase deploy --only hosting --project/);
  assert.match(helper, /Transient Firebase Hosting network failure detected/);
});

test('production deploy helpers keep Hosting separate from Functions and rules', async () => {
  const full = await read('scripts/deploy-v5-preproduction.sh');
  const focused = await read('scripts/deploy-assignment-v5-followup.sh');
  const grading = await read('scripts/deploy-grade-weighting-release.sh');

  assert.match(full, /firebase deploy --only firestore:rules --project/);
  assert.match(full, /deploy-hosting-resilient\.sh/);
  assert.doesNotMatch(full, /firestore:rules,hosting/);

  assert.match(focused, /deploy-hosting-resilient\.sh/);
  assert.doesNotMatch(focused, /--only hosting,functions:/);

  assert.match(grading, /deploy-hosting-resilient\.sh/);
  assert.doesNotMatch(grading, /functions:syncGradeToClassroom,hosting/);
});

test('package scripts expose the safe Hosting path', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.scripts['deploy:hosting'], 'bash scripts/deploy-hosting-resilient.sh');
  assert.match(pkg.scripts['deploy:path-admin'], /npm run deploy:hosting/);
  assert.doesNotMatch(pkg.scripts['deploy:path-admin'], /functions:path-admin,hosting/);
});
