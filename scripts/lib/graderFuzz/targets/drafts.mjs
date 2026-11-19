/*
 * FUZZ TARGET: A SAVED DRAFT READS BACK AS IT WAS SAVED, AND REOPENS.
 *
 * PR #553's crash came back on every reload because the value that broke the
 * question was in the student's saved draft. A draft is typed work that
 * outlives the screen it was typed on, so whatever a box can hold must
 * survive being saved, read back and opened again. Three kinds of draft:
 *
 *   response   an ordinary question's answers as the workspace draft store
 *              keeps them (workspaceDraftSchema.mjs sanitizeWorkspaceDraftValue),
 *              then as the server rebuilds a response from the draft at a
 *              deadline (workspaceDraftRecovery.mjs responseFromDraftEntry)
 *   algebra    a Step Algebra equation draft, reopened (rehydrateAlgebraDraft)
 *   radical    a radical solve's recorded candidate check and solution set,
 *              reopened and drawn (relationRadicalToolsModel.js: the helpers
 *              PR #553 added)
 *
 * PROPERTIES
 *
 *   never-throws        saving, reading back and reopening never throw
 *   round-trips         what was saved is what is read back, exactly; a typed
 *                       value is never refused by the draft store
 *   recovered-verdict   the server gives a draft it recovers the verdict it
 *                       would have given the same answers had they been
 *                       submitted
 *   reopens-the-same    a reopened draft, saved and reopened again, is unchanged
 *   reopen-time-grows-with-length
 *                       reopening a Step Algebra draft costs in proportion to
 *                       the equation it holds, not exponentially more
 */
import { isDeepStrictEqual } from 'node:util';

import { normalizeOrdinaryResponse, gradeMultiAnswerResponse, gradeTableResponse } from '../../../../functions/shared/ordinaryResponseGrading.mjs';
import { gradeServerResponse } from '../../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { readExactValue } from '../../../../functions/shared/serverGrading/stepAlgebraRadicalGrading.mjs';
import { responseFromDraftEntry } from '../../../../functions/shared/workspaceDraftRecovery.mjs';
import { sanitizeWorkspaceDraftValue } from '../../../../functions/shared/workspaceDraftSchema.mjs';
import { rehydrateAlgebraDraft, ALGEBRA_DRAFT_VERSION } from '../../../../src/algebraDraftState.js';
import {
  isRecordedCheck,
  readCheckDraft,
  readSolutionSetDraft,
  relationLatex,
  restorableSolutionSet,
  typedValueLatex,
} from '../../../../src/relationRadicalToolsModel.js';
import { errorLine, finding } from '../findings.mjs';
import { FREE_CLASSES, typedInput } from '../inputs.mjs';
import { cases as questionCases } from './questionResponses.mjs';

export const id = 'drafts';

const plain = (value) => JSON.parse(JSON.stringify(value));
const SUFFIX = { literal: 'literal', orderedPair: 'ordered-pair', system: 'system', multiAnswer: 'multi-answer', table: 'table' };
const typedValue = (rng) => typedInput(rng, rng.pick(FREE_CLASSES), { maxLength: 600 }).text;
// A Step Algebra draft's own text: every class but `long`. A long chain there
// does not come back at all (see algebra-growth below), and a run that never
// ends reports nothing.
const SHORT_CLASSES = FREE_CLASSES.filter((inputClass) => inputClass !== 'long');
const shortTypedValue = (rng) => typedInput(rng, rng.pick(SHORT_CLASSES)).text;

/*
 * HOW REOPENING A STEP ALGEBRA DRAFT GROWS WITH THE EQUATION IT HOLDS.
 *
 * Each balanced move adds a term to both sides, and nothing makes a student
 * combine them, so a side can hold many terms. Reopening a draft with a move
 * in progress rebuilds that move (makePendingMove). Until mathjs's
 * simplifyCore was ported without its discarded call (simplifyCoreOnce.mjs,
 * issue #559), that cost doubled with every term: 18 terms took over twenty
 * times as long as 9, and 24 did not finish. A time limit would depend on the
 * machine; the RATIO does not, so that is what is held.
 */
const GROWTH_TERMS = Object.freeze({ short: 9, long: 18 });
const GROWTH_RATIO_LIMIT = 8;
const growthDraft = (terms) => ({
  algebraDraftVersion: ALGEBRA_DRAFT_VERSION,
  equation: { left: `2x${'+1'.repeat(terms)}`, right: '7' },
  pendingMove: { operation: 'subtract', operandExpression: '3' },
  workSteps: [],
});

