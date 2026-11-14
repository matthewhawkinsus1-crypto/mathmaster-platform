/*
 * ONE NAME FOR EACH HONORS GAP, WHEREVER A TEACHER READS IT.
 *
 * Create's last check on the Honors version printed the Honors check's own
 * keys: "The Honors version is still missing: justification,
 * modelingApplication. Nothing was created." Review and the import check
 * call the same gaps "explanation / justification" and "modeling /
 * application". The names are now kept once, beside the rule
 * (courseRigor.js, HONORS_CHECK_LABELS), and each of those messages reads
 * them there.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import {
  HONORS_CCMR_STATUS,
  composeHonorsCcmrCandidate,
  confirmHonorsCandidateForCreate,
} from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { HONORS_CHECK_LABELS, HONORS_DEPTH_AREAS, inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { describeHonorsGap } from '../../src/components/teacher/preflightSteps.js';
import { honorsMissingLabels } from '../../src/platform/contract/honorsDepthAiRepair.js';
import { HONORS_AREA_LABELS } from '../../scripts/lib/honorsImportReview.mjs';

// A key as the check spells it (coreTeks, modelingApplication), never a word a teacher reads.
const INTERNAL_KEY = /\b[a-z]+[A-Z][A-Za-z]*\b/;

test('every gap the Honors check can report has a name', () => {
  // With no questions every check fails, so `missing` lists every key there is.
  const everything = inspectHonorsRigor([], { ccmrTargetRequired: true });
  assert.deepEqual(everything.missing, Object.keys(everything.checks));
  assert.deepEqual(everything.missing.filter((key) => !HONORS_CHECK_LABELS[key]), [], 'a key with no name');
  Object.values(HONORS_CHECK_LABELS).forEach((label) => assert.doesNotMatch(label, INTERNAL_KEY, label));
});

test('Create refuses an Honors version that is short of depth by the names Review uses, not by the check\'s keys', () => {
  // The Multiple Representations lesson has two Practice questions, so no
  // audited CCMR is asked of it, and on its own it has two depth areas.
  const lesson = readFileSync(new URL('../../docs/assignments/Algebra1_Linear_Multiple_Representations_V5_FAMILY_UPDATED.json', import.meta.url), 'utf8');
  const base = buildAssignmentV5PreflightModel(parseAssignmentBlueprintText(lesson).assignmentV5).assignmentV5;
  const candidate = composeHonorsCcmrCandidate({ baseAssignmentV5: base, selection: null });
  assert.equal(candidate.status, HONORS_CCMR_STATUS.NOT_REQUIRED, 'a publishable version, so Create reaches its last check');
  assert.equal(candidate.honorsReport.isHonorsReady, false);
  const { missing } = candidate.honorsReport;
  assert.ok(missing.some((key) => INTERNAL_KEY.test(key)), `the gaps include a key a teacher must not read (${missing})`);

  assert.throws(
    () => confirmHonorsCandidateForCreate({ honorsCandidate: candidate, reviewedAssignmentV5: base }),
    (error) => {
      assert.equal(error.message, `The Honors version is still missing: ${missing.map((key) => HONORS_CHECK_LABELS[key]).join(', ')}. Nothing was created.`);
      assert.doesNotMatch(error.message, INTERNAL_KEY);
      return true;
    },
  );
});

test('the import check, Review and the AI repair name each gap as Create does', () => {
  assert.deepEqual(
    HONORS_AREA_LABELS,
    Object.fromEntries(HONORS_DEPTH_AREAS.map((key) => [key, HONORS_CHECK_LABELS[key]])),
    'the import check\'s area names',
  );
  assert.deepEqual(honorsMissingLabels(Object.keys(HONORS_CHECK_LABELS)), Object.values(HONORS_CHECK_LABELS), 'the AI repair\'s names');
  // Review's blocker, for an assignment with only higher-order reasoning and no TEKS.
  const blocker = describeHonorsGap({
    isNarrowCheckpoint: false,
    missing: ['coreTeks', 'multipleRepresentations', 'justification', 'modelingApplication', 'ccmrEnrichment'],
  });
  ['coreTeks', ...HONORS_DEPTH_AREAS].forEach((key) => {
    assert.ok(blocker.includes(HONORS_CHECK_LABELS[key]), `Review names ${key} "${HONORS_CHECK_LABELS[key]}": ${blocker}`);
  });
});
