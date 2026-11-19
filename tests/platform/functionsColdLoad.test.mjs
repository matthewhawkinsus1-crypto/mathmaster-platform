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
// 512 (#550). functions/lib/classroom.js now loads nothing Google until a
// function first builds a client, and then only the Classroom and Drive APIs
// (about 170 modules), from the modules the package builds its own clients
// from.
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

// Whether the whole `googleapis` package was loaded: its index and its
// GoogleApis class build a client for each of some 300 APIs.
const WHOLE_PACKAGE_LOADED = String.raw`Object.keys(require.cache).some((file) => /\/node_modules\/googleapis\/build\/src\/(?:index|googleapis)\.js$/.test(file))`;
const API_MODULES_LOADED = String.raw`Object.keys(require.cache).filter((file) => /\/node_modules\/googleapis\/build\/src\/apis\/[^/]+\/index\.js$/.test(file)).map((file) => file.split('/').at(-2)).sort()`;

test('the Classroom library gets its OAuth client when it first builds one, without the whole googleapis package', () => {
  // buildAuthUrl is the first thing a teacher's "Connect Google Classroom"
  // does, and it needs the OAuth client.
  const { packages, result } = loadInFreshProcess(
    `
    const classroom = require('./lib/classroom');
    const before = Object.keys(require.cache).some((file) => file.includes('/node_modules/googleapis'));
    const url = classroom.buildAuthUrl('synthetic-state');
    globalThis.__result = { before, url, whole: ${WHOLE_PACKAGE_LOADED}, apis: ${API_MODULES_LOADED} };
    `,
    {
      GOOGLE_OAUTH_CLIENT_ID: 'synthetic-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'synthetic-client-secret',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://example.invalid/oauth/callback',
    },
  );
  assert.equal(result.before, false, 'loading lib/classroom alone loads nothing from googleapis');
  assert.ok(packages.includes('google-auth-library'), 'building an OAuth client loads the auth library');
  assert.equal(result.whole, false, 'building a client loads the APIs this codebase uses, not every Google API');
  assert.deepEqual(result.apis, ['classroom']);
  const url = new URL(result.url);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.equal(url.searchParams.get('client_id'), 'synthetic-client-id');
  assert.equal(url.searchParams.get('state'), 'synthetic-state');
  assert.match(url.searchParams.get('scope'), /classroom\.coursework\.students/);
});

test('the per-API modules give the clients the whole package gives', () => {
  // lib/classroom.js builds its clients from googleapis/build/src/apis/<name>,
  // which is not a documented entry point. This compares, in the installed
  // version, what those modules build with what `google.classroom()`,
  // `google.drive()` and `google.auth.OAuth2` build: the same classes, with
  // the same per-client options and the same (empty) package-wide options.
  // If an upgrade of googleapis moves the modules or changes what they build,
  // this fails before a Classroom call does.
  const { result } = loadInFreshProcess(`
    const { google } = require('googleapis');
    const classroomApi = require('googleapis/build/src/apis/classroom');
    const driveApi = require('googleapis/build/src/apis/drive');
    const oauth = (auth) => new auth.OAuth2('synthetic-client-id', 'synthetic-client-secret', 'https://example.invalid/oauth/callback');
    const whole = { classroom: google.classroom({ version: 'v1', auth: oauth(google.auth) }), drive: google.drive({ version: 'v3', auth: oauth(google.auth) }) };
    const perApi = { classroom: classroomApi.classroom({ version: 'v1', auth: oauth(classroomApi.auth) }), drive: driveApi.drive({ version: 'v3', auth: oauth(classroomApi.auth) }) };
    const options = (client) => ({
      own: Object.keys(client.context._options).sort(),
      authIsOAuth2: client.context._options.auth instanceof google.auth.OAuth2,
      // What every request starts from (googleapis-common, createAPIRequest).
      packageWide: (client.context.google && client.context.google._options) || {},
    });
    globalThis.__result = {
      sameOAuth2: classroomApi.auth.OAuth2 === google.auth.OAuth2,
      sameClassroom: perApi.classroom.constructor === whole.classroom.constructor,
      sameDrive: perApi.drive.constructor === whole.drive.constructor,
      wholeOptions: [options(whole.classroom), options(whole.drive)],
      perApiOptions: [options(perApi.classroom), options(perApi.drive)],
    };
  `);
  assert.equal(result.sameOAuth2, true, 'the OAuth2 client class');
  assert.equal(result.sameClassroom, true, 'the Classroom v1 client class');
  assert.equal(result.sameDrive, true, 'the Drive v3 client class');
  assert.deepEqual(result.perApiOptions, result.wholeOptions);
  assert.deepEqual(result.perApiOptions[0], { own: ['auth'], authIsOAuth2: true, packageWide: {} });
});
