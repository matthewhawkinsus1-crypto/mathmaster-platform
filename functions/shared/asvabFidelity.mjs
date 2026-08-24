/**
 * ASVAB fidelity analysis.
 *
 * This module answers a question the ordinary Path quality gate cannot: an item
 * can generate cleanly, grade correctly and still be a poor ASVAB item. It
 * looks at four things the mathematical validators are blind to.
 *
 *   1. ANSWER-KEY BIAS. The bank this replaced built every distractor as
 *      `correct + 1`, `correct + 2`, `correct + 3`. Every choice list was
 *      shuffled, so no position bias existed — and 99.8% of numeric items were
 *      still answerable without reading the question, by taking the smallest of
 *      the four numbers. Shuffling hides position bias; it does nothing about
 *      magnitude bias. This checks the ranks the key actually lands on.
 *
 *   2. UNDERLYING-TASK CLONING. Five families per standard is only useful if
 *      they measure the skill five ways. "A car travels…", "A truck travels…"
 *      and "A bus travels…" are three surface forms of one task. The fingerprint
 *      here is built from the generator's relation graph, so renaming the nouns
 *      does not change it.
 *
 *   3. SURFACE-LANGUAGE CLONING. The complement of the above: two items can
 *      compute different things through an identical sentence frame.
 *
 *   4. REGISTER. ASVAB Arithmetic Reasoning is concise practical quantitative
 *      prose; Mathematics Knowledge is mostly direct symbolic mathematics.
 *      Neither reads like the SAT, and neither tells the student which
 *      procedure to run. Difficulty is supposed to come from the mathematics,
 *      not from the sentence.
 *
 * Pure and dependency-free so the import gate, the audit script and the tests
 * can all share one definition of what "authentic" means here.
 */

export const ASVAB_DOMAINS = Object.freeze({
  ARITHMETIC_REASONING: 'arithmeticReasoning',
  MATHEMATICS_KNOWLEDGE: 'mathematicsKnowledge',
});

export const ASVAB_DOMAIN_IDS = Object.freeze([
  ASVAB_DOMAINS.ARITHMETIC_REASONING,
  ASVAB_DOMAINS.MATHEMATICS_KNOWLEDGE,
]);

/** Misconception codes a distractor may claim. A distractor that cannot name
 *  the error it represents is decoration, and decoration is what produced the
 *  `+1 / +2 / +3` bank. */
export const DISTRACTOR_ERRORS = Object.freeze({
  RATIO_REVERSED: 'ratioReversed',
  WRONG_PERCENT_BASE: 'wrongPercentBase',
  PERCENT_NOT_APPLIED: 'percentNotApplied',
  FORGOT_FINAL_STEP: 'forgotFinalStep',
  OFF_BY_ONE_STEP: 'offByOneStep',
  UNIT_CONVERSION: 'unitConversion',
  CONVERTED_WRONG_WAY: 'convertedWrongWay',
  OPERATION_INVERTED: 'operationInverted',
  DIAMETER_FOR_RADIUS: 'diameterForRadius',
  AREA_PERIMETER_SWAP: 'areaPerimeterSwap',
  EXPONENT_ERROR: 'exponentError',
  SIGN_ERROR: 'signError',
  INCOMPLETE_FACTORING: 'incompleteFactoring',
  ORDER_OF_OPERATIONS: 'orderOfOperations',
  USED_GIVEN_VALUE: 'usedGivenValue',
  ROUNDED_WRONG: 'roundedWrong',
  SIMPLE_FOR_COMPOUND: 'simpleForCompound',
  PARTIAL_TOTAL: 'partialTotal',
  MEAN_MEDIAN_SWAP: 'meanMedianSwap',
  ARITHMETIC_SLIP: 'arithmeticSlip',
});

const ERROR_CODES = new Set(Object.values(DISTRACTOR_ERRORS));

export const isDistractorErrorCode = (value) => ERROR_CODES.has(String(value || ''));

// --- small helpers -------------------------------------------------------------

const text = (value) => String(value ?? '');

