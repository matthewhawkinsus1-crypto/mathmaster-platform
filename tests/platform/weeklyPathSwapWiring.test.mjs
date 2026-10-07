/*
 * "SWAP A SKILL" WIRING (student push D, item 3).
 *
 * The rule itself — what a frozen weekly slot permits — is behaviour-tested in
 * weeklyPathSlotAuthority.test.mjs. These contracts pin that every caller goes
 * through it: the server freeze and launch, the live session service, the
 * session container, the student's Path screen and the Teacher Path Simulator.
 * Each assertion is bound to the region that does the work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('the server freezes a week, alternatives included, through the shared rule', () => {
  const source = executableSource(read('functions/index.js'));
  const tools = region(source, 'const WEEKLY_SLOT_TEKS_TOOLS', 'async function sanitizeWeeklyPathGoalProposal', 'weekly slot TEKS tools');
  assert.match(tools, /canonicalTeks: mathPath\.canonicalAlignmentKey/);
  assert.match(tools, /displayTeks: mathPath\.displayAlignmentKey/);
  assert.match(tools, /normalizeFramework: normalizePathAssessmentFramework/);

  const freeze = region(source, 'async function sanitizeWeeklyPathGoalProposal', 'exports.resolveWeeklyPathGoalSnapshot', 'freeze');
  assert.match(freeze, /await import\("\.\/shared\/weeklyPathSlotAuthority\.mjs"\)/);
  assert.match(freeze, /slotAuthority\.freezeWeeklyPathGoalProposal\(goal, \{[\s\S]*?\.\.\.WEEKLY_SLOT_TEKS_TOOLS/);
  assert.match(freeze, /throw new HttpsError\(error\.code, error\.message\)/, 'a malformed proposal is still refused as an HttpsError');

  const resolve = region(source, 'exports.resolveWeeklyPathGoalSnapshot', 'exports.getStudentWeeklyPathGoalSnapshot', 'resolve callable');
  // The freeze is async now. Without the await, `proposed.weekKey` is undefined
  // and every student's week would be written to `${studentId}__undefined`.
  assert.match(resolve, /const proposed = await sanitizeWeeklyPathGoalProposal\(/);
  assert.match(resolve, /doc\(`\$\{studentId\}__\$\{proposed\.weekKey\}`\)/);
  // First freeze still wins: a week already frozen (with or without
  // alternatives) is returned untouched, never backfilled.
  assert.match(resolve, /if \(existing\.exists\) return existing\.data\(\);/);
});

test('a weekly launch is authorized by the shared rule and records the swap', () => {
  const source = executableSource(read('functions/index.js'));
  const start = region(source, 'exports.startMyMathPathSession', 'exports.issueNextQuestion', 'start callable');
  const weekly = region(start, 'const requestedWeeklySlotKey', 'const coursePracticeIntent', 'weekly authority block');

  assert.match(weekly, /slotAuthority\.authorizeWeeklySlotLaunch\(\{/);
  assert.match(weekly, /goal: snapshot\.exists \? \(snapshot\.data\(\) \|\| \{\}\) : null/);
  assert.match(weekly, /weeklySlotKey: requestedWeeklySlotKey/);
  assert.match(weekly, /targetAlignmentKey,/);
  assert.match(weekly, /requestedFramework: assessmentFramework/);
  assert.match(weekly, /chosenSkillId: String\(request\.data\?\.chosenSkillId/);
  assert.match(weekly, /classId: studentClass\?\.classId \|\| null/);
  assert.match(weekly, /\.\.\.WEEKLY_SLOT_TEKS_TOOLS/);
  assert.match(weekly, /if \(!authorization\.ok\) throw new HttpsError\(authorization\.code, authorization\.message/);
  assert.match(weekly, /weeklySlot = authorization\.slot;/);
  // The slot's framework, never the browser's.
  assert.match(weekly, /assessmentFramework = authorization\.assessmentFramework;/);
  // The old exact-standard comparison is gone; it is what refused every swap.
  assert.doesNotMatch(start, /assignedTarget !== targetAlignmentKey/);

  const record = region(start, 'const next = {', 'transaction.set(proposedSessionRef, next);', 'new session document');
  assert.match(record, /weeklySlotKey: requestedWeeklySlotKey,/, 'a swap keeps the slot key, so completion fills the same slot');
  assert.match(record, /intendedDok: weeklySlot\?\.dok \|\| null/, 'rigor comes from the frozen slot');
  assert.match(record, /swappedFromTeks: weeklySwap\?\.swappedFromTeks \|\| null/);
  assert.match(record, /chosenAlternative: weeklySwap\?\.chosenAlternative \|\| null/);
  assert.match(weekly, /weeklySwap = authorization\.swapped\s*\?\s*\{ swappedFromTeks: authorization\.swappedFromTeks, chosenAlternative: authorization\.chosenAlternative \}/);
});
