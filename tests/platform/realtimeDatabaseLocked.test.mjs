import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = new URL('../../', import.meta.url);

const readJson = async (relativePath) => JSON.parse(
  await readFile(new URL(relativePath, repoRoot), 'utf8'),
);

const walkCodeFiles = async (relativeDir) => {
  const root = new URL(relativeDir, repoRoot);
  const output = [];

  const visit = async (dirUrl, displayPath) => {
    const entries = await readdir(dirUrl, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const nextUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, dirUrl);
      const nextDisplay = path.posix.join(displayPath, entry.name);
      if (entry.isDirectory()) {
        await visit(nextUrl, nextDisplay);
      } else if (/\.(?:js|jsx|mjs|cjs)$/.test(entry.name)) {
        output.push({ url: nextUrl, displayPath: nextDisplay });
      }
    }
  };

  await visit(root, relativeDir.replace(/\/$/, ''));
  return output;
};

test('Realtime Database is source-controlled in locked deny-all mode', async () => {
  const firebaseConfig = await readJson('firebase.json');
  assert.deepEqual(
    firebaseConfig.database,
    { rules: 'database.rules.json' },
    'firebase.json must deploy the committed Realtime Database rules file',
  );

  const rules = await readJson('database.rules.json');
  assert.equal(rules?.rules?.['.read'], false, 'Realtime Database client reads must be denied');
  assert.equal(rules?.rules?.['.write'], false, 'Realtime Database client writes must be denied');
});

test('MathMaster runtime does not silently depend on Realtime Database', async () => {
  const files = [
    ...(await walkCodeFiles('src/')),
    ...(await walkCodeFiles('functions/')),
  ];

  const forbiddenPatterns = [
    /from\s+['"]firebase\/database['"]/,
    /require\(\s*['"]firebase\/database['"]\s*\)/,
    /from\s+['"]firebase-admin\/database['"]/,
    /require\(\s*['"]firebase-admin\/database['"]\s*\)/,
    /\bgetDatabase\s*\(/,
  ];

  const offenders = [];
  for (const file of files) {
    const source = await readFile(file.url, 'utf8');
    if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
      offenders.push(file.displayPath);
    }
  }

  assert.deepEqual(
    offenders,
    [],
    [
      'MathMaster currently uses Firestore, Auth, Functions, and Storage rather than Firebase Realtime Database.',
      'If Realtime Database becomes intentional, design path-specific rules first and update this guard in the same change.',
    ].join(' '),
  );
});
