/*
 * STUDENT PASS 3, BATCH 6 — READ ALOUD AND TRANSLATE THAT WORK.
 *
 *   HELP-6 / H-115  Read aloud read the prompt only. A student with a
 *                   read-aloud accommodation did not hear the answer choices,
 *                   the field labels, a composed question's current step, the
 *                   matrices, the system a tool shows, or the "Let's back up"
 *                   question that blocks their work.
 *   HELP-3          "Translate" beside feedback, hints, examples and solutions
 *                   was a dead button for every language.
 *   speech          prices, function names a prompt defines, matrices
 *                   (Q-21, PR-4, PR-29, PR-30).
 *
 * Every Read aloud case runs over the REAL lessons (teacher-import-jsons),
 * compiled the way QuestionEngine receives them. Choice order is checked
 * against MultiAnswerGrader as rendered, not against a copy of its shuffle.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { resolveReferenceInfo } from '../../src/referenceInfo.js';
import { questionReadingParts, questionReadingText, readingFunctionNames } from '../../src/platform/language/questionReading.js';
import { definedFunctionNames, mathToSpeech, speechTextFor } from '../../src/platform/language/speechText.js';
import { spokenMathLabel } from '../../src/platform/language/mathSpeechLabel.js';
import { maskMath } from '../../src/platform/language/mathSafeText.js';
import {
  loadLanguagePack, resolveTranslation, resolveTranslationNow, translateWithPack, TRANSLATION_COVERAGE, TRANSLATION_GAP,
} from '../../src/platform/language/translationProviders.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { MISCONCEPTION_STUDENT_MESSAGES } from '../../functions/shared/misconceptionStudentMessages.mjs';
import { GENERIC_MISS_MESSAGES } from '../../src/platform/supports/feedback/genericMissChecks.js';
import { closedAttemptText } from '../../src/platform/supports/feedback/attemptFeedbackPlan.js';
import { missOutcomeText } from '../../src/platform/student/submitCost.js';
import { normalizeEvidenceDetails } from '../../functions/shared/supportEvidenceModel.mjs';
import { PLATFORM_FAMILY_IDS, defaultFamilyVersion, getPlatformQuestionFamily } from '../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyPreviewInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { executableSource, region } from './helpers/sourceContract.mjs';

const ROOT = new URL('../../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);
const code = (path) => executableSource(readFileSync(new URL(path, ROOT), 'utf8'));

/* -------------------------------------------------------------- real lessons */

let lessons = null;
const realQuestions = () => {
  if (lessons) return lessons;
  lessons = [];
  const imports = join(ROOT_PATH, 'teacher-import-jsons');
  readdirSync(imports).forEach((folder) => readdirSync(join(imports, folder)).filter((name) => name.endsWith('.json')).forEach((name) => {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(join(imports, folder, name), 'utf8')));
    compiled.package.sections.forEach((section) => section.questions.forEach((stored) => {
      // The chain QuestionEngine runs before it renders (processedQuestion).
      const question = normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null));
      lessons.push({ stored, question });
    }));
  }));
  return lessons;
};
const real = (questionId) => {
  const found = realQuestions().find((entry) => entry.stored.questionId === questionId);
  assert.ok(found, `${questionId} is in the real lessons`);
  return found.question;
};
const readingOf = (question, context = {}) => questionReadingParts(question, { referenceInfo: resolveReferenceInfo(question), ...context });
const spoken = (parts) => speechTextFor(questionReadingText(parts));

let vite = null;
before(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
});
after(async () => { await vite?.close(); });

/* ----------------------------------------------------------- 3. the speech */

