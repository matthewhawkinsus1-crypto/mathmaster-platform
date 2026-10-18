/*
 * NAV-22 (student pass 3): a Classroom post for a section that is not open
 * yet ("Lesson 5 — DOL" at 1:30, the DOL opens at 2:15) opens where the
 * student can work now, and says why — in the navigator's own words.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describeSectionDetour, DETOUR_SECTION_LABEL } from '../../src/platform/student/sectionDetour.js';
import { describeSectionAccess } from '../../src/platform/student/assignmentNavigator.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const NOW = new Date(2026, 9, 19, 13, 30).getTime();
const at = (h, m) => new Date(2026, 9, 19, h, m);

test('NAV-22: the DOL opens at 2:15 — here is Classwork meanwhile', () => {
  const access = describeSectionAccess({
    role: 'dol', label: DETOUR_SECTION_LABEL.dol, timedDol: true, nowValue: NOW,
    dolState: { enabled: true, status: 'waiting', opensAt: at(14, 15) },
  });
  const detour = describeSectionDetour({ requestedRole: 'dol', landingRole: 'classwork', access });
  assert.equal(detour.title, 'The exit ticket (DOL) is not open right now');
  assert.match(detour.body, /^The exit ticket \(DOL\) opens at 2:15\s?PM — here is Classwork meanwhile\.$/);
});

test('NAV-22: nothing to explain when the section is open, or the student landed in it', () => {
  const open = { workable: true, reason: '' };
  assert.equal(describeSectionDetour({ requestedRole: 'dol', landingRole: 'classwork', access: open }), null);
  const locked = { workable: false, reason: 'The Warm-Up opens before class.' };
  assert.equal(describeSectionDetour({ requestedRole: 'warmup', landingRole: 'warmup', access: locked }), null);
  assert.equal(describeSectionDetour({ requestedRole: 'whole', landingRole: 'classwork', access: locked }), null);
  // A reason the navigator could not word still says the section and where they are.
  assert.equal(describeSectionDetour({ requestedRole: 'practice', landingRole: 'classwork', access: { workable: false } }).body,
    'Practice is not open right now — here is Classwork meanwhile.');
});

test('NAV-22: App passes the post\'s section to the start, and explains a detour with the same states entry used', () => {
  const app = executableSource(readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8'));
  assert.match(app, /import \{ DETOUR_SECTION_LABEL, describeSectionDetour \} from '\.\/platform\/student\/sectionDetour\.js';/);
  const launch = region(app, 'startAssignment(target.assignmentId, target.questionIndex, {', '});', 'Classroom launch start');
  assert.match(launch, /launchedSectionKey: target\.sectionKey \|\| null/);
  const detour = region(app, "const launchedRole = String(options?.launchedSectionKey || '')", 'if (detour) toastInfo(detour.title, detour.body);', 'detour');
  assert.match(detour, /if \(DETOUR_SECTION_LABEL\[launchedRole\] && !roleIsActionable\(launchedRole\)\)/);
  assert.match(detour, /landingRole: stageEntries\.find\(\(entry\) => entry\.storageIndex === actionableIndex\)\?\.logicalRole/);
  assert.match(detour, /access: describeSectionAccess\(\{\s*role: launchedRole,/);
  // It runs once the landing question is known, before it is applied.
  const order = ['const actionableIndex = resolveStudentAssignmentEntry({', "const launchedRole = String(options?.launchedSectionKey || '')", 'safeQuestionIndex = actionableIndex;'];
  const positions = order.map((needle) => app.indexOf(needle));
  positions.forEach((position, index) => assert.notEqual(position, -1, order[index]));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});
