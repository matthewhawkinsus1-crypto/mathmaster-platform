// LANGUAGE ACCESS — THE WORDS AROUND THE TASK, NEVER THE TASK.
//
// Translation, Vocabulary, Read aloud, Break it down and Help me say it
// (src/platform/language/). Each must leave the mathematics exactly as
// authored, appear only where the item actually has the resource behind it,
// and record what was really on the screen — never "available" because a
// language is set. Synthetic content only.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { maskMath, mathTokensOf, preservesMath, segmentMathText, splitSentences, unmaskMath } from '../../src/platform/language/mathSafeText.js';
import { mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import {
  TRANSLATION_COVERAGE, compileTemplates, loadLanguagePack, resolveTranslation, translateWithPack,
} from '../../src/platform/language/translationProviders.js';
import { TOOL_VOCABULARY, VOCABULARY_IDS, loadMathGlossary, vocabularyForContext, vocabularyInText } from '../../src/platform/language/mathVocabulary.js';
import { chunkDirections } from '../../src/platform/language/directionChunks.js';
import { FRAME_SETS, GENERAL_FRAMES, asksForExplanation, sentenceFramesFor } from '../../src/platform/language/sentenceFrames.js';
import {
  SUPPORT_TOOL, TOOL_STATE, pathDeliveryOf, supportToolsForItem, toolEvidence, toolEvidenceRecords,
  toolsEntitlementFromPath, toolsEntitlementFromProfile, visibleTools, withTranslation,
} from '../../src/platform/language/supportToolsModel.js';
import * as esPack from '../../src/platform/language/packs/es.js';
import { buildSupportProjection } from '../../functions/shared/supportProfileModel.mjs';
import { applyStudentSupportToQuestion } from '../../src/studentSupport.js';

const NOW = Date.parse('2026-10-06T15:00:00Z');

// --- Math-safe text ---------------------------------------------------------------------------------

test('mathematics is found and carried exactly: equations, coordinates, fractions, inequalities, functions', () => {
  const cases = [
    ['Graph y = -2/3x + 7 and name the point (0, 7).', ['y = -2/3x + 7', '(0, 7)']],
    ['Solve $2x+3=7$ for x.', ['$2x+3=7$', 'x']],
    ['If 3 < x ≤ 7, what is the domain [0, 5)?', ['3 < x ≤ 7', '[0, 5)']],
    ['Find the y-intercept of f(x) = 3x - 2.', ['f(x) = 3x - 2']],
    ['A student factors $x^2+5x+6$ as $(x+2)(x+3)$.', ['$x^2+5x+6$', '$(x+2)(x+3)$']],
    ['Use log(100) and 2.5 (in dollars).', ['log(100)', '2.5']],
  ];
  cases.forEach(([text, tokens]) => {
    const segments = segmentMathText(text);
    assert.equal(segments.map((segment) => segment.value).join(''), text, 'segmentation is lossless');
    assert.deepEqual(segments.filter((segment) => segment.kind === 'math').map((segment) => segment.value), tokens, text);
    const { masked, tokens: masks } = maskMath(text);
    assert.equal(unmaskMath(masked, masks), text);
  });
  // Vocabulary is prose, not mathematics.
  assert.deepEqual(mathTokensOf('the y-intercept on the x-axis'), []);
  // "A line …" is an article; "Type A, B" is a label.
  assert.deepEqual(mathTokensOf('A line passes through the origin.'), []);
  assert.deepEqual(mathTokensOf('Type A, B, C, or D.'), ['A', 'B', 'C', 'D']);
  // Spanish "y" / "o" between mathematics are words.
  assert.deepEqual(mathTokensOf('Una recta pasa por (2, 3) y (4, 7).', { language: 'es' }), ['(2,3)', '(4,7)']);
  assert.deepEqual(mathTokensOf('Grafica y = 2x + 1.', { language: 'es' }), ['y=2x+1']);
});

test('a language step that damages the mathematics is refused', () => {
  const { tokens } = maskMath('Solve 2x + 3 = 7 for x.');
  assert.equal(unmaskMath('Resuelve ⟦0⟧ para ⟦1⟧.', tokens), 'Resuelve 2x + 3 = 7 para x.');
  assert.equal(unmaskMath('Resuelve ⟦0⟧.', tokens), null, 'a slot dropped');
  assert.equal(unmaskMath('Resuelve ⟦0⟧ para ⟦0⟧ y ⟦1⟧.', tokens), null, 'a slot duplicated');
  assert.ok(preservesMath('Graph y = 2x + 1.', 'Grafica y = 2x + 1.', { language: 'es' }));
  assert.ok(!preservesMath('Graph y = 2x + 1.', 'Grafica y = 2x - 1.', { language: 'es' }));
  assert.deepEqual(splitSentences('Solve 2.5x = 10. Then check. Is 4 right?'), ['Solve 2.5x = 10.', 'Then check.', 'Is 4 right?']);
});

// --- Read aloud -------------------------------------------------------------------------------------

test('read aloud says mathematics as mathematics, and never reads vocabulary as an operation', () => {
  assert.equal(speechTextFor('Graph y = -2/3x + 7.'), 'Graph y equals negative 2 over 3 x plus 7.');
  assert.equal(speechTextFor('Solve $2x+3=7$.'), 'Solve 2x plus 3 equals 7.');
  assert.equal(speechTextFor('What is $\\frac{3}{4}$ of 12?'), 'What is 3 over 4 of 12?');
  assert.equal(speechTextFor('If 3 < x ≤ 7, what is |x - 5|?'), 'If 3 is less than x is less than or equal to 7, what is the absolute value of x minus 5?');
  assert.equal(speechTextFor('A line passes through (2, 3).'), 'A line passes through the point 2, 3.');
  assert.equal(speechTextFor('Find the y-intercept of f(x) = 3x - 2.'), 'Find the y-intercept of f of x equals 3x minus 2.');
  assert.equal(speechTextFor('Factor to get (x + 2)(x + 3).'), 'Factor to get the quantity x plus 2 times the quantity x plus 3.');
  assert.equal(speechTextFor('It costs $4.50, about 25% off.'), 'It costs 4.50 dollars, about 25 percent off.');
  assert.equal(mathToSpeech('y = -2/3x + 7', { language: 'es' }), 'y es igual a negativo 2 sobre 3 x más 7');
  assert.equal(speechTextFor(''), '');
});

// --- Translation ------------------------------------------------------------------------------------

test('translation: authored first, then the curated pack; full, partial, none and not applicable are different facts', async () => {
  const authored = await resolveTranslation({ question: { prompt: 'Solve x + 2 = 5.', translations: { es: { prompt: 'Resuelve x + 2 = 5.' } } }, language: 'es' });
  assert.deepEqual([authored.coverage, authored.provider, authored.text], [TRANSLATION_COVERAGE.FULL, 'authored', 'Resuelve x + 2 = 5.']);

  const full = await resolveTranslation({ text: 'The lines y=-2x+6 and y=4x+6 are graphed. What is their solution?\n\nA) (0, 6)\nB) No solution\n\nType A, B, C, or D.', language: 'es' });
  assert.equal(full.coverage, TRANSLATION_COVERAGE.FULL);
  assert.equal(full.provider, 'curated');
  assert.match(full.text, /Las rectas y=-2x\+6 y y=4x\+6 están graficadas\./);
  assert.match(full.text, /B\) No tiene solución/);
  assert.ok(preservesMath('The lines y=-2x+6 and y=4x+6 are graphed.', full.text.split('\n')[0], { language: 'es' }));

  const partial = await resolveTranslation({ text: 'A farmer plants rows of corn. Solve 3x = 12.', language: 'es' });
  assert.equal(partial.coverage, TRANSLATION_COVERAGE.PARTIAL);
  assert.deepEqual(partial.sentences.map((sentence) => sentence.translated), [false, true]);

  const none = await resolveTranslation({ text: 'A farmer plants rows of corn in a field.', language: 'es' });
  assert.deepEqual([none.coverage, none.reason], [TRANSLATION_COVERAGE.NONE, 'no-translation-resource']);

  const onlyMath = await resolveTranslation({ text: '2x + 3 = 7', language: 'es' });
  assert.equal(onlyMath.coverage, TRANSLATION_COVERAGE.NOT_APPLICABLE);

  // A language with no pack and no authored translation is a gap, named.
  const vietnamese = await resolveTranslation({ text: 'Solve 3x = 12.', language: 'vi' });
  assert.deepEqual([vietnamese.coverage, vietnamese.reason], [TRANSLATION_COVERAGE.NONE, 'no-language-pack']);

  // An authored translation whose mathematics differs is never used.
  const broken = await resolveTranslation({ question: { prompt: 'Solve x + 2 = 5.', translations: { es: { prompt: 'Resuelve x + 3 = 5.' } } }, language: 'es' });
  assert.notEqual(broken.provider, 'authored');
});