test('money is said the way a person says it', () => {
  assert.equal(speechTextFor('A ticket costs $4.50.'), 'A ticket costs 4 dollars and 50 cents.');
  assert.equal(speechTextFor('It costs $1, or $0.99 on sale, or $0.01 more.'), 'It costs 1 dollar, or 99 cents on sale, or 1 cent more.');
  assert.equal(speechTextFor('They took in $2,086.25.'), 'They took in 2,086 dollars and 25 cents.');
  assert.equal(speechTextFor('A sandwich is $15.75, baskets are $25.'), 'A sandwich is 15 dollars and 75 cents, baskets are 25 dollars.');
  assert.equal(speechTextFor('It costs \\$4.50 each.'), 'It costs 4 dollars and 50 cents each.', 'an escaped dollar outside a span is a price, without its backslash');
  assert.equal(mathToSpeech('$4.00'), '4 dollars');
  assert.equal(speechTextFor('Cuesta $4.50.', { language: 'es' }), 'Cuesta 4 dólares con 50 centavos.');
  // A real lesson (Algebra II M1 T2 L3): the ticket prices of the theater problem.
  const theater = real('l3m-pr-11');
  assert.match(spoken(readingOf(theater)), /child tickets for 3 dollars and 50 cents, student tickets for 5 dollars, and adult tickets for 8 dollars and 50 cents/);
});

test('$7$ is the number 7, not a price (PR-4)', () => {
  assert.equal(speechTextFor('A rectangle is $7$ units wide.'), 'A rectangle is 7 units wide.');
  assert.equal(speechTextFor('Solve $3x + 2 = 8$ for x.'), 'Solve 3x plus 2 equals 8 for x.');
  // A list of prices is still prices.
  assert.equal(speechTextFor('The team sold $20, $25, and $50 gas cards.'), 'The team sold 20 dollars, 25 dollars, and 50 dollars gas cards.');
});

test('a function the text defines is read as a function, and products stay products (Q-21, PR-29)', () => {
  assert.equal(speechTextFor('Graph $c(x) = 2x + 1$.'), 'Graph c of x equals 2x plus 1.');
  assert.equal(
    speechTextFor('Let c(x) = 3x - 2 and d(x) = x^2. Find c(d(2)).'),
    'Let c of x equals 3x minus 2 and d of x equals x squared. Find c of d of 2.',
    'defined once, a function in every later sentence; read from the inside out',
  );
  assert.equal(speechTextFor('If m(x) = 4x and n(x) = x + 1, find (m + n)(x).'), 'If m of x equals 4x and n of x equals x plus 1, find m plus n of x.');
  assert.equal(speechTextFor('Find $(f \\circ g)(x)$.'), 'Find f composed with g of x.');
  assert.equal(speechTextFor('Find f(g(2)).'), 'Find f of g of 2.');
  // Nothing defined: still products.
  assert.equal(mathToSpeech('y − 2 = m(x − 6)'), 'y minus 2 equals m times the quantity x minus 6');
  assert.equal(speechTextFor('Let x(x+1) = 6.'), 'Let x times the quantity x plus 1 equals 6.');
  assert.equal(definedFunctionNames('x(x + 1) = 6 and y − 2 = m(x − 6)'), '');
  assert.equal(definedFunctionNames('c\\left(x\\right) = 5x and n(t) = t'), 'cn');
  // An angle is still degrees.
  assert.equal(speechTextFor('The angle is $45^\\circ$.'), 'The angle is 45 degrees.');
});

test('a matrix is read row by row, and "3 × 2" about dimensions is "3 by 2" (PR-30)', () => {
  assert.equal(
    speechTextFor('$A = \\begin{bmatrix} 1 & 2 \\\\ 3 & -4 \\end{bmatrix}$'),
    'A equals a 2 by 2 matrix: row 1: 1, 2; row 2: 3, negative 4; end matrix',
  );
  assert.equal(
    speechTextFor('Find $\\begin{vmatrix}a & b\\\\ c & d\\end{vmatrix}$.'),
    'Find the determinant of a 2 by 2 matrix: row 1: a, b; row 2: c, d; end matrix.',
  );
  assert.equal(speechTextFor('Matrix C has dimensions 3 × 2.'), 'Matrix C has dimensions 3 by 2.');
  assert.equal(speechTextFor('Find 3 × 2.'), 'Find 3 times 2.', 'arithmetic is still times');
});

