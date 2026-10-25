/*
 * TT22 — A TEACHER'S OWN SPANISH FOR HINTS AND WORKED SOLUTIONS.
 *
 * Teacher-written hints and worked solutions could be translated only by an
 * authored translation, and an authored translation carried only the prompt:
 * a Spanish-reading student pressed Translate beside a hint and was told there
 * was none. It also never reached the student at all, because the import
 * compiler dropped `translations` from every question. This holds the whole
 * path:
 *
 *   - import keeps `translations` through Pre-Flight, the saved record and the
 *     rebuild;
 *   - a hint and a worked-solution sentence carry the teacher's Spanish to the
 *     Translate button, and it is shown only if it keeps the English's
 *     mathematics exactly (the same rule as the prompt); otherwise the English
 *     stays and the platform's own Spanish, if any, is used;
 *   - Pre-Flight says what is missing or cannot be shown, as advice that never
 *     changes whether the assignment is ready, in a count that includes it.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import {
  ADVISORY_FINDING_GROUPS, buildAssignmentV5PreflightModel, summarizeAdvisoryFindings,
} from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { auditAssignmentSpanishVersions } from '../../src/platform/preflight/spanishVersionPreflight.js';
import { canonicalV5PersistencePatch, getStoredAssignmentQuestions, storedAssignmentToV5 } from '../../src/platform/contract/storedAssignmentV5.js';
import { authoredHintTexts, buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { buildClosedQuestionReview } from '../../src/platform/supports/review/closedQuestionReview.js';
import { authoredLineFor, authoredReviewTranslation } from '../../src/platform/language/authoredSupportText.js';
import { authoredTranslationEntry, authoredTranslationKeepsMath, languageKeyIn } from '../../src/platform/language/authoredTranslation.js';
import { preservesMath } from '../../src/platform/language/mathSafeText.js';
import { resolveTranslation, resolveTranslationNow, TRANSLATION_COVERAGE, TRANSLATION_GAP } from '../../src/platform/language/translationProviders.js';
import { applyStudentSupportToQuestion } from '../../src/studentSupport.js';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { region } from './helpers/sourceContract.mjs';

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');
const clone = (value) => JSON.parse(JSON.stringify(value));

/* --------------------------------------------------------------- fixtures -- */

const SPANISH = {
  hints: ['Deshaz la suma: resta 2 en ambos lados.', 'Comprueba sustituyendo tu respuesta en x + 2 = 5.'],
  solutionReview: {
    headline: 'Deshaz la suma.',
    reasoning: ['Resta 2 en ambos lados: x = 5 - 2.', 'Comprueba que x + 2 = 5.'],
    commonError: 'Sumar 2 en lugar de restarlo.',
  },
};

// A Practice question with two hints and a worked solution, none of which states
// the answer, so the leak guard keeps every hint.
const practiceQuestion = (extra = {}) => ({
  type: 'algebra',
  prompt: 'Solve x + 2 = 5.',
  answer: '3',
  activityRole: 'practice',
  alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' }],
  hints: ['Undo the addition: subtract 2 from both sides.', 'Check by putting your answer back into x + 2 = 5.'],
  solutionReview: {
    headline: 'Undo the addition.',
    reasoning: ['Subtract 2 from both sides: x = 5 - 2.', 'Check that x + 2 = 5.'],
    commonError: 'Adding 2 instead of subtracting it.',
  },
  ...extra,
});
const lessonOf = (...questions) => ({
  schemaVersion: 5,
  assignment: { title: 'Spanish for hints', courseId: 'algebra1', instructionalPurpose: 'lesson', gradingPurpose: 'classwork' },
  variantPolicy: { mode: 'personalized', sectionModes: { practice: 'personalized' } },
  sections: [{ id: 'practice', role: 'practice', title: 'Practice', questions }],
});

/* --------------------------------------------------------- the import path -- */

test('import keeps a question\'s translations through Pre-Flight, the saved record and the rebuild', () => {
  const raw = JSON.parse(read('teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json'));
  const target = raw.sections.find((section) => section.role === 'practice').questions[0];
  target.hints = ['Look at the sign of the slope first.'];
  target.solutionReview = { headline: 'Compare the slopes.', reasoning: ['Multiply the two slopes.'], commonError: 'Forgetting the negative sign.' };
  target.translations = { es: { hints: ['Mira primero el signo de la pendiente.'], solutionReview: { headline: 'Compara las pendientes.', reasoning: ['Multiplica las dos pendientes.'], commonError: 'Olvidar el signo negativo.' } } };

  const parsed = parseAssignmentBlueprintText(JSON.stringify(raw));
  const modelOf = buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parsed.assignmentV5, {}));
  assert.equal(modelOf.isValid, true, modelOf.errors.join('\n'));
  const carried = (assignmentV5) => assignmentV5.sections.find((section) => section.role === 'practice').questions[0].translations;
  assert.deepEqual(carried(modelOf.assignmentV5), target.translations, 'through the import compiler and Pre-Flight');

  // The saved record, and the editor's rebuild of it.
  const stored = { id: 'saved-1', ...canonicalV5PersistencePatch(modelOf.assignmentV5) };
  assert.deepEqual(carried(stored), target.translations, 'in the record that is saved');
  assert.deepEqual(carried(storedAssignmentToV5(stored)), target.translations, 'and after the editor rebuilds it');
  assert.ok(getStoredAssignmentQuestions(stored).some((question) => question.translations), 'a student\'s copy has it');
});

