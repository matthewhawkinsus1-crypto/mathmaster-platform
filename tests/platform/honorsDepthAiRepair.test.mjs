import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  applyHonorsDepthAiSections,
  buildHonorsDepthAiRepairRequest,
  judgeHonorsDepthRepair,
  nonCcmrHonorsMissing,
  nonCcmrHonorsReady,
  separateHonorsDepthAiRepair,
  unresolvedRequestedHonorsGaps,
} from '../../src/platform/contract/honorsDepthAiRepair.js';
import { HONORS_DEPTH_AREAS, inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { describeHonorsGap } from '../../src/components/teacher/preflightSteps.js';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { lessonWith } from './helpers/honorsDepthFixtures.mjs';

const base = () => ({
  schemaVersion: 5,
  assignment: { title: 'Linear Review', courseId: 'algebra1' },
  sections: [{
    id: 'classwork',
    role: 'classwork',
    title: 'Classwork',
    questions: [{
      questionId: 'q1',
      type: 'multiAnswer',
      prompt: 'Solve 2x + 3 = 11.',
      alignments: [],
      responseFields: [{ id: 'answer', inputProfile: 'number', expected: '4' }],
    }],
  }, {
    id: 'practice',
    role: 'practice',
    title: 'Practice',
    questions: [{
      questionId: 'q2',
      type: 'multiAnswer',
      prompt: 'Solve 3x - 2 = 10.',
      alignments: [],
      responseFields: [{ id: 'answer', inputProfile: 'number', expected: '4' }],
    }],
  }],
  variantPolicy: { mode: 'personalized' },
  supportPolicy: { mode: 'inheritStudentProfile' },
});

test('representationMatch and representation-connection intent count as genuine Honors multiple representations', () => {
  const byRuntimeTool = inspectHonorsRigor([{
    type: 'representationMatch',
    studentActions: ['findRepresentationMismatch', 'connectRepresentations'],
    dok: 3,
    alignments: [{ framework: 'teks', code: 'A.2B', role: 'primary', evidenceLevel: 'assessed' }],
    sets: [{
      slopeIntercept: 'y=2x+5',
      pointSlope: 'y-3=2(x+1)',
      standard: '-2x+y=5',
    }],
  }], { ccmrTargetRequired: false });
  assert.equal(byRuntimeTool.checks.multipleRepresentations, true);

  const bySemanticIntent = inspectHonorsRigor([{
    type: 'multiAnswer',
    studentActions: ['connectLinearRepresentations'],
    dok: 3,
    alignments: [{ framework: 'teks', code: 'A.2B', role: 'primary', evidenceLevel: 'assessed' }],
  }], { ccmrTargetRequired: false });
  assert.equal(bySemanticIntent.checks.multipleRepresentations, true);
});

test('a rationale-required open sort counts as explicit explanation/justification work', () => {
  const report = inspectHonorsRigor([{
    type: 'openSortBoard',
    studentActions: ['sortIntoOwnGroups'],
    requireRationale: true,
    dok: 3,
    alignments: [{ framework: 'teks', code: 'A.2B', role: 'primary', evidenceLevel: 'assessed' }],
    items: [{ id: 'A' }, { id: 'B' }],
    validSchemes: [{ groups: [{ itemIds: ['A'] }, { itemIds: ['B'] }] }],
  }], { ccmrTargetRequired: false });
  assert.equal(report.checks.justification, true);
});

/*
 * A REPAIR IS TAKEN WHEN THE HONORS CHECK PASSES IT.
 *
 * A candidate used to be refused unless it resolved every gap the request
 * listed. Honors needs three of the four depth areas, so an assignment with
 * higher-order reasoning and justification is listed as missing multiple
 * representations and modeling / application, either of which would do: a
 * candidate that added a modeling question passed the check and was refused
 * all the same. The lessons below are built from questions that each supply
 * exactly one depth area (helpers/honorsDepthFixtures.mjs), so every verdict
 * is the real check's.
 */
// What the request listed for a source lesson, as Pre-Flight passes it.
const listedFor = (questions) => nonCcmrHonorsMissing(inspectHonorsRigor(questions, { allowNarrowCheckpoint: true }));
const judge = (source, candidate) => judgeHonorsDepthRepair({
  questions: candidate,
  requestedMissing: listedFor(source),
  sourceLabel: 'MathMaster AI',
});

test('the area questions supply exactly the areas they are named for', () => {
  for (const area of HONORS_DEPTH_AREAS) {
    const { checks } = inspectHonorsRigor(lessonWith([area]), { ccmrTargetRequired: false });
    assert.deepEqual(HONORS_DEPTH_AREAS.filter((key) => checks[key]), [area]);
    assert.equal(checks.coreTeks, true);
  }
  assert.equal(inspectHonorsRigor(lessonWith(HONORS_DEPTH_AREAS, { teks: false })).checks.coreTeks, false);
});

test('a candidate that supplies enough depth areas is taken, though a gap the request listed is still open', () => {
  const source = lessonWith(['higherOrderReasoning', 'justification']);
  assert.deepEqual(listedFor(source), ['multipleRepresentations', 'modelingApplication']);
  const candidate = lessonWith(['higherOrderReasoning', 'justification', 'modelingApplication']);
  const verdict = judge(source, candidate);
  assert.equal(verdict.accepted, true, verdict.message);
  assert.equal(verdict.message, '');
  assert.equal(verdict.report.checks.multipleRepresentations, false, 'a listed gap is still open');
  assert.deepEqual(unresolvedRequestedHonorsGaps(listedFor(source), verdict.report), ['multipleRepresentations'], 'the gap that used to refuse it');
  assert.equal(describeHonorsGap(inspectHonorsRigor(candidate, { allowNarrowCheckpoint: true })), '', 'Review does not block the repaired lesson');
});

test('a candidate still short of the depth rule is refused, with the message it always had', () => {
  const source = lessonWith(['higherOrderReasoning']);
  assert.deepEqual(listedFor(source), ['multipleRepresentations', 'justification', 'modelingApplication']);
  const short = judge(source, lessonWith(['higherOrderReasoning', 'justification']));
  assert.equal(short.accepted, false);
  assert.equal(short.message, 'MathMaster AI did not resolve the Honors gap(s) it was asked to repair: multiple representations, modeling / application. The original assignment was kept unchanged.');

  // Three areas are not enough without higher-order reasoning: it is required on its own.
  const noReasoning = lessonWith(['multipleRepresentations', 'justification', 'modelingApplication']);
  assert.equal(inspectHonorsRigor(noReasoning, { ccmrTargetRequired: false }).depthCount, 3);
  const unchanged = judge(noReasoning, noReasoning);
  assert.equal(unchanged.accepted, false);
  assert.equal(unchanged.message, 'MathMaster AI did not resolve the Honors gap(s) it was asked to repair: higher-order reasoning. The original assignment was kept unchanged.');
});

test('a candidate that leaves Core TEKS unaligned is refused, with the message it always had', () => {
  // Listed and still open: the depth rule is met, Core TEKS is not.
  const unaligned = lessonWith(['higherOrderReasoning', 'justification'], { teks: false });
  assert.deepEqual(listedFor(unaligned), ['coreTeks', 'multipleRepresentations', 'modelingApplication']);
  const leftOpen = judge(unaligned, lessonWith(['higherOrderReasoning', 'justification', 'modelingApplication'], { teks: false }));
  assert.equal(leftOpen.accepted, false);
  assert.equal(leftOpen.message, 'MathMaster AI did not resolve the Honors gap(s) it was asked to repair: Core TEKS alignment, multiple representations. The original assignment was kept unchanged.');

  // Not listed but lost: every listed gap is closed and the TEKS alignment is gone.
  const lost = judge(lessonWith(['higherOrderReasoning', 'justification']), lessonWith(HONORS_DEPTH_AREAS, { teks: false }));
  assert.equal(lost.accepted, false);
  assert.equal(lost.message, 'MathMaster AI could not safely resolve enough Honors depth: Core TEKS alignment. Honors requires Core TEKS, DOK 3+ reasoning, and at least three of the four depth dimensions. The original assignment was kept unchanged.');
});

test('a repair is taken exactly when Review would not block the lesson for Honors depth or Core TEKS', () => {
  let taken = 0;
  for (const teks of [true, false]) {
    for (let mask = 0; mask < 2 ** HONORS_DEPTH_AREAS.length; mask += 1) {
      const areas = HONORS_DEPTH_AREAS.filter((_, index) => mask & (2 ** index));
      const candidate = lessonWith(areas, { teks });
      const reviewBlocks = describeHonorsGap(inspectHonorsRigor(candidate, { allowNarrowCheckpoint: true })) !== '';
      const verdict = judgeHonorsDepthRepair({ questions: candidate, requestedMissing: ['coreTeks', ...HONORS_DEPTH_AREAS] });
      assert.equal(verdict.accepted, !reviewBlocks, `${teks ? 'aligned' : 'not aligned'}, ${areas.join(' + ') || 'no depth'}: ${verdict.message}`);
      if (verdict.accepted) taken += 1;
      else assert.match(verdict.message, /^AI (did not resolve|could not safely resolve) .* The original assignment was kept unchanged\.$/);
    }
  }
  // Aligned, with higher-order reasoning and two or three of the other areas.
  assert.equal(taken, 4);
});

test('Pre-Flight takes or refuses an Honors repair on that verdict alone', () => {
  const modal = readFileSync(new URL('../../src/components/teacher/LessonPreflightModal.jsx', import.meta.url), 'utf8');
  const gate = executableSource(region(modal, 'const acceptHonorsDepthCandidate', 'const buildHonorsDepthWithAi', 'the Honors repair gate'));
  assert.match(gate, /judgeHonorsDepthRepair\(\{[^}]*questions: candidateModel\.questions/);
  assert.match(gate, /requestedMissing: nonCcmrHonorsMissing\(honorsReport\)/);
  assert.match(gate, /if \(!(\w+)\.accepted\) throw new Error\(\1\.message\)/);
  assert.doesNotMatch(gate, /unresolvedRequestedHonorsGaps\(|nonCcmrHonorsReady\(|inspectHonorsRigor\(/, 'no second gate refuses what the check passes');
});

test('CCMR is deliberately excluded from the embedded Honors repair target', () => {
  assert.deepEqual(
    nonCcmrHonorsMissing({ missing: ['coreTeks', 'ccmrEnrichment'] }),
    ['coreTeks'],
  );
});

test('non-CCMR Honors readiness follows the platform 3-of-4 depth contract', () => {
  assert.equal(nonCcmrHonorsReady({
    checks: { coreTeks: true, higherOrderReasoning: true },
    depthCount: 3,
  }), true);
  assert.equal(nonCcmrHonorsReady({
    checks: { coreTeks: true, higherOrderReasoning: true },
    depthCount: 2,
  }), false);
});

test('Honors AI repair prompt tells the provider to repair TEKS/depth without fabricating CCMR', () => {
  const prompt = buildHonorsDepthAiRepairRequest({
    assignmentV5: base(),
    honorsReport: { missing: ['coreTeks', 'higherOrderReasoning', 'ccmrEnrichment'] },
  });
  assert.match(prompt, /Core TEKS alignment/);
  assert.match(prompt, /higher-order reasoning/);
  assert.match(prompt, /Audited CCMR Practice is sourced separately/);
  assert.match(prompt, /AT MOST ONE new Honors extension question/);
  assert.match(prompt, /Do not change mathematics to force a standard/);
  assert.match(prompt, /MathMaster Assignment V5/);
  assert.match(prompt, /Compact repair contract/);
  assert.match(prompt, /## Common studentActions/);
  assert.match(prompt, /## Course TEKS/);
  assert.match(prompt, /Do NOT add type, toolId, questionId/);
  assert.match(prompt, /The returned candidate MUST meet that readiness rule after compilation/);
  assert.match(prompt, /do not satisfy it only by mentioning equation forms in prose\/card text/);
  assert.match(prompt, /connectRepresentations\/findRepresentationMismatch/);
  assert.doesNotMatch(prompt, /Current MathMaster authoring contract/);
});

test('the repair request asks for the depth rule the check applies, not for every gap it lists', () => {
  const prompt = buildHonorsDepthAiRepairRequest({
    assignmentV5: base(),
    honorsReport: { missing: ['multipleRepresentations', 'modelingApplication', 'ccmrEnrichment'] },
  });
  // The gaps are still listed...
  assert.match(prompt, /^Non-CCMR Honors gaps to repair: multiple representations, modeling \/ application$/m);
  assert.match(prompt, /^Repair the current assignment only enough to meet the Honors readiness rule in the repair contract below\.$/m);
  // ...and what is required of them is what judgeHonorsDepthRepair takes.
  assert.match(prompt, /- Honors readiness requires Core TEKS, DOK 3\+ reasoning, and at least three of the four depth dimensions /);
  assert.match(prompt, /- The returned candidate MUST meet that readiness rule after compilation\. MathMaster rechecks the rule itself, not each gap listed at the top of this repair request: a listed Core TEKS or higher-order reasoning gap MUST be resolved, while the other listed gaps need resolving only until the candidate has three of the four depth dimensions\. Leaving one of those unresolved once the rule is met is an acceptable repair\./);
  assert.doesNotMatch(prompt, /MUST be resolved by the returned candidate|leaving a requested gap unresolved is not an acceptable repair|satisfy the listed Honors depth gaps/);
});

test('Honors repair stays compact for a rich lesson instead of attaching the full global authoring manual', () => {
  const source = base();
  source.sections[0].questions = Array.from({ length: 12 }, (_, index) => ({
    ...source.sections[0].questions[0],
    questionId: `cw-${index + 1}`,
    prompt: `Question ${index + 1}: ${'model this relationship and justify the representation. '.repeat(45)}`,
  }));
  source.sections[1].questions = Array.from({ length: 8 }, (_, index) => ({
    ...source.sections[1].questions[0],
    questionId: `p-${index + 1}`,
    prompt: `Practice ${index + 1}: ${'compare the representations and explain the structure. '.repeat(40)}`,
  }));

  const prompt = buildHonorsDepthAiRepairRequest({
    assignmentV5: source,
    honorsReport: { missing: ['coreTeks', 'higherOrderReasoning'] },
  });

  assert.ok(prompt.length < 120000, `expected compact Honors repair request; got ${prompt.length} characters`);
  assert.doesNotMatch(prompt, /## Current MathMaster authoring contract/);
  assert.match(prompt, /Current Assignment V5 repair snapshot/);
});

test('accepted Honors AI repair may add TEKS metadata and one extension without rewriting source work', () => {
  const source = base();
  const ai = structuredClone(source);
  ai.sections[0].questions[0].alignments = [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ];
  ai.sections[1].questions[0].alignments = [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ];
  ai.sections[0].questions.push({
    questionId: 'honors-extension-1',
    type: 'graphStory',
    prompt: 'Model a linear situation in two representations and justify the relationship.',
    dok: 3,
    difficultyBand: 4,
    alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
  });

  const merged = applyHonorsDepthAiSections(source, ai);
  assert.equal(merged.sections[0].questions.length, 2);
  assert.equal(merged.sections[0].questions[0].prompt, source.sections[0].questions[0].prompt);
  assert.deepEqual(merged.supportPolicy, source.supportPolicy);

  const separated = separateHonorsDepthAiRepair(source, merged);
  assert.equal(separated.assignmentV5.sections[0].questions.length, 1, 'Standard source keeps its original question count');
  assert.equal(separated.honorsEnrichmentQuestion.questionId, 'honors-extension-1');
  assert.equal(separated.honorsEnrichmentQuestion.activityRole, 'classwork');
  assert.deepEqual(
    separated.assignmentV5.sections[0].questions[0].alignments,
    ai.sections[0].questions[0].alignments,
    'safe TEKS metadata repair remains on the shared source question',
  );
});

test('intent-only Honors extension is compiled locally and passes the non-CCMR rigor contract', () => {
  const source = base();
  const ai = structuredClone(source);
  ai.sections[0].questions[0].standard = 'A.5A';
  ai.sections[1].questions[0].standard = 'A.5A';

  ai.sections[1].questions.push({
    prompt: 'A reservoir is being drained at a constant rate. Use the table and graph to build and justify a linear model, then use the model to predict the amount remaining after 10 minutes.',
    scenario: 'At 3 minutes, 84 gallons remain, and at 7 minutes, 60 gallons remain.',
    studentActions: ['readGraph', 'multipleResponses'],
    standard: 'A.2B',
    secondaryStandards: ['A.3A', 'A.3B'],
    table: {
      columns: [
        { key: 'x', label: 'Time (minutes)' },
        { key: 'y', label: 'Water remaining (gallons)' },
      ],
      rows: [
        { x: 3, y: 84 },
        { x: 7, y: 60 },
      ],
    },
    function: { family: 'linear', m: -6, b: 102 },
    answerFields: [
      { id: 'slope', label: 'Slope / rate of change', answer: -6, inputProfile: 'number' },
      { id: 'equation', label: 'Point-slope model using (3, 84)', acceptedAnswers: ['y-84=-6(x-3)'], inputProfile: 'equation' },
      { id: 'prediction', label: 'Water remaining after 10 minutes', answer: 42, inputProfile: 'number' },
      {
        id: 'justification',
        label: 'Which statement best justifies that your model matches both representations?',
        type: 'choice',
        options: [
          'Both representations show a decrease of 6 gallons per minute and the model passes through (3, 84).',
          'The two representations have different rates.',
          'Any equation containing (3, 84) represents the same line.',
          '84 is the y-intercept.',
        ],
        answer: 'Both representations show a decrease of 6 gallons per minute and the model passes through (3, 84).',
        inputProfile: 'choice',
      },
    ],
    dok: 3,
    difficultyBand: 4,
  });

  const merged = applyHonorsDepthAiSections(source, ai);
  const extension = merged.sections[1].questions.at(-1);

  assert.equal(extension.type, 'multiAnswer', 'MathMaster should compile intent to a runtime interaction');
  assert.ok(extension.graph, 'the authored linear function should become the visible graph');
  assert.ok(extension.table, 'the authored table must stay visible');
  assert.equal(extension.questionId?.length > 0, true, 'MathMaster assigns the new extension identity');

  const report = inspectHonorsRigor(
    merged.sections.flatMap((section) => section.questions),
    { allowNarrowCheckpoint: true, ccmrTargetRequired: false },
  );
  assert.equal(report.checks.multipleRepresentations, true, 'table + graph must count as multiple representations');
  assert.equal(report.checks.justification, true);
  assert.equal(report.checks.modelingApplication, true);
  assert.equal(nonCcmrHonorsReady(report), true, 'Core TEKS + DOK 3 + three depth dimensions should pass');
});

test('Honors AI repair rejects assignment rewrites, deletions, course changes, and excessive additions', () => {
  const source = base();

  const rewrite = structuredClone(source);
  rewrite.sections[0].questions[0].prompt = 'A different question.';
  assert.throws(() => applyHonorsDepthAiSections(source, rewrite), /rewrote an existing question/);

  const deletion = structuredClone(source);
  deletion.sections[0].questions = [];
  assert.throws(() => applyHonorsDepthAiSections(source, deletion), /removed an existing question/);

  const course = structuredClone(source);
  course.assignment.courseId = 'algebra2';
  assert.throws(() => applyHonorsDepthAiSections(source, course), /changed the course/);

  const answerRewrite = structuredClone(source);
  answerRewrite.sections[0].questions[0].responseFields[0].expected = '5';
  assert.throws(() => applyHonorsDepthAiSections(source, answerRewrite), /mathematics, grading, or rigor metadata/);

  const tooMany = structuredClone(source);
  tooMany.sections[0].questions.push(
    { questionId: 'a', type: 'graphStory', prompt: 'A' },
    { questionId: 'b', type: 'graphStory', prompt: 'B' },
  );
  assert.throws(() => applyHonorsDepthAiSections(source, tooMany), /more than one Honors extension/);
});
