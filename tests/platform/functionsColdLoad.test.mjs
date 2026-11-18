// WHAT EVERY FUNCTION INSTANCE LOADS BEFORE IT ANSWERS ITS FIRST REQUEST.
//
// Each function in the default codebase starts by loading the whole entry
// point (functions/package.json `main`). Whatever that loads is paid for by
// every instance of every function: in start-up time, and in memory that
// counts against the 512 MiB each one runs in.
//
// Until November 2026 the entry point loaded `googleapis`, the client for
// every Google API, through the Classroom section entries: about 950 modules,
// half a second and 45 MB of heap, in functions that never talk to Google.
// The Live Challenge lobby callable was killed with 520 MiB in use against
// 512 (#550). functions/lib/classroom.js now loads it when a function first
// builds a Google client.
//
// These tests load the real entry point in a fresh node process and read its
// module cache, so a top-level require added in any file of the entry chain,
// or in any module it loads, is caught.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const functionsDir = path.join(repoRoot, 'functions');
const entry = JSON.parse(readFileSync(path.join(functionsDir, 'package.json'), 'utf8')).main;

// Packages a function loads only when it needs them. Each is hundreds of
// modules; mathjs is reached through shared/algebra/safeMath.mjs.
const LOADED_ON_DEMAND = ['googleapis', 'googleapis-common', 'mathjs'];

// The entry point loads about 470 modules, some 410 of them the Firebase
// SDKs. The budget leaves room for ordinary growth and none for another
// client library.
const MODULE_BUDGET = 620;

// Runs `script` in a new node process inside functions/ and returns the JSON
// it prints: the packages and module count in the CommonJS cache.
const loadInFreshProcess = (script, env = {}) => {
  const report = `
    const packages = new Set();
    let modules = 0;
    for (const file of Object.keys(require.cache)) {
      modules += 1;
      const at = file.lastIndexOf('/node_modules/');
      if (at < 0) continue;
      const parts = file.slice(at + '/node_modules/'.length).split('/');
      packages.add(parts[0].startsWith('@') ? parts[0] + '/' + parts[1] : parts[0]);
    }
    console.log(JSON.stringify({ modules, packages: [...packages].sort(), result: globalThis.__result ?? null }));
  `;
  const run = spawnSync(process.execPath, ['-e', `${script}\n${report}`], {
    cwd: functionsDir,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(run.status, 0, `the functions code loads in a fresh process:\n${run.stderr}`);
  return JSON.parse(run.stdout.trim().split('\n').pop());
};

test('the entry point loads no on-demand client library', () => {
  const { packages, modules } = loadInFreshProcess(`require(${JSON.stringify(`./${entry}`)});`);
  assert.ok(packages.includes('firebase-functions'), 'the real entry point was loaded');
  const loaded = LOADED_ON_DEMAND.filter((name) => packages.includes(name));
  assert.deepEqual(loaded, [], 'every function instance would load these at start-up; require them inside the function that uses them');
  assert.ok(
    modules <= MODULE_BUDGET,
    `the entry point loads ${modules} modules, over its budget of ${MODULE_BUDGET}: find what a top-level require pulled in before raising it`,
  );
});

test('the Classroom library still gets its Google client, when it first builds one', () => {
  // buildAuthUrl is the first thing a teacher's "Connect Google Classroom"
  // does, and it needs the OAuth client from googleapis.
  const { packages, result } = loadInFreshProcess(
    `
    const classroom = require('./lib/classroom');
    const before = Object.keys(require.cache).some((file) => file.includes('/node_modules/googleapis/'));
    const url = classroom.buildAuthUrl('synthetic-state');
    globalThis.__result = { before, url };
    `,
    {
      GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://example.invalid/oauth/callback',
    },
  );
  assert.equal(result.before, false, 'loading lib/classroom alone does not load googleapis');
  assert.ok(packages.includes('googleapis'), 'building an OAuth client loads it');
  const url = new URL(result.url);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), 'synthetic-client-id');
  assert.equal(url.searchParams.get('state'), 'synthetic-state');
  assert.match(url.searchParams.get('scope'), /classroom\.coursework\.students/);
});
