import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';
import {
  STARTER_CLASS_REWARDS,
  buildCancelledRequest,
  buildCatalogDocument,
  buildClassRewardDebit,
  buildClassRewardRefund,
  buildClassRewardRequest,
  planRequestResolution,
  validateCatalogInput,
} from '../../functions/shared/classRewardCatalog.mjs';

/*
 * A CLASS REWARD CANNOT CHANGE A GRADE, BECAUSE NOTHING COULD NOTICE IT (LC04).
 *
 * The wording screen (classRewardCatalog.mjs academicWordingIn) is a word
 * list, and a teacher can phrase a promise past any word list. What keeps the
 * promise "none of these change a grade" true is not the screen. It is that no
 * code which decides a grade, a completion, a deadline, an attempt or a
 * mastery level ever reads a reward, and that a reward carries nothing such
 * code could read. Both are asserted here, over the whole source tree, so they
 * do not depend on anyone remembering to look.
 *
 * If one of these fails, the question is not "how do I make it pass" but "why
 * does this file need to know about class rewards?" A screen that only SHOWS
 * rewards belongs on the list. A grader, an assignment rule, a deadline or
 * mastery calculation that READS one does not: that is a reward changing
 * academic work, which is the one thing a class reward must never do.
 */

const ROOT = new URL('../../', import.meta.url);
const read = (relative) => readFileSync(new URL(relative, ROOT), 'utf8');

// Files that exist FOR class rewards: their whole content is about them.
const REWARD_FILES = new Set([
  'functions/shared/classRewardCatalog.mjs',
  'functions/lib/classRewardStore.js',
  'src/platform/rewards/classRewardDraftStore.js',
  'src/platform/rewards/classRewardsClient.js',
  'src/platform/rewards/classRewardsModel.js',
  'src/platform/rewards/useClassRewards.js',
  'src/components/rewards/ClassRewardCatalogEditor.jsx',
  'src/components/rewards/ClassRewardRequestsPanel.jsx',
  'src/components/student/rewards/ClassRewardsShelf.jsx',
  'src/components/student/rewards/UseClassRewardDialog.jsx',
]);

