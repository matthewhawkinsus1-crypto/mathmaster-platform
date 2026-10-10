/*
 * ONE MASTERY TRUTH (student push D, item 2).
 *
 * The Path map, Recommended, prerequisite locks and Challenge unlocks used an
 * assignment-only mastery with its own 0.9 cut-off; the wheel and the weekly
 * planner read the server's Path evidence (85+, four events, two independent
 * successes, a DOK-3 item). These tests pin one rule and one source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MASTERY_STATUS,
  classifyMasteryStatus,
  masteryChecklist,
} from '../../functions/shared/masteryRule.mjs';
import {
  buildUnifiedMasteryProfiles,
  masteryBySkillFromProfiles,
  toPathSkillMastery,
} from '../../src/platform/mastery/unifiedMastery.js';
import { getStudentPathOptions, STATUS } from '../../src/platform/path/recommendationEngine.js';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { statusForSkill } from '../../src/platform/path/pathMap.js';
import { executableSource, region } from './helpers/sourceContract.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const masteredFacts = { estimate: 90, eligibleEvents: 5, effectiveWeight: 5, independentSuccesses: 2, dokRepresented: [2, 3] };

test('the rule: every Mastered condition is required', () => {
  assert.equal(classifyMasteryStatus(masteredFacts), MASTERY_STATUS.MASTERED);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, estimate: 84 }), MASTERY_STATUS.SECURE);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, eligibleEvents: 3 }), MASTERY_STATUS.SECURE);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, independentSuccesses: 1 }), MASTERY_STATUS.SECURE);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, dokRepresented: [1, 2] }), MASTERY_STATUS.SECURE);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, eligibleEvents: 1 }), MASTERY_STATUS.NOT_ENOUGH_EVIDENCE);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, effectiveWeight: 1 }), MASTERY_STATUS.NOT_ENOUGH_EVIDENCE);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, estimate: 60 }), MASTERY_STATUS.DEVELOPING);
  assert.equal(classifyMasteryStatus({ ...masteredFacts, estimate: 40 }), MASTERY_STATUS.NEEDS_ATTENTION);
});

test('the server trigger classifies with the shared rule, not its own thresholds', () => {
  const source = executableSource(read('functions/index.js'));
  const trigger = region(source, 'exports.updateMyMathPathMasteryFromEvidence', 'ASSIGNMENT_AI_USAGE_COLLECTION', 'mastery trigger');
  assert.match(trigger, /await import\("\.\/shared\/masteryRule\.mjs"\)/);
  assert.match(trigger, /const status = masteryRule\.classifyMasteryStatus\(\{/);
  assert.doesNotMatch(trigger, /estimate >= 85/, 'a second copy of the thresholds is how the screens drifted apart');
});

test('a 92% assignment record without breadth is NOT mastered on the Path map (it used to be, at 0.9)', () => {
  const server = {
    'A.5A': {
      mastery: { estimate: 92, status: 'Secure' },
      accumulator: { eligibleEvents: 3, effectiveWeight: 3, independentSuccesses: 3 },
      dimensions: { dokRepresented: [1, 2] },
    },
  };
  const record = toPathSkillMastery(server['A.5A']);
  assert.equal(record.mastery, 0.92);
  assert.equal(record.mastered, false);
  const options = getStudentPathOptions({ courseId: 'algebra1', masteryBySkill: masteryBySkillFromProfiles(server) });
  assert.notEqual(statusForSkill(options, teksSkillId('A.5A')), STATUS.MASTERED);
});

test('a server-Mastered skill is Mastered on the Path map, the wheel and in the checklist', () => {
  const server = {
    'A.5A': {
      mastery: { estimate: 88 },
      accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 },
      dimensions: { dokRepresented: [2, 3] },
    },
  };
  const profiles = buildUnifiedMasteryProfiles({ student: { id: 's' }, assignments: [], serverProfiles: server });
  // The wheel reads this status…
  assert.equal(profiles['A.5A'].mastery.status, MASTERY_STATUS.MASTERED);
  // …the path engine reads the same verdict…
  const options = buildStudentPathOptions({ student: { id: 's' }, assignments: [], courseId: 'algebra1', serverMasteryProfiles: server });
  assert.equal(statusForSkill(options, teksSkillId('A.5A')), STATUS.MASTERED);
  // …and the detail card's checklist agrees.
  assert.equal(masteryChecklist(profiles['A.5A']).mastered, true);
});

test('a stale stored status is re-derived from the evidence, so one rule wins', () => {
  const server = { 'A.5A': { mastery: { estimate: 70, status: 'Mastered' }, accumulator: { eligibleEvents: 6, effectiveWeight: 6, independentSuccesses: 4 }, dimensions: { dokRepresented: [3] } } };
  const profiles = buildUnifiedMasteryProfiles({ serverProfiles: server });
  assert.equal(profiles['A.5A'].mastery.status, MASTERY_STATUS.SECURE);
});

test('"what\'s left to master this" names exactly the unmet conditions', () => {
  const list = masteryChecklist({
    mastery: { estimate: 90 },
    accumulator: { eligibleEvents: 5, effectiveWeight: 5, independentSuccesses: 1 },
    dimensions: { dokRepresented: [1, 2] },
  });
  assert.equal(list.mastered, false);
  assert.deepEqual(list.items.filter((item) => !item.met).map((item) => item.key), ['independent', 'dok3']);
  assert.equal(list.remaining, 2);
});

test('the live app, the simulator and the mastery fetch all build from the unified profiles', () => {
  const app = executableSource(read('src/App.jsx'));
  const options = region(app, 'const studentPathOptions = useMemo(() => buildStudentPathOptions({', '}), [studentRecord', 'student path options');
  assert.match(options, /serverMasteryProfiles: studentServerMasteryProfiles/);
  assert.match(app, /subscribeStudentServerMasteryProfiles\(\{/);
  assert.match(app, /import \{ subscribeStudentServerMasteryProfiles \} from '.\/platform\/mastery\/serverMasteryProfiles.js';/);

  const simulator = executableSource(read('src/components/teacher/SimulatedStudentExperience.jsx'));
  assert.match(simulator, /masteryProfilesByTEKS: buildUnifiedMasteryProfiles\(/);
  const service = executableSource(read('src/services/masteryStateService.js'));
  assert.match(service, /const masteryProfilesByTEKS = buildUnifiedMasteryProfiles\(/);
  const adapter = executableSource(read('src/platform/path/masteryAdapter.js'));
  assert.match(adapter, /masteryBySkillFromProfiles\(buildUnifiedMasteryProfiles\(/);
});

test('the skill card shows one score and the checklist, not two names for one number', () => {
  const modal = executableSource(read('src/components/student/SkillDetailCardModal.jsx'));
  assert.doesNotMatch(modal, /Observed accuracy/);
  assert.doesNotMatch(modal, /Mastery estimate/);
  assert.match(modal, /const checklist = masteryChecklist\(masteryProfile/);
  assert.match(modal, /checklist\.items\.map\(/);
  assert.match(modal, /describeCoursePathPass\(pathPassProgress \|\| \{\}, \{ mastered: checklist\.mastered \}\)/);
});

test('Level 3 is practice depth, not a mastery claim, and "Path Pass" no longer collides with the Practice Pass reward', () => {
  const presentation = read('src/platform/path/pathPassPresentation.js');
  assert.doesNotMatch(presentation, /Mastery challenge/);
  assert.doesNotMatch(executableSource(presentation), /Path Pass \d|Path Pass \$/);
  for (const file of ['src/components/student/MyMathPathWheel.jsx', 'src/components/student/MyMathPathProductionContainer.jsx', 'src/components/student/SkillDetailCardModal.jsx']) {
    assert.doesNotMatch(executableSource(read(file)), /Path Pass|Mastery challenge/, file);
  }
});