const numericLabel = (label) => {
  const bare = text(label)
    // `\$` is an escaped dollar sign inside math mode — a money label reads
    // `$\$12$`. Strip the escape before the delimiters, or every money item
    // silently drops out of the bias check instead of failing it.
    .replace(/\\\$/g, '')
    .replace(/\$/g, '')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{},]/g, '')
    .trim();
  if (!/^-?\d+(?:\.\d+)?$/.test(bare)) return null;
  const value = Number(bare);
  return Number.isFinite(value) ? value : null;
};

const correctChoiceId = (question) => {
  const field = (question?.responseFields || []).find((entry) => entry?.inputProfile === 'choice');
  return field ? text(field.expected) : '';
};

// --- 1. answer-key bias --------------------------------------------------------

/**
 * How concentrated may the key's rank be before the pattern is exploitable?
 *
 * Chance is 0.25, but 0.25 is not a reachable target and demanding it would be
 * dishonest. A one-step proportion draws only two independent quantities, so
 * every distractor built from them moves with one of those two and the key can
 * land on at most two distinct ranks — 0.5 is the floor the mathematics allows,
 * not a sign of lazy authoring. Richer items with three or more independent
 * draws do better and are held to the same bar.
 *
 * `RANK_TOLERANCE` is therefore set just above that floor. `EXTREME_TOLERANCE`
 * is the one that guards the actually cheap exploit — "always pick the smallest"
 * or "always pick the largest" — and is held tighter.
 */
export const RANK_TOLERANCE = 0.55;
export const EXTREME_TOLERANCE = 0.45;

/**
 * Where does the key land among the choices, across many draws?
 *
 * Reports two independent things. `position` is the index in the choice list as
 * the student sees it, which the runtime shuffle should already randomize.
 * `rank` is the index after sorting the four numbers, which the shuffle cannot
 * touch and which is the channel the previous bank leaked through.
 */
export const analyzeAnswerKeyBias = (instances, { tolerance = RANK_TOLERANCE, extremeTolerance = EXTREME_TOLERANCE } = {}) => {
  const rank = [0, 0, 0, 0];
  const position = [0, 0, 0, 0];
  let numeric = 0;
  let nonNumeric = 0;

  for (const instance of instances) {
    const choices = instance?.choices || [];
    if (choices.length !== 4) continue;
    const keyId = correctChoiceId(instance);
    const keyIndex = choices.findIndex((choice) => text(choice.id) === keyId);
    if (keyIndex < 0) continue;

    position[keyIndex] += 1;
    const values = choices.map((choice) => numericLabel(choice.label));
    if (values.some((value) => value === null)) { nonNumeric += 1; continue; }
    numeric += 1;
    const sorted = [...values].sort((a, b) => a - b);
    rank[sorted.indexOf(values[keyIndex])] += 1;
  }

  const issues = [];
  const share = (count, total) => (total ? count / total : 0);
  // Four choices means chance is 0.25. `tolerance` sets how far above chance a
  // single slot may sit before the pattern is exploitable; 0.5 flags a bank a
  // student could beat by always picking the same extreme.
  if (numeric >= 8) {
    rank.forEach((count, index) => {
      const value = share(count, numeric);
      if (value >= tolerance) {
        issues.push({
          code: 'answerKeyMagnitudeBias',
          detail: `the key is the ${['smallest', '2nd smallest', '2nd largest', 'largest'][index]} of the four in ${(value * 100).toFixed(0)}% of draws`,
        });
      }
    });
  }
  if (numeric >= 8) {
    const extremes = [['smallest', rank[0]], ['largest', rank[3]]];
    for (const [name, count] of extremes) {
      const value = share(count, numeric);
      if (value >= extremeTolerance) {
        issues.push({ code: 'answerKeyExtremeBias', detail: `the key is the ${name} of the four in ${(value * 100).toFixed(0)}% of draws` });
      }
    }
  }

  const positioned = position.reduce((sum, count) => sum + count, 0);
  if (positioned >= 8) {
    position.forEach((count, index) => {
      if (share(count, positioned) >= tolerance) {
        issues.push({ code: 'answerKeyPositionBias', detail: `the key sits at position ${index + 1} in ${(share(count, positioned) * 100).toFixed(0)}% of draws` });
      }
    });
  }

  return { numeric, nonNumeric, rank, position, issues };
};

