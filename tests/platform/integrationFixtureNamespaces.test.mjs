import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

/*
 * TWO INTEGRATION FILES MUST NOT SHARE A FIXTURE (CI08, finding D-5).
 *
 * `npm run test:challenge-finish` runs every tests/integration/*.test.mjs side
 * by side against ONE emulator. secureExamNavigation and testCycleCertification
 * both installed the certification fixture under its default ids (the class
 * cert-class-alg1, the assignment cert-test-cycle-assignment, the cert_
 * families): one file's ten students sat in the other's class (13 students
 * where a test expected 3), and whichever finished first deleted the documents
 * the other was still using. Run together they failed 32 of 66 tests; on a
 * developer machine the whole suite lost "31 of 477", while every file passed
 * alone and CI, where fewer files overlap, passed.
 *
 * testCycleCertification owns the default ids. Every other file asks the
 * fixture for ids of its own (a prefix, a class, an assignment) or renames the
 * ids it gets. This reads each file's source: it cannot see an id spelled in a
 * string, only the imports and the calls that put the default ones in.
 *
 * canonicalPersistenceHarness's fixture (the 'canonpersist' ids) is seeded and
 * torn down by two files, but never in the same place: canonicalPersistence-
 * Certification uses the emulator's default project, and gradeAuthorityEndToEnd
 * sets a project of its own before the harness (and the Cloud Functions in it)
 * load, and the emulator keeps each project's documents apart. The last test
 * below keeps it that way for any file that seeds it.
 */

const integration = new URL('../integration/', import.meta.url);
const OWNER = 'testCycleCertification.test.mjs';
const DEFAULT_IDS = ['CERT_CLASS_ID', 'CERT_OTHER_CLASS_ID', 'CERT_ASSIGNMENT_ID'];

const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

/** The names a file imports from the certification fixture. */
const importedFromFixture = (text) => {
  const found = [];
  for (const match of withoutComments(text).matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*testCycleCertificationFixture\.mjs'/g)) {
    match[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0]).filter(Boolean).forEach((name) => found.push(name));
  }
  return found;
};

