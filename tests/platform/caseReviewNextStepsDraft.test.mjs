// The case review's teacher-entered next steps: a draft in this browser tab,
// one per signed-in teacher per student — kept when the case review closes or
// the page reloads, removed when the teacher clears it, signs out, or another
// account opens a case review in the tab, and never written to Firestore.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  ACCOUNT_TAB_STORAGE_PREFIX, accountTabStorageKey, clearAccountTabStorage,
} from '../../src/auth/accountTabStorage.js';
import {
  NEXT_STEPS_MAX_LENGTH, forgetOtherAccountsDrafts, nextStepsDraftAvailable, nextStepsDraftKey, readNextStepsDraft, writeNextStepsDraft,
} from '../../src/platform/caseReview/nextStepsDraft.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

// sessionStorage as the browser exposes it (key/length/getItem/setItem/removeItem).
const memoryStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    get length() { return map.size; },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    keys: () => [...map.keys()],
  };
};
const blockedStorage = () => ({
  length: 0,
  key: () => null,
  getItem: () => { throw new Error('SecurityError: storage is disabled'); },
  setItem: () => { throw new Error('QuotaExceededError'); },
  removeItem: () => { throw new Error('SecurityError: storage is disabled'); },
});

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const A = 'uid-teacher-a'; // synthetic
const B = 'uid-teacher-b';
const STEPS = 'Reteach elimination with two worked examples (synthetic note).';

test('a teacher\'s next steps for a student come back after the case review is closed or the page reloads', () => {
  const storage = memoryStorage();
  assert.equal(writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: STEPS }), true);
  // Reopening (a new mount) and reloading both read this tab's storage again.
  assert.equal(readNextStepsDraft({ storage, teacherUid: A, studentId: '910002' }), STEPS);
  assert.equal(readNextStepsDraft({ storage, teacherUid: A, studentId: '910005' }), '', 'one draft per student');
  assert.equal(nextStepsDraftAvailable({ storage, teacherUid: A, studentId: '910002' }), true);
});

test('another teacher account never reads the draft, and opening a case review removes other accounts\' drafts', () => {
  const storage = memoryStorage({ 'mathmaster.rememberDevice': 'false' });
  writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: STEPS });
  writeNextStepsDraft({ storage, teacherUid: B, studentId: '910002', text: 'B\'s own plan (synthetic).' });
  assert.equal(readNextStepsDraft({ storage, teacherUid: B, studentId: '910002' }), 'B\'s own plan (synthetic).');
  assert.notEqual(nextStepsDraftKey({ teacherUid: A, studentId: '910002' }), nextStepsDraftKey({ teacherUid: B, studentId: '910002' }));

  assert.equal(forgetOtherAccountsDrafts({ storage, teacherUid: B }), 1, 'teacher A\'s draft is removed when B opens a case review');
  assert.equal(readNextStepsDraft({ storage, teacherUid: A, studentId: '910002' }), '');
  assert.equal(readNextStepsDraft({ storage, teacherUid: B, studentId: '910002' }), 'B\'s own plan (synthetic).', 'B keeps their own');
  assert.equal(storage.getItem('mathmaster.rememberDevice'), 'false', 'nothing outside the account drafts is touched');
});

test('signing out removes every account\'s drafts from the tab', () => {
  const storage = memoryStorage({ 'other.app.key': 'x' });
  writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: STEPS });
  writeNextStepsDraft({ storage, teacherUid: B, studentId: '910005', text: STEPS });
  assert.equal(clearAccountTabStorage({ storage }), 2);
  assert.deepEqual(storage.keys(), ['other.app.key']);
});

test('clearing the box removes the draft; a blank box keeps nothing', () => {
  const storage = memoryStorage();
  writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: STEPS });
  assert.equal(writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: '' }), true);
  assert.deepEqual(storage.keys(), []);
  writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: '   \n  ' });
  assert.deepEqual(storage.keys(), [], 'whitespace is not a draft');
});

test('with no signed-in teacher or no student nothing is kept — never under a key two accounts could share', () => {
  const storage = memoryStorage();
  assert.equal(nextStepsDraftKey({ teacherUid: '', studentId: '910002' }), null);
  assert.equal(nextStepsDraftKey({ teacherUid: A, studentId: '  ' }), null);
  assert.equal(writeNextStepsDraft({ storage, teacherUid: '', studentId: '910002', text: STEPS }), false);
  assert.equal(writeNextStepsDraft({ storage, teacherUid: A, studentId: null, text: STEPS }), false);
  assert.deepEqual(storage.keys(), []);
  assert.equal(nextStepsDraftAvailable({ storage, teacherUid: '', studentId: '910002' }), false);
  assert.equal(forgetOtherAccountsDrafts({ storage, teacherUid: '' }), 0, 'an unnamed account removes nothing');
  // Ids are encoded, so no uid or student id can run into the next.
  assert.notEqual(accountTabStorageKey('a:b', 'n', 'c'), accountTabStorageKey('a', 'n', 'b:c'));
  assert.ok(nextStepsDraftKey({ teacherUid: A, studentId: '910002' }).startsWith(ACCOUNT_TAB_STORAGE_PREFIX));
});