/* ------------------------------------------------------------ the lookups -- */

test('the language lookup finds the exact tag, then its base language, ignoring case', () => {
  const map = { es: 'base', 'es-MX': 'mexico', FR: 'french' };
  assert.equal(languageKeyIn(map, 'es-mx'), 'es-MX');
  assert.equal(languageKeyIn(map, 'es-419'), 'es');
  assert.equal(languageKeyIn(map, 'fr'), 'FR');
  assert.equal(languageKeyIn(map, 'vi'), undefined);
  assert.equal(languageKeyIn(null, 'es'), undefined);
  assert.equal(languageKeyIn(['es'], 'es'), undefined);
  // The prompt's own lookup is the same one.
  assert.equal(authoredTranslationEntry({ translations: { es: { prompt: 'a' }, 'es-MX': { prompt: 'b' } } }, 'es-mx').prompt, 'b');
  assert.equal(authoredTranslationEntry({ translations: { es: { prompt: 'a' } } }, 'es-MX').prompt, 'a');
});

test('a hint\'s line is the one in the student\'s language, and only a line with words in it', () => {
  assert.equal(authoredLineFor({ es: 'hola', fr: 'bonjour' }, 'fr'), 'bonjour');
  assert.equal(authoredLineFor({ es: 'hola', fr: 'bonjour' }, 'es-MX'), 'hola');
  assert.equal(authoredLineFor({ es: 'hola' }, 'vi'), null, 'no Vietnamese line: no line');
  assert.equal(authoredLineFor({ es: '   ' }, 'es'), null);
  assert.equal(authoredLineFor({ es: 7 }, 'es'), null);
  assert.equal(authoredLineFor(undefined, 'es'), null);
  assert.equal(authoredLineFor({ es: 'hola' }, ''), null);
});

test('hint N is the Nth teacher-written hint the ladder offers, and line N of the Spanish', () => {
  const question = practiceQuestion({ supportHints: ['Read what is asked.'], hint: '   ', translations: { es: { hints: ['Lee lo que se pide.', SPANISH.hints[0], SPANISH.hints[1]] } } });
  assert.deepEqual(authoredHintTexts(question), ['Read what is asked.', ...question.hints], 'supportHints first, then hints; empty ones left out');
  const ladder = buildQuestionHints(question);
  assert.deepEqual(ladder.map((hint) => hint.translations?.es), ['Lee lo que se pide.', SPANISH.hints[0], SPANISH.hints[1]]);
  // A hint with no Spanish line is exactly what it was.
  const bare = buildQuestionHints(practiceQuestion());
  assert.deepEqual(bare[0], { text: bare[0].text, source: 'authored' });
  // A line that is not text, or blank, is not a line.
  const odd = buildQuestionHints(practiceQuestion({ translations: { es: { hints: [42, '   '] } } }));
  assert.equal(odd[0].translations, undefined);
  assert.equal(odd[1].translations, undefined);
  // A hint the answer guard drops is still hint 1: the one after it keeps ITS line.
  const leaky = buildQuestionHints(practiceQuestion({
    hints: ['The answer is 3.', 'Check by putting your answer back into x + 2 = 5.'],
    translations: { es: { hints: ['La respuesta es 3.', SPANISH.hints[1]] } },
  }));
  assert.deepEqual(leaky.map((hint) => hint.text), ['Check by putting your answer back into x + 2 = 5.']);
  assert.equal(leaky[0].translations.es, SPANISH.hints[1]);
});

test('the student\'s copy of the question still carries the teacher\'s Spanish', () => {
  const question = practiceQuestion({ translations: { es: SPANISH } });
  const { question: seen } = applyStudentSupportToQuestion(question, { accommodations: [], modifications: [], translationLanguage: 'es', inclusionStatus: false });
  assert.deepEqual(seen.translations.es.hints, SPANISH.hints);
  assert.deepEqual(buildQuestionHints(seen).map((hint) => authoredLineFor(hint.translations, 'es')), SPANISH.hints);
});

/* --------------------------------------------------- Translate on a hint -- */

const PROSE = 'Isolate the variable term before you do anything else.';
const PROSE_ES = 'Aísla primero el término con la variable.';

test('Translate shows the teacher\'s Spanish for a hint, at once, with no language pack', async () => {
  const known = resolveTranslationNow({ text: PROSE, language: 'es-MX', authored: { text: PROSE_ES } });
  assert.equal(known.coverage, TRANSLATION_COVERAGE.FULL);
  assert.equal(known.provider, 'authored');
  assert.equal(known.text, PROSE_ES);
  const later = await resolveTranslation({ text: PROSE, language: 'es', authored: { text: PROSE_ES } });
  assert.deepEqual([later.coverage, later.provider, later.text], [TRANSLATION_COVERAGE.FULL, 'authored', PROSE_ES]);
  // A language the platform has no pack for still shows what the teacher wrote in it.
  const french = resolveTranslationNow({ text: PROSE, language: 'fr', authored: { text: 'Isolez d’abord le terme qui contient la variable.' } });
  assert.equal(french.provider, 'authored');
  assert.equal(french.coverage, TRANSLATION_COVERAGE.FULL);
  // Without the teacher's words nothing changes: no pack yet means "not known yet".
  assert.equal(resolveTranslationNow({ text: PROSE, language: 'es' }), null);
});

