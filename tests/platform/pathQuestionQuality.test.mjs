import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUESTION_QUALITY,
  auditPathQuestionQuality,
  detectDuplicateFamilies,
  interactionOf,
  representationOf,
  summarizePathBankQuality,
  buildPathQuestionRevisionBrief,
} from '../../src/platform/path/pathQuestionQuality.js';
import {
  CONTENT_STATE,
  analyzeStandardContent,
} from '../../functions/shared/pathStandardQuality.mjs';

const issuablePlans = (ids) => Object.fromEntries(ids.map((id) => [id, { issuable: true }]));

test('a plain response box with nothing to look at is operational coverage, not production content', () => {
  const audit = auditPathQuestionQuality({
    id: 'seed-a12e',
    alignmentKeys: ['texas:A.12E'],
    prompt: 'Solve the literal equation for the requested variable.',
    responseFields: [{ id: 'answer', label: 'Answer', expected: 'd/r' }],
  });
  assert.equal(audit.level, QUESTION_QUALITY.OPERATIONAL);
  assert.ok(audit.issues.some((issue) => issue.code === 'legacy-field-only'));
  assert.ok(audit.issues.some((issue) => issue.code === 'missing-solution-support'));
});

test('missing graph representation is a blocker', () => {
  const audit = auditPathQuestionQuality({
    alignmentKeys: ['texas:A.3C'],
    prompt: 'Use the displayed graph to identify the behavior from left to right.',
    responseFields: [{ id: 'answer', label: 'Behavior', expected: 'decreasing' }],
  });
  assert.equal(audit.level, QUESTION_QUALITY.BLOCKED);
  assert.ok(audit.issues.some((issue) => issue.code === 'missing-graph-representation'));
});

// --- The failure mode the starter bank actually had ---------------------------

test('options typed into the prompt are a blocker, however well-formed the JSON is', () => {
  const audit = auditPathQuestionQuality({
    id: 'seed_A_2A_1',
    alignmentKeys: ['texas:A.2A'],
    difficultyBand: 2,
    dok: 1,
    prompt: 'A bike rental is open for at most 8 hours. Which is the reasonable domain?\n\nA) 0 ≤ x ≤ 8\nB) x ≥ 8\nC) x < 0\nD) All real numbers\n\nType A, B, C, or D.',
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: 'text', expected: 'A' }],
  });
  assert.equal(audit.level, QUESTION_QUALITY.BLOCKED);
  assert.ok(audit.blockers.some((issue) => issue.code === 'choices-typed-into-prompt'));
  assert.ok(audit.blockers.some((issue) => issue.code === 'asks-for-a-typed-letter'));
});

test('the same question with real choices is a real interaction', () => {
  const audit = auditPathQuestionQuality({
    id: 'a2a-domain-context',
    alignmentKeys: ['texas:A.2A'],
    difficultyBand: 2,
    dok: 2,
    taskType: 'application',
    representation: 'context',
    prompt: 'A bike rental is open for at most 8 hours. Let $x$ be the hours rented. Which domain is reasonable?',
    choices: [
      { id: 'a', label: '$0 \\le x \\le 8$' },
      { id: 'b', label: '$x \\ge 8$' },
      { id: 'c', label: '$x < 0$' },
      { id: 'd', label: 'All real numbers' },
    ],
    responseFields: [{ id: 'answer', label: 'Choose one', inputProfile: 'choice', expected: 'a' }],
    solutionReview: {
      headline: 'The domain is the hours you could actually rent for.',
      reasoning: ['You cannot rent for a negative number of hours, so the smallest value is 0.', 'The shop closes after 8 hours, so 8 is the largest value.'],
      answerSummary: '$0 \\le x \\le 8$',
    },
  });
  assert.equal(audit.level, QUESTION_QUALITY.PRODUCTION);
  assert.equal(audit.interaction, 'choice');
  assert.equal(audit.representation, 'context');
});

