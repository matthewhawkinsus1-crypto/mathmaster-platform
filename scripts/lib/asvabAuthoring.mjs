// Authoring kit for the ASVAB Arithmetic Reasoning and Mathematics Knowledge
// banks.
//
// Two rules, both learned from the bank this replaces.
//
//   DISTRACTORS ARE ERRORS, NOT NEIGHBOURS. The previous bank built every
//   distractor as `correct + 1`, `correct + 2`, `correct + 3`. Choices were
//   shuffled, so no position bias existed — and 99.8% of numeric items were
//   still answerable without reading the question by taking the smallest of the
//   four numbers. Here every distractor is an expression over the SAME drawn
//   parameters that computes what a student gets after one identified mistake,
//   and it must name that mistake. Wrong answers then land on both sides of the
//   key because real errors do.
//
//   CORRECTNESS BY CONSTRUCTION. Generators draw the quantities the situation
//   starts from and derive everything shown from them, so no draw can produce
//   an item whose key is wrong. Matching the repository convention in
//   scripts/author-middle-school-dok3.mjs.
//
// THE DISTRACTOR RECIPE, learned the hard way while rebuilding the first few
// standards. For a numeric key, supply:
//
//   1. one error that OVERSHOOTS the key,
//   2. one error that UNDERSHOOTS it,
//   3. one that is a different real quantity from the same situation, drawn
//      from a range that overlaps the key's range so it lands on either side.
//
// (1) and (2) bracket the key, so it can never be the smallest or largest of
// the four — which kills the "always pick the smallest" exploit outright. (3)
// then moves the key between the two middle ranks as the parameters are drawn.
//
// A key computed as the PRODUCT of two drawn quantities is the awkward shape:
// adding instead of multiplying, using a given value, and stopping a step short
// all land below it, so without a deliberate overshoot it is the largest of the
// four every single time. Two-quantity items also cannot do better than a
// 50/50 split between the two middle ranks, because every distractor is a
// function of the same two draws — that is the floor the mathematics allows,
// not sloppy authoring, and the thresholds in asvabFidelity.mjs are set to it.
//
// A THIRD RULE, about constraints. `generatePathInstance` redraws past values
// listed in `exclude`, but a failed CONSTRAINT costs a whole attempt. So a
// constraint that fails often does not merely slow generation down — it biases
// the draws that survive. `num < den` with `num` drawn 1..19 and `den` drawn
// from {4, 5, 8, 10, 20} silently produced a bank dominated by den = 20,
// because that was the only value the constraint rarely rejected. Prefer
// parameter ranges where the constraint is satisfied by construction.
//
// The kit emits nothing a student should not see: distractor error codes live
// on the template and are stripped by functions/lib/mathPath.js normalizeChoices
// before a question reaches the browser.

import { ASVAB_DOMAINS, isDistractorErrorCode } from '../../functions/shared/asvabFidelity.mjs';

export const AR = ASVAB_DOMAINS.ARITHMETIC_REASONING;
export const MK = ASVAB_DOMAINS.MATHEMATICS_KNOWLEDGE;

const slugId = (value) => String(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

/** `$…$` unless the label is already wrapped or is deliberately prose. */
export const money = (expression) => `$\\$${expression}$`;
export const plain = (expression) => `$${expression}$`;



/**
 * Opaque, non-revealing choice ids.
 *
 * The bank this replaces gave the key the id `asvab-correct` and the runtime
 * shipped choice ids to the browser, so the answer was readable in the network
 * payload without doing any mathematics. Ids here are neutral, and which id the
 * key receives is decided per family by hashing the family id — so it is
 * neither always the first nor guessable from one family to the next.
 */
const CHOICE_IDS = ['choice-a', 'choice-b', 'choice-c', 'choice-d'];

const hashSeed = (value) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const permuteForFamily = (choices, familyKey) => {
  const order = choices.map((choice, index) => index);
  let seed = hashSeed(familyKey);
  for (let index = order.length - 1; index > 0; index -= 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const swap = seed % (index + 1);
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order.map((position) => choices[position]);
};

const labelPlaceholders = (label) => {
  const names = [];
  const pattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*[A-Za-z]+\s*)?\}\}/g;
  for (let match = pattern.exec(String(label)); match; match = pattern.exec(String(label))) names.push(match[1]);
  return names;
};

