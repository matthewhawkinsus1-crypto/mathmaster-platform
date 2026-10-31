/*
 * EVERY COLLECTION IN THE FIRESTORE RULES HAS A RULES CASE (CI05, D-83).
 *
 * AGENTS.md ("What the gate is weak on"): Firestore rules are covered only by
 * the emulator suites (`npm run test:rules`), so a new collection needs its own
 * cases there and its deploy needs `firestore:rules`. Nothing checked that a
 * new collection HAD any: it could ship with rules no test had ever exercised,
 * and every check stayed green until a student or a teacher hit them.
 *
 * This test needs no emulator. It lists every `match /<collection>/` in
 * firestore.rules, nested ones too (grades/{id}/supportEvidence), and fails for
 * any collection that none of the files `npm run test:rules` runs
 * (tests/rules/*.test.mjs and tests/firestore-rules.test.mjs) names in code.
 * A comment does not count; a collection spelled through an exported constant
 * (TEACHER_QUESTION_COLLECTION) does, because the constant's value is read.
 *
 * What it can and cannot tell. A name in a rules test is evidence that someone
 * wrote a case for the collection, not that the case is good: that is still a
 * reviewer's job (and breaking the rule once to see the case go red, AGENTS.md).
 * What it does catch is the case that never gets written. A collection that is
 * truly covered some other way goes in NO_RULES_CASE_NEEDED with its reason;
 * the list must stay true, so an entry that is covered after all, or that no
 * longer exists in the rules, fails too.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import { stripComments } from './helpers/stripComments.mjs';

const ROOT = new URL('../../', import.meta.url);

/**
 * Collections that have no case in a rules test file, and why that is right.
 * One line each. Keyed by the collection's name, or by 'parent/child' for a
 * nested one. Empty today: every collection has a case.
 */
const NO_RULES_CASE_NEEDED = {};

/** The files `npm run test:rules` runs (package.json), as repository paths. */
const rulesTestFiles = () => [
  ...readdirSync(new URL('tests/rules/', ROOT)).filter((name) => name.endsWith('.test.mjs')).sort().map((name) => `tests/rules/${name}`),
  'tests/firestore-rules.test.mjs',
];

/**
 * Every collection the rules match, keyed 'parent/child' down the nesting:
 * Map(path -> name). Wildcards ({id}, {document=**}) are documents, not
 * collections, and the /databases/{database}/documents wrapper is no collection.
 */
export const rulesCollections = (rulesText) => {
  const header = String.raw`\bmatch\s+((?:\/(?:[A-Za-z_]\w*|\{[^}]+\}))+)\s*\{`;
  const found = new Map();
  const open = []; // the match blocks around this point: { depth, chain: ['grades'] }
  let depth = 0;
  for (const [token, path] of stripComments(rulesText).matchAll(new RegExp(`${header}|[{}]`, 'g'))) {
    if (token === '}') {
      if (open.length && open[open.length - 1].depth === depth) open.pop();
      depth -= 1;
      continue;
    }
    depth += 1;
    if (token === '{') continue;
    if (/^\/databases\/\{[^}]+\}\/documents$/.test(path)) {
      open.push({ depth, chain: [] });
      continue;
    }
    const chain = open.length ? [...open[open.length - 1].chain] : [];
    for (const segment of path.split('/').filter((part) => part && !part.startsWith('{'))) {
      chain.push(segment);
      found.set(chain.join('/'), segment);
    }
    open.push({ depth, chain });
  }
  return found;
};

/**
 * The string constants a test file imports from a module of ours and uses
 * (askTeacherRules.test.mjs spells its collections TEACHER_QUESTION_COLLECTION),
 * so a collection named only through one still counts. Only UPPER_SNAKE names
 * are followed: that is how this codebase writes a constant.
 */
