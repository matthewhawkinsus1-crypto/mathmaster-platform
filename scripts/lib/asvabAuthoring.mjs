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
// A FIFTH RULE, and the one most easily got wrong: THE CROSSING DISTRACTOR MUST
// BE INDEPENDENT OF THE KEY, not merely overlapping in range. A pyramid's base
// area drawn 6..120 against a key of 3Bh running 36..5040 looks like an overlap
// and is nothing of the kind — the key is built FROM the base area, so their
// ratio never passes one and the key was the second largest of four in every
// single draw. Anything that divides the key, or that the key is a fixed
// multiple of, is disqualified however its range reads. What works is a second
// quantity the situation genuinely contains and that is drawn separately: the
// other pyramid's volume, the other machine's rate, the second row of the
// table. Then the two are drawn apart and the crossing is real.
//
// A SIXTH RULE, about where the crossing threshold falls. When a distractor
// beats the key exactly when some drawn value passes a fixed number — three
// times the base beats the key when the height multiplier is under three — the
// range has to be even about that number AFTER the automatic distinctness
// constraints have taken their bites. Those constraints remove exactly the
// values that make two choices equal, and those are usually the values sitting
// on the threshold. One family drew a multiplier 1..6 around a threshold of 3
// and had 1 and 3 both removed, leaving nothing below the line at all.

// A FOURTH RULE, about drawn context words. Every `choice` parameter is drawn
// INDEPENDENTLY, so two of them can never be relied on to agree. Naming a unit
// in one parameter and its partner in another produced "how many ounces are in
// 11 hours?" and "how many grams are in 51 kilograms?" with the table saying
// 1 kilogram = 100 grams — nonsense items that every mathematical gate passed,
// because the arithmetic was consistent and only the words were wrong. Drawn
// words must each be valid on their own. Where a unit pair and its conversion
// factor have to match, fix them for that family and take the variety from the
// other four families in the standard.
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
/**
 * Unit markup that may trail a value in a choice label.
 *
 * Every entry here is a trap that has already been sprung: a label ending in
 * one of these does not reduce to a bare placeholder, so the anchored match in
 * `distinctChoiceConstraints` fails and the choice silently loses its
 * distinctness constraint. Percentages shipped 20%, 160%, 20%, 80%; degrees
 * shipped a repeated angle. ANY new unit markup used in a label must be added
 * here, or the same failure recurs quietly.
 */
const UNIT_SUFFIXES = [
  ['percent', /\\?%$/],
  ['degrees', /\^\{?\\circ\}?$/],
  // A circle answer is usually left as a multiple of pi, so `{{rsq}}\pi` and
  // `{{fourR}}\pi` are two coefficients of the same unit and comparing them is
  // exactly the right test. Without this a circumference family shipped
  // 8pi, 4pi, 16pi, 16pi whenever the radius was drawn as four.
  ['pi', /\\pi$/],
];

const distinctChoiceConstraints = (choices, generator) => {
  const known = new Set(Object.keys(generator?.parameters || {}).concat(Object.keys(generator?.derived || {})));
  // Compare the values the labels DISPLAY, not the parameter names. A label of
  // `-{{p}}` and one of `{{r}}` are different names but the same number
  // whenever r = -p, and constraining the names let that through: a
  // closest-to-zero item shipped a draw reading 5, -2, -35, -35.
  //
  // The unit a label carries has to survive that reduction. `$\${{a}}$` is a
  // money label and `${{a}}\%$` a percentage; stripping the markup down to the
  // bare name defeats the anchored match below, and the choice silently loses
  // its distinctness constraint. That is exactly how the Arithmetic Reasoning
  // bank came to ship draws reading $8, $64, $8, $8 and 20%, 160%, 20%, 80%.
  // Keeping the unit also stops a percentage being constrained against a plain
  // number that happens to share a name, which would reject draws for no
  // reason and skew the ones that survive.
  const valueOf = (label) => {
    let bare = String(label).replace(/\s+/g, '').replace(/^\$/, '').replace(/\$$/, '');
    let unit = '';
    if (bare.startsWith('\\$')) {
      unit = 'money';
      bare = bare.slice(2);
    }
    for (const [name, pattern] of UNIT_SUFFIXES) {
      const found = pattern.exec(bare);
      if (!found) continue;
      unit = name;
      bare = bare.slice(0, bare.length - found[0].length);
      break;
    }
    const match = /^(-?)\{\{([A-Za-z_][A-Za-z0-9_]*)(?:\|[A-Za-z]+)?\}\}$/.exec(bare);
    if (!match || !known.has(match[2])) return null;
    return { unit, expression: match[1] === '-' ? `0-${match[2]}` : match[2] };
  };

  // Labels built from more than one placeholder (a mixed number, a fraction, a
  // whole sentence) cannot be reduced to a value expression, so they get no
  // automatic constraint and the author has to rule out the collision by hand.
  const byUnit = new Map();
  for (const choice of choices) {
    const value = valueOf(choice.label);
    if (!value) continue;
    if (!byUnit.has(value.unit)) byUnit.set(value.unit, new Set());
    byUnit.get(value.unit).add(value.expression);
  }
  const existing = new Set((generator?.constraints || []).map((entry) => String(entry).replace(/\s+/g, '')));
  const added = [];
  for (const group of byUnit.values()) {
    const usable = [...group];
    for (let i = 0; i < usable.length; i += 1) {
      for (let j = i + 1; j < usable.length; j += 1) {
        const forward = `${usable[i]}!=${usable[j]}`;
        const backward = `${usable[j]}!=${usable[i]}`;
        if (!existing.has(forward) && !existing.has(backward)) added.push(forward);
      }
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
