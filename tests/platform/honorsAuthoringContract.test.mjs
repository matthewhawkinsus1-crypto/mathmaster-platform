/*
 * THE AUTHORING CONTRACT STATES THE HONORS DEPTH RULE THE CHECK ENFORCES.
 *
 * Authors learned the rule only from a blocked import. The contract's
 * "Honors + CCMR Practice" section asked them to "deepen reasoning,
 * representation, modeling, justification, and transfer" and never said
 * that an Honors assignment needs three of the four depth areas, or that a
 * question's taskType can declare modeling / application work (PR #540).
 * It now says both, with the numbers, the area names and the taskType values
 * read from the check's own definitions (courseRigor.js).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildContractSlice } from '../../src/platform/contract/authoringContract.js';
import { buildHonorsDepthAiRepairRequest } from '../../src/platform/contract/honorsDepthAiRepair.js';
import {
  HONORS_CHECKPOINT_MAX_QUESTIONS,
  HONORS_CHECK_LABELS,
  HONORS_DEPTH_AREAS,
  HONORS_DEPTH_REQUIRED,
  MODELING_TASK_TYPES,
  declaresModelingTask,
  inspectHonorsRigor,
} from '../../src/platform/rigor/courseRigor.js';
import { TASK_TYPES } from '../../functions/shared/pathQuestionQuality.mjs';
import { lessonWith } from './helpers/honorsDepthFixtures.mjs';

const HONORS = buildContractSlice({ sections: ['Honors + CCMR Practice'], courseId: 'algebra1' });
const RULES = HONORS.split('\n').filter((line) => line.startsWith('- '));
const keyOf = Object.fromEntries(Object.entries(HONORS_CHECK_LABELS).map(([key, label]) => [label, key]));

test('the Honors section states the depth rule with the check\'s own numbers and names', () => {
  assert.match(HONORS, /## Honors \+ CCMR Practice/);
  const areas = HONORS_DEPTH_AREAS.map((key) => HONORS_CHECK_LABELS[key]).join(', ');
  assert.ok(
    HONORS.includes(`needs ${HONORS_CHECK_LABELS.coreTeks} and at least ${HONORS_DEPTH_REQUIRED} of the ${HONORS_DEPTH_AREAS.length} depth areas (${areas}).`),
    HONORS,
  );
  assert.ok(HONORS.includes(`One of them must be ${HONORS_CHECK_LABELS.higherOrderReasoning}: at least one question with \`"dok": 3\` or higher`), HONORS);
  assert.ok(
    HONORS.includes(`Warm-Ups/DOLs with ${HONORS_CHECKPOINT_MAX_QUESTIONS} or fewer questions are exempt from the depth rule and the CCMR-share expectation; they need only ${HONORS_CHECK_LABELS.coreTeks}.`),
    HONORS,
  );
});

test('it names taskType and exactly the values the check counts for modeling / application', () => {
  const line = RULES.find((entry) => entry.includes('`taskType`'));
  assert.ok(line, `a rule names the field:\n${HONORS}`);
  const named = [...line.matchAll(/"taskType": "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(named, [...MODELING_TASK_TYPES]);
  assert.ok(line.includes(`counts it for ${HONORS_CHECK_LABELS.modelingApplication}`), line);
  // Each value it names earns the credit; no other value in the audited vocabulary does.
  named.forEach((taskType) => assert.equal(declaresModelingTask({ taskType }), true, taskType));
  TASK_TYPES.filter((taskType) => !named.includes(taskType)).forEach((taskType) => {
    assert.equal(declaresModelingTask({ taskType }), false, `${taskType} counts but the contract does not name it`);
  });
});

test('the rule as the contract words it is the rule the check enforces', () => {
  const [, required, of, names] = HONORS.match(/at least (\d+) of the (\d+) depth areas \(([^)]+)\)/) || [];
  assert.ok(names, HONORS);
  const areas = names.split(', ').map((label) => keyOf[label]);
  assert.deepEqual(areas, [...HONORS_DEPTH_AREAS], 'the areas it lists are the check\'s');
  assert.equal(Number(of), areas.length);
  const reasoning = keyOf[(HONORS.match(/One of them must be ([^:]+):/) || [])[1]];
  assert.equal(reasoning, 'higherOrderReasoning');
  // Every set of areas an aligned lesson can have: ready exactly when the contract says so.
  for (let mask = 0; mask < 2 ** areas.length; mask += 1) {
    const present = areas.filter((_, index) => mask & (2 ** index));
    const contractSays = present.includes(reasoning) && present.length >= Number(required);
    const { fullContractReady } = inspectHonorsRigor(lessonWith(present), { ccmrTargetRequired: false });
    assert.equal(fullContractReady, contractSays, present.join(' + ') || 'no depth areas');
  }
  // The short checkpoint it exempts is the one the check exempts.
  const most = Number((HONORS.match(/Warm-Ups\/DOLs with (\d+) or fewer questions/) || [])[1]);
  const dol = (count) => Array.from({ length: count }, () => ({ activityRole: 'dol', dok: 1, standard: 'A.5A', prompt: 'Solve $2x = 8$.' }));
  assert.equal(inspectHonorsRigor(dol(most), { allowNarrowCheckpoint: true }).isHonorsReady, true, `${most} DOL questions need only Core TEKS`);
  assert.equal(inspectHonorsRigor(dol(most + 1), { allowNarrowCheckpoint: true }).isNarrowCheckpoint, false, `${most + 1} are a full assignment`);
});

test('the Honors AI repair request carries the same rules to the provider', () => {
  const request = buildHonorsDepthAiRepairRequest({
    assignmentV5: {
      schemaVersion: 5,
      assignment: { title: 'Dividing Polynomials', courseId: 'algebra2' },
      sections: [{ id: 'practice', role: 'practice', questions: [{ type: 'multiAnswer', prompt: 'Divide $x^3 - 1$ by $x - 1$.' }] }],
    },
    honorsReport: { missing: ['modelingApplication', 'ccmrEnrichment'] },
  });
  RULES.forEach((rule) => assert.ok(request.includes(rule), rule));
});
