import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { canSalvageV5IntakeResult } from '../../src/platform/preflight/assignmentAuthoringState.js';
import { buildIncompleteAssignmentDraftRecord } from '../../src/platform/preflight/incompleteAssignmentDraft.js';

/*
 * THE CASE THE WHOLE REPAIR WORKSPACE EXISTS FOR.
 *
 * A teacher pastes a twenty-question V5 assignment and one question is missing
 * its studentActions. The compiler does not collect that as a diagnostic — it
 * THROWS, from the middle of the compile, and readAssignmentJson caught the
 * throw and returned `{ ok: false, errors: [message] }` with no parsed document
 * and sourceSchemaVersion null.
 *
 * canSalvageV5IntakeResult needs both of those. So for the single commonest V5
 * failure there was, salvage could never fire: no draft was saved, the hard
 * rejection panel appeared, and the teacher was told to take the entire
 * assignment back to the AI over one question. Everything downstream — the
 * Repair Center, the triage, the packets, the review scopes, final review —
 * was unreachable from the path a teacher actually arrives on.
 *
 * Nothing caught it because every test for salvage built its own intake result
 * by hand, with `parsed` already populated. This one starts from raw JSON and
 * the real compiler.
 */

const workingQuestion = (n) => ({
  questionId: `q-${n}`,
  prompt: `For g(x)=f(x-${n})+3, describe the horizontal translation.`,
  standards: ['A2.6C'],
  studentActions: [{
    type: 'multipleChoice',
    choices: [{ id: 'a', text: `left ${n}` }, { id: 'b', text: `right ${n}` }, { id: 'c', text: 'none' }],
    correctChoiceId: 'b',
  }],
});

// No studentActions and no mathematical data: the compiler refuses this one.
const uncompilableQuestion = (n) => ({
  questionId: `q-${n}`,
  prompt: `Question ${n}`,
  standards: ['A2.6C'],
});

const assignmentText = JSON.stringify({
  schemaVersion: 5,
  assignment: { title: 'Transformations to Absolute Value Functions', course: 'algebra2', instructionalPurpose: 'lesson' },
  sections: [{
    id: 'warmup',
    role: 'warmup',
    questions: [workingQuestion(1), workingQuestion(2), uncompilableQuestion(3)],
  }],
});

/*
 * Mirrors readAssignmentJson's catch. Kept in the test rather than imported
 * because that function lives inside App.jsx, which no test can import — which
 * is also why the source assertion at the bottom exists.
 */
const intakeResultFor = (rawText) => {
  try {
    parseAssignmentBlueprintText(rawText);
    return null;
  } catch (error) {
    let recoveredV5 = null;
    try {
      const document = JSON.parse(rawText);
      if (document && typeof document === 'object' && Number(document.schemaVersion) === 5) recoveredV5 = document;
    } catch {
      recoveredV5 = null;
    }
    if (!recoveredV5) {
      return { ok: false, errors: [error.message], warnings: [], sourceSchemaVersion: null, compilerDefect: false };
    }
    return {
      ok: false,
      errors: [error.message],
      warnings: [],
      parsed: { assignmentV5: recoveredV5, questions: [] },
      sourceSchemaVersion: 5,
      compilerDefect: false,
    };
  }
};

test('a V5 assignment whose compile throws on one question is still salvageable', () => {
  const result = intakeResultFor(assignmentText);
  assert.notEqual(result, null, 'this fixture must actually make the compiler throw, or it is testing nothing');
  assert.match(result.errors[0], /does not contain enough mathematical intent/, 'expected the real compiler message');

  assert.equal(
    canSalvageV5IntakeResult(result),
    true,
    'one question the compiler refuses must not cost the teacher the other nineteen; this is the exact case the repair workspace was built for',
  );
});

test('the salvaged draft keeps every question, including the ones that were fine', () => {
  const result = intakeResultFor(assignmentText);
  const draft = buildIncompleteAssignmentDraftRecord({
    intakeResult: result,
    rawText: assignmentText,
    sourceName: 'gemini-code-1788749036998.json',
    ownerUid: 'teacher-uid',
  });

  assert.equal(draft.authoringState, 'incomplete');
  assert.equal(draft.title, 'Transformations to Absolute Value Functions');
  assert.equal(draft.authoringReview.questionCount, 3, 'the working questions must survive with the broken one');

  const canonical = JSON.parse(draft.authoringDraft.canonicalJson);
  const ids = canonical.sections.flatMap((section) => section.questions.map((question) => question.questionId));
  assert.deepEqual(ids, ['q-1', 'q-2', 'q-3'], 'the draft must hold the authored assignment, not just the failing question');
});

test('genuinely unreadable input is still rejected rather than salvaged', () => {
  assert.equal(canSalvageV5IntakeResult(intakeResultFor('{ not json at all')), false);
  assert.equal(
    canSalvageV5IntakeResult(intakeResultFor(JSON.stringify({ schemaVersion: 3, questions: [] }))),
    false,
    'an older unsupported format has no V5 to repair and must keep failing',
  );
});

/*
 * The recovery lives in App.jsx, which is .jsx: no test can import it, the build
 * does not typecheck it, and lint here has no no-undef. The behaviour above is
 * therefore verified against a copy, and this asserts the copy still matches the
 * original.
 */
test('readAssignmentJson recovers the V5 document instead of discarding it on a throw', () => {
  const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  const start = appSource.indexOf('parsed = parseAssignmentBlueprintText(rawText);');
  assert.notEqual(start, -1, 'readAssignmentJson must still compile through parseAssignmentBlueprintText');
  const handler = appSource.slice(start, appSource.indexOf('validateAssignmentQuestions', start));

  assert.match(handler, /JSON\.parse\(rawText\)/,
    'the catch must re-read the raw text, or a compile throw discards a perfectly legible V5 and salvage cannot fire');
  assert.match(handler, /Number\(document\.schemaVersion\) === 5/,
    'only a V5 document may be recovered this way');
  assert.match(handler, /parsed:\s*\{\s*assignmentV5:\s*recoveredV5/,
    'the recovered document must be returned where canSalvageV5IntakeResult looks for it');
  assert.match(handler, /sourceSchemaVersion:\s*5/,
    'the recovered result must report schema version 5, which the salvage check also requires');
});