export const cases = function* cases({ rng, count, maxLength = 2000 }) {
  const responses = questionCases({ rng: rng.fork('responses'), count: count * 3, maxLength });
  // Once a run: it costs about a second.
  if (count >= 4) yield { target: id, kind: 'algebra-growth', source: 'synthetic:algebra-growth', terms: GROWTH_TERMS };
  for (let index = 0; index < count; index += 1) {
    const kind = ['response', 'response', 'algebra', 'radical'][index % 4];
    if (kind === 'response') {
      let next = responses.next();
      while (!next.done && !SUFFIX[next.value.question.type]) next = responses.next();
      if (next.done) return;
      const { source, question, answers, input } = next.value;
      yield { target: id, kind, source, question, answers, input };
    } else if (kind === 'algebra') {
      const side = () => (rng.chance(0.4) ? rng.pick(['2x + 3', '7', 'x', '3(x - 2)', 'x/4']) : shortTypedValue(rng));
      const equation = () => ({ left: side(), right: side() });
      yield {
        target: id,
        kind,
        source: 'synthetic:algebra-draft',
        initialEquation: { left: '2x + 3', right: '7' },
        draft: {
          algebraDraftVersion: rng.pick([ALGEBRA_DRAFT_VERSION, ALGEBRA_DRAFT_VERSION, 1, undefined, shortTypedValue(rng)]),
          equation: rng.chance(0.85) ? equation() : rng.pick([null, {}, { left: shortTypedValue(rng) }, shortTypedValue(rng)]),
          pendingMove: rng.chance(0.6) ? { operation: rng.pick(['add', 'subtract', 'multiply', 'divide', shortTypedValue(rng)]), operandExpression: shortTypedValue(rng), placementBySide: rng.pick([undefined, { left: 'end', right: 'start' }, { left: shortTypedValue(rng) }]) } : null,
          simplificationAnswers: rng.chance(0.5) ? { left: shortTypedValue(rng), right: shortTypedValue(rng) } : undefined,
          workSteps: Array.from({ length: rng.int(0, 3) }, () => ({ before: equation(), after: equation(), description: shortTypedValue(rng) })),
          structureTool: rng.pick([null, undefined, { kind: shortTypedValue(rng), side: 'left' }]),
        },
      };
    } else {
      yield {
        target: id,
        kind,
        source: 'synthetic:radical-draft',
        check: { left: typedValue(rng), right: typedValue(rng), choice: rng.pick(['valid', 'extraneous', null, typedValue(rng)]) },
        solutionSet: { none: rng.chance(0.15), values: Array.from({ length: rng.int(0, 5) }, () => (rng.chance(0.85) ? typedValue(rng) : rng.pick([null, 4, {}, []]))) },
      };
    }
  }
};

const responseDraft = (fuzzCase, report, guard) => {
  const { question, answers } = fuzzCase;
  const key = `mathmaster:draft:student-1:assignment-1:0:0:${SUFFIX[question.type]}`;
  const value = ['multiAnswer', 'table'].includes(question.type) ? { ...answers } : String(answers.value ?? '');

  const saved = guard('save', () => sanitizeWorkspaceDraftValue(value, { key }));
  if (!saved) return;
  if (!saved.ok) {
    // An answer box whose id is a forbidden key is the author's doing, not the student's.
    if (saved.reason !== 'forbidden-key') report('round-trips', `response/${question.type}/refused:${saved.reason}`, `the draft store refused a ${question.type} draft (${saved.reason})`);
    return;
  }
  const readBack = guard('read', () => JSON.parse(saved.json));
  if (readBack === undefined) return;
  if (!isDeepStrictEqual(readBack, value)) report('round-trips', `response/${question.type}/changed`, `a ${question.type} draft read back differently from how it was saved`);

  const recovered = guard('recover', () => responseFromDraftEntry({ key, value: readBack }));
  if (recovered === undefined) return;
  // What submitting the same answers sends.
  const device = question.type === 'multiAnswer' ? gradeMultiAnswerResponse(question, answers) : question.type === 'table' ? gradeTableResponse(question, answers) : null;
  const submitted = plain(normalizeOrdinaryResponse({ question, answerState: device ? { parts: device.parts } : { responseKey: value } }));
  const verdict = (response) => {
    if (!response) return 'no-response';
    const result = gradeServerResponse({ question, response });
    return result.graded ? `graded:${result.isCorrect === true}` : 'ungraded';
  };
  const fromDraft = guard('grade-recovered', () => verdict(recovered));
  const fromSubmit = guard('grade-submitted', () => verdict(submitted));
  if (fromDraft === undefined || fromSubmit === undefined) return;
  // A draft with nothing in it is no response; submitted, it is refused as blank. Both are "no mark".
  const noMark = (value_) => value_ === 'no-response' || value_ === 'ungraded';
  if (fromDraft !== fromSubmit && !(noMark(fromDraft) && noMark(fromSubmit))) {
    report('recovered-verdict', `${question.type}/${fuzzCase.input?.inputClass || 'value'}/draft=${fromDraft},submitted=${fromSubmit}`,
      `${question.type}: recovered from the draft the server says ${fromDraft}; submitted, it says ${fromSubmit}`);
  }
};