test('the curated pack: every template carries each slot exactly once, and no template contains mathematics', () => {
  [...esPack.sentences, ...esPack.choices].forEach(([english, spanish]) => {
    const slots = (text) => (text.match(/\{(\d+)\}/g) || []).sort();
    assert.deepEqual(slots(spanish), slots(english), english);
    assert.equal(new Set(slots(english)).size, slots(english).length, `${english}: a slot used twice`);
    assert.doesNotMatch(english.replace(/\{\d+\}/g, ''), /[0-9=<>≤≥^]/, `${english}: mathematics belongs in a slot`);
  });
  const compiled = compileTemplates(esPack.sentences);
  assert.equal(compiled.length, esPack.sentences.length);
});

test('the language pack and the glossary are loaded on demand, never in the initial bundle', async () => {
  const providers = readFileSync(new URL('../../src/platform/language/translationProviders.js', import.meta.url), 'utf8');
  assert.match(providers, /es: \(\) => import\('\.\/packs\/es\.js'\)/);
  assert.doesNotMatch(providers, /^import .*packs\//m);
  const vocabulary = readFileSync(new URL('../../src/platform/language/mathVocabulary.js', import.meta.url), 'utf8');
  assert.match(vocabulary, /import\('\.\/glossary\/mathGlossaryEntries\.js'\)/);
  assert.doesNotMatch(vocabulary, /^import .*mathGlossaryEntries/m);
  const pack = await loadLanguagePack('es');
  assert.ok(pack.sentences.length > 100);
  assert.equal(await loadLanguagePack('xx'), null);
});

// --- Vocabulary -------------------------------------------------------------------------------------

test('vocabulary: every term has a definition and a Spanish entry, and no definition contains an item\'s answer', async () => {
  const glossary = await loadMathGlossary();
  assert.deepEqual(Object.keys(glossary).sort(), [...VOCABULARY_IDS].sort());
  Object.values(glossary).forEach((entry) => {
    assert.ok(entry.term && entry.definition && entry.es?.term && entry.es?.definition, entry.term);
  });
  // The brief's Algebra I/II list is covered.
  ['coefficient', 'constant', 'slope', 'y-intercept', 'rate-of-change', 'solution', 'inequality', 'system', 'substitution',
    'elimination', 'equivalent', 'factor', 'domain', 'range', 'correlation', 'causation', 'outlier', 'residual',
    'transformation', 'sequence', 'common-difference', 'discrete', 'continuous'].forEach((id) => assert.ok(glossary[id], id));
  // Dashed/solid explain the lines, never which symbol needs which.
  assert.doesNotMatch(glossary.dashed.definition + glossary.solid.definition, /[<>≤≥]/);
});

test('vocabulary is found in prose (never inside mathematics) and each rich tool brings its own words', () => {
  assert.deepEqual(vocabularyInText('Find the y-intercept and the rate of change of y = 3x + 2.'), ['y-intercept', 'rate-of-change']);
  assert.deepEqual(vocabularyInText('Solve 2x + 3 = 7.'), ['solution']);
  assert.ok(vocabularyForContext({ text: 'Solve 3(x + 2) = 18.', toolType: 'stepAlgebra' }).includes('distribute'));
  ['graphing2', 'systemsWorkspace', 'regressionCalculator', 'dataModelingLab', 'functionInvestigation2', 'sequenceExplorer', 'transformationsLab']
    .forEach((toolType) => assert.ok(TOOL_VOCABULARY[toolType]?.length, toolType));
  assert.ok(TOOL_VOCABULARY.graphing2.includes('boundary') && TOOL_VOCABULARY.graphing2.includes('shade'));
  assert.ok(TOOL_VOCABULARY.systemsWorkspace.includes('substitution') && TOOL_VOCABULARY.systemsWorkspace.includes('intersection'));
});

// --- Break it down ----------------------------------------------------------------------------------

test('break it down: the brief\'s example, curated; the same expectation, no new mathematics', () => {
  const steps = chunkDirections('Determine whether the relationship represented by the data demonstrates a positive, negative, or no correlation and justify your conclusion.');
  assert.equal(steps.source, 'curated');
  assert.deepEqual(steps.steps.map((step) => step.text), ['Look at the data.', 'Decide the type of correlation:', 'Explain how you know.']);
  assert.deepEqual(steps.steps[1].options, ['positive', 'negative', 'none']);
});

test('break it down: the item\'s own words, split at a joined instruction, mathematics untouched', () => {
  const graph = chunkDirections('Graph y = 2x - 3 for x ≥ -3, then state the range.');
  assert.deepEqual(graph.steps.map((step) => step.text), ['Graph y = 2x - 3 for x ≥ -3.', 'State the range.']);
  const regression = chunkDirections('Use quadratic regression to formulate the model $y=ax^2+bx+c$. Enter all three regression coefficients, then use that fitted model to predict y when $x=3$.');
  assert.equal(regression.steps.length, 3);
  assert.ok(preservesMath('Use quadratic regression to formulate the model $y=ax^2+bx+c$. Enter all three regression coefficients, then use that fitted model to predict y when $x=3$.', regression.steps.map((step) => step.text).join(' ')));
  // One short instruction is already one step.
  assert.equal(chunkDirections('Solve 2x + 3 = 7.'), null);
  // Authored steps may not introduce a number the item does not contain.
  assert.equal(chunkDirections('Solve 2x + 3 = 7.', { authoredSteps: ['Subtract 5 first.', 'Then divide.'] }), null);
  assert.equal(chunkDirections('Solve 2x + 3 = 7.', { authoredSteps: ['Read the equation.', 'Find x so both sides are equal.'] }).source, 'authored');
});

// --- Help me say it ---------------------------------------------------------------------------------

test('sentence frames: only where an item asks for words, topic first, and never an answer or a value', () => {
  assert.equal(asksForExplanation({ text: 'Solve 2x + 3 = 7.' }), false);
  assert.equal(sentenceFramesFor({ text: 'Solve 2x + 3 = 7.' }).applicable, false);
  assert.deepEqual(sentenceFramesFor({ text: 'Is the correlation positive or negative? Explain.' }).sets, ['correlation']);
  assert.deepEqual(sentenceFramesFor({ text: 'A student factors x^2+5x+6 as (x+2)(x+4). What is wrong?' }).sets, ['error-analysis']);
  assert.deepEqual(sentenceFramesFor({ text: 'Interpret the residual.', toolType: 'regressionCalculator' }).sets, ['residual-model']);
  const frames = [...FRAME_SETS.flatMap((set) => set.frames), ...GENERAL_FRAMES];
  frames.forEach((frame) => {
    assert.doesNotMatch(`${frame.en} ${frame.es}`, /[0-9=<>]/, frame.en);
    assert.match(frame.en, /_____|__/, `${frame.en}: a frame has a blank`);
    assert.ok(frame.es, `${frame.en}: Spanish line`);
  });
  // The brief's frames are in the library.
  const english = frames.map((frame) => frame.en);
  ['The data show a _____ correlation because as _____ increases, _____.',
    'The point (__, __) is the solution because it _____ both equations.',
    'The graph moved _____ units _____.',
    'The mistake occurred when _____. The correct step should be _____.'].forEach((line) => assert.ok(english.includes(line), line));
});

// --- The tools model --------------------------------------------------------------------------------

const revisionWith = (accommodations, translationLanguage = null, status = 'active') => buildSupportProjection({
  revisions: [{
    id: 'r1', revisionId: 'r1', revision: 1, status, effectiveStart: '2026-08-17', translationLanguage,
    accommodations: accommodations.map((id) => ({ id, params: {}, appliesTo: [] })), modifications: [],
  }],
  todayKey: '2026-10-06',
});

test('entitlement: from the same effective profile everywhere; the language alone authorizes Translate', () => {
  const eb = revisionWith(['glossary-lookup', 'chunked-directions', 'sentence-frames'], 'es');
  assert.deepEqual(toolsEntitlementFromProfile(eb, { nowValue: NOW }).tools, ['translate', 'vocabulary', 'break-it-down', 'say-it']);
  assert.equal(toolsEntitlementFromProfile(eb, { nowValue: NOW }).language, 'es');
  // No language, no Translate; English is not a translation.
  assert.deepEqual(toolsEntitlementFromProfile(revisionWith(['glossary-lookup'], 'en'), { nowValue: NOW }).tools, ['vocabulary']);
  // A student with no language support: nothing at all.
  assert.deepEqual(toolsEntitlementFromProfile(revisionWith(['text-to-speech']), { nowValue: NOW }).tools, ['read-aloud']);
  assert.deepEqual(toolsEntitlementFromProfile(revisionWith([]), { nowValue: NOW }).tools, []);
  assert.deepEqual(toolsEntitlementFromProfile(null).tools, []);
  // Inactive: supports are switched off.
  assert.deepEqual(toolsEntitlementFromProfile(revisionWith(['glossary-lookup'], 'es', 'inactive'), { nowValue: NOW }).tools, []);
  // My Math Path: from the server's applicable list.
  assert.deepEqual(toolsEntitlementFromPath({ applicableSupports: ['translation', 'glossary', 'chunkedDirections', 'sentenceFrames'], translationLanguage: 'es' }).tools, ['translate', 'vocabulary', 'break-it-down', 'say-it']);
  assert.deepEqual(toolsEntitlementFromPath({ applicableSupports: ['translation'], translationLanguage: null }).tools, []);
});

test('a tool is shown only where the item backs it, and the evidence says what was on screen', async () => {
  const entitlement = { tools: ['translate', 'vocabulary', 'read-aloud', 'break-it-down', 'say-it'], language: 'es' };
  const prompt = 'Determine whether the relationship represented by the data demonstrates a positive, negative, or no correlation and justify your conclusion.';
  const base = supportToolsForItem({ entitlement, prompt, toolType: 'dataModelingLab' });
  const byTool = (model) => Object.fromEntries(model.tools.map((tool) => [tool.tool, tool]));
  assert.equal(byTool(base).translate.state, TOOL_STATE.PENDING);
  assert.equal(toolEvidence(byTool(base).translate), null, 'pending records nothing');
  const model = withTranslation(base, await resolveTranslation({ text: prompt, language: 'es' }));
  const tools = byTool(model);
  assert.equal(tools.translate.state, TOOL_STATE.AVAILABLE);
  assert.equal(tools.vocabulary.state, TOOL_STATE.AVAILABLE);
  assert.equal(tools['break-it-down'].state, TOOL_STATE.PROVIDED);
  assert.equal(tools['say-it'].state, TOOL_STATE.AVAILABLE);
  assert.deepEqual(visibleTools(model).map((tool) => tool.tool), ['translate', 'vocabulary', 'read-aloud', 'break-it-down', 'say-it']);
  const records = Object.fromEntries(toolEvidenceRecords(model, { surface: 'rich-tool', toolType: 'dataModelingLab' }).map((record) => [record.supportId, record]));
  assert.deepEqual(records.translation, {
    supportId: 'translation', eventType: 'available', variant: 'full',
    details: { surface: 'rich-tool', toolType: 'dataModelingLab', language: 'es', deliveryMode: 'on-demand', provider: 'curated', coverage: 'full' },
  });
  assert.equal(records['chunked-directions'].eventType, 'provided');
  assert.equal(records['chunked-directions'].details.deliveryMode, 'automatic');

  // A plain one-step item with no translation: no Translate, no frames, no steps.
  const plain = withTranslation(
    supportToolsForItem({ entitlement, prompt: 'A farmer plants rows of corn in a field.', speech: false }),
    await resolveTranslation({ text: 'A farmer plants rows of corn in a field.', language: 'es' }),
  );
  const plainTools = byTool(plain);
  assert.equal(plainTools.translate.state, TOOL_STATE.UNAVAILABLE, 'a language on the profile is not translated content');
  assert.equal(toolEvidence(plainTools.translate).details.reason, 'no-translation-resource');
  assert.equal(plainTools['read-aloud'].state, TOOL_STATE.UNAVAILABLE);
  assert.equal(plainTools['break-it-down'].state, TOOL_STATE.NOT_APPLICABLE);
  assert.equal(plainTools['say-it'].state, TOOL_STATE.NOT_APPLICABLE);
  assert.deepEqual(visibleTools(plain).map((tool) => tool.tool), [], 'never a dead button');
  // On the Path the same facts travel in canonical ids.
  assert.deepEqual(pathDeliveryOf(model, ['glossary-lookup']), {
    presented: ['translation', 'glossary', 'textToSpeech', 'chunkedDirections', 'sentenceFrames'], used: ['glossary'],
  });
  assert.ok(Object.values(SUPPORT_TOOL).every((tool) => typeof tool === 'string'));
});

// --- Every language step refuses to change the mathematics -------------------------------------------

test('a pack sentence that would drop, repeat or add mathematics stays in English', () => {
  // A defective pack (a slot dropped, a slot repeated, a variable written into
  // the translation) must never reach a student.
  const pack = {
    language: 'es',
    sentences: compileTemplates([['Solve {0}.', 'Resuelve.'], ['Graph {0}.', 'Grafica {0} y {0}.'], ['Find the value.', 'Encuentra el valor de x.']]),
    choices: [],
  };
  const added = translateWithPack('Find the value.', pack);
  assert.deepEqual([added.coverage, added.text], [TRANSLATION_COVERAGE.NONE, 'Find the value.']);
  const solve = translateWithPack('Solve 3x = 12.', pack);
  assert.deepEqual([solve.coverage, solve.text], [TRANSLATION_COVERAGE.NONE, 'Solve 3x = 12.']);
  const graph = translateWithPack('Graph y = 2x - 1.', pack);
  assert.deepEqual([graph.coverage, graph.text], [TRANSLATION_COVERAGE.NONE, 'Graph y = 2x - 1.']);
});

test('break it down never hands back steps whose mathematics differs from the item', () => {
  // From the seed Path banks: "a" is the coefficient here, and a step ending
  // "Determine a." would read it differently than the item does.
  const prompt = 'A quadratic has vertex $(2,3)$ and passes through the point one unit to the right, $(3,5)$. Determine a and write the complete equation in vertex form.';
  const steps = chunkDirections(prompt);
  assert.ok(steps === null || preservesMath(prompt, steps.steps.map((step) => step.text).join(' ')), JSON.stringify(steps));
});

test('an authored translation whose mathematics differs is never shown on an assignment', () => {
  const profile = { accommodations: [], modifications: [], translationLanguage: 'es' };
  const kept = applyStudentSupportToQuestion({ prompt: 'Solve x + 2 = 5.', translations: { es: { prompt: 'Resuelve x + 2 = 5.' } } }, profile);
  assert.equal(kept.question.prompt, 'Resuelve x + 2 = 5.');
  const wrong = applyStudentSupportToQuestion({ prompt: 'Solve x + 2 = 5.', translations: { es: { prompt: 'Resuelve x + 3 = 5.' } } }, profile);
  assert.equal(wrong.question.prompt, 'Solve x + 2 = 5.');
});