test('a hint whose Spanish changes the mathematics stays English, and the gap says why', async () => {
  const english = 'Subtract 2 from both sides of x + 2 = 5, then check.';
  const wrong = 'Resta 3 en ambos lados de x + 2 = 5 y comprueba.';
  const then = await resolveTranslation({ text: english, language: 'es', authored: { text: wrong } });
  assert.notEqual(then.text, wrong, 'the teacher\'s line is not shown');
  assert.notEqual(then.provider, 'authored');
  // Where nothing else can translate it either, the student is told the honest reason.
  const odd = await resolveTranslation({ text: 'Flurble the wug 2 times.', language: 'es', authored: { text: 'Flurble el wug 3 veces.' } });
  assert.equal(odd.coverage, TRANSLATION_COVERAGE.NONE);
  assert.equal(odd.reason, TRANSLATION_GAP.MATH_MISMATCH);
  // The same with a language that has no pack (the answer is known at once).
  const noPack = resolveTranslationNow({ text: 'Subtract 2 from both sides.', language: 'fr', authored: { text: 'Soustrayez 3 des deux côtés.' } });
  assert.equal(noPack.coverage, TRANSLATION_COVERAGE.NONE);
  assert.equal(noPack.reason, TRANSLATION_GAP.MATH_MISMATCH);
  // A capital-letter name of a point is mathematics too.
  const names = resolveTranslationNow({ text: 'Find the midpoint of AB.', language: 'fr', authored: { text: 'Trouvez le milieu de XY.' } });
  assert.equal(names.reason, TRANSLATION_GAP.MATH_MISMATCH);
  // Without any words of the teacher's, a language with no pack says so, as before.
  assert.equal(resolveTranslationNow({ text: 'Subtract 2 from both sides.', language: 'fr' }).reason, TRANSLATION_GAP.NO_PACK);
  // Once the Spanish pack has loaded (it has, above), the answer is known at once there too.
  const sentence = 'Flurble the wug 2 times.';
  const sync = resolveTranslationNow({ text: sentence, language: 'es', authored: { text: 'Flurble el wug 3 veces.' } });
  assert.deepEqual([sync.coverage, sync.reason], [TRANSLATION_COVERAGE.NONE, TRANSLATION_GAP.MATH_MISMATCH]);
  assert.equal(resolveTranslationNow({ text: sentence, language: 'es' }).reason, TRANSLATION_GAP.NO_RESOURCE, 'with no Spanish of the teacher\'s it is the pack that has no sentence');
});

/* --------------------------------------------- a variable written $y$ -- */

// In Spanish prose a lone y is the word "and" (so are o, a, e, u), which is why
// "el cambio en y dividido entre..." read as a line that had lost the variable.
// A person writing the Spanish marks the variable the way MathText sets it.
const SLOPE_EN = 'Slope is the change in y divided by the change in x between the two points.';
const SLOPE_ES_BARE = 'La pendiente es el cambio en y dividido entre el cambio en x entre los dos puntos.';
const SLOPE_ES_MARKED = 'La pendiente es el cambio en $y$ dividido entre el cambio en $x$ entre los dos puntos.';

test('a Spanish line marks a lone y as the variable it is by writing $y$: the delimiters are how it is written, not what it says', async () => {
  assert.equal(authoredTranslationKeepsMath(SLOPE_EN, SLOPE_ES_BARE, 'es'), false, 'bare, the y reads as the word "and": the variable is lost');
  assert.equal(authoredTranslationKeepsMath(SLOPE_EN, SLOPE_ES_MARKED, 'es'), true);
  // Delimiters only: another letter, another number, or a price's own dollar sign still differ.
  assert.equal(authoredTranslationKeepsMath(SLOPE_EN, SLOPE_ES_MARKED.replace('$y$', '$z$'), 'es'), false);
  assert.equal(authoredTranslationKeepsMath('Subtract 2 from both sides.', 'Resta $3$ de ambos lados.', 'es'), false);
  assert.equal(authoredTranslationKeepsMath('Subtract 2 from both sides.', 'Resta $2$ de ambos lados.', 'es'), true);
  assert.equal(authoredTranslationKeepsMath('It costs $4 today.', 'Cuesta 4 hoy.', 'es'), false, 'a price\'s dollar sign is not a delimiter');
  assert.equal(authoredTranslationKeepsMath('Solve x + 2 = 5.', 'Resuelve \\(x + 2 = 5\\).', 'es'), true, 'the other delimiters are the same');
  // What a machine or a pack wrote is still held to the strict reading.
  assert.equal(preservesMath(SLOPE_EN, SLOPE_ES_MARKED, { language: 'es' }), false);
  assert.equal(preservesMath(SLOPE_EN, SLOPE_ES_MARKED, { language: 'es', ignoreDelimiters: true }), true);

  // The hint reaches Translate with the marked line, and is refused with the bare one.
  const shown = resolveTranslationNow({ text: SLOPE_EN, language: 'es', authored: { text: SLOPE_ES_MARKED } });
  assert.deepEqual([shown.provider, shown.coverage, shown.text], ['authored', TRANSLATION_COVERAGE.FULL, SLOPE_ES_MARKED]);
  const refused = await resolveTranslation({ text: SLOPE_EN, language: 'es', authored: { text: SLOPE_ES_BARE } });
  assert.equal(refused.provider, null);
  assert.equal(refused.reason, TRANSLATION_GAP.MATH_MISMATCH);

  // So does a worked-solution sentence.
  const question = practiceQuestion({
    solutionReview: { reasoning: ['Divide the change in y by the change in x.'] },
    translations: { es: { solutionReview: { reasoning: ['Divide el cambio en $y$ entre el cambio en $x$.'] } } },
  });
  const parts = buildClosedQuestionReview({ question }).speechParts;
  assert.equal(authoredReviewTranslation({ question, parts, language: 'es' }).text, 'Divide el cambio en $y$ entre el cambio en $x$.');
  const bareStep = clone(question);
  bareStep.translations.es.solutionReview.reasoning = ['Divide el cambio en y entre el cambio en x.'];
  assert.equal(authoredReviewTranslation({ question: bareStep, parts, language: 'es' }), null);
});