const algebraDraft = (fuzzCase, report, guard) => {
  const reopen = (draft) => rehydrateAlgebraDraft({ draft, initialEquation: fuzzCase.initialEquation });
  // The first reopen may migrate an older draft (it drops fields the current
  // version no longer keeps), so "the same" is held from the second on.
  let saved = plain(fuzzCase.draft);
  const reopened = [];
  for (const step of ['reopen', 'reopen-again', 'reopen-a-third-time']) {
    const next = guard(step, () => reopen(plain(saved)));
    if (next === undefined || next === null) return;
    saved = guard('save', () => plain(next));
    if (saved === undefined) return;
    reopened.push(saved);
  }
  if (!isDeepStrictEqual(reopened[1], reopened[2])) report('reopens-the-same', 'algebra', 'a Step Algebra draft, reopened and saved twice, changed when reopened a third time');
};

const algebraGrowth = (fuzzCase, report, guard) => {
  const reopenMs = (terms) => {
    const draft = growthDraft(terms);
    // The best of three: the first call also pays for loading the engine.
    let best = Infinity;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const started = performance.now();
      rehydrateAlgebraDraft({ draft: plain(draft), initialEquation: { left: '2x + 3', right: '7' } });
      best = Math.min(best, performance.now() - started);
    }
    return best;
  };
  const short = guard('reopen', () => reopenMs(fuzzCase.terms.short));
  const long = guard('reopen', () => reopenMs(fuzzCase.terms.long));
  if (short === undefined || long === undefined) return;
  const ratio = long / Math.max(short, 1);
  if (ratio > GROWTH_RATIO_LIMIT) {
    report('reopen-time-grows-with-length', 'algebra',
      `reopening a Step Algebra draft with a move in progress took ${Math.round(short)} ms at ${fuzzCase.terms.short} terms and ${Math.round(long)} ms at ${fuzzCase.terms.long}: ${Math.round(ratio)} times as long for twice the terms`);
  }
};

const radicalDraft = (fuzzCase, report, guard) => {
  const { check, solutionSet } = fuzzCase;
  // Every helper the radical tools draw a saved value through.
  for (const value of [check.left, check.right, ...(Array.isArray(solutionSet.values) ? solutionSet.values : [])]) {
    const drawn = guard('typedValueLatex', () => typedValueLatex(value));
    if (drawn !== undefined && typeof drawn !== 'string') report('never-throws', 'radical/typedValueLatex/not-text', 'typedValueLatex returned something that is not text');
    guard('relationLatex', () => relationLatex(value));
    guard('readExactValue', () => readExactValue(value));
  }
  const recorded = guard('readCheckDraft', () => readCheckDraft(check));
  if (recorded?.ok) {
    const reopened = plain(recorded.entry);
    if (guard('isRecordedCheck', () => isRecordedCheck(reopened)) === false) report('round-trips', 'radical/check', 'a recorded candidate check is not read as recorded after it is saved');
  }
  const set = guard('readSolutionSetDraft', () => readSolutionSetDraft(solutionSet));
  if (set?.ok) {
    const restored = guard('restorableSolutionSet', () => restorableSolutionSet(plain(set.set)));
    if (restored !== undefined && !isDeepStrictEqual(restored, set.set)) report('round-trips', 'radical/solution-set', `a recorded solution set ${JSON.stringify(set.set)} is restored as ${JSON.stringify(restored)}`);
  }
  guard('restorableSolutionSet', () => restorableSolutionSet(plain(solutionSet)));
};

export const check = async (fuzzCase) => {
  const found = [];
  const report = (property, signature, message, severity) => found.push(finding({ target: id, property, signature, message, repro: fuzzCase, severity }));
  /** Run one step: its value, or undefined after reporting what it threw. */
  const guard = (step, run) => {
    try {
      return run();
    } catch (error) {
      report('never-throws', `${fuzzCase.kind}/${step}/${errorLine(error)}`, `${step} threw on a ${fuzzCase.kind} draft: ${error?.message}`);
      return undefined;
    }
  };
  if (fuzzCase.kind === 'response') responseDraft(fuzzCase, report, guard);
  else if (fuzzCase.kind === 'algebra') algebraDraft(fuzzCase, report, guard);
  else if (fuzzCase.kind === 'algebra-growth') algebraGrowth(fuzzCase, report, guard);
  else radicalDraft(fuzzCase, report, guard);
  return found;
};
