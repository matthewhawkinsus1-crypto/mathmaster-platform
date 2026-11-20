/*
 * THE WORKED SOLUTION IN SPANISH, AS FOUR SUPPORT FAMILIES WRITE IT.
 *
 * Solution Review (src/SolutionReviewPanel.jsx) offers Translate beside a
 * closed question's worked solution (SupportedTextActions). When the lesson
 * wrote no steps, the steps are the question's support family's own
 * (closedQuestionReview.js: familyFor(question).workedSolution), and so are the
 * headline and the answer summary where the lesson wrote none. For the real
 * lessons four families write them, functionFeatures, inverseComposition,
 * perpendicularLines and transformations, and their sentences had almost no
 * Spanish: over teacher-import-jsons, 631 of the 853 sentences of their steps
 * and 374 of the 378 of their headlines and answer summaries stayed English,
 * so Translate showed a student a worked solution that was mostly English.
 *
 * The Spanish pack (src/platform/language/packs/esSupport.js) matches a
 * sentence exactly, after its mathematics is masked. So this holds every
 * sentence those families write, for every real question each one claims:
 *   - it translates with the Spanish pack, in full;
 *   - its mathematics comes through untouched;
 *   - the headline and steps still translate read as Solution Review reads
 *     them, one text: a step that ends without a stop runs on into the next.
 * (A step that is only mathematics has nothing to translate and is shown as
 * it is.)
 *
 * STRICT ON PURPOSE, like the family test in readAloudAndTranslate.test.mjs
 * (its "DECISION (CI14, C2-85): THIS TEST STAYS STRICT"): a sentence a family
 * rewords, or a new one, fails here until it has Spanish, and the failure says
 * which family file wrote it, the English sentence as a pack template with its
 * {1} {2} slots ready to paste, one example of it as a student sees it, and
 * the list in the pack that takes the pair.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { prepareQuestionForRuntimeRouting } from '../../src/platform/algebra/algebraWorkspaceRoute.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { normalizeContextualQuestion } from '../../src/platform/context/wordProblemLayer.js';
import { maskMath } from '../../src/platform/language/mathSafeText.js';
import {
  compileTemplates, loadLanguagePack, translateWithPack, TRANSLATION_COVERAGE,
} from '../../src/platform/language/translationProviders.js';
import * as functionFeatures from '../../src/platform/supports/families/functionFeatures.js';
import * as inverseComposition from '../../src/platform/supports/families/inverseComposition.js';
import * as perpendicularLines from '../../src/platform/supports/families/perpendicularLines.js';
import * as transformations from '../../src/platform/supports/families/transformations.js';

const ROOT = new URL('../../', import.meta.url);
const ROOT_PATH = fileURLToPath(ROOT);

const FAMILIES = Object.entries({ functionFeatures, inverseComposition, perpendicularLines, transformations });
const familyFile = (family) => `src/platform/supports/families/${family}.js`;
const SPANISH_SUPPORT_PACK = 'src/platform/language/packs/esSupport.js';
const PACK_LIST = 'supportFamilyWorkedSolutions';

/* -------------------------------------------------------------- real lessons */

// The questions of the real lessons, compiled and generated the way
// QuestionEngine receives them (readAloudAndTranslate.test.mjs realQuestions).
let lessons = null;
const realQuestions = () => {
  if (lessons) return lessons;
  lessons = [];
  const imports = join(ROOT_PATH, 'teacher-import-jsons');
  readdirSync(imports).forEach((folder) => readdirSync(join(imports, folder)).filter((name) => name.endsWith('.json')).forEach((name) => {
    const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(join(imports, folder, name), 'utf8')));
    compiled.package.sections.forEach((section) => section.questions.forEach((stored) => {
      const question = normalizeContextualQuestion(generateQuestion(prepareQuestionForRuntimeRouting(stored, {}), 0, null, null, null));
      lessons.push({ stored, question });
    }));
  }));
  return lessons;
};