test('a hint that gives away the answer is rejected', () => {
  const audit = auditPathQuestionQuality({
    alignmentKeys: ['texas:A.5A'],
    prompt: 'Solve $3x + 4 = 19$ for $x$.',
    responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: '5' }],
    supportHints: ['Remember that x = 5 once you divide.'],
  });
  assert.ok(audit.blockers.some((issue) => issue.code === 'hint-reveals-answer'));
});

test('a DOK 3 label on a procedural task is flagged rather than believed', () => {
  const audit = auditPathQuestionQuality({
    alignmentKeys: ['texas:A.5A'],
    dok: 3,
    taskType: 'procedural',
    prompt: 'Solve $36x + 144 = 396$ for $x$.',
    responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: '7' }],
  });
  assert.ok(audit.warnings.some((issue) => issue.code === 'dok-overstated'));
});

test('a tool-backed item is recognised as an interaction', () => {
  const question = {
    alignmentKeys: ['texas:A.5A'],
    type: 'stepAlgebra',
    equation: '3x + 4 = 19',
    answer: '5',
  };
  assert.equal(interactionOf(question), 'tool:stepAlgebra');
  assert.equal(auditPathQuestionQuality(question).usesTool, true);
});

test('a table stimulus is recognised as a different representation from symbols', () => {
  assert.equal(representationOf({ stimulus: { table: { headers: ['x', 'y'], rows: [['1', '4']] } } }), 'table');
  assert.equal(representationOf({ prompt: 'Solve.' }), 'symbolic');
});

// --- Five families that are one family ------------------------------------------

test('numbers changed is not a new family', () => {
  const clones = [8, 12, 16].map((value, index) => ({
    id: `clone-${index}`,
    alignmentKeys: ['texas:A.5A'],
    prompt: `Solve 3x + ${value} = ${value * 2} for x.`,
    responseFields: [{ id: 'answer', label: 'x', inputProfile: 'number', expected: String(value / 3) }],
  }));
  const duplicates = detectDuplicateFamilies(clones);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].count, 3);
});

test('genuinely different tasks on one standard are not flagged as duplicates', () => {
  const varied = [
    { id: 'v1', prompt: 'Solve 3x + 4 = 19 for x.', responseFields: [{ id: 'a', inputProfile: 'number', expected: '5' }] },
    { id: 'v2', prompt: 'A student wrote the steps below. Which step is wrong?', stimulus: { steps: [{ label: 'Step 1', work: '3x = 15' }] }, choices: [{ id: 'a', label: 'Step 1' }, { id: 'b', label: 'Step 2' }], responseFields: [{ id: 'a', inputProfile: 'choice', expected: 'b' }] },
  ];
  assert.deepEqual(detectDuplicateFamilies(varied), []);
});

// --- Per-standard states ---------------------------------------------------------

test('five placeholder items report as operational coverage, not as production ready', () => {
  const items = [1, 2, 3, 4, 5].map((slot) => ({
    id: `seed-${slot}`,
    active: true,
    difficultyBand: slot <= 2 ? 2 : 3,
    dok: 1,
    prompt: `Starter question number ${slot} for this standard.`,
    responseFields: [{ id: 'answer', label: 'Answer', expected: String(slot) }],
  }));
  const analysis = analyzeStandardContent({
    displayCode: 'A.2A',
    items,
    plans: issuablePlans(items.map((item) => item.id)),
  });
  assert.equal(analysis.state, CONTENT_STATE.MINIMUM_OPERATIONAL);
  assert.equal(analysis.issuableCount, 5);
  assert.equal(analysis.productionCount, 0);
  assert.equal(analysis.studentReady, true, 'a session can still run — it is simply not finished');
  assert.ok(analysis.warnings.some((line) => /production quality/.test(line)));
});

test('a standard with nothing authored is distinguishable from one that is broken', () => {
  assert.equal(analyzeStandardContent({ displayCode: 'A.9E', items: [] }).state, CONTENT_STATE.NONE);
  assert.equal(
    analyzeStandardContent({
      displayCode: 'A.9E',
      items: [{ id: 'x', active: true, prompt: 'Something' }],
      plans: { x: { issuable: false, reason: 'no_gradable_definition' } },
    }).state,
    CONTENT_STATE.AUTHORED_UNUSABLE,
  );
});