test('Pre-Flight accepts the marked line, and for the bare one says what was lost and how to keep it', () => {
  const audit = (hintLine, stepLine = 'Divide el cambio en $y$ entre el cambio en $x$.') => auditAssignmentSpanishVersions([practiceQuestion({
    hints: [SLOPE_EN, 'Check by putting your answer back into x + 2 = 5.'],
    solutionReview: { reasoning: ['Divide the change in y by the change in x.'] },
    translations: { es: { hints: [hintLine, SPANISH.hints[1]], solutionReview: { reasoning: [stepLine] } } },
  })]);
  assert.deepEqual(audit(SLOPE_ES_MARKED).warnings, []);
  const bare = audit(SLOPE_ES_BARE);
  assert.equal(bare.warnings.length, 1);
  assert.equal(bare.warnings[0], 'Question 1, hint 1: the Spanish leaves out “y”, so students see the English instead. Keep every number, letter and symbol exactly as in the English. In Spanish prose a lone y, o, a, e or u reads as a word: write the variable inside $…$ (for example $y$) to keep it as mathematics.');
  // The same for a sentence of the worked solution.
  const step = audit(SLOPE_ES_MARKED, 'Divide el cambio en y entre el cambio en x.');
  assert.equal(step.warnings.length, 1);
  assert.match(step.warnings[0], /^Question 1, worked solution step 1: the Spanish leaves out “y”.* write the variable inside \$…\$/);
  // A difference that is not a lost letter gets no such tip.
  const number = audit(SLOPE_ES_MARKED.replace('entre los dos puntos', 'entre los 3 puntos'));
  assert.equal(number.warnings.length, 1);
  assert.doesNotMatch(number.warnings[0], /lone y/);
});

/* ------------------------------------------------ Translate on the solution -- */

test('the worked solution\'s sentences carry paths only where the TEACHER wrote them', () => {
  const question = practiceQuestion();
  const review = buildClosedQuestionReview({ question });
  assert.deepEqual(review.speechParts, [
    { text: 'Undo the addition.', path: ['headline'] },
    { text: 'Subtract 2 from both sides: x = 5 - 2.', path: ['reasoning', 0] },
    { text: 'Check that x + 2 = 5.', path: ['reasoning', 1] },
    { text: 'Adding 2 instead of subtracting it.', path: ['commonError'] },
  ]);
  assert.equal(review.speechParts.map((part) => part.text).join(' '), review.speechText, 'the parts are exactly what is read and translated');
  // A question with no steps of its own gets its family\'s: those are not the teacher\'s.
  const slot = { type: 'multiAnswer', activityRole: 'practice', prompt: 'Find the slope.', questionFamily: { id: 'linear.slopeFromPoints', version: 1 } };
  const delivered = (solutionReview) => ({ ...resolveFamilyPreviewInstance({ ...slot, solutionReview }).question, solutionReview });
  const family = buildClosedQuestionReview({ question: delivered({ commonError: 'Swapping rise and run.' }) });
  assert.equal(family.fromFamily, true);
  assert.ok(family.speechParts.length > 3, 'the family\'s own steps are read and translated too');
  assert.deepEqual(family.speechParts.filter((part) => part.path), [{ text: 'Swapping rise and run.', path: ['commonError'] }], 'only the teacher\'s own sentence has a counterpart to look for');
  // The same family, with a headline and a summary the teacher wrote: those two are theirs too.
  const mixed = buildClosedQuestionReview({ question: delivered({ headline: 'Compare rise and run.', answerSummary: 'The slope is the ratio.', commonError: 'Swapping rise and run.' }) });
  assert.deepEqual(mixed.speechParts.filter((part) => part.path), [
    { text: 'Compare rise and run.', path: ['headline'] },
    { text: 'The slope is the ratio.', path: ['answerSummary'] },
    { text: 'Swapping rise and run.', path: ['commonError'] },
  ]);
  // A teacher-written summary, on a question with steps of its own, sits between the steps and the usual mistake.
  const own = buildClosedQuestionReview({ question: practiceQuestion({ solutionReview: { ...practiceQuestion().solutionReview, answerSummary: 'So x = 3.' } }) });
  assert.deepEqual(own.speechParts.map((part) => part.path?.join('.')), ['headline', 'reasoning.0', 'reasoning.1', 'answerSummary', 'commonError']);
});