// Each family's worked solution of every real question it claims.
let solutions = null;
const workedSolutions = () => {
  if (solutions) return solutions;
  solutions = [];
  realQuestions().forEach(({ stored, question }) => FAMILIES.forEach(([family, module]) => {
    let claims = false;
    try { claims = module.matches(question) === true; } catch { claims = false; }
    if (!claims) return;
    const worked = module.workedSolution(question);
    if (worked) solutions.push({ family, questionId: stored.questionId, worked });
  }));
  return solutions;
};
const stepsOf = (worked) => (Array.isArray(worked?.steps) ? worked.steps : [])
  .map((step) => (typeof step === 'string' ? step : (step?.text || step?.explanation || '')));
const textOf = (value) => (typeof value === 'string' ? value.trim() : '');
/** Every text Solution Review translates from this worked solution. */
const partsOf = (worked) => [
  { kind: 'headline', text: textOf(worked.headline) },
  ...stepsOf(worked).map((step, index) => ({ kind: `step ${index + 1}`, text: textOf(step) })),
  { kind: 'answer summary', text: textOf(worked.answerSummary) },
  // closedQuestionReview.js joins the parts with a space before they are
  // translated, so a sentence is cut where the joined text has a stop.
  { kind: 'headline and steps read as one text', text: [textOf(worked.headline), ...stepsOf(worked).map(textOf)].filter(Boolean).join(' '), joined: true },
].filter((part) => part.text);

/* ------------------------------------------------------------ the checks */

// The sentence the way the pack writes it: each piece of mathematics, in order, as {1}, {2}, ...
const asPackTemplate = (sentence) => {
  let slot = 0;
  return maskMath(sentence).masked.replace(/⟦\d+⟧/g, () => `{${++slot}}`);
};