/** Whether a file that installs the fixture's families keeps them to itself. */
const keepsFamiliesToItself = (text) => {
  const code = withoutComments(text);
  if (!/\bcertFamilies\s*\(/.test(code)) return true;
  // A prefix of its own, or every id renamed away from cert_ (testCycleFewerItems and the others).
  return /\bcertFamilies\s*\(\s*\{[^}]*prefix\b/.test(code) || /\bid:\s*family\.id\.replace\(\/\^cert_\/,/.test(code);
};

/*
 * The emulator project a file seeds canonicalPersistenceHarness's fixture
 * into: null when it does not seed it, 'default' unless it sets
 * GCLOUD_PROJECT to an id of its own BEFORE a dynamic import of the harness
 * (a static import runs first, so it always gets the default project).
 */
const CANONICAL_OWNER = 'canonicalPersistenceCertification.test.mjs';
const canonicalFixtureProject = (text) => {
  const code = withoutComments(text);
  if (!code.includes('canonicalPersistenceHarness.mjs') || !/\b(?:seedFixture|teardownFixture)\b/.test(code)) return null;
  const loadedAt = code.search(/await import\(\s*'\.\/canonicalPersistenceHarness\.mjs'\s*\)/);
  const set = code.match(/process\.env\.GCLOUD_PROJECT\s*=\s*([A-Za-z_$][\w$]*|'[^']+')/);
  if (/from\s*'\.\/canonicalPersistenceHarness\.mjs'/.test(code) || loadedAt < 0 || !set || set.index > loadedAt) return 'default';
  if (set[1].startsWith("'")) return set[1].slice(1, -1);
  return code.match(new RegExp(`const ${set[1]}\\s*=\\s*'([^']+)'`))?.[1] || set[1];
};

const files = () => readdirSync(integration).filter((name) => name.endsWith('.test.mjs'));
const source = (name) => readFileSync(new URL(name, integration), 'utf8');

test('the checks below can tell a shared fixture from a namespaced one', () => {
  assert.deepEqual(importedFromFixture("import {\n  CERT_CLASS_ID, certFamilies as families,\n  CERT_TOTAL_QUESTIONS,\n} from '../fixtures/testCycleCertificationFixture.mjs';"), ['CERT_CLASS_ID', 'certFamilies', 'CERT_TOTAL_QUESTIONS']);
  assert.deepEqual(importedFromFixture("// import { CERT_CLASS_ID } from '../fixtures/testCycleCertificationFixture.mjs';"), [], 'a comment imports nothing');
  assert.equal(keepsFamiliesToItself('const f = certFamilies();'), false, 'the default families, as they are');
  assert.equal(keepsFamiliesToItself("const f = certFamilies({ prefix: 'nav_' });"), true);
  assert.equal(keepsFamiliesToItself("const f = certFamilies().map((family) => ({ ...family, id: family.id.replace(/^cert_/, PREFIX) }));"), true);
  assert.equal(keepsFamiliesToItself("const f = certFamilies().map((family) => ({ ...family, familyId: family.familyId.replace(/^cert_/, PREFIX) }));"), false, 'renaming only the family label leaves the document ids shared');
  assert.equal(keepsFamiliesToItself('const f = 1;'), true, 'a file that never installs them');
  const harness = "'./canonicalPersistenceHarness.mjs'";
  assert.equal(canonicalFixtureProject(`import { seedFixture } from ${harness};\nbefore(seedFixture);`), 'default');
  assert.equal(canonicalFixtureProject(`const P = 'own-e2e';\nprocess.env.GCLOUD_PROJECT = P;\nconst { seedFixture } = await import(${harness});`), 'own-e2e');
  assert.equal(canonicalFixtureProject(`const { seedFixture } = await import(${harness});\nprocess.env.GCLOUD_PROJECT = 'late';`), 'default', 'set after the harness loaded: too late');
  assert.equal(canonicalFixtureProject(`import { db } from ${harness};\nconst cleanup = 1;`), null, 'a file that uses the harness but not its fixture');
});

test('only testCycleCertification uses the certification fixture\'s default class and assignment', () => {
  assert.ok(files().includes(OWNER), `${OWNER} exists`);
  const ownerImports = importedFromFixture(source(OWNER));
  for (const name of ['CERT_CLASS_ID', 'CERT_ASSIGNMENT_ID']) assert.ok(ownerImports.includes(name), `${OWNER} owns ${name}`);
  for (const name of files().filter((file) => file !== OWNER)) {
    const shared = importedFromFixture(source(name)).filter((imported) => DEFAULT_IDS.includes(imported));
    assert.deepEqual(shared, [], `${name} imports the fixture's default ids ${shared.join(', ')}: ${OWNER} owns them, and files in this folder run side by side on one emulator. Give the file its own class and assignment: certAssignment({ prefix, classIds, assignmentId }) and certFamilies({ prefix }) take them.`);
  }
});

test('a file that installs the certification families gives them ids of its own', () => {
  for (const name of files().filter((file) => file !== OWNER)) {
    assert.ok(keepsFamiliesToItself(source(name)), `${name} installs the default cert_ families, which ${OWNER} also installs and removes: pass certFamilies({ prefix }) or rename the ids`);
  }
});

test('every file that seeds the canonical persistence fixture has an emulator project of its own', () => {
  const seeded = files().map((name) => [name, canonicalFixtureProject(source(name))]).filter(([, project]) => project);
  assert.deepEqual(seeded.filter(([, project]) => project === 'default').map(([name]) => name), [CANONICAL_OWNER],
    `only ${CANONICAL_OWNER} may seed the 'canonpersist' fixture in the default project; another file must set process.env.GCLOUD_PROJECT to an id of its own before \`await import('./canonicalPersistenceHarness.mjs')\` (gradeAuthorityEndToEnd does), or one file's teardown deletes the other's class`);
  const own = seeded.filter(([, project]) => project !== 'default').map(([, project]) => project);
  assert.ok(own.length >= 1, 'gradeAuthorityEndToEnd seeds it in a project of its own');
  assert.equal(new Set(own).size, own.length, `no two files share a project: ${own.join(', ')}`);
});