test('each sentence of the teacher\'s Spanish that keeps the mathematics replaces that sentence; the rest stays English', () => {
  const question = practiceQuestion({ translations: { es: SPANISH } });
  const parts = buildClosedQuestionReview({ question }).speechParts;
  const all = authoredReviewTranslation({ question, parts, language: 'es' });
  assert.equal(all.coverage, 'full');
  assert.equal(all.text, [SPANISH.solutionReview.headline, ...SPANISH.solutionReview.reasoning, SPANISH.solutionReview.commonError].join(' '));

  // Step 2 says "x + 3 = 5": that sentence stays English, the rest is Spanish.
  const wrongStep = clone(question);
  wrongStep.translations.es.solutionReview.reasoning[1] = 'Comprueba que x + 3 = 5.';
  const partly = authoredReviewTranslation({ question: wrongStep, parts, language: 'es' });
  assert.equal(partly.coverage, 'partial');
  assert.ok(partly.text.includes('Check that x + 2 = 5.'), 'the English step is kept');
  assert.ok(partly.text.includes(SPANISH.solutionReview.headline) && partly.text.includes(SPANISH.solutionReview.commonError));
  assert.ok(!partly.text.includes('x + 3'), 'and the wrong one is never shown');

  // Nothing usable: nothing to offer. Part-by-part lines before them are English, so "partial".
  const none = clone(question);
  none.translations.es.solutionReview = { headline: 'Cambia el 2 por 9.' };
  assert.equal(authoredReviewTranslation({ question: none, parts, language: 'es' }), null);
  assert.equal(authoredReviewTranslation({ question: practiceQuestion(), parts, language: 'es' }), null);
  const withLead = authoredReviewTranslation({ question, parts, language: 'es', leading: 'x: You wrote 3. The answer is 3.' });
  assert.equal(withLead.coverage, 'partial');
  assert.ok(withLead.text.startsWith('x: You wrote 3.'));

  // The whole text is then checked once more, as the provider does for any translation.
  const english = buildClosedQuestionReview({ question }).speechText;
  const shown = resolveTranslationNow({ text: english, language: 'es', authored: all });
  assert.deepEqual([shown.coverage, shown.provider, shown.text], [TRANSLATION_COVERAGE.FULL, 'authored', all.text]);
  const half = resolveTranslationNow({ text: english, language: 'es', authored: partly });
  assert.equal(half.coverage, TRANSLATION_COVERAGE.PARTIAL, 'the student is told some sentences are still in English');
});

test('dollar signs in the teacher\'s own math survive the swap (replacement text is never read as a pattern)', () => {
  // "$$" and "$&" mean something to String.replace; display math is written with them.
  const question = practiceQuestion({
    solutionReview: { reasoning: ['Add $2$ to both sides to get $$x = 3$$ and check $x + 2 = 5$.'] },
    translations: { es: { solutionReview: { reasoning: ['Suma $2$ en ambos lados para obtener $$x = 3$$ y comprueba $x + 2 = 5$.'] } } },
  });
  const review = buildClosedQuestionReview({ question });
  const translated = authoredReviewTranslation({ question, parts: review.speechParts, language: 'es' });
  assert.equal(translated.text, 'Suma $2$ en ambos lados para obtener $$x = 3$$ y comprueba $x + 2 = 5$.');
  const shown = resolveTranslationNow({ text: review.speechText, language: 'es', authored: translated });
  assert.equal(shown.provider, 'authored', 'and it still keeps the mathematics once the whole text is checked');
});

test('a sentence with no counterpart (a tool\'s step, the question family\'s) stays English beside the teacher\'s Spanish', () => {
  const question = practiceQuestion({ translations: { es: SPANISH } });
  const parts = [
    { text: 'Undo the addition.', path: ['headline'] },
    { text: 'Move the 2 over.' },
    { text: 'Adding 2 instead of subtracting it.', path: ['commonError'] },
  ];
  const result = authoredReviewTranslation({ question, parts, language: 'es' });
  assert.equal(result.text, `${SPANISH.solutionReview.headline} Move the 2 over. ${SPANISH.solutionReview.commonError}`);
  assert.equal(result.coverage, 'partial', 'the student is told one sentence is still English');
  // Nothing of the teacher's to put in: nothing offered, whatever else is on the list.
  assert.equal(authoredReviewTranslation({ question, parts: [{ text: 'Move the 2 over.' }], language: 'es' }), null);
});

test('a partial worked solution whose English sentences name a variable is still the teacher\'s text: it is not read again as Spanish prose', async () => {
  // Read as Spanish, the English "…the change in y with…" has lost its y (the Spanish word "and"):
  // the whole text must not be judged that way, each sentence was judged on its own.
  const question = practiceQuestion({
    solutionReview: { headline: 'Slope compares the change in y with the change in x.', reasoning: ['Change in y: 5 − 2 = 3.', 'Change in x: 5 − 1 = 4.'] },
    translations: { es: { solutionReview: {
      headline: 'La pendiente compara el cambio en y con el cambio en x.', // a bare y: lost, so this sentence stays English
      reasoning: ['Cambio en y: 5 − 2 = 3.', 'Cambio en x: 5 − 9 = 4.'], // the first is right; the second changes a number
    } } },
  });
  const review = buildClosedQuestionReview({ question });
  const authored = authoredReviewTranslation({ question, parts: review.speechParts, language: 'es' });
  assert.equal(authored.coverage, 'partial');
  assert.equal(authored.verified, true);
  assert.ok(authored.text.startsWith('Slope compares the change in y with the change in x. Cambio en y: 5 − 2 = 3. Change in x: 5 − 1 = 4.'), authored.text);
  const shown = await resolveTranslation({ text: review.speechText, language: 'es', authored });
  assert.deepEqual([shown.provider, shown.coverage, shown.text], ['authored', TRANSLATION_COVERAGE.PARTIAL, authored.text]);
  // Only the code that checked the sentences may say so: a text handed over without the flag is read as a whole.
  const unchecked = await resolveTranslation({ text: review.speechText, language: 'es', authored: { text: authored.text } });
  assert.notEqual(unchecked.provider, 'authored');
});