test('a hyphen joining mathematics to a word is part of the word: "$x$-terms" is "x terms"', () => {
  assert.equal(speechTextFor('Get the $x$-terms on one side, and the $y$-intercept is 4.'), 'Get the x terms on one side, and the y intercept is 4.');
  assert.equal(speechTextFor('Solve $x$-3 = 4.'), 'Solve x minus 3 equals 4.', 'a minus before a number is still a minus');
  assert.deepEqual(maskMath('The $x$-terms are both $3x$.').tokens, ['$x$', '$3x$'], 'the hyphen is not carried into a translation slot');
});

test('the labels other tools speak are unchanged where they had no price, defined function or matrix', () => {
  // Session E speaks tool labels with spokenMathLabel; these outputs are its contract.
  assert.equal(spokenMathLabel('2 * x'), '2 times x');
  assert.equal(spokenMathLabel('Given point (2, -3)'), 'Given point 2, negative 3');
  assert.equal(spokenMathLabel('g(x) = f(x − 7)'), 'g of x equals f of the quantity x minus 7');
  assert.equal(spokenMathLabel('[A]⁻¹·[B]'), mathToSpeech('[A]⁻¹·[B]'));
});

/* -------------------------------------------- HELP-6: the whole question */

test('the ACT matrices item: the matrices row by row, then every part with its choices, in screen order', async () => {
  const question = real('l3m-pr-12-ccmr');
  const parts = readingOf(question);
  assert.deepEqual(parts.map((part) => part.kind), ['prompt', 'matrix', 'matrix', 'part', 'part', 'part']);
  const text = spoken(parts);
  assert.match(text, /Matrix C has dimensions 3 by 2 and matrix D has dimensions 2 by 4\./);
  assert.match(text, /Matrix A, 2 by 2\. Row 1: 2, negative 1\. Row 2: 0, 3\. Matrix B, 2 by 2\. Row 1: 4, 1\. Row 2: negative 2, 5\./);
  assert.match(text, /What is the entry in row 2, column 1 of the product AB\? Choices: /);

  // The order a student hears is the order the screen draws.
  const MultiAnswerGrader = (await vite.ssrLoadModule('/src/MultiAnswerGrader.jsx')).default;
  const html = renderToStaticMarkup(React.createElement(MultiAnswerGrader, { question, onStateChange: () => {} }));
  // The visible text of every choice button, in document order.
  const drawn = [...html.matchAll(/role="radio"[^>]*>([\s\S]*?)<\/button>/g)]
    .map((match) => match[1].split(/<span[^>]*position:absolute[\s\S]*$/)[0].replace(/<[^>]+>/g, '').trim());
  const heard = question.answerFields.flatMap((field) => parts
    .find((entry) => entry.id === `part-${field.id}`).text.split('Choices: ')[1].replace(/\.$/, '').split(/; (?:or )?/));
  assert.deepEqual(heard, drawn, 'every choice, in the order the screen draws it');
});

test('every field of every real item is read, with every choice it offers', () => {
  let fields = 0;
  realQuestions().forEach(({ stored, question }) => {
    const parts = readingOf(question);
    assert.ok(parts.some((part) => part.kind === 'prompt'), `${stored.questionId}: the prompt is read`);
    const text = questionReadingText(parts);
    (question.answerFields || []).filter((field) => field?.id).forEach((field) => {
      fields += 1;
      assert.ok(text.includes(String(field.label || field.id).replace(/\s+/g, ' ').trim()), `${stored.questionId}/${field.id}: its label is read`);
      (field.options || []).forEach((option) => assert.ok(text.includes(String(option).trim()), `${stored.questionId}/${field.id}: choice "${option}" is read`));
    });
  });
  assert.ok(fields >= 300, `${fields} fields across the real lessons`);
});

