import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertCapability, componentSource, executableSource, region } from './helpers/sourceContract.mjs';

// The class reward screens are wired to their logic. Node cannot render .jsx,
// so these read the components as source (docs/handoffs/
// SOURCE_CONTRACT_PLAYBOOK.md): each assertion is bound to the region that
// does the work, and names the behaviour it protects. The behaviour itself is
// driven in Chromium by tests/browser/classRewardsQa.mjs.

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const center = executableSource(componentSource('src/components/student/rewards/StudentRewardsCenter.jsx'));
const shelf = executableSource(componentSource('src/components/student/rewards/ClassRewardsShelf.jsx'));
const dialog = executableSource(componentSource('src/components/student/rewards/UseClassRewardDialog.jsx'));
const editor = executableSource(componentSource('src/components/rewards/ClassRewardCatalogEditor.jsx'));
const panel = executableSource(componentSource('src/components/rewards/ClassRewardRequestsPanel.jsx'));
const client = executableSource(read('src/platform/rewards/classRewardsClient.js'));

test('My Rewards: the Practice Pass stays first; the class rewards shelf follows it, fed the live balance', () => {
  const page = region(center, 'return (', null, 'StudentRewardsCenter render');
  const pass = page.indexOf('<PracticePassCard');
  const shelfAt = page.indexOf('<ClassRewardsShelf');
  assert.ok(pass > -1 && shelfAt > -1, 'both cards render');
  assert.ok(pass < shelfAt, 'the Practice Pass card comes before the class rewards');
  const shelfProps = region(page, '<ClassRewardsShelf', '/>', 'shelf props');
  // A balance that failed to load must not read as 0 points to spend.
  assert.match(shelfProps, /balanceKnown=\{pointsKnown\}/);
  assert.match(shelfProps, /onRedeem=\{shelfData\.redeem\}/);
});

test('My Rewards opens its own class-reward listeners only for a real student, and only when the caller passed none', () => {
  const hook = region(center, 'useStudentClassRewards({', '});', 'own class rewards');
  assert.match(hook, /student\?\.role === 'student' \? student\.id : null/);
  assert.match(hook, /enabled: classRewards === undefined/);
});

test('My Rewards shows badges grouped by what they recognize, by readable name', () => {
  const badges = region(center, 'id="badges-heading"', '</section>', 'badges card');
  assert.match(badges, /badgeGroups/);
  assert.match(badges, /badgeView\(grant\)/);
  assert.match(badges, /view\.label/);
});

test('the shelf: an item that cannot be used is disabled AND says why on screen', () => {
  const item = region(shelf, 'shelf.items.map((entry)', '</li>', 'shelf item');
  assert.match(item, /disabled=\{!entry\.canUse\}/);
  assert.match(item, /!entry\.canUse && entry\.reason &&/);
  assert.match(item, /aria-describedby=\{!entry\.canUse && entry\.reason \? reasonId : undefined\}/);
});

test('the use dialog: one request id per opening, reused by every retry; a ref stops a double click; the agreed price travels', () => {
  assert.match(dialog, /const requestId = useRef\(newClassRewardRequestId\(\)\)/);
  const confirm = region(dialog, 'const confirm = async', '};', 'confirm handler');
  assert.match(confirm, /if \(inFlight\.current\) return;/);
  assert.match(confirm, /requestId: requestId\.current/);
  assert.match(confirm, /expectedCost: Number\(agreed\.item\.cost\)/);
  // The server's word decides the success sentence for a retry.
  assert.match(confirm, /alreadyRequested: result\?\.outcome === 'alreadyRequested'/);
});

test('the use dialog: an item that stops being usable while open blocks the confirm and says nothing was spent', () => {
  const blocked = region(dialog, 'const blockedReason', 'const confirm', 'blocked reason');
  assertCapability(blocked, [/took this reward off the list/], 'a removed item is explained');
  assertCapability(blocked, [/price changed/], 'a price change is explained');
  assert.match(blocked, /!entry\.canUse \? entry\.reason/);
  assert.match(dialog, /const disabled = busy \|\| \(Boolean\(blockedReason\) && !error\)/);
  assert.match(region(dialog, '{blockedReason && !busy', '</p>', 'blocked notice'), /Nothing was spent\./);
});

