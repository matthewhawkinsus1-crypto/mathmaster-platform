import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const firebaseJson = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
const buildScript = fs.readFileSync('scripts/build-firebase-hosting.mjs', 'utf8');
const pathFields = fs.readFileSync('src/components/student/PathResponseFields.jsx', 'utf8');

test('Firebase Hosting has a production-safe build command', () => {
  assert.equal(
    packageJson.scripts['build:firebase'],
    'node scripts/build-firebase-hosting.mjs',
  );
  assert.ok(
    Array.isArray(firebaseJson.hosting.predeploy)
      && firebaseJson.hosting.predeploy.includes('npm run build:firebase'),
    'Firebase Hosting must build through the guarded production command',
  );
});

test('the guarded build sets the secure Path execution mode explicitly', () => {
  assert.match(
    buildScript,
    /VITE_MATHMASTER_EXECUTION_MODE:\s*['"]firebaseProduction['"]/,
  );
});

test('the ordered-pair required-key hotfix is still present', () => {
  assert.match(
    pathFields,
    /profile === 'orderedPair' \? 'orderedPair' : profile/,
  );
});