test('a field label is read: "Slope of the perpendicular line"', () => {
  const parts = readingOf(real('l3-pr-1'));
  assert.ok(parts.some((part) => part.kind === 'part' && /Answer box: Slope of the perpendicular line\./.test(part.text)), JSON.stringify(parts));
});

test('a composed question reads its current step and that step\'s choices', () => {
  const question = real('l3-cw-6');
  const { workflow } = readComposedQuestion(question);
  const choiceStage = workflow.find((stage) => Array.isArray(stage.choices) && stage.choices.length);
  const index = workflow.indexOf(choiceStage);
  const parts = readingOf(question, { stage: { stage: choiceStage, index, total: workflow.length, workflow: question.workflow } });
  const step = parts.find((part) => part.kind === 'step');
  assert.ok(step, 'the step is a part');
  assert.ok(step.text.startsWith(`Step ${index + 1} of ${workflow.length}: `), step.text);
  assert.ok(step.text.includes(String(choiceStage.prompt || choiceStage.label).trim()));
  choiceStage.choices.forEach((choice) => assert.ok(step.text.includes(typeof choice === 'string' ? choice : choice.label), `choice ${JSON.stringify(choice)}`));
  // No step known (not composed, or before the runner reports): none read.
  assert.equal(readingOf(question).some((part) => part.kind === 'step'), false);
});

test('"Information you need" is read after the prompt', () => {
  const withScenario = realQuestions().filter(({ question }) => resolveReferenceInfo(question));
  assert.ok(withScenario.length >= 2, 'real items with the card');
  withScenario.forEach(({ stored, question }) => {
    const kinds = readingOf(question).map((part) => part.kind);
    assert.equal(kinds.indexOf('information'), kinds.indexOf('prompt') + 1, stored.questionId);
  });
});

test('a system Matrix Lab shows but the prompt does not write out is read', () => {
  const parts = readingOf(real('l3m-pr-5'));
  const system = parts.find((part) => part.kind === 'system');
  assert.ok(system, 'the system is a part');
  assert.match(speechTextFor(system.text), /^The system: /);
  assert.equal(readingOf({ ...real('l3m-pr-5'), showEquations: false }).some((part) => part.kind === 'system'), false, 'not when the tool hides it');
});

test('the "Let\'s back up" question is read first while it blocks the work, with its choices', () => {
  const question = real('l3-pr-1');
  const backUp = backUpStepFor(question);
  const parts = readingOf(question, { backUp });
  assert.equal(parts[0].kind, 'back-up');
  assert.ok(parts[0].text.startsWith('Let’s back up. '));
  assert.ok(parts[0].text.includes(backUp.prompt));
  backUp.options.forEach((option) => assert.ok(parts[0].text.includes(option)));
  assert.equal(readingOf(question).some((part) => part.kind === 'back-up'), false, 'not once it is answered');
});

test('a part heard on its own still says the functions the question defines', () => {
  const parts = questionReadingParts({
    prompt: 'Let c(x) = 5x + 20 be the cost of x tickets.',
    answerFields: [{ id: 'a', label: 'Find c(4).' }, { id: 'b', label: 'Is c(4) more than $30?', options: ['Yes', 'No'] }],
  });
  assert.equal(readingFunctionNames(parts), 'c');
  const part = parts.find((entry) => entry.id === 'part-a');
  assert.equal(speechTextFor(part.text, { functionNames: part.functionNames }), 'Answer box: Find c of 4.');
  assert.equal(speechTextFor(part.text), 'Answer box: Find c times the quantity 4.', 'without the question it would be a product');
});

test('in Spanish, the reader\'s own words are Spanish', () => {
  const parts = questionReadingParts({ prompt: 'Halla x.', answerFields: [{ id: 'a', label: '¿Sí o no?', options: ['Sí', 'No'] }, { id: 'b', label: 'x' }] }, { language: 'es' });
  const text = questionReadingText(parts);
  assert.match(text, /Opciones: (Sí; o No|No; o Sí)\./);
  assert.match(text, /Casilla de respuesta: x\./);
});

