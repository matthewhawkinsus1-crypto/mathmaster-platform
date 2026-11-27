/*
 * REFERENCE CARDS (WE-H; docs/platform/WORKED_EXAMPLES.md sections 4 and 5).
 *
 * A lesson declares `lessonSupports.referenceCards: [{ id, skill, sections? }]`
 * (AG-1). The platform supplies the card for the skill
 * (referenceCardLibrary.js) and pins it above the work on Classwork and
 * Practice (referenceCardRule.js, QuestionEngine, ReferenceCards.jsx):
 *
 *   1. the library: every card in English and Spanish, with the same
 *      mathematics in both, read aloud as words and translated without a
 *      language pack;
 *   2. where it is pinned: Classwork and Practice only, by the section's own
 *      role, where help is allowed; never a DOL, quiz or test;
 *   3. never a grade: recorded only as a fact, kept only when true, absent
 *      from every independence test, read by no grade or mastery path;
 *   4. the screen: QuestionEngine loads the card lazily, behind the rule, and
 *      none of it is on a first load;
 *   5. the gates: the leak lists carry the card's words and parts, and the
 *      driver runs in CI.
 *
 * The browser drivers are tests/browser/referenceCards.mjs and the
 * reference-cards surface of tests/browser/assessmentLeakGates.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

import { executableSource, region } from './helpers/sourceContract.mjs';
import { firstLoadGraph, repo, teacherFirstLoadGraph } from './helpers/firstLoadGraph.mjs';
import { REFERENCE_CARDS, REFERENCE_CARD_LANGUAGES, REFERENCE_CARD_TEXT, readingFor, referenceCardFor } from '../../src/platform/supports/referenceCards/referenceCardLibrary.js';
import { REFERENCE_CARD_SECTION_ROLES, pinnedReferenceCards } from '../../src/platform/supports/referenceCards/referenceCardRule.js';
import { NO_EXAMPLE_SECTION_ROLES, validateLessonSupportsV5 } from '../../src/platform/contract/lessonSupportsV5.js';
import { speechTextFor } from '../../src/platform/language/speechText.js';
import { TRANSLATION_COVERAGE, TRANSLATION_PROVIDER, resolveTranslation } from '../../src/platform/language/translationProviders.js';
import { attemptSupportUsageFrom, emptySupportUse } from '../../src/platform/supports/supportUseMemory.js';
import { ACTIVITY_POLICIES } from '../../src/platform/policies/activityPolicies.js';
import { getQuestionCredit, normalizeQuestionRecord, recordQuestionAttempt } from '../../functions/shared/attemptPolicy.mjs';
import { REFERENCE_CARD_LABEL, analyzeAssignmentQuestions } from '../../src/platform/caseReview/attemptAnalysis.js';
import { ASSESSMENT_LEAK_SELECTORS, ASSESSMENT_LEAK_TEXTS, LADDER_WORDS, REFERENCE_CARD_SELECTORS } from '../browser/support/assessmentLadderWords.mjs';

const read = (file) => readFileSync(path.join(repo, file), 'utf8');
const mathOf = (text) => (String(text).match(/\$[^$]+\$/g) || []);

// ------------------------------------------------------------------ 1. the library

test('every card is written in English and Spanish, with its title, formulas and named parts', () => {
  assert.deepEqual([...REFERENCE_CARD_LANGUAGES].sort(), ['en', 'es']);
  assert.ok(REFERENCE_CARDS.length >= 12, 'the skills the lessons use most');
  const ids = new Set();
  for (const card of REFERENCE_CARDS) {
    assert.ok(!ids.has(card.id), `${card.id}: one card per skill`);
    ids.add(card.id);
    assert.equal(card.id, card.skill);
    for (const language of REFERENCE_CARD_LANGUAGES) {
      assert.ok(card.title[language]?.trim(), `${card.id}: a ${language} title`);
      card.formulas.forEach((formula, index) => assert.ok(formula.label[language]?.trim(), `${card.id} formula ${index}: a ${language} label`));
      card.parts.forEach((part, index) => assert.ok(part.says[language]?.trim(), `${card.id} part ${index}: what it is, in ${language}`));
    }
    assert.ok(card.formulas.length >= 1 && card.formulas.every((formula) => formula.latex.trim()), `${card.id}: a formula, as LaTeX`);
    assert.ok(card.parts.length >= 2 && card.parts.every((part) => part.latex.trim()), `${card.id}: its parts, named`);
    assert.ok(Object.isFrozen(card) && Object.isFrozen(card.parts), `${card.id}: frozen`);
  }
  for (const language of REFERENCE_CARD_LANGUAGES) {
    assert.deepEqual(Object.keys(REFERENCE_CARD_TEXT[language]).sort(), Object.keys(REFERENCE_CARD_TEXT.en).sort(), `${language}: every fixed word`);
  }
});

test('a lesson\'s skill finds its card, by its id or an alias, and an unknown skill finds none', () => {
  assert.equal(referenceCardFor('factor.sumDifferenceOfCubes')?.title.en, 'Sum and difference of cubes');
  // The example lesson in the authoring guide, and a lesson family's own id for the same skill.
  assert.equal(referenceCardFor('lines.slopeInterceptForm')?.id, 'lines.slopeInterceptForm');
  assert.equal(referenceCardFor('linear.graphFromSlopeIntercept')?.id, 'lines.slopeInterceptForm');
  assert.equal(referenceCardFor('  FACTOR.SUMDIFFERENCEOFCUBES '), referenceCardFor('factor.sumDifferenceOfCubes'), 'case and spaces do not count');
  for (const missing of ['made.up.skill', '', null, undefined, 42, {}]) assert.equal(referenceCardFor(missing), null, String(missing));
  // Every alias names one card only.
  const seen = new Map();
  for (const card of REFERENCE_CARDS) {
    for (const name of [card.skill, ...card.aliases]) {
      assert.ok(!seen.has(name.toLowerCase()), `${name} names ${seen.get(name.toLowerCase())} and ${card.id}`);
      seen.set(name.toLowerCase(), card.id);
    }
  }
  // The cards the repository's lessons and guide declare are all in the library.
  const declared = [
    ...JSON.parse(read('tests/platform/fixtures/learningSupportsLessonFragment.json')).lessonSupports.referenceCards,
    { skill: 'factor.sumDifferenceOfCubes' },
  ];
  for (const card of declared) assert.ok(referenceCardFor(card.skill), `${card.skill} has a card`);
});

test('Read aloud reads the card as words, in English and in Spanish, with no markup', () => {
  for (const card of REFERENCE_CARDS) {
    for (const language of REFERENCE_CARD_LANGUAGES) {
      const reading = readingFor(card, language);
      assert.ok(reading.startsWith(`${REFERENCE_CARD_TEXT[language].name}: ${card.title[language]}.`), `${card.id} ${language}: it starts with what it is`);
      const spoken = speechTextFor(reading, { language });
      assert.ok(spoken.length > 40, `${card.id} ${language}: spoken`);
      assert.doesNotMatch(spoken, /[$\\^_{}]/, `${card.id} ${language}: no markup is read out: ${spoken}`);
      for (const part of card.parts) assert.ok(spoken.includes(speechTextFor(part.says[language], { language }).replace(/[.]$/, '')), `${card.id} ${language}: the part "${part.says[language]}" is read`);
    }
  }
  assert.match(speechTextFor(readingFor(referenceCardFor('factor.sumDifferenceOfCubes'), 'en')), /a cubed plus b cubed equals/);
  assert.match(speechTextFor(readingFor(referenceCardFor('quadratics.quadraticFormula'), 'es'), { language: 'es' }), /más o menos la raíz cuadrada de b al cuadrado menos 4ac/);
  assert.equal(readingFor(referenceCardFor('lines.slopeFormula'), 'vi'), null, 'a language the card is not written in has no reading of its own');
  assert.equal(readingFor(null), null);
});

test('Translate shows the card in Spanish as the platform\'s own words: the same mathematics, no language pack', async () => {
  for (const card of REFERENCE_CARDS) {
    const english = readingFor(card, 'en');
    const spanish = readingFor(card, 'es');
    assert.deepEqual(mathOf(spanish), mathOf(english), `${card.id}: the same mathematics, in the same order`);
    const result = await resolveTranslation({ text: english, language: 'es', authored: { text: spanish } });
    assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${card.id}: ${result.reason || ''}`);
    assert.equal(result.provider, TRANSLATION_PROVIDER.AUTHORED, `${card.id}: its own words`);
    assert.equal(result.text, spanish);
  }
});

// ------------------------------------------------------------------ 2. where it is pinned

const LESSON = Object.freeze({
  referenceCards: [
    { id: 'every', skill: 'lines.slopeFormula' },
    { id: 'practice-only', skill: 'factor.differenceOfSquares', sections: ['practice'] },
    { id: 'by-id', skill: 'quadratics.vertexForm', sections: ['cw-day-2'] },
    // A stored card forged to name assessments: the validator refuses it, and it is still never pinned there.
    { id: 'forged', skill: 'factor.sumDifferenceOfCubes', sections: ['dol', 'quiz', 'test', 'classwork'] },
  ],
});
const pinned = (options) => pinnedReferenceCards({ lessonSupports: LESSON, hintsAllowed: true, ...options }).map((card) => card.id);

test('pinned on Classwork and Practice, by the card\'s sections (role or id) or on both when it names none', () => {
  assert.deepEqual([...REFERENCE_CARD_SECTION_ROLES], ['classwork', 'practice']);
  assert.deepEqual(pinned({ sectionRole: 'classwork', activityRole: 'classwork' }), ['every', 'forged']);
  assert.deepEqual(pinned({ sectionRole: 'classwork', sectionId: 'cw-day-2', activityRole: 'classwork' }), ['every', 'by-id', 'forged']);
  assert.deepEqual(pinned({ sectionRole: 'practice', activityRole: 'practice' }), ['every', 'practice-only']);
  // Classwork after its due date runs as practice: still Classwork's cards.
  assert.deepEqual(pinned({ sectionRole: 'classwork', activityRole: 'practice' }), ['every', 'forged']);
  // Only ids and skills: what a card says loads with the card.
  assert.deepEqual(pinnedReferenceCards({ lessonSupports: LESSON, hintsAllowed: true, sectionRole: 'practice' })[0], { id: 'every', skill: 'lines.slopeFormula' });
});

test('never on a DOL, quiz or test, nor where help is withheld or the role is unknown', () => {
  for (const role of NO_EXAMPLE_SECTION_ROLES) {
    assert.deepEqual(pinned({ sectionRole: role, activityRole: role }), [], `${role}`);
    // A DOL practised after its due date runs as practice and is still a DOL.
    assert.deepEqual(pinned({ sectionRole: role, activityRole: 'practice' }), [], `${role} practised after its due date`);
    // A Classwork question run under an assessment's policy.
    assert.deepEqual(pinned({ sectionRole: 'classwork', activityRole: role }), [], `classwork run as ${role}`);
  }
  for (const role of ['warmup', 'review', 'corrections']) assert.deepEqual(pinned({ sectionRole: role, activityRole: role }), [], `${role}: Classwork and Practice only`);
  for (const hintsAllowed of [false, undefined, null, 'true', 1]) assert.deepEqual(pinned({ sectionRole: 'classwork', hintsAllowed }), [], `hintsAllowed ${String(hintsAllowed)}`);
  for (const sectionRole of [null, '', 'homework', undefined]) assert.deepEqual(pinned({ sectionRole }), [], `an unknown section role (${String(sectionRole)}) fails closed`);
  // Malformed declarations pin nothing and throw nothing.
  for (const lessonSupports of [null, {}, { referenceCards: 'cubes' }, { referenceCards: [null, 'x', { id: 'no-skill' }, { skill: 'no.id' }] }]) {
    assert.deepEqual(pinnedReferenceCards({ lessonSupports, sectionRole: 'classwork', hintsAllowed: true }), []);
  }
  assert.deepEqual(pinnedReferenceCards({ lessonSupports: { referenceCards: [{ id: 'a', skill: 's' }, { id: 'a', skill: 't' }] }, sectionRole: 'practice', hintsAllowed: true }).map((card) => card.skill), ['s'], 'one card per id');
});

test('the authoring contract the rule reads: it refuses a card on a DOL, quiz or test, and accepts one with no sections', () => {
  const sections = [{ id: 'classwork', role: 'classwork', questions: [] }, { id: 'dol', role: 'dol', questions: [] }];
  const errorsFor = (referenceCards) => validateLessonSupportsV5({ sections, lessonSupports: { referenceCards } }).errors;
  assert.deepEqual(errorsFor([{ id: 'cubes', skill: 'factor.sumDifferenceOfCubes' }]), []);
  assert.ok(errorsFor([{ id: 'cubes', skill: 'factor.sumDifferenceOfCubes', sections: ['dol'] }]).some((error) => /never shown on a DOL, quiz or test/.test(error)));
  // No body field: the card's content is the platform's.
  assert.ok(errorsFor([{ id: 'cubes', skill: 'factor.sumDifferenceOfCubes', formula: 'a^3+b^3' }]).some((error) => /formula is not a reference card field/.test(error)));
});

test('Pre-Flight warns about a card whose skill has no built-in card, which students would never see', () => {
  const sections = [{ id: 'classwork', role: 'classwork', questions: [] }];
  const judge = (referenceCards) => validateLessonSupportsV5({ sections, lessonSupports: { referenceCards } });
  const unknown = judge([{ id: 'cubes', skill: 'factor.sumDifferenceOfCubes' }, { id: 'mystery', skill: 'made.up.skill' }]);
  assert.deepEqual(unknown.errors, [], 'a warning, never an error: it does not stop the teacher');
  assert.equal(unknown.warnings.length, 1);
  assert.match(unknown.warnings[0], /^lessonSupports\.referenceCards\[1\]\.skill "made\.up\.skill" has no reference card in MathMaster yet, so students will not see this card\. Use the skill of a built-in card: factor\.sumDifferenceOfCubes, /);
  for (const card of REFERENCE_CARDS) assert.ok(unknown.warnings[0].includes(card.skill), `${card.skill} is offered`);
  // A known skill, or an alias of one, raises nothing.
  assert.deepEqual(judge([{ id: 'a', skill: 'lines.slopeInterceptForm' }, { id: 'b', skill: 'linear.graphFromSlopeIntercept' }]).warnings, []);
  // The one lesson that declares a card today has its card.
  const packet = read('scripts/content/build-algebra2-honors-thanksgiving-packet.mjs');
  for (const [, skill] of packet.matchAll(/referenceCards: \[\{ id: '[^']+', skill: '([^']+)'/g)) assert.ok(referenceCardFor(skill), skill);
});

// ------------------------------------------------------------------ 3. never a grade

test('a pinned card is recorded only as a fact: kept when true, never help, never independence', () => {
  assert.equal(attemptSupportUsageFrom({ supportUsage: {}, referenceCardShown: true }).referenceCardShown, true);
  assert.equal('referenceCardShown' in attemptSupportUsageFrom({ supportUsage: {} }), false, 'absent unless shown: an attempt without a card records what it did before');
  const shown = attemptSupportUsageFrom({ supportUsage: {}, referenceCardShown: true });
  assert.equal(shown.isMathematicallyIndependent, true);
  assert.equal(shown.hintUsed, false);
  assert.equal(shown.workedExampleUsed, false);
  // It is not a remembered support: a remount pins the card again, from the lesson.
  assert.equal('referenceCardShown' in emptySupportUse(), false);
});

test('the score, the status and the attempts are the same with a card as without; only the fact differs', () => {
  const SEQUENCES = {
    'right first time': [{ isCorrect: true }],
    'a miss, then right': [{ isCorrect: false, partialCreditPercent: 50 }, { isCorrect: true }],
    'never right': [{ isCorrect: false, partialCreditPercent: 25 }, { isCorrect: false, partialCreditPercent: 50 }, { isCorrect: false, partialCreditPercent: 50 }],
  };
  const play = (attempts, referenceCardShown, policy) => attempts.reduce((record, attempt, index) => recordQuestionAttempt({
    record,
    ...attempt,
    questionDetails: `try ${index + 1}`,
    timeSpent: 40,
    responseKey: `try-${index + 1}`,
    supportUsage: attemptSupportUsageFrom({ supportUsage: {}, referenceCardShown }),
    maximumAttempts: policy.attempts,
    occurredAt: '2026-11-27T15:00:00.000Z',
  }).record, null);
  for (const role of REFERENCE_CARD_SECTION_ROLES) {
    for (const [name, attempts] of Object.entries(SEQUENCES)) {
      const policy = ACTIVITY_POLICIES[role];
      const without = play(attempts, false, policy);
      const withCard = play(attempts, true, policy);
      const label = `${role}, ${name}`;
      assert.equal(withCard.supportUsage.referenceCardShown, true, `${label}: the fact is recorded`);
      assert.equal('referenceCardShown' in without.supportUsage, false, `${label}: and not invented`);
      assert.equal(getQuestionCredit(withCard), getQuestionCredit(without), `${label}: the credit`);
      assert.equal(withCard.status, without.status, `${label}: the status`);
      assert.equal(withCard.attemptCount, without.attemptCount, `${label}: no attempt`);
      assert.equal(withCard.bestPartialCredit, without.bestPartialCredit);
      assert.equal(withCard.supportUsage.isMathematicallyIndependent, without.supportUsage.isMathematicallyIndependent, `${label}: independence`);
      const strip = (record) => ({ ...record, supportUsage: { ...record.supportUsage, referenceCardShown: null }, attempts: record.attempts?.map((entry) => ({ ...entry, supportUsage: null })) });
      assert.deepEqual(strip(withCard), strip(without), `${label}: only the fact differs`);
      assert.equal(normalizeQuestionRecord(withCard).supportUsage.referenceCardShown, true, `${label}: it survives a normalise`);
    }
  }
  // Only true is kept.
  assert.equal('referenceCardShown' in normalizeQuestionRecord({ status: 'correct', attemptCount: 1, totalAttempts: 1, supportUsage: { referenceCardShown: 'yes' } }).supportUsage, false);
});

test('the teacher sees it named as a fact in the student\'s attempts', () => {
  const question = { questionId: 'q1', type: 'multiAnswer', prompt: 'p', answerFields: [{ id: 'a', answer: '1' }] };
  const analyse = (supportUsage) => analyzeAssignmentQuestions({
    assignment: { id: 'a1', schemaVersion: 5, sections: [{ id: 'classwork', role: 'classwork', questions: [question] }] },
    student: { id: 's1', gradesByAssignment: { a1: { 0: recordQuestionAttempt({ record: null, isCorrect: true, supportUsage }).record } } },
  });
  const supportsOf = (result) => (Array.isArray(result) ? result : result?.questions || [])[0]?.lastAttemptSupports;
  assert.deepEqual(supportsOf(analyse(attemptSupportUsageFrom({ supportUsage: {}, referenceCardShown: true }))), [REFERENCE_CARD_LABEL]);
  assert.deepEqual(supportsOf(analyse(attemptSupportUsageFrom({ supportUsage: {} }))), []);
  assert.match(REFERENCE_CARD_LABEL, /not asked for/);
});

const sourceFiles = (dir) => readdirSync(path.join(repo, dir)).flatMap((name) => {
  const file = path.join(dir, name);
  if (name === 'node_modules') return [];
  if (statSync(path.join(repo, file)).isDirectory()) return sourceFiles(file);
  return /\.(m?js|jsx)$/.test(name) ? [file] : [];
});

test('no grade, credit, mastery or independence path reads the fact: only the code that records and names it', () => {
  const readers = [...sourceFiles('src'), ...sourceFiles('functions')]
    .filter((file) => /referenceCardShown/.test(executableSource(read(file))))
    .sort();
  assert.deepEqual(readers, [
    'functions/shared/attemptPolicy.mjs',
    'src/QuestionEngine.jsx',
    'src/platform/caseReview/attemptAnalysis.js',
    'src/platform/supports/supportUseMemory.js',
  ]);
  // In the shared attempt policy, one helper carries it through as it came, and nothing else reads it.
  const policy = executableSource(read('functions/shared/attemptPolicy.mjs'));
  const mentions = [...policy.matchAll(/referenceCardShown/g)].length;
  assert.equal(mentions, 2, 'the helper alone: its test and its value');
  assert.match(policy, /^const referenceCard = \(supportUsage\) => \(supportUsage\?\.referenceCardShown === true \? \{ referenceCardShown: true \} : \{\}\);$/m);
  for (const independence of policy.match(/isMathematicallyIndependent:[^,]*(?:\n\s*&&[^\n]*)*/g) || []) assert.doesNotMatch(independence, /referenceCard/);
  // In the student's record of help, it is never part of independence.
  const memory = executableSource(read('src/platform/supports/supportUseMemory.js'));
  assert.doesNotMatch(region(memory, 'isMathematicallyIndependent: supportUsage?.isMathematicallyIndependent', ';', 'independence'), /referenceCard/);
  // The engine sets it from the card itself, once it is on the screen, and hands it to the record of the attempt.
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  assert.match(engine, /onShown=\{\(\) => setReferenceCardShown\(true\)\}/);
  assert.match(region(engine, 'const attemptSupportUsage = () => attemptSupportUsageFrom({', '});', 'what an attempt records'), /referenceCardShown,/);
  assert.equal([...engine.matchAll(/referenceCardShown/g)].length, 2, 'its state and the record of the attempt: nothing else reads it');
});