// --- 2. underlying-task fingerprint --------------------------------------------

/**
 * Reduce one generator expression to its shape: identifiers become their role,
 * numeric literals become `#`, operators survive. `speed*hours` and
 * `rate*minutes` both become `A*G` when `speed`/`rate` is the answer.
 */
const expressionSkeleton = (expression, roleOf) => text(expression)
  .replace(/\s+/g, '')
  .replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (name) => (
    Object.prototype.hasOwnProperty.call(roleOf, name) ? roleOf[name] : (/^(abs|min|max|round|floor|ceil|sign|sqrt|pow|gcd)$/.test(name) ? name : 'H')
  ))
  .replace(/\b\d+(?:\.\d+)?\b/g, '#');

const placeholderNames = (value, found = new Set()) => {
  if (typeof value === 'string') {
    const pattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*[A-Za-z]+\s*)?\}\}/g;
    for (let match = pattern.exec(value); match; match = pattern.exec(value)) found.add(match[1]);
    return found;
  }
  if (Array.isArray(value)) { value.forEach((entry) => placeholderNames(entry, found)); return found; }
  if (value && typeof value === 'object') { Object.values(value).forEach((entry) => placeholderNames(entry, found)); return found; }
  return found;
};

/** Coarse tag for the kind of numbers involved — two items with the same
 *  relation shape are less clone-like when one works in whole units and the
 *  other in fractions or percents. */
const numberDomain = (question) => {
  const parameters = question?.generator?.parameters || {};
  const tags = new Set();
  for (const spec of Object.values(parameters)) {
    const type = text(spec?.type || 'int');
    if (type === 'decimal') tags.add('decimal');
    else if (type === 'choice') tags.add('choice');
    else if (Number(spec?.min) < 0) tags.add('signed');
    else tags.add('int');
  }
  return [...tags].sort().join('+') || 'none';
};

/**
 * A structural signature of what the item actually asks the student to do.
 *
 * Built from the relation graph rather than the prose, so swapping every noun
 * in the prompt leaves it unchanged — which is exactly the property needed to
 * catch five families that are one task wearing five costumes.
 */
export const taskFingerprint = (question) => {
  const generator = question?.generator || {};
  const derived = generator.derived && typeof generator.derived === 'object' ? generator.derived : {};
  const parameters = generator.parameters && typeof generator.parameters === 'object' ? generator.parameters : {};

  const keyId = correctChoiceId(question);
  const keyChoice = (question?.choices || []).find((choice) => text(choice.id) === keyId);
  const answerNames = [...placeholderNames(text(keyChoice?.label || ''))];

  // Everything the student can read, minus the choice labels: these are the
  // quantities the item hands over.
  const shown = placeholderNames({
    prompt: question?.prompt, stimulus: question?.stimulus, formulaLatex: question?.formulaLatex,
  });

  const roleOf = {};
  for (const name of [...Object.keys(parameters), ...Object.keys(derived)]) {
    if (answerNames.includes(name)) roleOf[name] = 'A';
    else if (shown.has(name)) roleOf[name] = 'G';
    else roleOf[name] = 'H';
  }

  const relations = Object.entries(derived)
    .map(([name, expression]) => `${roleOf[name] || 'H'}:=${expressionSkeleton(expression, roleOf)}`)
    .sort()
    .join(';');

  const constraints = (Array.isArray(generator.constraints) ? generator.constraints : [])
    .map((expression) => expressionSkeleton(expression, roleOf))
    .sort()
    .join(';');

  const answerIsDerived = answerNames.some((name) => Object.prototype.hasOwnProperty.call(derived, name));

  return [
    `given=${[...shown].filter((name) => roleOf[name]).length}`,
    `ask=${answerIsDerived ? 'derived' : 'parameter'}`,
    `num=${numberDomain(question)}`,
    `rel=${relations || 'none'}`,
    `con=${constraints || 'none'}`,
  ].join('|');
};

// --- 3. surface-language fingerprint -------------------------------------------