/* ------------------------------------------------------------ the screens -- */

// The real components, rendered at first paint: the Translate button is there
// (or not) before any effect runs, which is what a student sees on opening a hint.
let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

const markup = async (modulePath, props, exportName = 'default') => {
  const component = (await vite.ssrLoadModule(modulePath))[exportName];
  return renderToStaticMarkup(React.createElement(component, props));
};
const translateButtons = (html) => (html.match(/data-translate-ready/g) || []).length;

test('rendered, Translate beside a text offers the teacher\'s words at first paint, and nothing when only English is known or the mathematics differs', async () => {
  const render = (props, language = 'es') => markup('/src/platform/supports/SupportedText.jsx', { text: PROSE, translation: { language }, ...props }, 'SupportedTextActions');
  assert.equal(translateButtons(await render({ authored: { text: PROSE_ES } })), 1);
  assert.equal(translateButtons(await render({ authored: { text: PROSE_ES } }, 'es-MX')), 1, 'a student set to es-MX');
  assert.equal(translateButtons(await render({})), 0, 'no pack loaded yet and no words of the teacher\'s: not known yet');
  assert.equal(translateButtons(await render({ authored: { text: 'Aísla primero el término con la variable 3.' } })), 0, 'a line that adds a number is not offered');
});

test('rendered, each hint offers Translate only if the teacher translated it and kept its mathematics', async () => {
  const hints = [
    { text: PROSE, source: 'authored', translations: { es: PROSE_ES } },
    { text: 'Subtract 2 from both sides of x + 2 = 5.', source: 'authored', translations: { es: 'Resta 3 en ambos lados de x + 2 = 5.' } },
    { text: 'Look at the sign of the slope first.', source: 'authored' },
    { text: 'Rewrite it in slope-intercept form.', source: 'authored', translations: { fr: 'Réécrivez-la sous forme pente-ordonnée.' } },
  ];
  const html = await markup('/src/platform/supports/hints/HintPanel.jsx', { hints, revealed: 4, translation: { language: 'es' } });
  assert.equal(translateButtons(html), 1, 'only the first hint has Spanish that keeps its mathematics');
  assert.match(html, /aria-label="Translate hint 1"/);
  // The same hints for a student who reads French: the fourth is the one with a line.
  const french = await markup('/src/platform/supports/hints/HintPanel.jsx', { hints, revealed: 4, translation: { language: 'fr' } });
  assert.equal(translateButtons(french), 1);
  assert.match(french, /aria-label="Translate hint 4"/);
});

test('rendered, a worked solution offers Translate for the teacher\'s Spanish, even if one sentence of it must stay English', async () => {
  const solution = (question) => markup('/src/SolutionReviewPanel.jsx', { question, translation: { language: 'es' } });
  const complete = await solution(practiceQuestion({ translations: { es: SPANISH } }));
  assert.equal(translateButtons(complete), 1);
  assert.match(complete, /aria-label="Translate the worked solution"/);
  assert.equal(translateButtons(await solution(practiceQuestion())), 0, 'no Spanish written: no button');
  const oneWrong = clone(SPANISH);
  oneWrong.solutionReview.reasoning[1] = 'Comprueba que x + 3 = 5.';
  assert.equal(translateButtons(await solution(practiceQuestion({ translations: { es: oneWrong } }))), 1, 'the other sentences are still offered');
  const allWrong = { solutionReview: { headline: 'Cambia el 2 por 9.', reasoning: ['Resta 7 de los dos lados.', 'Comprueba que x + 4 = 5.'], commonError: 'Sumar 8.' } };
  assert.equal(translateButtons(await solution(practiceQuestion({ translations: { es: allWrong } }))), 0, 'nothing that keeps its mathematics: nothing offered');
});

test('the hint panel and the worked-solution panel hand the teacher\'s words to Translate', () => {
  const hintPanel = read('src/platform/supports/hints/HintPanel.jsx');
  assert.match(hintPanel, /import \{ authoredLineFor \} from '\.\.\/\.\.\/language\/authoredSupportText\.js';/);
  const teachers = region(hintPanel, 'const teachersWords = (hint, translation) => {', '};', 'the hint lookup');
  assert.match(teachers, /authoredLineFor\(hint\?\.translations, translation\?\.language\)/);
  assert.match(hintPanel, /<SupportedTextActions text=\{hint\.text\}[^>]*authored=\{teachersWords\(hint, translation\)\} \/>/);

  const solutionPanel = read('src/SolutionReviewPanel.jsx');
  const reviewWords = region(solutionPanel, 'const teachersWords = translation?.language', ': null;', 'the review lookup');
  assert.match(reviewWords, /authoredReviewTranslation\(\{ question, parts: review\.speechParts, language: translation\.language, leading: partReviewSpeech\(partRows\) \}\)/);
  assert.match(solutionPanel, /<SupportedTextActions text=\{speechText\}[^>]*label="the worked solution"[^>]*authored=\{teachersWords\} \/>/);

  // The Translate control looks the text up with them, and again when they change.
  const actions = read('src/platform/supports/SupportedText.jsx');
  assert.match(actions, /const lookupKey = `\$\{language \|\| ''\}\|\$\{text \|\| ''\}\|\$\{authored\?\.text \|\| ''\}`;/);
  assert.match(actions, /result: resolveTranslationNow\(\{ text, language, authored \}\) \} : null\)\);/, 'at first paint');
  assert.match(actions, /const now = resolveTranslationNow\(\{ text, language, authored \}\);/, 'when the text or the teacher\'s words change');
  assert.match(actions, /else resolveTranslation\(\{ text, language, authored \}\)\.then\(settle\);/, 'and when the pack has to load');
});