/* ----------------------------------------- HELP-6: wired where it is said */

test('QuestionEngine says the whole question from the work bar and hands the tray the parts', () => {
  const engine = code('src/QuestionEngine.jsx');
  assert.match(engine, /import \{ questionReadingParts, questionReadingText \} from '\.\/platform\/language\/questionReading\.js';/);
  const reading = region(engine, 'const readingParts = useMemo(', ');', 'the reading');
  assert.match(reading, /questionReadingParts\(processedQuestion, \{/);
  assert.match(reading, /backUp: scaffoldRequired \? scaffold : null,/, 'the back-up question while it blocks the work');
  assert.match(reading, /stage: readingStage,/);
  assert.match(engine, /const referenceSpeechText = useMemo\(\(\) => questionReadingText\(readingParts\), \[readingParts\]\);/);
  assert.match(engine, /onClick=\{\(\) => \{ if \(speakText\(referenceSpeechText, readAloudLanguage\)\) reportSupportEvidence\('text-to-speech', 'used'\); \}\}/);
  const tray = region(engine, '<StudentSupportTray', '/>', 'the tray');
  assert.match(tray, /readingParts=\{readingParts\}/);
  const backUp = region(engine, '{scaffoldRequired && (', '</section>', 'the back-up overlay');
  assert.match(backUp, /<SupportedTextActions text=\{\[scaffold\.prompt, \.\.\.\(scaffold\.options \|\| \[\]\)/);
  assert.match(region(engine, '<GuidedClassworkCoach', '/>', 'Guided Notes'), /readAloud=\{supportedTextReadAloud\}/);
  assert.match(code('src/GuidedClassworkCoach.jsx'), /<SupportedTextActions text=\{\[currentStep\.title/);
});

test('the tray says the whole question and offers its parts — also beside the work bar\'s Read', async () => {
  const SupportToolsTray = (await vite.ssrLoadModule('/src/components/student/supportTools/SupportToolsTray.jsx')).default;
  const parts = readingOf(real('l3m-pr-12-ccmr'));
  const render = (props) => renderToStaticMarkup(React.createElement(SupportToolsTray, {
    entitlement: { tools: ['read-aloud'], language: null, universal: [] },
    prompt: parts[0].text,
    readingParts: parts,
    ...props,
  }));
  // Speech is unavailable in node, so model the browser that can speak.
  const speaking = { speechSynthesis: { cancel() {}, speak() {} }, SpeechSynthesisUtterance: function Utterance() {} };
  globalThis.window = speaking;
  try {
    const own = render({ includeReadAloud: true });
    assert.match(own, /data-support-tool="read-aloud"[^>]*aria-expanded="false"/, 'Read aloud opens the parts');
    const besideWorkBar = render({ includeReadAloud: false });
    assert.match(besideWorkBar, /data-support-tool="read-parts"[^>]*>.*Read a part<\/button>/);
    assert.doesNotMatch(besideWorkBar, /data-support-tool="read-aloud"/, 'the work bar keeps the whole-question Read');
  } finally {
    delete globalThis.window;
  }
});

/* --------------------------------------------------- HELP-3: Translate */

const mathSurvives = (source, translated) => {
  const { tokens } = maskMath(source);
  let rest = translated;
  return tokens.every((token) => {
    const at = rest.indexOf(token);
    if (at < 0) return false;
    rest = rest.slice(0, at) + rest.slice(at + token.length);
    return true;
  });
};

test('every miss message, generic hint and outcome sentence MathMaster writes is in Spanish — the mathematics untouched', async () => {
  const pack = await loadLanguagePack('es');
  const texts = [
    ...Object.values(MISCONCEPTION_STUDENT_MESSAGES),
    ...Object.values(GENERIC_MISS_MESSAGES),
    ...buildQuestionHints({ type: 'multiAnswer', prompt: 'x' }).map((hint) => hint.text),
    // Built from the functions that write them, so a new wording cannot ship
    // untranslated (pass 3: the pack once held only the old sentences).
    ...[3, 2, 1].map((left) => missOutcomeText(left)),
    ...[1, 3].flatMap((maximumAttempts) => [false, true].flatMap((reviewAvailable) => [false, true].map((allowReplacement) => (
      closedAttemptText({ maximumAttempts, reviewAvailable, allowReplacement })
    )))),
  ];
  texts.forEach((text) => {
    const result = translateWithPack(text, pack);
    assert.equal(result.coverage, TRANSLATION_COVERAGE.FULL, `${text}\n→ ${result.sentences.filter((s) => !s.translated && !s.mathOnly).map((s) => s.source).join(' | ')}`);
    assert.notEqual(result.text, text);
    assert.ok(mathSurvives(text, result.text), `${text}\n→ ${result.text}`);
  });
  assert.equal(
    translateWithPack('Your answer has the right size but the opposite sign. Look for a step where a negative sign was dropped or added — especially when subtracting or moving a term.', pack).text,
    'Tu respuesta tiene el tamaño correcto, pero el signo opuesto. Busca un paso donde se perdió o se agregó un signo negativo, sobre todo al restar o al pasar un término.',
  );
});

test('the hints, back-up steps and worked examples of the real lessons translate — teacher-written hints honestly do not', async () => {
  const pack = await loadLanguagePack('es');
  const tally = {};
  const count = (kind, text) => {
    const result = translateWithPack(text, pack);
    tally[kind] ||= { total: 0, translated: 0 };
    tally[kind].total += 1;
    if (result.coverage === TRANSLATION_COVERAGE.FULL) tally[kind].translated += 1;
    if (result.coverage !== TRANSLATION_COVERAGE.NONE) assert.ok(mathSurvives(text, result.text), `${text}\n→ ${result.text}`);
  };
  realQuestions().forEach(({ stored }) => {
    buildQuestionHints(stored).forEach((hint) => count(`hint-${hint.source}`, hint.text));
    const backUp = backUpStepFor(stored);
    if (backUp.source !== 'authored') count('back-up', [backUp.prompt, ...backUp.options.map((option) => `${option}.`)].join('\n'));
    const similar = buildSimilarWorkedExample(stored);
    if (similar) count('worked-example', [similar.prompt, ...similar.steps, `Answer: ${similar.answer}`].join(' '));
  });
  const rate = (kind) => tally[kind].translated / tally[kind].total;
  // Before pass 3: none of these translated.
  assert.ok(tally['hint-family'].total > 500 && rate('hint-family') >= 0.98, JSON.stringify(tally['hint-family']));
  assert.ok(rate('hint-generic') === 1, JSON.stringify(tally['hint-generic']));
  assert.ok(rate('back-up') === 1, JSON.stringify(tally['back-up']));
  assert.ok(tally['worked-example'].total > 100 && rate('worked-example') >= 0.95, JSON.stringify(tally['worked-example']));
  // A teacher's own words are not the pack's; they are not sent anywhere either.
  assert.ok(rate('hint-authored') < 0.1, JSON.stringify(tally['hint-authored']));
});

test('every platform question family\'s hints, back-up steps and worked examples translate, for every tool it serves', async () => {
  const pack = await loadLanguagePack('es');
  const missing = new Set();
  let texts = 0;
  PLATFORM_FAMILY_IDS.forEach((id) => {
    const family = getPlatformQuestionFamily(id);
    Object.keys(family.tools || {}).forEach((tool) => {
      for (let index = 0; index < 8; index += 1) {
        const { question } = resolveFamilyPreviewInstance({ questionId: `probe-${id}`, type: tool, questionFamily: { id, version: defaultFamilyVersion(id), tool } }, { index });
        if (!question) continue;
        const backUp = backUpStepFor(question);
        const similar = buildSimilarWorkedExample(question);
        [
          ...buildQuestionHints(question).filter((hint) => hint.source !== 'authored').map((hint) => hint.text),
          ...(backUp.source === 'authored' ? [] : [backUp.prompt, ...backUp.options.map((option) => `${option}.`)]),
          ...(similar ? [similar.prompt, ...similar.steps, `Answer: ${similar.answer}`] : []),
        ].forEach((text) => {
          texts += 1;
          const result = translateWithPack(text, pack);
          result.sentences.filter((sentence) => !sentence.translated && !sentence.mathOnly).forEach((sentence) => missing.add(`${id}: ${sentence.source}`));
          assert.ok(mathSurvives(text, result.text), `${text}\n→ ${result.text}`);
        });
      }
    });
  });
  assert.ok(PLATFORM_FAMILY_IDS.length >= 12 && texts > 500, `${texts} texts`);
  assert.deepEqual([...missing], [], 'a sentence a family generates has no Spanish yet');
});

test('when a text cannot be translated, the student is told why — never a dead button', async () => {
  const { SupportedTextActions, translationUnavailableMessage, translationUnavailableDetails } = await vite.ssrLoadModule('/src/platform/supports/SupportedText.jsx');
  // What is recorded: the plan report can say Translate was unavailable, in
  // fields the evidence model and firestore.rules keep as they are.
  const details = translationUnavailableDetails({ language: 'es', reason: TRANSLATION_GAP.NO_RESOURCE });
  assert.deepEqual(normalizeEvidenceDetails(details), details);
  assert.deepEqual(details, { language: 'es', reason: 'no-translation-resource' });
  assert.match(code('src/platform/supports/SupportedText.jsx'), /onEvidence\?\.\('translation', 'unavailable', translationUnavailableDetails\(/);
  await (await vite.ssrLoadModule('/src/platform/language/translationProviders.js')).loadLanguagePack('es');
  const render = (text, language, extra = {}) => renderToStaticMarkup(React.createElement(SupportedTextActions, {
    text, readAloud: null, translation: language ? { language } : null, label: 'hint 1', ...extra,
  }));
  const platformHint = render('Check the order of your slope fraction.', 'es');
  assert.match(platformHint, /aria-label="Translate hint 1"/);
  assert.match(platformHint, /data-translate-ready=""/);
  const teacherHint = render('Remember what we did with the pizza problem on Monday.', 'es');
  assert.doesNotMatch(teacherHint, /<button/);
  assert.match(teacherHint, /data-translation-unavailable="no-translation-resource"[^>]*>No Spanish translation for this text yet\.</);
  const vietnamese = render('Check the order of your slope fraction.', 'vi');
  assert.match(vietnamese, />Translate isn’t available in Vietnamese yet\.</);
  assert.equal(render('Check the order of your slope fraction.', null), '', 'not entitled: nothing at all');
  assert.equal(translationUnavailableMessage({ language: 'es', reason: TRANSLATION_GAP.LOAD_FAILED }), 'Spanish could not load right now, so this stays in English.');

  // And it is the same answer the provider gives, asked either way.
  const now = resolveTranslationNow({ text: 'Check the order of your slope fraction.', language: 'es' });
  const later = await resolveTranslation({ text: 'Check the order of your slope fraction.', language: 'es' });
  assert.deepEqual([now.coverage, now.text], [later.coverage, later.text]);
  assert.equal(now.text, 'Revisa el orden de tu fracción de la pendiente.');
  assert.equal(resolveTranslationNow({ text: 'Solve x.', language: 'vi' }).reason, TRANSLATION_GAP.NO_PACK);
});

test('a translation never reaches anything outside MathMaster', () => {
  // No machine-translation provider is registered, and none is called.
  const providers = code('src/platform/language/translationProviders.js');
  assert.doesNotMatch(providers, /fetch\(|XMLHttpRequest|httpsCallable|translate\.googleapis|deepl/i);
  assert.doesNotMatch(code('src/platform/supports/SupportedText.jsx'), /fetch\(|httpsCallable|registerTranslationProvider/);
});