// Big shared files that mention class rewards on a few lines only. Every
// line that names them must be one of these, so a grader living in the same
// file (functions/index.js grades answers) cannot start reading a reward.
const WIRING_LINES = {
  // The three callables, and moving a student's pending requests with them
  // when they change class.
  'functions/index.js': /exports\.(?:saveClassRewardCatalog|redeemClassReward|resolveClassRewardRequest) = onCall\(\(request\) => require\("\.\/lib\/classRewardStore"\)\.\w+Handler\(request\)\);|counts\.classRewardRequests = (?:await require\("\.\/lib\/classRewardStore"\)|0;)|^\s*\.reauthorizeClassRewardRequests\(db, studentId, classRecord\);/,
  // The lists of collections a student's deletion and a test reset clear.
  'functions/lib/admin.js': /^\s*"classReward(?:Catalogs|Requests)",$/,
  // The two reward screens in the teacher's workspace, and their lazy load.
  'src/app/lazyScreens.js': /^export const ClassReward(?:CatalogEditor|RequestsPanel) = teacherPanel\(\(\) => import\('\.\.\/components\/rewards\/ClassReward(?:CatalogEditor|RequestsPanel)\.jsx'\)\);$/,
  'src/app/teacher/TeacherWorkspace.jsx': /^import \{.*\bClassRewardCatalogEditor, ClassRewardRequestsPanel\b.*\} from '\.\.\/lazyScreens\.js';$|^\s*<ClassReward(?:RequestsPanel|CatalogEditor)\s*$/,
  // The student's rewards page shows the shelf.
  'src/components/student/rewards/StudentRewardsCenter.jsx': /ClassRewardsShelf|[Cc]lassReward|useStudentClassRewards/,
  // The admin reset screen names the two collections it clears.
  'src/components/admin/PreproductionReset.jsx': /^\s*classReward(?:Catalogs|Requests): '[^']+',$/,
  // Access rules for the two collections and the helpers they use.
  'firestore.rules': /^\s*match \/classReward(?:Catalogs|Requests)\/\{\w+\} \{$|function classRewardClass(?:Teacher|Student)\(|classRewardClass(?:Teacher|Student)\(/,
};

const NEEDLE = /classReward|ClassReward|CLASS_REWARD/;
const CODE_FILE = /\.(?:js|jsx|mjs|cjs)$/;

const walk = (directory, found = []) => {
  for (const entry of readdirSync(new URL(directory, ROOT), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const relative = `${directory}${entry.name}`;
    if (entry.isDirectory()) walk(`${relative}/`, found);
    else if (CODE_FILE.test(entry.name)) found.push(relative);
  }
  return found;
};

const sourceFiles = () => [...walk('src/'), ...walk('functions/'), ...walk('scripts/'), 'firestore.rules'];

test('only the reward screens, the reward store and a few lines of wiring know class rewards exist', () => {
  const strangers = [];
  const badLines = [];
  let scanned = 0;
  for (const file of sourceFiles()) {
    const text = executableSource(read(file));
    scanned += 1;
    if (!NEEDLE.test(text) || REWARD_FILES.has(file)) continue;
    const allowed = WIRING_LINES[file];
    if (!allowed) { strangers.push(file); continue; }
    text.split('\n').filter((line) => NEEDLE.test(line)).forEach((line) => {
      if (!allowed.test(line)) badLines.push(`${file}: ${line.trim().slice(0, 120)}`);
    });
  }
  // The scan has to be looking at the tree: a moved directory must not turn
  // this into a test over nothing.
  assert.ok(scanned > 400, `the scan only found ${scanned} source files`);
  assert.deepEqual(strangers, [], 'these files know class rewards exist; if one decides a grade, a completion, a deadline, an attempt or mastery it must not (see the top of this file)');
  assert.deepEqual(badLines, [], 'these lines read class rewards in a file that is only allowed to wire them up');
  // Every file on the lists is still real, so a rename cannot leave a stale
  // entry that quietly allows a different file later.
  [...REWARD_FILES, ...Object.keys(WIRING_LINES)].forEach((file) => assert.ok(NEEDLE.test(read(file)), `${file} no longer mentions class rewards; remove it from the list`));
});

test('the reward store only ever writes its own documents, the Class Points ledger and the student\'s Class Points account, never a grade', () => {
  const store = executableSource(read('functions/lib/classRewardStore.js'));
  const targets = [...store.matchAll(/\b(?:transaction|batch)\.(?:set|update|delete|create)\(\s*([^,]+?)\s*,/g)].map((match) => match[1]);
  assert.ok(targets.length >= 6, 'the store writes through transactions and a batch');
  const allowed = new Set(['catalogRef', 'requestRef', 'accountRef', 'refundRef', 'db.collection(LEDGER).doc(debitId)', 'entry.ref']);
  assert.deepEqual(targets.filter((target) => !allowed.has(target)), [], 'a write to anything else (a grade record, an assignment) is a reward changing academic work');
  // The student's record is read to learn their class, and never written.
  assert.doesNotMatch(store, /\b(?:transaction|batch)\.(?:set|update|delete)\(\s*gradeRef\b/);
});

// Everything a reward writes, built the way the server builds it, with every
// key at every depth listed. Nothing a grader, deadline or mastery rule reads
// (a grade, a score, credit, an assignment, a section, an excuse, a waiver,
// mastery, a due time, an attempt, a retake) is ever on one.
const keysOf = (value, path = '', found = []) => {
  if (Array.isArray(value)) value.forEach((entry, index) => keysOf(entry, `${path}[${index}]`, found));
  else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, inner]) => { found.push(path ? `${path}.${key}` : key); keysOf(inner, path ? `${path}.${key}` : key, found); });
  }
  return found;
};
const ACADEMIC_KEY = /grade|score|credit|assignment|section|excus|waiv|mastery|deadline|due|attempt|retake|practicepass|homework|quiz|exam/i;
const item = { itemId: 'starter-seat', label: 'Choose your seat for a day', description: 'Sit anywhere.', cost: 50, active: true, weeklyLimitPerStudent: 1 };

test('no document a class reward writes carries a key a grade, deadline or mastery rule could read', () => {
  const { items } = validateCatalogInput({ classId: 'c', items: [item, ...STARTER_CLASS_REWARDS.slice(1).map((starter) => ({ ...starter }))] });
  const request = buildClassRewardRequest({
    requestDocId: 'crr_1', requestId: 'r1', studentId: 's', classId: 'c', item: items[0], weekKey: '2026-10-05', studentLabel: 'Ava M.',
    debitTransactionId: 'crd_1', originTeacherEmail: 't@school.test', authorizedTeacherEmails: ['t@school.test'], at: 'then',
  });
  const documents = {
    catalog: buildCatalogDocument({ classId: 'c', items, teacherEmail: 't@school.test', at: 'now' }),
    request,
    debit: buildClassRewardDebit({ request, sourceType: 'rewardRedemption', issuedByUid: 'u', at: 'now' }),
    refund: buildClassRewardRefund({ request, sourceType: 'rewardRefund', reason: 'We ran out', teacherEmail: 't@school.test', originTeacherEmail: 't@school.test', authorizedTeacherEmails: ['t@school.test'], at: 'later' }),
    fulfilled: planRequestResolution(request, { resolution: 'fulfilled', teacherEmail: 't@school.test', at: 'later' }).next,
    declined: planRequestResolution(request, { resolution: 'declined', reason: 'No seats', teacherEmail: 't@school.test', at: 'later' }).next,
    cancelled: buildCancelledRequest(request, { teacherEmail: 't@school.test', at: 'later' }),
  };
  Object.entries(documents).forEach(([name, document]) => {
    const keys = keysOf(document);
    assert.ok(keys.length > 5, `${name} was built`);
    assert.deepEqual(keys.filter((key) => ACADEMIC_KEY.test(key.split('.').pop())), [], `${name} carries an academic key`);
  });
  // A stored item is the six reward fields (written out here, not read from
  // the module that builds it).
  assert.deepEqual(Object.keys(documents.catalog.items[0]).sort(), ['active', 'cost', 'description', 'itemId', 'label', 'weeklyLimitPerStudent']);
});

// The key pattern above has to be able to see every name the module treats as
// academic, or the test above is only as good as that pattern.
test('the key pattern sees every grade-like field name the module refuses', () => {
  ['grade', 'gradeEffect', 'gradeChange', 'score', 'scoreBonus', 'credit', 'extraCredit', 'assignmentId', 'assignmentIds',
    'sectionId', 'section', 'excuse', 'excused', 'waiver', 'waive', 'mastery', 'deadline', 'dueAt', 'attempts', 'retake', 'practicePass']
    .forEach((name) => assert.ok(ACADEMIC_KEY.test(name), `${name} would slip past the key check`));
});
