import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildAttemptSupportPayload,
  buildPrivateSupport,
  hasSolutionSupport,
  hintRevealsAnswer,
} from '../../functions/shared/pathSolutionSupport.mjs';
import { describeSkill, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { deriveStudentLabel, studentLabelForTeks } from '../../src/platform/path/skillLabels.js';
import { explainStepForStudent, PATH_ACTION } from '../../src/platform/path/pathSessionRouting.js';

const read = (relativePath) => readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

const player = read('src/components/student/PathSessionPlayer.jsx');
const responses = read('src/components/student/PathResponseFields.jsx');
const container = read('src/components/student/MyMathPathProductionContainer.jsx');
const mathPath = read('functions/lib/mathPath.js');

// --- Students see mathematics, not identifiers --------------------------------

test('a skill is named for a student, and the TEKS code stays on teacher surfaces', () => {
  const described = describeSkill(teksSkillId('A.5A'));
  assert.equal(described.studentLabel, 'Solving linear equations');
  assert.equal(described.shortLabel, 'A.5A', 'teacher tooling still gets the code');
});

test('every routeable standard has a student-facing name that is not its code', () => {
  ['A.2A', 'A.12E', 'A2.6K', '8.5G', '7.11A', '6.7A'].forEach((code) => {
    const label = studentLabelForTeks(code);
    assert.ok(label.length > 3, `${code} needs a readable name`);
    assert.ok(!label.includes(code), `${code} must not be shown to a student as its own code`);
  });
});

test('an uncurated standard still gets prose rather than an identifier', () => {
  assert.equal(
    deriveStudentLabel('Determine the domain and range of linear functions, including reasonable values.', 'X.1A'),
    'Domain and range of linear functions',
  );
  assert.equal(deriveStudentLabel('', 'X.9Z'), 'Skill X.9Z');
});

test('the student player never renders DOK, difficulty band or a raw alignment key', () => {
  assert.ok(!/DOK \{/.test(player) && !/DOK \$\{/.test(player), 'DOK is teacher metadata');
  assert.ok(!/Band \$\{/.test(player), 'difficulty band is teacher metadata');
  assert.ok(!player.includes('questionInstance.teksCode || session?.target?.alignmentKey'), 'the header must not print a TEKS code');
  assert.ok(player.includes('skillNameFor'), 'the header names the skill for a student');
});

// --- Real interactions ---------------------------------------------------------

test('multiple choice renders selectable options rather than asking for a typed letter', () => {
  assert.ok(responses.includes("role=\"radiogroup\""), 'choices are a real radio group');
  assert.ok(responses.includes('role="radio"'), 'each option is selectable');
  assert.ok(responses.includes('MathText'), 'option text is rendered as mathematics');
});

test('the generic renderer supports the response types a Path question actually needs', () => {
  ['choice', 'number', 'expression', 'equation', 'interval', 'inequality', 'text'].forEach((profile) => {
    assert.ok(responses.includes(`'${profile}'`), `${profile} responses must be supported`);
  });
});

test('Enter activates the primary check action', () => {
  assert.ok(/if \(event\.key === 'Enter'\)/.test(responses), 'Enter must submit from a response input');
  assert.ok(responses.includes('onSubmit?.()'), 'Enter calls the same action the button calls');
});

test('student work is kept per question instance, so a second attempt is not a blank box', () => {
  assert.ok(player.includes('responsesByQuestion'), 'responses are stored per question instance');
  assert.ok(player.includes('[instanceId]: { ...(current[instanceId] || {}), [fieldId]: value }'),
    'a new value merges into that question\'s existing work');
});

// --- Feedback and solution review ---------------------------------------------

test('a solution review is never built for an open question', () => {
  const support = buildPrivateSupport({
    solutionReview: { headline: 'Isolate the variable', reasoning: ['Subtract 4 from both sides.'], answerSummary: 'x = 3' },
    attemptFeedback: ['Check what you did to both sides.'],
    supportHints: ['What operation undoes adding 4?'],
  });
  const firstMiss = buildAttemptSupportPayload({ support, attemptNumber: 1, attemptsAllowed: 3, isCorrect: false, questionFinalized: false });
  assert.equal(firstMiss.solutionReview, null, 'a wrong answer does not buy the solution');
  assert.equal(firstMiss.support, null, 'the hint is not offered on the first miss either');
  assert.match(firstMiss.feedback.message, /both sides/);

  const secondMiss = buildAttemptSupportPayload({ support, attemptNumber: 2, attemptsAllowed: 3, isCorrect: false, questionFinalized: false });
  assert.equal(secondMiss.solutionReview, null);
  assert.equal(secondMiss.support.hint, 'What operation undoes adding 4?');

  const closed = buildAttemptSupportPayload({ support, attemptNumber: 3, attemptsAllowed: 3, isCorrect: false, questionFinalized: true });
  assert.ok(closed.solutionReview, 'the review arrives when the question closes');
  assert.equal(closed.solutionReview.answerSummary, 'x = 3');

  const right = buildAttemptSupportPayload({ support, attemptNumber: 1, attemptsAllowed: 3, isCorrect: true, questionFinalized: true });
  assert.ok(right.solutionReview, 'a correct answer also earns the reasoning');
  assert.equal(right.feedback.tone, 'correct');
});

test('a review that is nothing but the letter of the answer is not solution support', () => {
  assert.equal(hasSolutionSupport({ solutionReview: { headline: 'Correct answer: B' } }), false);
  assert.equal(hasSolutionSupport({ solutionReview: { headline: 'x', reasoning: ['Because 2x = 6.'] } }), true);
});

test('a hint that contains the expected answer is an answer button, and is detectable', () => {
  assert.equal(hintRevealsAnswer('Remember the solution is x = 12.', ['12']), true);
  assert.equal(hintRevealsAnswer('What undoes multiplying by 3?', ['12']), false);
});

test('feedback keyed to a specific wrong answer beats generic encouragement', () => {
  const support = buildPrivateSupport({
    misconceptions: [{ match: ['-8'], message: 'Check the sign when you moved the 4 across.' }],
  });
  const payload = buildAttemptSupportPayload({
    support,
    attemptNumber: 1,
    attemptsAllowed: 3,
    isCorrect: false,
    questionFinalized: false,
    responsePayload: { responses: { answer: '-8' } },
  });
  assert.equal(payload.feedback.message, 'Check the sign when you moved the 4 across.');
});

test('the server holds the review privately and only releases it with the attempt result', () => {
  assert.ok(mathPath.includes('buildPrivateSupport'), 'the server builds a private support bundle');
  const sanitized = mathPath.split('function buildSanitizedQuestion')[1].split('\nfunction ')[0];
  assert.ok(!sanitized.includes('solutionReview'), 'the sanitized question must not carry the review');
  assert.ok(!sanitized.includes('privateSupport'), 'the sanitized question must not carry the support bundle');
});

test('the session container only ever shows a review the server sent', () => {
  assert.ok(container.includes('setSolutionReview(result.solutionReview || null)'));
  assert.ok(!/setSolutionReview\((?!result\.solutionReview|forced\.solutionReview|null)/.test(container),
    'nothing else may populate the review');
  assert.ok(container.includes('setAwaitingContinue(true)'), 'the session waits for the student to read the review');
});

// --- The path explains itself in student language -------------------------------

test('a change of direction is explained without engine vocabulary', () => {
  const descend = explainStepForStudent({
    action: PATH_ACTION.DESCEND,
    skillId: teksSkillId('A.5A'),
    excursion: { originSkillId: teksSkillId('A.5C') },
  });
  assert.match(descend.message, /Solving linear equations/);
  assert.match(descend.message, /Solving systems of equations/);
  assert.ok(!/texas:|A\.5A|excursion|prerequisite_/.test(descend.message));

  const bridge = explainStepForStudent({
    action: PATH_ACTION.BRIDGE,
    skillId: teksSkillId('A.5A'),
    returnTo: teksSkillId('A.5C'),
  });
  assert.match(bridge.headline, /Back to where you were/);

  assert.equal(explainStepForStudent({ action: PATH_ACTION.CONTINUE }), null,
    'an ordinary continue is not announced — a banner after every question is noise');
});