/* ------------------------------------------------------------- Pre-Flight -- */

test('Pre-Flight says which questions have hints or a worked solution with no Spanish, and what to add', () => {
  const audit = auditAssignmentSpanishVersions([practiceQuestion(), practiceQuestion({ translations: { es: SPANISH } }), practiceQuestion()]);
  assert.deepEqual(audit.hintsMissing, [1, 3]);
  assert.deepEqual(audit.reviewMissing, [1, 3]);
  assert.equal(audit.warnings.length, 2, 'one message per kind, not one per question');
  assert.match(audit.warnings[0], /^2 questions — 1, 3 have hints with no Spanish version/);
  assert.match(audit.warnings[0], /translations\.es\.hints: one Spanish line for each hint, in the same order/);
  assert.match(audit.warnings[1], /^2 questions — 1, 3 have a worked solution with no Spanish version/);
  assert.match(audit.warnings[1], /translations\.es\.solutionReview .*headline, reasoning, answerSummary, commonError/);
  const single = auditAssignmentSpanishVersions([practiceQuestion()]);
  assert.match(single.warnings[0], /^Question 1 has hints with no Spanish version/);
});

test('a question with all its Spanish, and one with nothing to translate, are left alone', () => {
  const complete = auditAssignmentSpanishVersions([practiceQuestion({ translations: { es: SPANISH } })]);
  assert.deepEqual(complete.warnings, []);
  const bare = { type: 'algebra', prompt: 'Solve x + 2 = 5.', answer: '3', activityRole: 'practice' };
  assert.deepEqual(auditAssignmentSpanishVersions([bare]).warnings, []);
  // Another language's version is no Spanish.
  assert.equal(auditAssignmentSpanishVersions([practiceQuestion({ translations: { fr: SPANISH } })]).warnings.length, 2);
  // A student set to "es-MX" reads the "es" entry, but a profile that says plain
  // "es" does not read an "es-MX" one: the note asks for the entry every Spanish
  // reader finds, keyed "es".
  assert.equal(auditAssignmentSpanishVersions([practiceQuestion({ translations: { 'es-MX': SPANISH } })]).warnings.length, 2);
});

test('only what a student can be shown is asked for: no hints on a DOL, none for a hint the guard hides, none for a thrown-out question', () => {
  // A DOL offers no hints, so only its worked solution is asked for.
  const dol = auditAssignmentSpanishVersions([practiceQuestion({ activityRole: 'dol' })]);
  assert.deepEqual(dol.hintsMissing, []);
  assert.deepEqual(dol.reviewMissing, [1]);
  // A hint that states the answer is dropped at run time (it has its own note).
  const leaky = practiceQuestion({ hints: ['The answer is 3.', 'Check by putting your answer back into x + 2 = 5.'], translations: { es: { hints: ['', SPANISH.hints[1]], solutionReview: SPANISH.solutionReview } } });
  assert.deepEqual(auditAssignmentSpanishVersions([leaky]).warnings, [], 'the hidden hint needs no Spanish');
  const excluded = practiceQuestion({ teacherExcluded: true });
  assert.deepEqual(auditAssignmentSpanishVersions([excluded]).warnings, []);
  assert.equal(auditAssignmentSpanishVersions([excluded], { deliveredOnly: false }).warnings.length, 2);
});

test('Pre-Flight notices a missing Spanish line in every part of the worked solution and every hint, whichever it is', () => {
  // Written out here, part by part, so the audit's own list of parts is not what is checked.
  const english = {
    headline: 'Undo the addition.',
    reasoning: ['Subtract 2 from both sides: x = 5 - 2.', 'Check that x + 2 = 5.'],
    answerSummary: 'So x = 3.',
    commonError: 'Adding 2 instead of subtracting it.',
  };
  const spanish = {
    headline: 'Deshaz la suma.',
    reasoning: ['Resta 2 en ambos lados: x = 5 - 2.', 'Comprueba que x + 2 = 5.'],
    answerSummary: 'Entonces x = 3.',
    commonError: 'Sumar 2 en lugar de restarlo.',
  };
  const build = (review, hints = SPANISH.hints) => practiceQuestion({ solutionReview: english, translations: { es: { hints, solutionReview: review } } });
  assert.deepEqual(auditAssignmentSpanishVersions([build(spanish)]).warnings, [], 'all of it, in Spanish: nothing to say');
  const WITHOUT = {
    'the headline': (review) => { delete review.headline; },
    'the first step': (review) => { review.reasoning = ['', review.reasoning[1]]; },
    'the second step': (review) => { review.reasoning = [review.reasoning[0], '']; },
    'the answer summary': (review) => { delete review.answerSummary; },
    'the usual mistake': (review) => { delete review.commonError; },
  };
  Object.entries(WITHOUT).forEach(([name, remove]) => {
    const review = clone(spanish);
    remove(review);
    const audit = auditAssignmentSpanishVersions([build(review)]);
    assert.deepEqual(audit.reviewMissing, [1], `no Spanish for ${name}`);
    assert.deepEqual(audit.hintsMissing, []);
  });
  [[0, 'the first hint'], [1, 'the second hint']].forEach(([index, name]) => {
    const hints = [...SPANISH.hints];
    hints[index] = '';
    const audit = auditAssignmentSpanishVersions([build(spanish, hints)]);
    assert.deepEqual(audit.hintsMissing, [1], `no Spanish for ${name}`);
    assert.deepEqual(audit.reviewMissing, []);
  });
});