const importedConstants = async (file, code) => {
  const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"]/g)];
  const body = code.replace(/import\s*\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?/g, ' ');
  const values = [];
  for (const [, names, from] of imports) {
    const wanted = names.split(',')
      .map((part) => part.trim().split(/\s+as\s+/))
      .filter(([exported]) => /^[A-Z][A-Z0-9_]+$/.test(exported))
      .filter(([exported, local = exported]) => new RegExp(`\\b${local}\\b`).test(body));
    if (!wanted.length) continue;
    const exported = await import(new URL(from, new URL(file, ROOT)));
    for (const [name] of wanted) if (typeof exported[name] === 'string') values.push(exported[name]);
  }
  return values;
};

/** What one rules test says: its code without comments, and the constants it imports and uses. */
const readTest = async (file, text) => {
  const code = stripComments(text);
  return { file, code, constants: new Set(await importedConstants(file, code)) };
};
const readRulesTests = () => Promise.all(rulesTestFiles().map((file) => readTest(file, readFileSync(new URL(file, ROOT), 'utf8'))));

/** Is this name a whole path segment of a string in the code ('grades/S1/x', `x/${id}`) or a constant's value? */
const names = (name, { code, constants }) => constants.has(name)
  || new RegExp(String.raw`(?<=['"\`/])${name}(?=['"\`/])`).test(code);

/**
 * Collections with no case. A nested collection needs its own name AND its
 * parent's in one file, so a common word ('items', 'players') in an unrelated
 * test does not stand in for it.
 */
export const withoutCases = (collections, tests) => [...collections.keys()].filter((path) => {
  const segments = path.split('/');
  return !tests.some((one) => segments.every((segment) => names(segment, one)));
});

test('the rules file is read whole: wrappers and wildcards are not collections, nesting is kept', () => {
  const found = rulesCollections(`
    service cloud.firestore {
      match /databases/{database}/documents {
        function ok() { return true; }
        // match /inAComment/{id} { allow read: if true; }
        /* match /inABlock/{id} { allow read: if true; } */
        match /grades/{studentId} {
          allow read: if ok();
          match /supportEvidence/{eventId} { allow read: if false; }
        }
        match /examSessions/{docId}/items/{itemId} { allow read: if false; }
        match /liveChallengePrivate/{roomId}/{document=**} { allow read: if false; }
        match /classes/{classId} { match /announcements/{id} { allow read: if false; } }
        match /{document=**} { allow read, write: if false; }
      }
    }`);
  assert.deepEqual([...found.keys()].sort(), [
    'classes', 'classes/announcements', 'examSessions', 'examSessions/items',
    'grades', 'grades/supportEvidence', 'liveChallengePrivate',
  ]);
});

test('the real rules list the collections this suite expects to find', () => {
  const found = [...rulesCollections(readFileSync(new URL('firestore.rules', ROOT), 'utf8')).keys()];
  assert.ok(found.length > 90, `${found.length} collections read from firestore.rules`);
  for (const path of ['grades', 'grades/supportEvidence', 'assignments', 'liveChallengeRooms/players', 'examSessions/items', 'pathReleaseJobs/chunks', 'classes/classPointAnnouncements', 'teacherPreferences']) {
    assert.ok(found.includes(path), `${path} is read from firestore.rules`);
  }
  assert.ok(!found.some((path) => /databases|documents|document=/.test(path)), 'the wrapper and the wildcards are not collections');
});

test('a collection counts only when a rules test names it in code, or through a constant it imports', async () => {
  const collections = new Map([['grades', 'grades'], ['grades/supportEvidence', 'supportEvidence'], ['oauthStates', 'oauthStates'], ['askTeacherQuestions', 'askTeacherQuestions']]);
  const test = (code) => readTest('tests/rules/x.test.mjs', code);
  // Named in a path, in an array of names, as a doc() argument, in a template.
  assert.deepEqual(withoutCases(collections, [await test("doc(db, 'grades/S1/supportEvidence/e1'); await get('oauthStates'); doc(db, `askTeacherQuestions/${id}`)")]), []);
  // A comment is not a case; a longer name is not the name.
  assert.deepEqual(withoutCases(collections, [await test("// oauthStates is checked in another file\n/* 'askTeacherQuestions' */ doc(db, 'grades'); doc(db, 'oauthStatesOld/x')")]).sort(), ['askTeacherQuestions', 'grades/supportEvidence', 'oauthStates']);
  // A nested collection needs its parent in the file too.
  assert.deepEqual(withoutCases(new Map([['liveChallengeRooms/players', 'players']]), [await test("doc(db, 'players/x')")]), ['liveChallengeRooms/players']);
  // A constant the file imports and uses stands for the name it holds (here the real askTeacher.js); one it only imports does not.
  const imported = "import { TEACHER_QUESTION_COLLECTION } from '../../src/platform/supports/askTeacher.js';\ndoc(db, 'grades/S1/supportEvidence/e1'); doc(db, 'oauthStates/o');";
  assert.deepEqual(withoutCases(collections, [await test(`${imported} doc(db, TEACHER_QUESTION_COLLECTION);`)]), []);
  assert.deepEqual(withoutCases(collections, [await test(imported)]), ['askTeacherQuestions']);
});