/**
 * Force the four choices apart for every draw.
 *
 * Hand-written `a!=b` lists miss pairs — one missing pair shipped a draw
 * reading 17, 16, 16, 15, which is an unanswerable item rather than a hard one.
 * Deriving the pairs from the labels means the guarantee holds for every family
 * without an author having to remember it.
 */
const distinctChoiceConstraints = (choices, generator) => {
  const names = choices.map((choice) => labelPlaceholders(choice.label)).filter((list) => list.length === 1).map((list) => list[0]);
  const known = new Set(Object.keys(generator?.parameters || {}).concat(Object.keys(generator?.derived || {})));
  const usable = [...new Set(names)].filter((name) => known.has(name));
  const existing = new Set((generator?.constraints || []).map((entry) => String(entry).replace(/\s+/g, '')));
  const added = [];
  for (let i = 0; i < usable.length; i += 1) {
    for (let j = i + 1; j < usable.length; j += 1) {
      const forward = `${usable[i]}!=${usable[j]}`;
      const backward = `${usable[j]}!=${usable[i]}`;
      if (!existing.has(forward) && !existing.has(backward)) added.push(forward);
    }
  }
  return added;
};

/**
 * One ASVAB item.
 *
 * `choices` is authored as `[{ label, error }]` with exactly one entry carrying
 * `correct: true`. Ids are assigned here so no author can accidentally leak the
 * key through a memorable id, and the runtime shuffles the list per draw.
 */
