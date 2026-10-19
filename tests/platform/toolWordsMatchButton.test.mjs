import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource, region } from './helpers/sourceContract.mjs';

/*
 * WORDS THAT MATCH THE BUTTON (student pass 3, wave 7; D9;
 * STUDENT_PASS3_SUBMIT_AND_FINISH.md "Not done").
 *
 * A sentence that tells the student which button to press names it as it
 * reads (useSubmitActionName: the host's label, "Submit" where the press
 * spends a try, the tool's own word elsewhere), and no student sentence says
 * "token form". Rewrite Linear Form and the Transformations Lab are rendered
 * in toolDirectionsSplit.test.mjs; Matrix Lab in tests/tools/matrixLabFeedback
 * and tests/browser/matrixLabFeedback.mjs; the Sign Solution review in
 * tests/tools/signSolutionAnalyzerSolutionReview.
 */
const read = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

test('the relation solver\'s recorded notice names the number line\'s button as it reads', () => {
  const core = read('src/MultiRelationAlgebraCore.jsx');
  assert.match(core, /import \{ useSubmitActionName, useToolRuntimeContext \} from '\.\/tools\/shared\/ToolRuntimeContext';/);
  // The same default the number line's own button uses (useSubmitLabel('Check')).
  assert.match(read('src/tools/intervalNumberLine/IntervalNumberLine.jsx'), /const submitActionLabel = useSubmitLabel\('Check'\);/);
  assert.match(core, /const representationActionName = useSubmitActionName\('Check'\);/);
  const notice = region(core, 'data-representation-recorded="true"', '</p>', 'the recorded notice');
  const presses = notice.match(/press [^.]+ again/g) || [];
  assert.equal(presses.length, 2, 'both notices tell the student what to press');
  presses.forEach((press) => assert.equal(press, 'press ${representationActionName} again'));
});

test('no student sentence in the systems workspace says "token form"', () => {
  const mode = read('src/tools/systemsWorkspace/AlgebraicSystemMode.jsx');
  const strings = mode.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) || [];
  assert.deepEqual(strings.filter((text) => /token form/i.test(text)), []);
  const parse = region(mode, "slotAttempt.reason === 'expression-parse'", ": 'That variable", 'the parse-failure message');
  assert.match(parse, /could not open the next solving step from that form of the expression\. Your work is still here\. Choose Change expression/);
});

test('My Math Path\'s unconfirmed-submission line names no button: it serves two that read differently', () => {
  // handleSubmitAnswer's error serves both Path routes: a tool question goes
  // through QuestionEngine (serverGrading.submit), whose button reads
  // "Submit — …"; every other question uses the player's own button,
  // "Check my answer". So the retry line says "try again" (review S2').
  const player = read('src/components/student/PathSessionPlayer.jsx');
  assert.match(player, /<QuestionEngine\b[\s\S]*serverGrading=/, 'tool questions submit through QuestionEngine');
  assert.doesNotMatch(region(player, '<QuestionEngine', '/>', 'the Path question'), /submitLabel=/, 'which names its button Submit');
  assert.match(player, /\{isSubmitting \? 'Checking…' : 'Check my answer'\}/, 'the player\'s own button');
  const container = read('src/components/student/MyMathPathProductionContainer.jsx');
  assert.match(container, /Submission was not confirmed\. Check your connection and try again — MathMaster reuses the same submission ID/);
  assert.doesNotMatch(container, /press (Check|Submit)\b/);
});