/** The collections that need a case and have none: no rules test names them, and the list does not excuse them. */
export const needingCases = (collections, tests, allowed = NO_RULES_CASE_NEEDED) => (
  withoutCases(collections, tests).filter((path) => !(path in allowed))
);

/** What is wrong with the list itself: an entry that is gone from the rules, covered after all, or unexplained. */
export const staleEntries = (collections, tests, allowed = NO_RULES_CASE_NEEDED) => {
  const uncovered = new Set(withoutCases(collections, tests));
  return Object.entries(allowed).flatMap(([path, reason]) => [
    ...(collections.has(path) ? [] : [`${path} is no longer in firestore.rules: delete its entry`]),
    ...(!collections.has(path) || uncovered.has(path) ? [] : [`${path} has a rules case now: delete its entry`]),
    ...(/^[^\n]{12,}$/.test(String(reason)) ? [] : [`${path}: give the reason in one line`]),
  ]);
};

test('a collection with no case fails unless the list excuses it; a list entry must stay true', () => {
  const collections = new Map([['grades', 'grades'], ['oauthStates', 'oauthStates'], ['zzNew', 'zzNew']]);
  const tests = [{ file: 'tests/rules/x.test.mjs', code: "doc(db, 'grades/S1')", constants: new Set() }];
  assert.deepEqual(needingCases(collections, tests, {}), ['oauthStates', 'zzNew']);
  assert.deepEqual(needingCases(collections, tests, { oauthStates: 'tested through the callable harness, not the rules' }), ['zzNew']);
  assert.deepEqual(staleEntries(collections, tests, { oauthStates: 'tested through the callable harness, not the rules' }), []);
  assert.equal(staleEntries(collections, tests, { grades: 'covered somewhere else entirely' }).length, 1, 'an entry that has a case now');
  assert.equal(staleEntries(collections, tests, { gone: 'was removed from the rules long ago' }).length, 1, 'an entry the rules no longer have');
  assert.equal(staleEntries(collections, tests, { oauthStates: 'todo' }).length, 1, 'an entry that says too little');
  assert.equal(staleEntries(collections, tests, { oauthStates: 'one line\nand another line here' }).length, 1, 'an entry that runs over lines');
});

test('every collection in firestore.rules has a case in a rules test, or a reason not to', async () => {
  const collections = rulesCollections(readFileSync(new URL('firestore.rules', ROOT), 'utf8'));
  const uncovered = needingCases(collections, await readRulesTests());
  assert.deepEqual(uncovered, [], [
    'These collections in firestore.rules have no case in any rules test:',
    ...uncovered.map((path) => `  - ${path}`),
    'Add cases to a file under tests/rules/ (the emulator: `npm run test:rules`): who may read it, who may write it,',
    'and that nobody else can. If it is covered some other way, list it in NO_RULES_CASE_NEEDED with the reason.',
  ].join('\n'));
});

test('NO_RULES_CASE_NEEDED stays true: each entry is in the rules, has no case, and says why in one line', async () => {
  const collections = rulesCollections(readFileSync(new URL('firestore.rules', ROOT), 'utf8'));
  assert.deepEqual(staleEntries(collections, await readRulesTests()), []);
});
