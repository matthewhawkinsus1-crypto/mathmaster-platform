// The guards on the class-reward screens, each bound to the code that does
// the work and asserting ORDER where order is the behaviour. A review of the
// first contracts broke each of these and saw every test still pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { readClassRewardDraft, writeClassRewardDraft } from '../../src/platform/rewards/classRewardDraftStore.js';
import { clearAccountTabStorage } from '../../src/auth/accountTabStorage.js';

const code = (rel) => executableSource(readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8'));
const before = (text, first, second, message) => {
  const a = text.indexOf(first);
  const b = text.indexOf(second);
  assert.ok(a >= 0, `missing: ${first}`);
  assert.ok(b >= 0, `missing: ${second}`);
  assert.ok(a < b, message);
};

test('a class reward is requested once per click burst, and a retry is the SAME request', () => {
  const dialog = code('src/components/student/rewards/UseClassRewardDialog.jsx');
  const confirm = region(dialog, 'const confirm = async () => {', '\n  };', 'confirm');
  // The ref guard is checked, then set, before the request is awaited.
  before(confirm, 'if (inFlight.current) return;', 'inFlight.current = true;', 'the guard is checked first');
  before(confirm, 'inFlight.current = true;', 'await onUse(', 'the guard is set before the await');
  // The request id is made once, when the dialog opens, and reused by every try.
  assert.match(dialog, /const requestId = useRef\(newClassRewardRequestId\(\)\);/);
  assert.match(confirm, /requestId: requestId\.current/);
  assert.doesNotMatch(dialog, /requestId\.current\s*=/, 'never reassigned');
  assert.equal((dialog.match(/newClassRewardRequestId\(/g) || []).length, 1, 'never minted again inside confirm');
});

test('a teacher resolves a request once per click burst', () => {
  const panel = code('src/components/rewards/ClassRewardRequestsPanel.jsx');
  const act = region(panel, 'const act = async (resolution) => {', '\n  };', 'act');
  before(act, 'if (inFlight.current) return;', 'inFlight.current = true;', 'the guard is checked first');
  before(act, 'inFlight.current = true;', 'await onResolve(', 'the guard is set before the await');
});

test('a wallet that failed to load is not read as zero points', () => {
  const center = code('src/components/student/rewards/StudentRewardsCenter.jsx');
  assert.match(center, /const pointsKnown = Boolean\(classPoints\) && !classPoints\.unavailable;/);
  assert.match(center, /balanceKnown=\{pointsKnown\}/);
});

test('an invalid list cannot be saved, and the live list never overwrites unsaved edits', () => {
  const editor = code('src/components/rewards/ClassRewardCatalogEditor.jsx');
  assert.match(editor, /const problem = draftProblem\(classId, draft\);/);
  const onSave = region(editor, 'const onSave = async () => {', '\n  };', 'onSave');
  assert.match(onSave, /if \(inFlight\.current \|\| problem \|\| !changed\) return;/);
  // The effect that copies the server's list into the draft bails out first while dirty.
  const sync = region(editor, 'useEffect(() => {\n    if (dirty) return;', '}, [catalog, dirty]);', 'the catalog-to-draft effect');
  assert.ok(sync.length > 0);
});

test('unsaved edits are kept per account and class, and sign-out clears them', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
  writeClassRewardDraft({ ownerUid: 'u1', classId: 'c1', draft: [{ itemId: 'a' }], baseRevision: 3, storage });
  assert.deepEqual(readClassRewardDraft({ ownerUid: 'u1', classId: 'c1', storage }), { draft: [{ itemId: 'a' }], baseRevision: 3 });
  assert.equal(readClassRewardDraft({ ownerUid: 'u1', classId: 'c2', storage }), null, 'another class');
  assert.equal(readClassRewardDraft({ ownerUid: 'u2', classId: 'c1', storage }), null, 'another account');
  clearAccountTabStorage({ storage });
  assert.equal(readClassRewardDraft({ ownerUid: 'u1', classId: 'c1', storage }), null);
  const editor = code('src/components/rewards/ClassRewardCatalogEditor.jsx');
  assert.match(editor, /writeClassRewardDraft\(\{ ownerUid, classId, draft: dirty \? draft : null, baseRevision \}\)/);
  assert.match(editor, /window\.addEventListener\('beforeunload', warn\)/);
});

test('keyboard focus is never left on the page after a request or a resolution', () => {
  const shelf = code('src/components/student/rewards/ClassRewardsShelf.jsx');
  assert.match(shelf, /if \(!active \|\| active === document\.body \|\| active\.disabled\) requestsHeadingRef\.current\?\.focus\(\);/);
  assert.match(shelf, /<h3 ref=\{requestsHeadingRef\} tabIndex=\{-1\}/);
  const panel = code('src/components/rewards/ClassRewardRequestsPanel.jsx');
  const onResolve = region(panel, 'const onResolve = async (', '\n  };', 'onResolve');
  before(onResolve, 'await resolve(', 'headingRef.current?.focus();', 'focus moves once the resolution is done');
});

test('extended time never reaches the public player row, however the row is built', () => {
  const server = code('functions/index.js');
  const join = region(server, 'exports.joinLiveChallenge = onCall', '\nexports.', 'joinLiveChallenge');
  // The public row is an inline literal, so nothing built elsewhere can carry a field into it…
  const row = region(join, 'transaction.set(publicPlayerRef, {', '}, { merge: true });', 'the public row');
  assert.doesNotMatch(row, /timeMultiplier/);
  // Its only spread is the seat; no other object can be spread into it.
  assert.equal((row.match(/\.\.\./g) || []).length, (row.match(/\.\.\.\(Number\.isInteger\(player\.slot\) \? \{ slot: player\.slot \} : \{\}\)/g) || []).length);
  // …and the only public-row write in the join is that one.
  assert.equal((join.match(/transaction\.set\(publicPlayerRef,/g) || []).length, 1);
});
