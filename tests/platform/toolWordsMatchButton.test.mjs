import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { executableSource, region } from './helpers/sourceContract.mjs';
import { closeEngine, loadEngine } from './helpers/actionBarRender.mjs';
import { buttonsOf, render, withBrowser } from './helpers/studentToolRender.mjs';

after(closeEngine);

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
  // The same default the number line's own button uses (useSubmitLabel('Check')),
  // and the same host label: the nested button is never "Submit" (TL29), so the
  // notice does not call it that either.
  assert.match(read('src/tools/intervalNumberLine/IntervalNumberLine.jsx'), /const submitActionLabel = useSubmitLabel\('Check'\);/);
  assert.match(core, /const representationActionName = useHostSubmitLabel\(\) \|\| 'Check';/);
  assert.doesNotMatch(core, /useSubmitActionName/, 'the cost never reaches the nested stage\'s words');
  const notice = region(core, 'data-representation-recorded="true"', '</p>', 'the recorded notice');
  const presses = notice.match(/press [^.]+ again/g) || [];
  assert.equal(presses.length, 2, 'both notices tell the student what to press');
  presses.forEach((press) => assert.equal(press, 'press ${representationActionName} again'));
});

/*
 * TL29 (finding C1-88): the registry tool above the solver — the Systems
 * Workspace — tells everything beneath it what ITS final action costs. The
 * solver's number line only records the graph (the solver grades it at the
 * host's Submit), so it must not read "Submit — uses 1 of 3 tries".
 */
test('TL29: the number line inside the relation solver never says Submit or a cost; a secure host\'s label still wins', async () => {
  const { server } = await loadEngine();
  const { ToolRuntimeProvider } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const Solver = (await server.ssrLoadModule('/src/MultiRelationAlgebraCore.jsx')).default;
  // x > 3 is already solved, so the solver goes straight to its number-line stage.
  const question = { type: 'stepAlgebra', equation: 'x > 3', prompt: 'Solve.' };
  const finalActions = async (runtime) => buttonsOf(await withBrowser(() => render(
    React.createElement(ToolRuntimeProvider, runtime, React.createElement(Solver, { question, questionRecord: null, draftKey: 'tl29' })),
  ))).filter((button) => button.finalAction).map((button) => button.text);
  const COST = 'uses 1 of 3 tries';
  const free = await finalActions({});
  assert.ok(free.length > 0 && free.every((text) => text === 'Check'), `the stage is on screen with a free Check: ${free}`);
  for (const showImmediateFeedback of [true, false]) {
    assert.deepEqual(await finalActions({ submitCost: COST, showImmediateFeedback }), free, `a host that charges a try (outcomes ${showImmediateFeedback ? 'shown' : 'withheld'}) does not change the nested button`);
  }
  assert.deepEqual(await finalActions({ submitCost: 'last try' }), free);
  const secure = await finalActions({ submitLabel: 'Record answer', submitCost: 'your only try' });
  assert.ok(secure.length === free.length && secure.every((text) => text === 'Record answer'), `a secure host's own word is kept: ${secure}`);
});

test('TL29: only the solver\'s nested stage drops the cost; a number line mounted by a question still says what it costs', async () => {
  const { server } = await loadEngine();
  const { ToolRuntimeProvider, NoTryCostScope, SubmitText } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const probe = (cost, scoped) => withBrowser(() => render(React.createElement(
    ToolRuntimeProvider,
    { submitCost: cost, hintsAllowed: false, showImmediateFeedback: false },
    scoped ? React.createElement(NoTryCostScope, null, React.createElement(SubmitText, null, 'Check')) : React.createElement(SubmitText, null, 'Check'),
  )));
  assert.match(await probe('uses 1 of 3 tries', false), /Submit — uses 1 of 3 tries/, 'outside the scope the host\'s cost stands');
  assert.doesNotMatch(await probe('uses 1 of 3 tries', true), /Submit|tries/, 'inside it there is none');
  // The scope hides the cost and nothing else of what the host said.
  const { default: Context } = await server.ssrLoadModule('/src/tools/shared/ToolRuntimeContext.jsx');
  const Reader = () => {
    const runtime = React.useContext(Context);
    return React.createElement('i', null, JSON.stringify([runtime.hintsAllowed, runtime.showImmediateFeedback, runtime.verdictsWithheld, runtime.submitCost]));
  };
  const markup = await withBrowser(() => render(React.createElement(
    ToolRuntimeProvider,
    { submitCost: 'last try', hintsAllowed: false, showImmediateFeedback: false, verdictsWithheld: true },
    React.createElement(NoTryCostScope, null, React.createElement(Reader)),
  )));
  assert.match(markup, /\[false,false,true,null\]/);
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
  // The line goes through the student translator now (MP09); its own words
  // still say "try again" and name no button.
  const unconfirmed = container.match(/setSubmissionError\(`\$\{studentErrorSentence\(caught, '([^']+)'\)\}([^`]*)`\)/);
  assert.ok(unconfirmed, 'the unconfirmed-submission line');
  assert.match(`${unconfirmed[1]}${unconfirmed[2]}`, /try again/i);
  assert.doesNotMatch(`${unconfirmed[1]}${unconfirmed[2]}`, /press (Check|Submit)\b/);
  assert.doesNotMatch(container, /press (Check|Submit)\b/);
});
