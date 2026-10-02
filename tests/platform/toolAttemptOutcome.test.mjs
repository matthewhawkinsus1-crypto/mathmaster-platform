import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { createAttemptOutcomeSlots } from '../../src/tools/shared/attemptOutcomeSlots.js';

const code = (path) => executableSource(readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));
const engine = code('src/QuestionEngine.jsx');
const shell = code('src/tools/shared/ToolShell.jsx');

/*
 * PLATFORM QUIRKS AUDIT PQ-022: AFTER A TOOL'S CHECK, THE OUTCOME IS WHERE THE
 * STUDENT IS LOOKING.
 *
 * QuestionEngine's "Not quite. You have N attempts remaining" rendered below the
 * whole tool — 357–403px below Check at 1366x768, 180px on a 390x844 phone, off
 * screen every time — while the tool's own "Not yet" sat beside Check. A tool's
 * verdict area now offers a slot; the outcome of the attempt goes to the slot
 * that mounted with the verdict of the Check just pressed, or stays in the
 * engine's box when there is none. tests/browser/toolAttemptOutcome.mjs drives
 * it; this pins the rule and its wiring.
 */
test('the outcome goes to the verdict mounted most recently, and to nobody when none is mounted', () => {
  const slots = createAttemptOutcomeSlots();
  assert.equal(slots.latest(), null, 'no verdict on screen: the engine keeps its box');
  const stage = slots.register();
  const verdict = slots.register();
  assert.notEqual(stage, verdict);
  assert.equal(slots.latest(), verdict, 'the verdict of the Check just pressed mounted last');
  slots.unregister(verdict);
  assert.equal(slots.latest(), stage);
  const again = slots.register();
  assert.ok(again !== verdict && again !== stage, 'a remounted verdict is a new slot, so a stale owner never matches it');
  slots.unregister(stage);
  slots.unregister(again);
  assert.equal(slots.latest(), null);
});

test('the engine hands an attempt to the latest slot only for a tool it graded itself', () => {
  const handler = region(engine, 'const handleMissingToolAction', 'const handleModelingLabGrade', 'the tool attempt handler');
  // Server grading: the tool shows no verdict of its own, so no owner is set
  // and the engine's box shows the server's result.
  const server = region(handler, 'if (serverGrading) {', '\n      return;', 'the server-graded branch');
  assert.doesNotMatch(server, /setToolOutcomeOwner/);
  // Graded here: the owner is chosen right after the feedback it belongs to.
  assert.match(handler, /setFeedback\(nextFeedback\);[\s\S]{0,400}setToolOutcomeOwner\(\{ feedback: nextFeedback, slot: toolOutcomeSlots\.latest\(\), id: toolOutcomeSequenceRef\.current \}\);/);
  // An owner never carries over to another attempt's feedback.
  assert.match(engine, /const toolOutcomeSlot = toolOutcomeOwner && toolOutcomeOwner\.feedback === feedback \? toolOutcomeOwner\.slot : null;/);
});

test('only a standalone registry tool is handed the outcome; a composed question keeps the box', () => {
  const tool = region(engine, 'if (missingToolDefinition) {', '</ToolRuntimeProvider>', 'the registry tool mount');
  assert.match(tool, /<ToolRuntimeProvider[^>]*attemptOutcome=\{toolAttemptOutcome\}[^>]*attemptOutcomeSlots=\{toolOutcomeSlots\}/);
  // renderModule's composed branch: everything before the registry branch.
  const composed = region(engine, 'const renderModule = () => {', 'if (missingToolDefinition) {', 'the composed question mount');
  assert.match(composed, /<ToolRuntimeProvider\b[^>]*>\s*<WorkflowRunner\b/, 'the region is the composed mount');
  assert.doesNotMatch(composed, /attemptOutcome/, 'composed questions are submitted by the engine and keep its box');
});

test('a tool question with an earlier attempt keeps the outcome of its new one', () => {
  // A registry tool never reports answerState, whose response key stays ''.
  // Compared with a recorded attempt's key, '' read as "the answer changed"
  // and the new outcome was cleared the instant it arrived.
  const clearing = region(engine, "if (missingToolDefinition) return;", '}, [answerState.responseKey', 'the stale-feedback clearing');
  assert.match(clearing, /setFeedback\(null\)/);
  assert.ok(engine.indexOf('if (missingToolDefinition) return;') < engine.indexOf("answerState.responseKey !== lastSubmittedResponseKey"));
});

test('every verdict pill offers the slot except a stage check, and a live verdict joins it inline', () => {
  const pill = region(shell, 'export const ResultPill', '\n};', 'ResultPill');
  assert.match(pill, /\{stageCheck \? null : <AttemptOutcome \/>\}/);
  const slot = region(shell, 'export const AttemptOutcome', 'export const ResultPill', 'the slot');
  // It joins the registry while mounted, and leaves it when unmounted.
  assert.match(slot, /const token = attemptOutcomeSlots\.register\(\);[\s\S]*return \(\) => attemptOutcomeSlots\.unregister\(token\);/);
  // Stage and step pills are not where an attempt's outcome belongs.
  assert.match(code('src/tools/representationBridge/RepresentationBridge.jsx'), /<ResultPill stageCheck ok=\{report\.passed\}>/);
  assert.match(code('src/tools/inverseComposition/InverseDerivationLab.jsx'), /<ResultPill stageCheck ok>y isolated<\/ResultPill>/);
  // Regression Calculator's verdict is itself a live region: the outcome is
  // read as part of it, not as a second announcement.
  const regression = code('src/tools/regressionCalculator/RegressionCalculator.jsx');
  assert.match(regression, /<p role="status">\{feedbackText\}<AttemptOutcome inline \/><\/p>/);
  assert.match(regression, /import ToolShell, \{[^}]*\bAttemptOutcome\b[^}]*\} from '\.\.\/shared\/ToolShell';/);
});
