import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Firebase Hosting never caches the SPA shell across hashed bundle deployments', async () => {
  const config = JSON.parse(await readFile('firebase.json', 'utf8'));
  const headers = config.hosting?.headers || [];
  const indexRule = headers.find((entry) => entry.source === '/index.html');
  const assetsRule = headers.find((entry) => entry.source === '/assets/**');
  assert.ok(indexRule, 'index.html needs an explicit no-cache rule');
  assert.match(
    indexRule.headers?.find((header) => header.key === 'Cache-Control')?.value || '',
    /no-cache/i,
  );
  assert.ok(assetsRule, 'fingerprinted Vite assets need an immutable cache rule');
  assert.match(
    assetsRule.headers?.find((header) => header.key === 'Cache-Control')?.value || '',
    /immutable/i,
  );
});

test('the static shell shows a recovery action if the JavaScript bundle never boots', async () => {
  const source = await readFile('index.html', 'utf8');
  assert.match(source, /mathmaster-boot-fallback/);
  assert.match(source, /MathMaster did not finish loading/);
  assert.match(source, /Reload current build/);
  assert.match(source, /window\.addEventListener\('error'/);
});