test('a Spanish line that changes the mathematics, or has no hint to go with it, is its own note', () => {
  const wrongHint = practiceQuestion({ translations: { es: { ...SPANISH, hints: [SPANISH.hints[0], 'Comprueba sustituyendo tu respuesta en x + 3 = 5.'] } } });
  const hintAudit = auditAssignmentSpanishVersions([wrongHint]);
  assert.deepEqual(hintAudit.hintsMissing, [], 'a line is there: it is a problem, not a gap');
  assert.equal(hintAudit.warnings.length, 1);
  assert.match(hintAudit.warnings[0], /^Question 1, hint 2: the Spanish leaves out “x\+2=5” and adds “x\+3=5”, so students see the English instead\. Keep every number, letter and symbol exactly as in the English\.$/);

  const wrongStep = practiceQuestion({ translations: { es: { ...SPANISH, solutionReview: { ...SPANISH.solutionReview, reasoning: [SPANISH.solutionReview.reasoning[0], 'Comprueba que x + 3 = 5.'] } } } });
  const stepAudit = auditAssignmentSpanishVersions([wrongStep]);
  assert.equal(stepAudit.warnings.length, 1);
  assert.match(stepAudit.warnings[0], /^Question 1, worked solution step 2: the Spanish leaves out “x\+2=5” and adds “x\+3=5”/);

  const extra = practiceQuestion({ translations: { es: { ...SPANISH, hints: [...SPANISH.hints, 'Una pista de más.', 'Otra más.'] } } });
  const extraAudit = auditAssignmentSpanishVersions([extra]);
  assert.deepEqual(extraAudit.warnings, ['Question 1: translations.es.hints has 4 lines but the question has 2 hints; line 3 onward is never shown.']);
});

test('the Spanish note is advice: counted in the suggestions, never in what decides readiness', () => {
  const model = buildAssignmentV5PreflightModel(lessonOf(practiceQuestion(), practiceQuestion({ translations: { es: SPANISH } })));
  assert.equal(model.isValid, true, model.errors.join('\n'));
  assert.equal(model.spanishVersions.warnings.length, 2);
  const group = model.advisory.groups.find(({ id }) => id === 'spanishVersions');
  assert.equal(group.count, 2, 'counted with the other suggestions');
  assert.match(group.label, /Spanish/);
  assert.equal(model.advisory.total, ADVISORY_FINDING_GROUPS.reduce((sum, { id }) => sum + (model[id]?.warnings?.length || 0), 0));
  const advice = new Set(model.spanishVersions.warnings);
  assert.equal(model.warnings.some((warning) => advice.has(warning)), false);
  assert.equal(model.errors.some((error) => advice.has(error)), false);
  // With the Spanish added, the note goes and the count drops by exactly its size.
  const done = buildAssignmentV5PreflightModel(lessonOf(practiceQuestion({ translations: { es: SPANISH } }), practiceQuestion({ translations: { es: SPANISH } })));
  assert.equal(done.spanishVersions.warnings.length, 0);
  assert.equal(done.advisory.groups.some(({ id }) => id === 'spanishVersions'), false);
  assert.equal(model.advisory.total - done.advisory.total, 2);
});

test('the advisory groups are an independent list: a group dropped from the summary fails here', () => {
  const EXPECTED = ['solutionReviews', 'attemptFeedback', 'hintAnswers', 'hiddenHints', 'choiceOptions', 'spanishVersions'];
  assert.deepEqual(ADVISORY_FINDING_GROUPS.map(({ id }) => id), EXPECTED);
  const audits = Object.fromEntries(EXPECTED.map((id, index) => [id, { warnings: Array.from({ length: index + 1 }, (_, n) => `${id} ${n}`) }]));
  const summary = summarizeAdvisoryFindings(audits);
  assert.deepEqual(summary.groups.map(({ id, count }) => [id, count]), EXPECTED.map((id, index) => [id, index + 1]));
  assert.equal(summary.total, 1 + 2 + 3 + 4 + 5 + 6);
  assert.deepEqual(summarizeAdvisoryFindings({ spanishVersions: { warnings: ['a', 'b'] } }), { total: 2, groups: [{ id: 'spanishVersions', label: ADVISORY_FINDING_GROUPS.at(-1).label, count: 2 }] });
});

test('Pre-Flight shows the notes in their own panel, with how to fix them', () => {
  const modal = read('src/components/teacher/LessonPreflightModal.jsx');
  const panel = region(modal, 'preflightModel.spanishVersions?.warnings?.length > 0 && (', '      {preflightModel.questionValues?.rows?.length > 0', 'the Spanish panel');
  assert.match(panel, /data-spanish-version-panel="true"/);
  assert.match(panel, /translations\.es, with one line for each hint in the same order and a solutionReview with the same fields/);
  assert.match(panel, /a lone y, o, a, e or u reads as a word, so write a variable like that inside \$…\$ \(for example \$y\$\)/);
  assert.match(panel, /This does not stop you publishing\./);
  assert.match(panel, /preflightModel\.spanishVersions\.warnings\.map\(\(warning\) => <li key=\{warning\}>\{warning\}<\/li>\)/);
});