// ------------------------------------------------------------------ 4. the screen

test('QuestionEngine pins the cards by the rule, with the hint control\'s own permission, and loads them lazily', () => {
  const engine = executableSource(read('src/QuestionEngine.jsx'));
  // The rule is the only static import; the card and its library come with the lazy chunk.
  assert.match(engine, /^import \{ pinnedReferenceCards \} from '\.\/platform\/supports\/referenceCards\/referenceCardRule\.js';$/m);
  assert.match(engine, /const ReferenceCards = lazy\(\(\) => import\('\.\/platform\/supports\/referenceCards\/ReferenceCards\.jsx'\)/);
  assert.doesNotMatch(engine, /^import[^;]*referenceCardLibrary/m);
  assert.doesNotMatch(engine, /^import[^;]*ReferenceCards\.jsx/m);
  const gate = region(engine, 'const pinnedCards = useMemo(() => pinnedReferenceCards({', '}),', 'the gate');
  assert.match(gate, /sectionRole: isActivityRole\(question\?\.activityRole\) \? question\.activityRole : null,/, 'the section\'s OWN role');
  assert.match(gate, /activityRole: resolvedActivityPolicy\?\.role,/, 'and the role it runs under');
  assert.match(gate, /hintsAllowed: hintControlAllowed,/, 'where the hint control is allowed');
  // Drawn only when one is pinned, above the work, in a boundary of its own.
  const cards = region(engine, 'const referenceCards = pinnedCards.length ? (', ') : null;', 'the cards');
  assert.match(cards, /<QuestionSupplementBoundary stage="reference-cards"/);
  assert.match(cards, /readAloud=\{supportedTextReadAloud\}\s*translation=\{supportedTextTranslation\}/);
  assert.match(engine, /\{referenceCards\}\s*\{hintPanelOpen && hintPanelPlace === 'top' && hintPanel \? \(/);
  // The rule knows nothing of what a card says.
  assert.doesNotMatch(executableSource(read('src/platform/supports/referenceCards/referenceCardRule.js')), /import/);
});

test('none of the card is on a student\'s or a teacher\'s first load', () => {
  for (const graph of [firstLoadGraph(), teacherFirstLoadGraph()]) {
    for (const file of ['ReferenceCards.jsx', 'referenceCardLibrary.js']) {
      assert.ok(!graph.has(path.join(repo, 'src/platform/supports/referenceCards', file)), file);
    }
  }
  // Only the card itself and the authoring validator (teacher-side: Pre-Flight
  // and the compiler, on neither first load) import the library.
  const importers = sourceFiles('src').filter((file) => /referenceCardLibrary/.test(executableSource(read(file)))).sort();
  assert.deepEqual(importers, ['src/platform/contract/lessonSupportsV5.js', 'src/platform/supports/referenceCards/ReferenceCards.jsx']);
  for (const graph of [firstLoadGraph(), teacherFirstLoadGraph()]) assert.ok(!graph.has(path.join(repo, 'src/platform/contract/lessonSupportsV5.js')));
});

const withVite = async (run) => {
  const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  try {
    return await run(server);
  } finally {
    await server.close();
  }
};

test('the card draws its title, each formula, its parts in a disclosure, and Read aloud; a skill with no card draws nothing', async () => {
  await withVite(async (server) => {
    const { default: ReferenceCards } = await server.ssrLoadModule('/src/platform/supports/referenceCards/ReferenceCards.jsx');
    const html = renderToStaticMarkup(React.createElement(ReferenceCards, {
      cards: [{ id: 'cubes', skill: 'factor.sumDifferenceOfCubes' }, { id: 'nope', skill: 'made.up.skill' }],
      readAloud: { language: 'en' },
    }));
    assert.match(html, /data-reference-cards=""/);
    assert.equal([...html.matchAll(/data-reference-card="/g)].length, 1, 'only the card the library has');
    assert.match(html, /data-reference-card="cubes"/);
    assert.match(html, />Sum and difference of cubes</);
    assert.equal([...html.matchAll(/data-reference-card-formula=""/g)].length, 2);
    assert.equal([...html.matchAll(/data-reference-card-part=""/g)].length, 4);
    assert.match(html, /<details data-reference-card-parts=""[^>]*><summary[^>]*>The parts, named<\/summary>/);
    assert.match(html, /aria-label="Read the reference card aloud"/);
    assert.match(html, /Pinned for this lesson/);
    assert.equal(renderToStaticMarkup(React.createElement(ReferenceCards, { cards: [{ id: 'nope', skill: 'made.up.skill' }] })), '', 'nothing to show, nothing drawn');
    assert.equal(renderToStaticMarkup(React.createElement(ReferenceCards, { cards: [] })), '');
  });
});

// ------------------------------------------------------------------ 5. the gates

test('the leak lists carry every fixed word of a card and every part of it', () => {
  for (const words of Object.values(REFERENCE_CARD_TEXT)) {
    for (const text of Object.values(words)) {
      assert.ok(LADDER_WORDS.includes(text) && ASSESSMENT_LEAK_TEXTS.includes(text), text);
    }
  }
  const drawn = read('src/platform/supports/referenceCards/ReferenceCards.jsx');
  const engine = read('src/QuestionEngine.jsx');
  const markers = new Set([...`${drawn}\n${engine}`.matchAll(/\b(data-reference-card[a-z-]*)=/g)].map((match) => `[${match[1]}]`));
  assert.ok(markers.size >= 8);
  for (const marker of markers) assert.ok(REFERENCE_CARD_SELECTORS.includes(marker) && ASSESSMENT_LEAK_SELECTORS.includes(marker), `${marker} is in the gate`);
  // Both drivers that look for leaks look for the card's parts too.
  for (const driver of ['tests/browser/assessmentLeakGates.mjs', 'tests/browser/showTheStep.mjs']) {
    assert.match(read(driver), /selectors\.filter\(\(selector\) => document\.querySelector\(selector\)\), ASSESSMENT_LEAK_SELECTORS\)/, driver);
  }
  // The leak gate's own surface, with its negative controls on a DOL and a test.
  const gates = read('tests/browser/assessmentLeakGates.mjs');
  assert.match(gates, /'reference-cards': referenceCards,/);
  for (const role of ['dol', 'quiz', 'test']) assert.match(gates, new RegExp(`\\{ role: '${role}', pinned: false \\}`));
  assert.match(gates, /\{ role: 'practice', pinned: true \}/, 'and its control');
});

test('the reference-card driver runs in CI, in the areas that change it', () => {
  const workflow = read('.github/workflows/student-teacher-journeys.yml');
  assert.match(workflow, /run: node tests\/browser\/referenceCards\.mjs/);
  const areas = read('scripts/lib/ciAreas.mjs');
  assert.equal([...areas.matchAll(/'tests\/browser\/referenceCards\*',/g)].length, 2);
});