export const asvabItem = ({
  code, domain, slug, courseId, prompt, choices, reasoning, answerSummary,
  hint, feedback, generator, stimulus = null, difficultyBand = 2, dok = 2,
  taskType = 'application', representation = 'context', rankAnalysisNotApplicable = false,
}) => {
  if (!code || !slug) throw new Error('An ASVAB item needs a TEKS code and a slug.');
  if (domain !== AR && domain !== MK) throw new Error(`${code}/${slug}: domain must be an ASVAB subtest id.`);
  const correct = choices.filter((choice) => choice.correct === true);
  if (correct.length !== 1) throw new Error(`${code}/${slug}: exactly one choice is the key, found ${correct.length}.`);
  if (choices.length !== 4) throw new Error(`${code}/${slug}: ASVAB items offer four choices, found ${choices.length}.`);
  for (const choice of choices) {
    if (choice.correct) continue;
    if (!isDistractorErrorCode(choice.error)) throw new Error(`${code}/${slug}: distractor "${choice.label}" names no misconception.`);
  }
  const errors = choices.filter((choice) => !choice.correct).map((choice) => choice.error);
  if (new Set(errors).size !== errors.length) throw new Error(`${code}/${slug}: three distractors must represent three different errors.`);

  const withDistinctChoices = {
    ...generator,
    constraints: [...(generator?.constraints || []), ...distinctChoiceConstraints(choices, generator)],
  };

  const familyKey = `${code}:${slug}`;
  const ordered = permuteForFamily(choices, familyKey);
  const built = ordered.map((choice, index) => ({
    id: CHOICE_IDS[index],
    label: choice.label,
    ...(choice.correct ? {} : { error: choice.error }),
  }));
  const keyId = CHOICE_IDS[ordered.findIndex((choice) => choice.correct === true)];

  // "Which does not match?" belongs here for the same reason as "which is
  // largest?": three records name one share and the fourth names another, so
  // the odd one out is necessarily the extreme value. Finding it IS the task,
  // and the three matching records are written in three different forms, so
  // nothing gives it away without doing the mathematics.
  const comparisonTask = /\b(largest|greatest|smallest|least|biggest|closest)\b/i.test(prompt)
    || /\b(does not match|odd one out|is wrong|do not agree|disagrees)\b/i.test(prompt);
  if (rankAnalysisNotApplicable && !comparisonTask) {
    throw new Error(`${code}/${slug}: rank analysis may only be waived on an item that asks the student to compare the choices.`);
  }

  return {
    id: `mm_asvab_${slugId(code)}_${slugId(slug)}`,
    active: true,
    alignmentKeys: [`texas:${code}`],
    alignments: [
      { framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' },
      { framework: 'asvab', domainId: domain, role: 'primary', evidenceMode: 'direct' },
    ],
    // `domainId` is the canonical field the server sanitizer reads. `subtest`
    // stays alongside it because teacher-facing ASVAB screens shipped against
    // that name; both carry the same value, so neither can drift.
    assessmentContext: { framework: 'asvab', examStyle: true, domainId: domain, subtest: domain },
    courseId,
    familyId: `mathmaster:asvab:${code}:${slug}`,
    familyVersion: 2,
    questionType: 'multipleChoice',
    activityRole: 'practice',
    difficultyBand,
    dok,
    // The ASVAB permits no calculator. The platform's canonical policy carries
    // that; nothing here invents a second calculator mode.
    calculatorPolicy: 'none',
    examCalculatorMode: 'none',
    assessedConstruct: code,
    taskType,
    representation,
    authoring: { source: 'MathMaster ASVAB fidelity rebuild', kit: 'ccmr-asvab-v2.1' },
    prompt,
    ...(rankAnalysisNotApplicable ? { rankAnalysisNotApplicable: true } : {}),
    ...(stimulus ? { stimulus } : {}),
    solutionReview: { headline: answerSummary.headline, reasoning, answerSummary: answerSummary.text },
    attemptFeedback: [feedback],
    supportHints: [hint],
    generator: withDistinctChoices,
    assessmentItemFormat: 'multipleChoice',
    choices: built,
    responseFields: [{ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected: keyId }],
  };
};

/** Context words drawn per instance, so the situation varies while the
 *  mathematics stays fixed. Not a substitute for a second task structure. */
export const contextParam = (values) => ({ type: 'choice', values });

/**
 * The five-family requirement, checked at build time.
 *
 * functions/shared/pathStandardQuality.mjs will not call a standard
 * production-ready until its polished families span three representations,
 * three kinds of thinking, two DOK levels and two difficulty bands. That is the
 * platform's own statement of what the brief means by "five useful ways of
 * measuring the skill", so it is enforced here rather than discovered later by
 * the import gate.
 */
export const assertStandardVariety = (items) => {
  const byCode = new Map();
  for (const item of items) {
    if (!byCode.has(item.assessedConstruct)) byCode.set(item.assessedConstruct, []);
    byCode.get(item.assessedConstruct).push(item);
  }
  const problems = [];
  for (const [code, group] of byCode) {
    const distinct = (key) => new Set(group.map((item) => item[key])).size;
    if (group.length !== 5) problems.push(`${code}: ${group.length} families, expected 5`);
    if (distinct('representation') < 3) problems.push(`${code}: ${distinct('representation')} representations, needs 3`);
    if (distinct('taskType') < 3) problems.push(`${code}: ${distinct('taskType')} task types, needs 3`);
    if (distinct('dok') < 2) problems.push(`${code}: every family sits at one DOK level`);
    if (distinct('difficultyBand') < 2) problems.push(`${code}: every family sits at one difficulty band`);
  }
  if (problems.length) throw new Error(`ASVAB standard variety:\n  ${problems.join('\n  ')}`);
  return byCode.size;
};

export default { AR, MK, asvabItem, assertStandardVariety, contextParam, money, plain };