test('a browser that blocks storage loses nothing but the draft: no throw, and the screen is told', () => {
  const storage = blockedStorage();
  assert.equal(writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: STEPS }), false);
  assert.equal(readNextStepsDraft({ storage, teacherUid: A, studentId: '910002' }), '');
  assert.equal(clearAccountTabStorage({ storage }), 0);
  assert.equal(writeNextStepsDraft({ storage: null, teacherUid: A, studentId: '910002', text: STEPS }), false);
  assert.equal(nextStepsDraftAvailable({ storage: null, teacherUid: A, studentId: '910002' }), false);
});

test('the draft is bounded, in storage and when read back', () => {
  const storage = memoryStorage();
  writeNextStepsDraft({ storage, teacherUid: A, studentId: '910002', text: 'x'.repeat(NEXT_STEPS_MAX_LENGTH + 500) });
  assert.equal(storage.getItem(nextStepsDraftKey({ teacherUid: A, studentId: '910002' })).length, NEXT_STEPS_MAX_LENGTH, 'what the tab holds');
  storage.setItem(nextStepsDraftKey({ teacherUid: A, studentId: '910005' }), 'y'.repeat(NEXT_STEPS_MAX_LENGTH + 1));
  assert.equal(readNextStepsDraft({ storage, teacherUid: A, studentId: '910005' }).length, NEXT_STEPS_MAX_LENGTH, 'what the screen receives');
});

test('the draft never reaches Firestore or long-lived storage', () => {
  const draft = executableSource(read('src/platform/caseReview/nextStepsDraft.js'));
  const tab = executableSource(read('src/auth/accountTabStorage.js'));
  [draft, tab].forEach((code) => assert.doesNotMatch(code, /firebase\/|setDoc|addDoc|updateDoc|httpsCallable|localStorage|indexedDB/));
  // The only storage is this tab's sessionStorage, reached through the auth layer's helper.
  assert.match(tab, /return typeof window !== 'undefined' && window\.sessionStorage \? window\.sessionStorage : null;/);
  assert.match(draft, /import \{[^}]*\btabStorage\b[^}]*\} from '\.\.\/\.\.\/auth\/accountTabStorage\.js';/);
  ['readNextStepsDraft', 'writeNextStepsDraft', 'forgetOtherAccountsDrafts'].forEach((name) => {
    assert.match(region(draft, `export const ${name} = (`, '=>', name), /storage = tabStorage\(\)/, `${name} defaults to this tab's storage`);
  });
});

test('the case review restores the draft on open, keeps it as the teacher types, and clears it on request', () => {
  const view = read('src/components/teacher/caseReview/StudentCaseReviewView.jsx');
  const reset = region(view, 'useEffect(() => {\n    if (!open) return;\n    setSelection(', '\n  }, [', 'reset effect');
  assert.match(reset, /forgetOtherAccountsDrafts\(\{ teacherUid \}\);\n\s*setNextSteps\(readNextStepsDraft\(\{ teacherUid, studentId: student\?\.id \}\)\);/);
  assert.doesNotMatch(reset, /setNextSteps\(''\)/, 'reopening no longer throws the teacher\'s words away');
  assert.match(region(view, 'useEffect(() => {\n    if (!open) return;\n    setSelection(', '// eslint', 'reset deps'), /\}, \[open, student\?\.id, teacherUid\]\);/,
    'a different teacher account resets what is on screen');
  const change = region(view, 'const changeNextSteps = (text) => {', '\n  };', 'change handler');
  assert.match(change, /setNextSteps\(text\);/);
  assert.match(change, /writeNextStepsDraft\(\{ teacherUid, studentId: student\.id, text \}\)/);
  const box = region(view, '<textarea className="cr-textarea"', '/>', 'next steps box');
  assert.match(box, /onChange=\{\(event\) => changeNextSteps\(event\.target\.value\)\}/);
  assert.match(box, /maxLength=\{NEXT_STEPS_MAX_LENGTH\}/);
  assert.match(view, /onClick=\{\(\) => changeNextSteps\(''\)\} data-case-next-steps-clear>Clear next steps</);
  // Print and the JSON export carry what is in the box (restored or typed).
  assert.match(view, /caseReviewJson\(model, \{ nextSteps \}\)/);
  assert.match(view, /<CasePrintView model=\{model\} nextSteps=\{nextSteps\} \/>/);
});

test('App names the signed-in teacher; signing out, however it happens, clears the tab\'s account drafts', () => {
  const app = read('src/App.jsx');
  const mount = region(app, '<StudentCaseReviewView', '/>', 'case review mount');
  assert.match(mount, /teacherUid=\{user\?\.uid \|\| ''\}/);
  const service = read('src/auth/authService.js');
  assert.match(service, /import \{ clearAccountTabStorage \} from '\.\/accountTabStorage\.js';/);
  const signOutSession = executableSource(region(service, 'export async function signOutSession() {', '\n}', 'signOutSession'));
  assert.ok(signOutSession.indexOf('clearAccountTabStorage();') > 0 && signOutSession.indexOf('clearAccountTabStorage();') < signOutSession.indexOf('await signOut(auth);'),
    'drafts go before the account does');
  const provider = read('src/auth/AuthProvider.jsx');
  assert.match(provider, /import \{ clearAccountTabStorage \} from '\.\/accountTabStorage\.js';/);
  const signedOut = executableSource(region(provider, 'if (!firebaseUser) {', 'return;', 'signed-out branch'));
  assert.match(signedOut, /clearAccountTabStorage\(\);/);
});