test('the catalog editor saves only a valid, changed draft, with the revision it started from', () => {
  const save = region(editor, 'const onSave = async', '};\n\n  return', 'save handler');
  assert.match(save, /if \(inFlight\.current \|\| problem \|\| !changed\) return;/);
  assert.match(save, /baseRevision \}/);
  assert.match(save, /catalogPayload\(draft\)/);
  const button = region(editor, 'onClick={onSave}', '</button>', 'save button');
  assert.ok(/disabled=\{busy \|\| Boolean\(problem\) \|\| !changed\}/.test(region(editor, '<button type="button" className="rw-button" disabled', 'onClick={onSave}', 'save button props')), 'the save button is disabled for a problem or no change');
  assert.ok(button.length > 0);
  // Starter suggestions are one click each, and an item's problem is shown on it.
  assert.match(editor, /availableStarters\(draft\)/);
  assert.match(region(editor, 'function ItemEditor', 'export default', 'item editor'), /draftItemProblem\(item\)/);
});

test('the catalog editor starts fresh for each class: a draft can never be saved over another class', () => {
  // The exported editor only mounts the body keyed by class, so a teacher
  // switching classes in place drops the old class's draft, base revision and
  // just-saved marker instead of saving them into the new class.
  const exported = region(editor, 'export default function ClassRewardCatalogEditor', '\n}', 'exported editor');
  assert.match(exported, /return <ClassCatalogEditorBody key=\{classId \|\| 'no-class'\} classId=\{classId\}/);
  // The draft state lives in the keyed body, not in the wrapper.
  assert.doesNotMatch(exported, /useState|useClassRewardCatalog/);
  const body = region(editor, 'function ClassCatalogEditorBody', 'const onSave = async', 'editor body');
  // It starts from nothing, or from unsaved edits kept for THIS class only
  // (classRewardDraftStore: keyed by account and classId).
  assert.match(body, /const \[kept\] = useState\(\(\) => readClassRewardDraft\(\{ ownerUid, classId \}\)\);/);
  assert.match(body, /const \[draft, setDraft\] = useState\(\(\) => kept\?\.draft \|\| \[\]\);/);
  assert.match(body, /const savedRevision = useRef\(0\);/);
});

test('the requests panel: a decline needs a reason before it is sent; actions are guarded against a double click', () => {
  const act = region(panel, 'const act = async', '\n  };', 'resolve action');
  assert.match(act, /if \(inFlight\.current\) return;/);
  const reasonCheck = act.indexOf("resolution === 'declined' && !reason.trim()");
  const send = act.indexOf('await onResolve');
  assert.ok(reasonCheck > -1 && send > reasonCheck, 'the reason is checked before the call');
  assertCapability(panel, [/Decline and return \$\{request\.cost\} points/], 'the decline button says the points go back');
});

test('the client queries match the rules: own requests by student+class; teacher by authorized email+class+pending', () => {
  const own = region(client, 'export const subscribeToStudentClassRewardRequests', '\n};', 'student query');
  assert.match(own, /where\('studentId', '==', student\), where\('classId', '==', cls\)/);
  const teacher = region(client, 'export const subscribeToPendingClassRewardRequests', '\n};', 'teacher query');
  assert.match(teacher, /where\('authorizedTeacherEmails', 'array-contains', email\)/);
  assert.match(teacher, /where\('classId', '==', cls\)/);
  assert.match(teacher, /where\('status', '==', 'pending'\)/);
  // A missing identity opens nothing at all, never a broad query.
  assert.match(own, /if \(!db \|\| !student \|\| !cls\)/);
  assert.match(teacher, /if \(!db \|\| !cls \|\| !email\)/);
});