// Every piece of mathematics the mask finds in the English is in the Spanish
// (readAloudAndTranslate.test.mjs mathSurvives), and so is every capital-letter
// name of a point, side or figure ("AB", "ABCD"): those are words to the mask,
// so only the template itself can carry them (mathSafeText.js IDENTIFIER).
const CAPITAL_NAMES = /(?<![A-Za-zÀ-ÖØ-öø-ÿ])[A-Z]{2,}['′’]*(?![A-Za-zÀ-ÖØ-öø-ÿ])/g;
const namesOf = (text) => (String(text).match(CAPITAL_NAMES) || []).sort().join(' ');
const mathSurvives = (source, translated) => {
  const { tokens } = maskMath(source);
  let rest = translated;
  const tokensKept = tokens.every((token) => {
    const at = rest.indexOf(token);
    if (at < 0) return false;
    rest = rest.slice(0, at) + rest.slice(at + token.length);
    return true;
  });
  return tokensKept && namesOf(source) === namesOf(translated);
};

const lineOf = (relativePath, needle) => {
  const at = readFileSync(new URL(relativePath, ROOT), 'utf8').split('\n').findIndex((line) => line.startsWith(needle));
  return at < 0 ? '' : ` (line ${at + 1})`;
};

/** gaps: [{ family, kind, questionId, template, seen }] -> the message the author reads. */
const spanishGapReport = (gaps) => {
  const byFamily = new Map();
  gaps.forEach((gap) => byFamily.set(gap.family, [...(byFamily.get(gap.family) || []), gap]));
  return [
    `${gaps.length} sentence${gaps.length === 1 ? '' : 's'} of a worked solution a support family writes ${gaps.length === 1 ? 'has' : 'have'} no Spanish yet.`,
    'Solution Review offers Translate beside it, so this stays strict (CI14): a student who needs Spanish gets the whole worked solution in it.',
    `Put each pair in ${SPANISH_SUPPORT_PACK}, in ${PACK_LIST}${lineOf(SPANISH_SUPPORT_PACK, `const ${PACK_LIST}`)}, under its family.`,
    'The Spanish carries the same {1} {2} ..., each once, where that mathematics goes.',
    ...[...byFamily].flatMap(([family, list]) => [
      '',
      `${family}  (${familyFile(family)})`,
      ...list.flatMap((gap) => [
        `  ${gap.kind}, ${gap.questionId}:`,
        `    ['${gap.template.replace(/'/g, "\\'")}', ''],`,
        `    as a student sees it: ${gap.seen}`,
      ]),
    ]),
  ].join('\n');
};

test('every sentence of the four families\' worked solutions of the real lessons is in Spanish, its mathematics untouched', async () => {
  const pack = await loadLanguagePack('es');
  const gaps = new Map();
  const lost = [];
  const notFull = [];
  const tally = Object.fromEntries(FAMILIES.map(([family]) => [family, { solutions: 0, sentences: 0 }]));
  workedSolutions().forEach(({ family, questionId, worked }) => {
    tally[family].solutions += 1;
    partsOf(worked).forEach(({ kind, text, joined = false }) => {
      const result = translateWithPack(text, pack);
      result.sentences.filter((sentence) => !sentence.mathOnly).forEach((sentence) => {
        if (!joined) tally[family].sentences += 1;
        if (sentence.translated) return;
        // One entry per sentence shape, however many numbers it was drawn with.
        const template = asPackTemplate(sentence.source);
        const key = `${family}\n${template}`;
        if (!gaps.has(key)) gaps.set(key, { family, kind, questionId, template, seen: sentence.source });
      });
      // Full, or (a step that is only mathematics) nothing to translate.
      const whole = result.coverage === TRANSLATION_COVERAGE.FULL
        || (result.coverage === TRANSLATION_COVERAGE.NOT_APPLICABLE && result.proseCount === 0 && result.text === text);
      if (!whole) notFull.push(`${family} ${questionId} (${kind}): ${result.coverage}`);
      if (!mathSurvives(text, result.text)) lost.push(`${family} ${questionId} (${kind}): ${text}\n  → ${result.text}`);
    });
  });
  // Not vacuous: each family still claims real questions and writes for them.
  FAMILIES.forEach(([family]) => assert.ok(tally[family].solutions >= 10 && tally[family].sentences >= 50, `${family}: ${JSON.stringify(tally[family])}`));
  if (gaps.size) assert.fail(spanishGapReport([...gaps.values()]));
  assert.deepEqual(notFull, [], 'every part translates in full');
  assert.deepEqual(lost, [], 'the mathematics of every sentence survives');
});

test('a worked-solution sentence with no Spanish is reported with its family file, the template to paste and where it goes', () => {
  // A sentence no family writes: its template, pasted as it is, translates it.
  const seen = 'Line Q passes through (1, 2) and (3, 8), so it rises 3 for each 1 to the right.';
  const template = asPackTemplate(seen);
  assert.equal(template, 'Line {1} passes through {2} and {3}, so it rises {4} for each {5} to the right.');
  const pasted = { language: 'es', sentences: compileTemplates([[template, 'La recta {1} pasa por {2} y {3}, así que sube {4} por cada {5} hacia la derecha.']]), choices: [] };
  assert.equal(translateWithPack(seen, pasted).text, 'La recta Q pasa por (1, 2) y (3, 8), así que sube 3 por cada 1 hacia la derecha.');
  const report = spanishGapReport([{ family: 'perpendicularLines', kind: 'step 2', questionId: 'l3-pr-1', template, seen }]);
  for (const part of ['perpendicularLines', 'src/platform/supports/families/perpendicularLines.js', `['${template}', '']`, seen,
    SPANISH_SUPPORT_PACK, `${PACK_LIST} (line `, 'step 2, l3-pr-1']) {
    assert.ok(report.includes(part), `the report says ${part}`);
  }
  // The list the report names is where the pack keeps these sentences.
  assert.match(readFileSync(new URL(SPANISH_SUPPORT_PACK, ROOT), 'utf8'), new RegExp(`^const ${PACK_LIST} = \\[`, 'm'));
  // Each family the test reads is the file the report names.
  FAMILIES.forEach(([family]) => assert.ok(readFileSync(new URL(familyFile(family), ROOT), 'utf8').includes('export const workedSolution'), family));
});