test('production ready needs varied thinking, not five polished copies of one idea', () => {
  const polished = (slot, extra) => ({
    id: `p-${slot}`,
    active: true,
    alignmentKeys: ['texas:A.5A'],
    difficultyBand: extra.band,
    dok: extra.dok,
    taskType: extra.taskType,
    representation: extra.representation,
    prompt: extra.prompt,
    choices: extra.choices || undefined,
    stimulus: extra.stimulus || undefined,
    responseFields: [{ id: 'answer', label: 'Answer', inputProfile: extra.profile || 'number', expected: '5' }],
    solutionReview: { headline: 'Why', reasoning: ['Step one.', 'Step two.'] },
  });

  const sameIdeaFiveTimes = [1, 2, 3, 4, 5].map((slot) => polished(slot, {
    band: slot <= 2 ? 2 : 3,
    dok: slot <= 2 ? 1 : 2,
    taskType: 'procedural',
    representation: 'symbolic',
    prompt: `Solve $${slot}x + 4 = 19$ for $x$.`,
  }));
  assert.notEqual(
    analyzeStandardContent({ displayCode: 'A.5A', items: sameIdeaFiveTimes, plans: issuablePlans(sameIdeaFiveTimes.map((item) => item.id)) }).state,
    CONTENT_STATE.PRODUCTION_READY,
  );

  const varied = [
    polished(1, { band: 2, dok: 1, taskType: 'procedural', representation: 'symbolic', prompt: 'Solve $3x + 4 = 19$ for $x$.' }),
    polished(2, { band: 3, dok: 2, taskType: 'application', representation: 'context', prompt: 'A taxi charges $3 plus $2 a mile. How far for $19?' }),
    polished(3, {
      band: 3,
      dok: 2,
      taskType: 'errorAnalysis',
      representation: 'symbolic',
      prompt: 'Another student solved this. Which line is the first mistake?',
      stimulus: { steps: [{ label: 'Line 1', work: '3x = 23' }] },
      choices: [{ id: 'a', label: 'Line 1' }, { id: 'b', label: 'Line 2' }],
      profile: 'choice',
    }),
    polished(4, {
      band: 4,
      dok: 2,
      taskType: 'interpretation',
      representation: 'table',
      prompt: 'The table shows the cost. Which equation matches it?',
      stimulus: { table: { headers: ['miles', 'cost'], rows: [['1', '5']] } },
      choices: [{ id: 'a', label: '$y = 2x + 3$' }, { id: 'b', label: '$y = 3x + 2$' }],
      profile: 'choice',
    }),
    polished(5, { band: 4, dok: 3, taskType: 'reverseReasoning', representation: 'verbal', prompt: 'Write an equation whose only solution is $x = 5$ and that has a variable on both sides.', profile: 'equation' }),
  ];
  const analysis = analyzeStandardContent({ displayCode: 'A.5A', items: varied, plans: issuablePlans(varied.map((item) => item.id)) });
  assert.equal(analysis.state, CONTENT_STATE.PRODUCTION_READY);
  assert.equal(analysis.productionCount, 5);
  assert.ok(analysis.productionRepresentations.length >= 3);
  assert.ok(analysis.productionTaskTypes.length >= 3);
});

test('bank summary and revision brief expose QA state', () => {
  const question = {
    id: 'seed',
    alignmentKeys: ['texas:A.12E'],
    prompt: 'Solve for t in the formula.',
    responseFields: [{ id: 'answer', label: 't', expected: 'd/r' }],
  };
  const summary = summarizePathBankQuality([question]);
  assert.equal(summary.total, 1);
  assert.equal(summary.operational, 1);
  assert.equal(summary.production, 0);
  assert.match(buildPathQuestionRevisionBrief(question), /Secure expected answer/);
});