const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'and', 'or', 'but',
  'is', 'are', 'was', 'were', 'be', 'been', 'has', 'have', 'had', 'if', 'then', 'than', 'that',
  'this', 'these', 'those', 'each', 'every', 'per', 'how', 'many', 'much', 'what', 'which', 'who',
  'when', 'where', 'it', 'its', 'they', 'their', 'he', 'she', 'his', 'her', 'as', 'so', 'not',
  'more', 'less', 'most', 'least', 'after', 'before', 'during', 'over', 'under', 'about', 'into',
  'does', 'do', 'did', 'will', 'would', 'can', 'could', 'should', 'there', 'all', 'both', 'same',
]);

/** The sentence frame with the subject matter removed. */
export const promptSkeleton = (prompt) => text(prompt)
  .replace(/\{\{[^}]*\}\}/g, '#')
  .replace(/\$[^$]*\$/g, '#')
  .replace(/\d+(?:\.\d+)?/g, '#')
  .toLowerCase()
  .replace(/[^a-z#?.,\s]/g, ' ')
  .split(/\s+/)
  .filter((word) => word && (FUNCTION_WORDS.has(word) || word === '#' || /^[?.,]+$/.test(word)))
  .join(' ')
  .trim();

const shingles = (prompt, size = 4) => {
  const words = text(prompt)
    .replace(/\{\{[^}]*\}\}/g, '#')
    .replace(/\d+(?:\.\d+)?/g, '#')
    .toLowerCase()
    .replace(/[^a-z#\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const set = new Set();
  for (let index = 0; index + size <= words.length; index += 1) set.add(words.slice(index, index + size).join(' '));
  return set;
};

export const promptOverlap = (left, right, size = 4) => {
  const a = shingles(left, size);
  const b = shingles(right, size);
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const gram of a) if (b.has(gram)) shared += 1;
  return shared / (a.size + b.size - shared);
};

// --- 4. register ---------------------------------------------------------------

/** Phrases that hand the student the procedure. AR is supposed to test
 *  deciding what arithmetic to do, so naming the operation gives away the task. */
const PROCEDURE_TELLS = [
  /\buse the [a-z\s-]*formula\b/i,
  /\bapply the [a-z\s-]*(formula|property|rule|theorem)\b/i,
  /\busing the (percent|distance|interest|area|perimeter|volume) formula\b/i,
  /\bset up a proportion\b/i,
  /\bdivide .* by .* to (find|get|determine)\b/i,
  /\bmultiply .* by .* to (find|get|determine)\b/i,
  /\brecall that\b/i,
  /\bremember that\b/i,
];

/** Register borrowed from another assessment. The SAT's habit of narrating a
 *  study, a researcher and a model before asking anything does not belong in
 *  either ASVAB subtest. */
const FOREIGN_REGISTER = [
  /\b(researcher|scientist|study|survey|data set|dataset)\b/i,
  /\bthe (function|equation) shown models\b/i,
  /\bwhich of the following (best|most) \w+\b/i,
  /\bbased on the (passage|text|information above)\b/i,
];

const sentences = (prompt) => text(prompt).split(/(?<=[.?!])\s+/).map((entry) => entry.trim()).filter(Boolean);
const words = (prompt) => text(prompt).replace(/\$[^$]*\$/g, ' # ').split(/\s+/).filter(Boolean);

export const AR_WORD_LIMIT = 48;
export const MK_WORD_LIMIT = 34;

export const analyzeRegister = (question) => {
  const issues = [];
  const domain = text(question?.assessmentContext?.domainId || question?.assessmentContext?.subtest);
  const prompt = text(question?.prompt);
  const wordCount = words(prompt).length;
  const sentenceCount = sentences(prompt).length;

  for (const pattern of PROCEDURE_TELLS) {
    if (pattern.test(prompt)) issues.push({ code: 'procedureTold', detail: `prompt names the procedure: ${pattern}` });
  }
  for (const pattern of FOREIGN_REGISTER) {
    if (pattern.test(prompt)) issues.push({ code: 'foreignRegister', detail: `register belongs to another assessment: ${pattern}` });
  }

  if (domain === ASVAB_DOMAINS.ARITHMETIC_REASONING) {
    if (wordCount > AR_WORD_LIMIT) issues.push({ code: 'arTooLong', detail: `${wordCount} words; Arithmetic Reasoning stays under ${AR_WORD_LIMIT}` });
    if (sentenceCount > 3) issues.push({ code: 'arTooManySentences', detail: `${sentenceCount} sentences` });
    if (!/[?]\s*$/.test(prompt.trim()) && !/^(find|how|what|which)\b/i.test(prompt.trim())) {
      issues.push({ code: 'arNoQuestion', detail: 'an Arithmetic Reasoning item ends in a direct question' });
    }
  } else if (domain === ASVAB_DOMAINS.MATHEMATICS_KNOWLEDGE) {
    if (wordCount > MK_WORD_LIMIT) issues.push({ code: 'mkTooLong', detail: `${wordCount} words; Mathematics Knowledge stays under ${MK_WORD_LIMIT}` });
    if (sentenceCount > 2) issues.push({ code: 'mkTooManySentences', detail: `${sentenceCount} sentences` });
  } else {
    issues.push({ code: 'unknownDomain', detail: `domainId must be one of ${ASVAB_DOMAIN_IDS.join(', ')}` });
  }

  return { wordCount, sentenceCount, issues };
};

// --- 5. distractor rationale ---------------------------------------------------

export const analyzeDistractors = (question) => {
  const issues = [];
  const choices = question?.choices || [];
  const keyId = correctChoiceId(question);
  if (choices.length !== 4) {
    issues.push({ code: 'choiceCount', detail: `${choices.length} choices; ASVAB items offer four` });
    return { issues };
  }
  if (!choices.some((choice) => text(choice.id) === keyId)) {
    issues.push({ code: 'keyMissing', detail: `no choice carries the expected id "${keyId}"` });
  }
  for (const choice of choices) {
    if (text(choice.id) === keyId) continue;
    if (!isDistractorErrorCode(choice.error)) {
      issues.push({ code: 'distractorUnexplained', detail: `choice "${choice.id}" names no misconception` });
    }
  }
  const errors = choices.filter((choice) => text(choice.id) !== keyId).map((choice) => text(choice.error));
  if (new Set(errors).size !== errors.length) {
    issues.push({ code: 'distractorErrorsRepeat', detail: `three distractors should represent three different errors: ${errors.join(', ')}` });
  }
  return { issues };
};

// --- 6. whole-standard analysis ------------------------------------------------

/**
 * The five-family check. Two families clone each other when their relation
 * graphs match, and separately when their sentence frames match.
 */
export const analyzeFamilySet = (code, questions, { overlapLimit = 0.5 } = {}) => {
  const issues = [];
  const fingerprints = new Map();
  for (const question of questions) {
    const print = taskFingerprint(question);
    if (!fingerprints.has(print)) fingerprints.set(print, []);
    fingerprints.get(print).push(question.id);
  }
  for (const [print, ids] of fingerprints) {
    if (ids.length > 1) issues.push({ code: 'taskClone', detail: `${ids.join(' + ')} share one task structure`, fingerprint: print, ids });
  }

  for (let i = 0; i < questions.length; i += 1) {
    for (let j = i + 1; j < questions.length; j += 1) {
      const left = questions[i];
      const right = questions[j];
      if (promptSkeleton(left.prompt) && promptSkeleton(left.prompt) === promptSkeleton(right.prompt)) {
        issues.push({ code: 'frameClone', detail: `${left.id} + ${right.id} share one sentence frame`, ids: [left.id, right.id] });
      }
      const overlap = promptOverlap(left.prompt, right.prompt);
      if (overlap > overlapLimit) {
        issues.push({ code: 'promptOverlap', detail: `${left.id} + ${right.id} overlap ${(overlap * 100).toFixed(0)}% of 4-grams`, ids: [left.id, right.id] });
      }
    }
  }

  return { code, families: questions.length, distinctTasks: fingerprints.size, issues };
};

export default {
  ASVAB_DOMAINS,
  RANK_TOLERANCE,
  EXTREME_TOLERANCE,
  ASVAB_DOMAIN_IDS,
  DISTRACTOR_ERRORS,
  analyzeAnswerKeyBias,
  analyzeDistractors,
  analyzeFamilySet,
  analyzeRegister,
  isDistractorErrorCode,
  promptOverlap,
  promptSkeleton,
  taskFingerprint,
};
