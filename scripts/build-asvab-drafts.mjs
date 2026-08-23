// Build the direct ASVAB Math Path bank from the verified generative
// course bank. This is not a relabel operation: every output is converted to
// the ASVAB four-option multiple-choice format,
// tool-only course interactions become discrete assessment items, and each
// question declares direct ASVAB subtest alignment.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExamDomainIds, TEKS_EXAM_CROSSWALK } from '../src/platform/assessment/teksExamCrosswalk.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SEED_DIR = path.join(ROOT, 'functions/seeds/pathQuestionBank');
const OUTPUT = path.join(ROOT, 'drafts/asvab.json');
const FRAMEWORK = 'asvab';
const TARGET_SPR = 0; // ASVAB Math uses multiple-choice items; no student-produced response items.

const documentsIn = (parsed) => (Array.isArray(parsed) ? parsed : (parsed.documents || parsed.items || parsed.questions || []));
const codeOf = (q) => String(q?.alignmentKeys?.[0] || '').replace(/^texas:/i, '');
const safe = (value) => String(value).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const clone = (value) => JSON.parse(JSON.stringify(value));

// A few legacy seed strings were authored through JavaScript string literals
// where `\\times`/`\\text` lost their leading backslash (`\\t` became a tab),
// and a small set of unit labels arrived as ` ext{...}`. Normalize only those
// unmistakable math-encoding defects. Do not replace the English word "times".
const normalizeMathEncoding = (value) => {
  if (typeof value === 'string') {
    return value
      .replace(/\u0009imes/g, '\\\\times')
      .replace(/\u0009ext\{/g, '\\\\text{')
      .replace(/ ext\{/g, ' \\\\text{');
  }
  if (Array.isArray(value)) return value.map(normalizeMathEncoding);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeMathEncoding(child)]));
  }
  return value;
};

const asvabCodes = new Set(Object.keys(TEKS_EXAM_CROSSWALK).filter((code) => getExamDomainIds(code, FRAMEWORK).length));
const courseQuestions = [];
for (const name of readdirSync(SEED_DIR).filter((entry) => entry.endsWith('_pathQuestionBank_seed.json')).sort()) {
  const parsed = JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'));
  for (const q of documentsIn(parsed)) {
    if (q?.assessmentContext?.framework && q.assessmentContext.framework !== 'course') continue;
    if (asvabCodes.has(codeOf(q))) courseQuestions.push(q);
  }
}

if (courseQuestions.length !== 730) {
  throw new Error(`Expected 730 ASVAB-mapped course families, found ${courseQuestions.length}.`);
}

const mathWrap = (profile, raw) => {
  const text = String(raw ?? '');
  if (profile === 'text') return text;
  if (/^\$[\s\S]*\$$/.test(text)) return text;
  return `$${text}$`;
};

const firstPlaceholder = (text) => {
  const match = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*([A-Za-z]+)\s*)?\}\}/.exec(String(text ?? ''));
  return match ? { whole: match[0], name: match[1], filter: match[2] || null } : null;
};

const placeholderNames = (text) => {
  const names = new Set();
  const pattern = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\|\s*[A-Za-z]+\s*)?\}\}/g;
  for (let match = pattern.exec(String(text ?? '')); match; match = pattern.exec(String(text ?? ''))) names.add(match[1]);
  return names;
};

const replaceFirstPlaceholder = (text, replacementName, filter = null) => {
  const hit = firstPlaceholder(text);
  if (!hit) return text;
  return String(text).replace(hit.whole, `{{${replacementName}${filter ? `|${filter}` : ''}}}`);
};

const ensureDerived = (q, baseName) => {
  q.generator = clone(q.generator || {});
  q.generator.parameters = clone(q.generator.parameters || {});
  q.generator.derived = clone(q.generator.derived || {});
  const stem = `asvab_${safe(baseName).slice(0, 24)}`;
  let index = 1;
  let p1 = `${stem}_p1`;
  while (Object.prototype.hasOwnProperty.call(q.generator.derived, p1) || Object.prototype.hasOwnProperty.call(q.generator.parameters, p1)) {
    index += 1;
    p1 = `${stem}_p${index}`;
  }
  const p2 = `${p1}_2`;
  const p3 = `${p1}_3`;
  q.generator.derived[p1] = `${baseName}+1`;
  q.generator.derived[p2] = `${baseName}+2`;
  q.generator.derived[p3] = `${baseName}+3`;
  return [p1, p2, p3];
};

const choiceField = () => ({ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected: 'asvab-correct' });

const makeChoicesFromExpected = (q, profile, expected) => {
  const correct = mathWrap(profile, expected);
  if (profile === 'inequality') {
    const ops = ['<=', '>=', '<', '>'];
    const present = ops.find((op) => String(expected).includes(op));
    if (present) {
      const alternatives = ops.filter((op) => op !== present).map((op) => mathWrap(profile, String(expected).replace(present, op)));
      return [
        { id: 'asvab-correct', label: correct },
        { id: 'asvab-d1', label: alternatives[0] },
        { id: 'asvab-d2', label: alternatives[1] },
        { id: 'asvab-d3', label: alternatives[2] },
      ];
    }
  }

  if (String(expected) === 'x' && profile === 'expression') {
    return [
      { id: 'asvab-correct', label: '$x$' },
      { id: 'asvab-d1', label: '$-x$' },
      { id: 'asvab-d2', label: '$x+1$' },
      { id: 'asvab-d3', label: '$1/x$' },
    ];
  }

  const hit = firstPlaceholder(expected);
  if (!hit) {
    const fallback = profile === 'text'
      ? ['The opposite conclusion is true.', 'The result is undefined.', 'The information given is insufficient to determine the result.']
      : ['$0$', '$1$', '$-1$'];
    return [
      { id: 'asvab-correct', label: correct },
      { id: 'asvab-d1', label: fallback[0] },
      { id: 'asvab-d2', label: fallback[1] },
      { id: 'asvab-d3', label: fallback[2] },
    ];
  }

  const names = ensureDerived(q, hit.name);
  const variants = names.map((name) => mathWrap(profile, replaceFirstPlaceholder(expected, name, hit.filter)));
  return [
    { id: 'asvab-correct', label: correct },
    { id: 'asvab-d1', label: variants[0] },
    { id: 'asvab-d2', label: variants[1] },
    { id: 'asvab-d3', label: variants[2] },
  ];
};

const normalizePunctuation = (text) => {
  const trimmed = String(text || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  return /[?.!]$/.test(trimmed) ? trimmed : `${trimmed}?`;
};

const stripCourseToolLanguage = (text) => normalizePunctuation(String(text || '')
  .replace(/\bUse the (?:algebra )?workspace to\s*/ig, '')
  .replace(/\busing the workspace\b/ig, '')
  .replace(/\band graph the solution\b/ig, '')
  .replace(/\bthen graph the solution\b/ig, '')
  .replace(/\band graph it\b/ig, '')
  .replace(/\bgraph the solution\b/ig, '')
  .replace(/\bBuild the mapping for\b/ig, 'Consider')
  .replace(/\bMap the inverse relation built from\b/ig, 'Consider the inverse relation built from')
  .replace(/\bPlot two points on\b/ig, 'For')
  .replace(/\bPlot the line\b/ig, 'For the line')
  .replace(/\bGraph the horizontal line\b/ig, 'For the horizontal line')
  .replace(/\bGraph\s+/ig, 'Consider ')
  .replace(/\bplotting\b/ig, 'using')
  .replace(/\s+,/g, ',')
  .replace(/\s{2,}/g, ' '));

const expectedFromTool = (q) => {
  if (q.type === 'stepAlgebra' && q.answer != null) {
    return { profile: 'number', expected: q.answer, prompt: `What is the value of $${q.variable || 'x'}$ in $${q.equation}$?` };
  }
  if (q.type === 'systemsWorkspace') {
    return {
      profile: 'orderedPair',
      expected: '({{x}},{{y}})',
      prompt: stripCourseToolLanguage(q.prompt).replace(/identify the intersection\.?$/i, 'What is the intersection?'),
    };
  }
  if (q.type === 'intervalNumberLine') {
    const intervals = Array.isArray(q.expectedIntervals) ? q.expectedIntervals : [];
    const one = intervals[0];
    if (!one) return null;
    let expected = null;
    if (one.min == null && one.max != null) expected = `x ${one.maxClosed ? '<=' : '<'} ${one.max}`;
    else if (one.max == null && one.min != null) expected = `x ${one.minClosed ? '>=' : '>'} ${one.min}`;
    else if (one.min != null && one.max != null) {
      expected = `${one.min} ${one.minClosed ? '<=' : '<'} x ${one.maxClosed ? '<=' : '<'} ${one.max}`;
    }
    if (!expected) return null;
    return { profile: 'inequality', expected, prompt: stripCourseToolLanguage(q.prompt) };
  }
  if (q.type === 'functionInvestigation') {
    const analysis = Array.isArray(q.analysisRequests) ? q.analysisRequests[0] : null;
    if (analysis?.expected?.length) {
      const rawExpected = analysis.expected[0];
      const numeric = /^\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\}$/.test(String(rawExpected)) || typeof rawExpected === 'number';
      const profile = numeric ? 'number' : (/^\s*\(/.test(String(rawExpected)) ? 'orderedPair' : 'text');
      const math = (String(q.prompt).match(/\$[^$]+\$/) || [])[0];
      const lead = math ? `For ${math}, ` : '';
      const ask = String(analysis.label || 'Which statement is correct?').replace(/^[Ww]hat is\s+/, 'what is ');
      return { profile, expected: rawExpected, prompt: normalizePunctuation(`${lead}${ask}`) };
    }
    const points = Array.isArray(q.pointTasks) ? q.pointTasks : [];
    const point = points.slice().sort((left, right) => {
      const score = (task) => JSON.stringify(task?.expected || []).match(/\{\{/g)?.length || 0;
      return score(right) - score(left);
    })[0] || null;
    if (point?.expected?.length === 2) {
      const expected = `(${point.expected[0]},${point.expected[1]})`;
      const math = (String(q.prompt).match(/\$[^$]+\$/) || [])[0];
      return { profile: 'orderedPair', expected, prompt: normalizePunctuation(`${math ? `For ${math}, ` : ''}which ordered pair satisfies the equation`) };
    }
  }
  if (q.type === 'relationMapping') {
    const relation = (q.pairs || []).map((pair) => `(${pair.x},${pair.y})`).join(',');
    const summary = `${q.solutionReview?.answerSummary || ''} ${q.solutionReview?.reasoning?.join(' ') || ''}`.toLowerCase();
    const correct = summary.includes('not a function') ? 'The relation is not a function.' : 'The relation is a function.';
    return {
      profile: 'text',
      expected: correct,
      prompt: `Consider the relation $\\{${relation}\\}$. Which statement is true?`,
      fixedChoices: [
        correct,
        correct.includes('not a function') ? 'The relation is a function.' : 'The relation is not a function.',
        'The relation has no domain.',
        'The relation has no range.',
      ],
    };
  }
  return null;
};

const sourceChoicePools = new Map();
for (const q of courseQuestions) {
  const code = codeOf(q);
  const pool = sourceChoicePools.get(code) || [];
  for (const option of (q.choices || [])) {
    const label = String(option?.label ?? '').trim();
    if (label && !pool.includes(label)) pool.push(label);
  }
  sourceChoicePools.set(code, pool);
}

const makeExistingChoiceFour = (q, source) => {
  const field = source.responseFields?.[0];
  const expectedId = String(field?.expected ?? '');
  const original = clone(source.choices || []);
  const correct = original.find((choice) => String(choice.id) === expectedId);
  if (!correct) throw new Error(`${source.id}: choice expected id not found`);
  const used = new Set([String(correct.label)]);
  const options = [{ id: 'asvab-correct', label: correct.label }];
  for (const choice of original) {
    if (String(choice.id) === expectedId) continue;
    const label = String(choice.label ?? '');
    if (!label || used.has(label)) continue;
    used.add(label);
    options.push({ id: `asvab-d${options.length}`, label });
    if (options.length === 4) break;
  }
  // A sibling choice from the SAME TEKS is a better distractor than a generic
  // escape hatch, but only when every placeholder it uses is bound by this
  // template. That prevents borrowing a label that mentions another family's
  // parameter (the first ASVAB draft correctly failed on exactly that defect).
  const bound = new Set([
    ...Object.keys(source.generator?.parameters || {}),
    ...Object.keys(source.generator?.derived || {}),
  ]);
  const siblingLabels = sourceChoicePools.get(codeOf(source)) || [];
  for (const label of siblingLabels) {
    if (options.length === 4) break;
    if (!label || used.has(label)) continue;
    const required = [...placeholderNames(label)];
    if (required.some((name) => !bound.has(name))) continue;
    used.add(label);
    options.push({ id: `asvab-d${options.length}`, label });
  }

  const generic = [
    'The information given is insufficient to determine the result.',
    'The result is undefined.',
    'None of the stated relationships is satisfied.',
  ];
  for (const label of generic) {
    if (options.length === 4) break;
    if (used.has(label)) continue;
    used.add(label);
    options.push({ id: `asvab-d${options.length}`, label });
  }
  return options;
};

const baseItem = (source, familyIndex) => {
  const code = codeOf(source);
  const domains = getExamDomainIds(code, FRAMEWORK);
  const sourceSlug = String(source.familyId || source.id).split(':').pop().replace(/^gen-/, '');
  // A2.6L legitimately spans both ASVAB math subtests. Its applied sharing
  // family is Arithmetic Reasoning; the direct inverse-variation families are
  // Mathematics Knowledge. Every other mapped TEKS has one ASVAB domain.
  const domainId = code === 'A2.6L' && /inverse-context/.test(sourceSlug)
    ? 'arithmeticReasoning'
    : (domains.includes('mathematicsKnowledge') ? 'mathematicsKnowledge' : domains[0]);
  const out = {
    id: `mm_asvab_${safe(code)}_${familyIndex + 1}_${safe(sourceSlug)}`,
    active: true,
    alignmentKeys: [`texas:${code}`],
    alignments: [
      { framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' },
      { framework: FRAMEWORK, domainId, role: 'primary', evidenceMode: 'direct' },
    ],
    assessmentContext: { framework: FRAMEWORK, examStyle: true, subtest: domainId },
    courseId: source.courseId,
    familyId: `mathmaster:asvab:${code}:${sourceSlug}`,
    familyVersion: 1,
    questionType: 'response',
    activityRole: 'practice',
    difficultyBand: source.difficultyBand,
    dok: Math.min(3, Math.max(1, Number(source.dok) || 1)),
    calculatorPolicy: 'none',
    examCalculatorMode: 'none',
    assessedConstruct: source.assessedConstruct || code,
    taskType: source.taskType || 'procedural',
    representation: source.representation || 'symbolic',
    prompt: stripCourseToolLanguage(source.prompt),
    solutionReview: clone(source.solutionReview || {}),
    attemptFeedback: clone(source.attemptFeedback || ['Recheck the relationship and try the most direct mathematical route.']),
    supportHints: clone(source.supportHints || ['Identify the quantity the question asks for before calculating.']),
    generator: clone(source.generator),
  };
  if (source.stimulus != null) out.stimulus = clone(source.stimulus);
  if (source.table != null) out.table = clone(source.table);
  if (source.data != null) out.data = clone(source.data);
  if (source.context != null) out.context = clone(source.context);
  if (source.referenceInfo != null) out.referenceInfo = clone(source.referenceInfo);
  return out;
};

// First pass: normalize every course family to one ASVAB-answerable field. We do
// not choose MCQ vs SPR yet; that is selected globally so the bank has the
// authentic exam-level response-format mix.
const normalized = [];
const byCodeCount = new Map();
for (const source of courseQuestions) {
  const code = codeOf(source);
  const familyIndex = byCodeCount.get(code) || 0;
  byCodeCount.set(code, familyIndex + 1);
  const q = baseItem(source, familyIndex);
  let profile;
  let expected;
  let sourceWasChoice = false;
  let fixedChoices = null;

  if (Array.isArray(source.responseFields) && source.responseFields.length) {
    const field = source.responseFields[0];
    profile = String(field.inputProfile || 'number');
    expected = field.expected;
    sourceWasChoice = profile === 'choice';
    if (sourceWasChoice) fixedChoices = makeExistingChoiceFour(q, source);
  } else {
    const converted = expectedFromTool(source);
    if (!converted) throw new Error(`${source.id}: unsupported tool conversion (${source.type || 'unknown'})`);
    profile = converted.profile;
    expected = converted.expected;
    q.prompt = converted.prompt;
    fixedChoices = converted.fixedChoices || null;
  }

  // Preserve a concise answer review but remove tool-only language from the
  // headline. The original reasoning is retained because it is tied to the
  // same generator parameters and has already passed the course integrity gate.
  q.solutionReview = {
    ...(q.solutionReview || {}),
    headline: `ASVAB placement reasoning: ${String(q.solutionReview?.headline || 'use the defining relationship').replace(/[.]$/, '')}.`,
  };

  normalized.push({ q, source, profile, expected, sourceWasChoice, fixedChoices });
}

// ASVAB Arithmetic Reasoning and Mathematics Knowledge use multiple-choice.
// TARGET_SPR stays zero so every normalized source becomes a four-option item.
const hash = (text) => {
  let value = 2166136261;
  for (const char of String(text)) { value ^= char.charCodeAt(0); value = Math.imul(value, 16777619); }
  return value >>> 0;
};
const numericCandidates = normalized.filter((entry) => entry.profile === 'number' && !entry.sourceWasChoice);
if (numericCandidates.length < TARGET_SPR) throw new Error(`Only ${numericCandidates.length} numeric SPR candidates; need ${TARGET_SPR}.`);
const sprIds = new Set(numericCandidates
  .slice()
  .sort((a, b) => hash(a.q.id) - hash(b.q.id) || a.q.id.localeCompare(b.q.id))
  .slice(0, TARGET_SPR)
  .map((entry) => entry.q.id));

const output = [];
for (const entry of normalized) {
  const { q, profile, expected, sourceWasChoice, fixedChoices } = entry;
  if (sprIds.has(q.id)) {
    q.responseFields = [{ id: 'answer', label: 'Answer', inputProfile: 'number', expected }];
    q.assessmentItemFormat = 'studentProducedResponse';
  } else {
    q.assessmentItemFormat = 'multipleChoice';
    if (sourceWasChoice) {
      q.choices = fixedChoices;
    } else if (Array.isArray(fixedChoices) && fixedChoices.length === 4) {
      q.choices = fixedChoices.map((label, index) => ({ id: index === 0 ? 'asvab-correct' : `asvab-d${index}`, label }));
    } else {
      q.choices = makeChoicesFromExpected(q, profile, expected);
    }
    q.responseFields = [choiceField()];
  }
  output.push(q);
}

const byCode = new Map();
for (const q of output) {
  const code = codeOf(q);
  const list = byCode.get(code) || [];
  list.push(q);
  byCode.set(code, list);
}
const badFamilies = [...byCode.entries()].filter(([, qs]) => qs.length !== 5);
if (byCode.size !== 146 || badFamilies.length) {
  throw new Error(`ASVAB family count mismatch: ${byCode.size} standards; bad=${JSON.stringify(badFamilies.map(([c, qs]) => [c, qs.length]))}`);
}
const mcq = output.filter((q) => q.assessmentItemFormat === 'multipleChoice');
const spr = output.filter((q) => q.assessmentItemFormat === 'studentProducedResponse');
if (mcq.length !== 730 || spr.length !== 0) throw new Error(`ASVAB format mismatch MCQ=${mcq.length}, SPR=${spr.length}`);
if (mcq.some((q) => q.choices?.length !== 4)) throw new Error('Every ASVAB MCQ must have exactly four options.');

const ASVAB_FULL_CHOICE_OVERRIDES = {
  'mm_asvab_A2_2A_3_cube_root_graph': ['all real numbers', '$x \\ge 0$', '$x > 0$', '$x \\ne 0$'],
  'mm_asvab_8_3B_5_compare_attributes': [
    'They are similar; side lengths are multiplied by {{k}}.',
    'They are congruent because all corresponding angles have equal measure.',
    'They are similar; side lengths are divided by {{k}}.',
    'They are not similar because the image has different side lengths.',
  ],
  'mm_asvab_6_8A_2_triangle_inequality': [
    'Yes; the sum of every two side lengths is greater than the third side length.',
    'No; the two shorter side lengths add to exactly the longest side length.',
    'No; the longest side length is greater than the sum of the other two side lengths.',
    'Yes; any three positive side lengths can form a triangle.',
  ],
  'mm_asvab_6_8A_3_not_a_triangle': [
    'No; the sum of two side lengths is not greater than the third side length.',
    'Yes; all three side lengths are positive.',
    'Yes; the longest side length is at least as large as either shorter side length.',
    'No; a triangle can be formed only when all three side lengths are equal.',
  ],
  'mm_asvab_A_12E_1_solve_linear_literal': [
    '$P/{{a}}-w$',
    '$P/{{a}}+w$',
    '$P-{{a}}w$',
    '$(P-w)/{{a}}$',
  ],
  'mm_asvab_A_12E_4_solve_area_height': [
    '$A/({{k}}b)$',
    '$A/{{k}}-b$',
    '${{k}}A/b$',
    '$A/({{k}}+b)$',
  ],
};

const ASVAB_CHOICE_COMPLETIONS = {
  'mm_asvab_A2_6K_4_notation_error': ['Only values $x<{{h}}$ are allowed.'],
  'mm_asvab_6_4B_3_compare_unit_rates': ['Both stores have the same cost per item.'],
  'mm_asvab_6_4C_4_same_attribute_check': ['${{a}}$ red marbles to ${{b}}$ kilograms'],
  'mm_asvab_6_4D_3_ratio_or_rate': ['A percent', 'A scale factor'],
  'mm_asvab_6_4G_5_equivalent_form_choice': ['${{dec}}\\%$'],
  'mm_asvab_6_6B_5_choose_equation': ['$y=x/{{k}}$'],
  'mm_asvab_6_6C_5_representation_match': ['$y=x/{{k}}$', '$y={{k}}+x$'],
  'mm_asvab_6_8B_5_formula_from_decomposition': ['${{b2}}{{h}}/2$'],
  'mm_asvab_6_8C_4_trapezoid_equation': ['$({{b1}}+{{b2}})x/2=2{{A}}$'],
  'mm_asvab_6_10B_1_equation_true': ['The equation has no solution.'],
  'mm_asvab_6_10B_2_equation_false': ['Every value of $x$ makes the equation true.'],
  'mm_asvab_6_10B_3_inequality_true': ['The inequality has no solutions.', 'Every real number satisfies the inequality.'],
  'mm_asvab_6_10B_4_inequality_boundary': ['The inequality has no solutions.', 'Only values less than {{a}} satisfy it.'],
  'mm_asvab_6_12A_5_choose_display': ['Scatterplot'],
  'mm_asvab_6_12C_5_summary_comparison': ['The data sets have the same range.', 'Neither data set has a range.'],
  'mm_asvab_6_12D_4_percent_bar_largest': ['A and C are tied.'],
  'mm_asvab_6_13A_5_boxplot_center_compare': ['The distributions have the same median.', 'Neither distribution has a median.'],
  'mm_asvab_7_4A_4_match_equation': ['$y={{r}}$'],
  'mm_asvab_7_4B_5_compare_unit_rates': ['The plans have the same cost per unit.', 'Both plans cost $0$ per unit.'],
  'mm_asvab_7_4C_5_compare_k': ['The constants of proportionality are equal.', 'Both constants of proportionality are 0.'],
  'mm_asvab_7_4E_5_choose_conversion': ['${{inch}}\\times25$'],
  'mm_asvab_7_5B_5_compare_circles': ['Both ratios are approximately 1.'],
  'mm_asvab_7_5C_5_compare_scales': ['The drawing lengths are equal.', 'Both drawing lengths are 0.'],
  'mm_asvab_7_6A_4_missing_outcome': ['A list with exactly {{s}} total outcomes'],
  'mm_asvab_7_6C_5_reasonableness': ['About 0 occurrences'],
  'mm_asvab_7_6D_5_compare_probabilities': ['The events are equally likely.', 'Neither event can occur.'],
  'mm_asvab_7_6E_5_complement_check': ['No, because complementary events must have equal probabilities.', 'Yes, but only when $P(E)=0$.'],
  'mm_asvab_7_7_4_compare_representations': ['The relationships have the same rate of change.', 'Their rates of change cannot be determined from the information given.'],
  'mm_asvab_7_8A_1_volume_ratio': ['The pyramid volume is three times the prism volume.'],
  'mm_asvab_7_9A_5_compare_solids': ['The prism has one-third the volume of the pyramid.'],
  'mm_asvab_7_9B_5_area_vs_circumference_formula': ['$\\pi{{r}}$', '$2\\pi({{r}})^2$'],
  'mm_asvab_7_9C_5_decomposition_choice': ['${{w}}{{h}}+({{b}}+{{t}})/2$'],
  'mm_asvab_7_9D_5_net_method': ['$2lw+2h$'],
  'mm_asvab_7_10A_4_match_model': ['${{m}}x={{total}}+{{b}}$'],
  'mm_asvab_7_11B_3_boundary_inclusive': ['No value of $x$ satisfies the inequality.'],
  'mm_asvab_7_11C_5_angle_equation_choice': ['$x+{{a}}=360$'],
  'mm_asvab_7_12B_3_sample_method': ['Select the first residents alphabetically from the city list.'],
  'mm_asvab_7_13A_5_compare_tax_rates': ['The two purchases have equal tax.', 'No tax is collected on either purchase.'],
  'mm_asvab_7_13E_4_compare_interest': ['Neither account earns interest.'],
  'mm_asvab_8_2B_5_pi_comparison': ['$\\pi={{n}}/100$', '$\\pi=0$'],
  'mm_asvab_8_2C_3_valid_form': ['$10^{{e}}+{{c}}$'],
  'mm_asvab_8_2C_5_compare_magnitudes': ['The quantities are equal.', 'Quantity A is 10 times smaller than Quantity B.'],
  'mm_asvab_8_3A_5_proportion_check': ['${{ak}}/{{a}}={{c}}/{{ck}}$', '${{ak}}+{{a}}={{ck}}+{{c}}$'],
  'mm_asvab_8_3C_5_error_translation': ['It is a rotation because the coordinates are multiplied by {{k}}.', 'It is a reflection because every coordinate changes sign.'],
  'mm_asvab_8_4A_5_similar_triangles': ['The second triangle has twice the slope of the first.', 'Slope cannot be compared using rise and run.'],
  'mm_asvab_8_4B_5_proportional_check': ['$y=x+{{k}}$', '$y={{k}}$'],
  'mm_asvab_8_4C_5_error_rate': ['Divide the run {{dx}} by the rise {{rise}}.', 'Use only the $y$-intercept to determine slope.'],
  'mm_asvab_8_5A_5_compare_representations': ['$y=x+{{k}}$', '$y={{k}}$'],
  'mm_asvab_8_5B_5_contrast_proportional': ['$y=({{m}}+1)x$', '$y=x/{{m}}$'],
  'mm_asvab_8_5D_5_extrapolation_error': ['Predictions are always more accurate ouasvabde the observed range.', 'The input must be changed to {{hi}} before the model can be used.'],
  'mm_asvab_8_5E_5_error_intercept': ['Direct variation must have slope 0.', 'A direct-variation relationship cannot be graphed.'],
  'mm_asvab_8_5I_5_error_model': ['$y={{b}}-{{r}}$'],
  'mm_asvab_8_6A_5_formula_meaning': ['Volume is circumference times height.', 'Volume is base area divided by height.'],
  'mm_asvab_8_6C_5_error_lengths': ['${{a}}^2+{{b}}^2=({{a}}+{{b}})^2$'],
  'mm_asvab_8_7A_5_compare_solids': ['The solids have equal volume.', 'The cone volume is three times the cylinder volume.'],
  'mm_asvab_8_7B_5_lateral_vs_total': ['Total surface area equals lateral area minus the two bases.', 'Lateral area includes the bases but total surface area does not.'],
  'mm_asvab_8_7C_5_error_sum': ['Check whether ${{a}}^2+{{b}}^2=({{a}}+{{b}})^2$.'],
  'mm_asvab_8_7D_5_error_manhattan': ['Use the larger of {{a}} and {{b}} as the distance.', 'Use $|{{a}}-{{b}}|$ as the distance.'],
  'mm_asvab_8_8A_2_verbal_match': ['${{m}}x-{{a}}={{n}}x+{{b}}$', '${{m}}x+{{a}}={{n}}x-{{b}}$'],
  'mm_asvab_8_8A_5_error_sign': ['${{start}}-{{d}}t={{other}}-{{f}}t$', '${{start}}+{{d}}t={{other}}-{{f}}t$'],
  'mm_asvab_8_8C_5_special_case': ['Exactly two solutions'],
  'mm_asvab_8_9_5_parallel_error': ['Infinitely many intersections.', 'Exactly two intersections.'],
  'mm_asvab_8_10C_2_reflection_name': ['A $180^\\circ$ rotation about the origin'],
  'mm_asvab_8_10D_5_error_area_factor': ['Area is multiplied by ${{k}}^3$.', 'Area is multiplied by $2{{k}}$.'],
  'mm_asvab_8_11B_5_compare_spread': ['The data sets have equal spread.', 'Neither data set has measurable spread.'],
  'mm_asvab_8_12B_5_compare_total_cost': ['The loans have equal total repayment.', 'Both total repayments are $0$.'],
  'mm_asvab_8_12C_5_early_saving': ['Fewer contributions but more time for growth.', 'The same number of contributions and the same growth time.'],
  'mm_asvab_8_12D_5_compare_methods': ['The methods always earn exactly the same amount.', 'Neither method earns interest.'],
};

// Human-authored ASVAB editorial overrides. These are intentionally small and
// explicit: the compiler handles response-format mechanics, while these edits
// preserve content quality where an automatic conversion would leave a thin or
// near-duplicate family.
const byId = new Map(output.map((question) => [question.id, question]));


// ASVAB-specific editorial layer -------------------------------------------------
// The framework crosswalk is intentionally narrower than some full TEKS. These
// rewrites keep the five-family requirement while staying inside the documented
// ASVAB slice of each partial standard. The answer is still generated from the
// same parameters as the displayed question.
const replaceWithExpectedChoice = (id, {
  prompt, expected, profile = 'number', headline, reasoning = [], answerSummary,
  taskType, representation, dok, mutateGenerator,
}) => {
  const question = byId.get(id);
  if (!question) throw new Error(`${id}: ASVAB editorial rewrite target not found.`);
  if (mutateGenerator) mutateGenerator(question.generator);
  question.prompt = prompt;
  if (taskType) question.taskType = taskType;
  if (representation) question.representation = representation;
  if (dok) question.dok = dok;
  question.solutionReview = {
    headline,
    reasoning,
    answerSummary: answerSummary || mathWrap(profile, expected),
  };
  question.choices = makeChoicesFromExpected(question, profile, expected);
  question.responseFields = [choiceField()];
  question.assessmentItemFormat = 'multipleChoice';
};

replaceWithExpectedChoice('mm_asvab_A_2A_3_context_domain', {
  prompt: 'For $f(x)={{rate}}x+{{fee}}$ on $0\\le x\\le{{maxh}}$, what is the greatest value in the range?',
  expected: '{{maxout}}',
  headline: 'Evaluate the increasing linear function at the right endpoint.',
  reasoning: ['Because the slope {{rate}} is positive, the greatest output occurs at $x={{maxh}}$.', '$f({{maxh}})={{rate}}({{maxh}})+{{fee}}={{maxout}}$.'],
  taskType: 'interpretation', representation: 'symbolic', dok: 2,
  mutateGenerator: (g) => { g.derived = { ...(g.derived || {}), maxout: 'fee+rate*maxh' }; },
});
const a2aRangeTable = byId.get('mm_asvab_A_2A_3_context_domain');
if (a2aRangeTable) {
  a2aRangeTable.prompt = 'The table shows endpoint values of a linear function on $0\\le x\\le{{maxh}}$. What is the greatest value in the range?';
  a2aRangeTable.stimulus = { table: { headers: ['x', 'f(x)'], rows: [['0', '{{fee}}'], ['{{maxh}}', '{{maxout}}']] } };
  a2aRangeTable.representation = 'table';
}
replaceWithExpectedChoice('mm_asvab_A_2A_5_discrete_domain', {
  prompt: 'For $f(r)={{seats}}r$ on $0\\le r\\le{{rows}}$, what is the greatest value in the range?',
  expected: '{{maxout}}',
  headline: 'Use the largest allowed input in the increasing linear function.',
  reasoning: ['Because {{seats}} is positive, the greatest output occurs at $r={{rows}}$.', '$f({{rows}})={{seats}}({{rows}})={{maxout}}$.'],
  taskType: 'interpretation', representation: 'symbolic', dok: 2,
  mutateGenerator: (g) => { g.derived = { ...(g.derived || {}), maxout: 'rows*seats' }; },
});
replaceWithExpectedChoice('mm_asvab_A_6A_2_range_up', {
  prompt: 'For $y={{a}}(x-{{h}})^2 {{k|signed}}$, what is the least value in the range?',
  expected: '{{k}}',
  headline: 'An upward-opening parabola has its minimum at the vertex.',
  reasoning: ['The coefficient {{a}} is positive, so the parabola opens upward.', 'The vertex has $y$-coordinate ${{k}}$, so no output is smaller.'],
  taskType: 'interpretation', representation: 'symbolic', dok: 2,
});
replaceWithExpectedChoice('mm_asvab_A_6A_3_projectile_range', {
  prompt: 'For $y=-{{a}}(x-{{v}})^2+{{maxh}}$, what is the greatest value in the range?',
  expected: '{{maxh}}',
  headline: 'A downward-opening parabola has its maximum at the vertex.',
  reasoning: ['The leading coefficient is negative, so the parabola opens downward.', 'The vertex has $y$-coordinate ${{maxh}}$, which is the greatest output.'],
  taskType: 'interpretation', representation: 'symbolic', dok: 2,
});
replaceWithExpectedChoice('mm_asvab_A2_4G_3_radical_domain_numberline', {
  prompt: 'Solve $\\sqrt{x-({{h}})}={{r}}$ by checking the generated candidate. Which value of $x$ satisfies the original equation?',
  expected: '{{candidate}}',
  headline: 'Undo the square root and check the result in the original equation.',
  reasoning: ['$x-({{h}})={{r}}^2$, so $x={{candidate}}$.', 'Substitution gives $\\sqrt{{{r2}}}={{r}}$.'],
  taskType: 'procedural', representation: 'symbolic', dok: 2,
  mutateGenerator: (g) => {
    g.parameters = { h: g.parameters.h, r: { type: 'int', min: 2, max: 9 } };
    g.derived = { r2: 'r*r', candidate: 'h+r*r' };
    delete g.constraints;
  },
});
replaceWithExpectedChoice('mm_asvab_A2_4G_5_reverse_domain_check', {
  prompt: 'After squaring a radical equation containing $\\sqrt{x-({{h}})}$, a candidate $x={{candidate}}$ appears. What is the value of the radicand $x-({{h}})$ for this candidate?',
  expected: '{{radicand}}',
  headline: 'Substitute the candidate into the original radicand.',
  reasoning: ['$x-({{h}})={{candidate}}-({{h}})={{radicand}}$.', 'Because this is negative, the candidate is extraneous in the real-number equation.'],
  taskType: 'interpretation', representation: 'symbolic', dok: 2,
  mutateGenerator: (g) => {
    g.parameters = { h: g.parameters.h, r: { type: 'int', min: 1, max: 9 } };
    g.derived = { candidate: 'h-r', radicand: '-r' };
    delete g.constraints;
  },
});
replaceWithExpectedChoice('mm_asvab_A2_6E_4_measurement_context', {
  prompt: 'For $|x-{{target}}|={{d}}$, what is the smaller solution?',
  expected: '{{low}}',
  headline: 'An absolute-value equation gives two symmetric cases.',
  reasoning: ['$x={{target}}-{{d}}={{low}}$ or $x={{target}}+{{d}}={{high}}$.', 'The smaller solution is ${{low}}$.'],
  taskType: 'procedural', representation: 'symbolic', dok: 2,
});
replaceWithExpectedChoice('mm_asvab_A2_7C_3_zero_remainder_meaning', {
  prompt: 'Divide $P(x)=x^3+({{B}})x^2+({{C}})x+({{D}})$ by $x-({{d}})$. What is the coefficient of $x$ in the quotient?',
  expected: '{{q}}',
  headline: 'Polynomial division recovers the generated quadratic quotient.',
  reasoning: ['The dividend was formed as $(x-({{d}}))(x^2+{{q}}x+{{r}})$.', 'So the coefficient of $x$ in the quotient is ${{q}}$.'],
  taskType: 'procedural', representation: 'symbolic', dok: 2,
});
replaceWithExpectedChoice('mm_asvab_A2_7C_4_division_error', {
  prompt: 'When $P(x)=x^3+({{B}})x^2+({{C}})x+({{D}})$ is divided by $x-({{d}})$, what remainder is left?',
  expected: '{{rem}}',
  headline: 'Carry the division through to its remainder.',
  reasoning: ['The generated dividend is $(x-({{d}}))(x^2+{{q}}x+{{r}})+{{rem}}$.', 'Therefore the remainder is ${{rem}}$.'],
  taskType: 'procedural', representation: 'symbolic', dok: 2,
});
replaceWithExpectedChoice('mm_asvab_A2_7D_5_rational_root_candidates', {
  prompt: 'Which expression is a linear factor of $x^2-{{sum}}x+{{prod}}$?',
  expected: 'x-({{p}})', profile: 'expression',
  headline: 'Factor the quadratic from its generated integer roots.',
  reasoning: ['$x^2-{{sum}}x+{{prod}}=(x-{{p}})(x-{{q}})$.', 'Thus $x-{{p}}$ is a linear factor.'],
  taskType: 'conceptual', representation: 'symbolic', dok: 2,
  mutateGenerator: (g) => {
    g.derived = { ...(g.derived || {}), sum: 'p+q', prod: 'p*q' };
    g.constraints = [...new Set([...(g.constraints || []), 'p != q'])];
  },
});

// Arithmetic Reasoning must read like arithmetic reasoning, not a course item
// with an ASVAB badge. These prompts keep the source mathematics and generated
// answer but place the calculation inside a concise real-world problem.
const AR_PROMPT_OVERRIDES = {
  'mm_asvab_A_3B_2_table_rate': 'A repair crew has completed {{y0}} work orders after {{x0}} hours and {{y1}} work orders after {{x1}} hours. If the rate is constant, how many work orders per hour is the rate of change?',
  'mm_asvab_6_3B_4_compute_increase': 'A supply depot has {{n}} cases on hand. A shipment request is ${{p}}/{{q}}$ times that amount. How many cases are requested?',
  'mm_asvab_6_3B_5_compare_multipliers': 'A warehouse starts with {{n}} crates for each of three shipment plans. The plans multiply that amount by ${{a}}/10$, ${{b}}/10$, and ${{c}}/10$. Which plan produces the greatest number of crates?',
  'mm_asvab_6_4C_3_scale_up_ratio': 'An animal shelter uses {{a}} bags of cat food for every {{b}} bags of dog food. If the cat-food amount is scaled to {{cats}} bags, how many bags of dog food are needed at the same ratio?',
  'mm_asvab_6_4D_4_rate_as_quotient': 'A freight service charges ${{a}} dollars for {{b}} pounds. Which quotient represents the charge in dollars per pound?',
  'mm_asvab_6_4E_1_percent_to_decimal': 'A warehouse inspection shows that ${{p}}\\%$ of the inventory passed. Which decimal represents the portion that passed?',
  'mm_asvab_6_4E_3_percent_to_fraction': 'A unit reports that ${{p}}\\%$ of its equipment is ready. Which fraction with denominator 100 represents the ready portion?',
  'mm_asvab_6_4E_5_ratio_to_decimal': 'During an inspection, {{p}} of 100 equal inventory lots pass. Which decimal represents the portion that passed?',
  'mm_asvab_6_4F_2_ten_percent': 'A fuel tank is ${{num}}/{{den}}$ full. What percent of the tank is filled?',
  'mm_asvab_6_4F_3_twenty_five_percent': 'A crew has completed ${{pct}}\\%$ of a job. Which fraction with denominator 100 represents the completed portion?',
  'mm_asvab_6_4G_1_fraction_to_decimal': 'A quality check finds {{p}} acceptable parts out of 100. Which decimal represents the acceptable portion?',
  'mm_asvab_6_4G_2_decimal_to_percent': 'A depot reports that {{dec}} of its scheduled shipments have arrived. What percent have arrived?',
  'mm_asvab_6_4G_5_equivalent_form_choice': 'A work crew has completed {{dec}} of a project. Which percent is equivalent to this completed portion?',
  'mm_asvab_6_4H_2_yards_feet': 'A roll of material is {{n}} yards long. How many feet long is the roll?',
  'mm_asvab_6_4H_3_pounds_ounces': 'A package weighs {{n}} pounds. How many ounces does it weigh?',
  'mm_asvab_6_4H_5_liters_milliliters': 'A container holds {{n}} liters of water. How many milliliters does it hold?',
  'mm_asvab_6_5A_2_table_missing': 'A packing line uses {{k}} parts per kit. A proportional table begins with 1 kit and {{k}} parts. What is the missing number of parts in the final row?',
  'mm_asvab_6_5A_3_proportion_missing': 'A mixture uses {{a}} units of material for every {{b}} batches. At the same rate, $x$ units are used for {{d}} batches. What value of $x$ satisfies ${{a}}/{{b}}=x/{{d}}$?',
  'mm_asvab_6_5A_4_graph_point': 'A machine uses {{k}} bolts for each assembly, so the total number of bolts is $y={{k}}x$. How many bolts are needed for {{x}} assemblies?',
  'mm_asvab_6_5B_1_find_part': 'A unit has {{whole}} pieces of equipment, and ${{p}}\\%$ require inspection. How many pieces require inspection?',
  'mm_asvab_6_5C_1_match_percent_decimal': 'A team has completed ${{p}}\\%$ of an assignment. Which decimal represents the completed portion?',
  'mm_asvab_6_5C_2_match_fraction_percent': 'A shipment has {{p}} acceptable items out of every 100. What percent of the shipment is acceptable?',
  'mm_asvab_6_5C_3_missing_equivalent': 'A readiness report lists ${{p}}\\%={{dec}}=x/100$. What value of $x$ represents the same portion?',
  'mm_asvab_6_9C_1_addition_context': 'A supply clerk models a situation with $x+{{a}}={{b}}$. Which real-world situation could this equation describe?',
  'mm_asvab_6_9C_2_subtraction_context': 'A supply clerk models a situation with $x-{{a}}={{b}}$. Which real-world situation could this equation describe?',
  'mm_asvab_6_9C_3_multiplication_context': 'A packing crew models a situation with ${{a}}x={{b}}$. Which real-world situation could this equation describe?',
  'mm_asvab_6_9C_4_at_least_context': 'A supervisor writes $x\\ge{{m}}$ for a minimum requirement. Which situation could this inequality describe?',
  'mm_asvab_6_12C_1_mean_four': 'A repair took {{a}}, {{b}}, {{c}}, and {{d}} minutes on four jobs. What was the mean repair time?',
  'mm_asvab_6_12C_2_median_five': 'Five shipment weights, in order, are {{a}}, {{b}}, {{c}}, {{d}}, and {{e}} pounds. What is the median weight?',
  'mm_asvab_6_12C_3_range': 'Daily temperatures during a field exercise had a minimum of {{minv}} degrees and a maximum of {{maxv}} degrees. What was the range?',
  'mm_asvab_6_12C_4_iqr': 'Delivery times have first quartile $Q_1={{q1}}$ minutes and third quartile $Q_3={{q3}}$ minutes. What is the interquartile range?',
  'mm_asvab_6_12C_5_summary_comparison': 'Crew A has a repair-time range of {{aRange}} minutes and Crew B has a range of {{bRange}} minutes. Which crew has the more spread-out repair times by this measure?',
  'mm_asvab_7_4C_1_equation_k': 'A packing machine uses a proportional rule $y={{k}}x$, where $x$ is the number of cartons and $y$ is the number of items packed. What is the constant number of items per carton?',
  'mm_asvab_7_4C_2_table_k': 'A supply table shows {{y}} units used for {{x}} kits at a constant rate. What is the constant of proportionality $k=y/x$?',
  'mm_asvab_7_4C_4_point_k': 'A machine has produced {{y}} parts after {{x}} hours at a constant proportional rate from zero. How many parts per hour does it produce?',
  'mm_asvab_7_4C_5_compare_k': 'Machine A produces according to $y={{ka}}x$. Machine B produces {{yb}} units in {{x}} hours. Which machine has the larger constant production rate?',
  'mm_asvab_7_10C_1_equation_scenario': 'A rental plan is modeled by ${{m}}x+{{b}}={{total}}$. Which situation could this equation represent?',
  'mm_asvab_7_10C_2_at_most_scenario': 'A crew must keep total cost at or below {{limit}} dollars, modeled by ${{m}}x+{{b}}\\le{{limit}}$. Which situation matches this limit?',
  'mm_asvab_7_10C_3_at_least_scenario': 'A worker must earn at least {{goal}} dollars after a fixed deduction of {{b}}, modeled by ${{m}}x-{{b}}\\ge{{goal}}$. Which story matches?',
  'mm_asvab_7_10C_4_reverse_interpret': 'A service job has a fixed fee of {{b}} dollars. After removing that fee, the remaining equation is ${{m}}x={{rhs}}$. Which original total-cost equation is consistent?',
  'mm_asvab_8_8B_1_match_story': 'Two service plans are compared by ${{a}}+{{r1}}x={{b}}+{{r2}}x$. Which story correctly describes the two plans?',
  'mm_asvab_8_8B_2_context_inequality': 'Two service plans are compared by ${{a}}+{{r1}}x\\le{{b}}+{{r2}}x$. Which story correctly describes when the first plan costs no more than the second?',
  'mm_asvab_8_8B_4_reverse_wording': 'Two production plans satisfy ${{m1}}x+{{b1}}>{{m2}}x+{{b2}}$. Which statement correctly describes the values of $x$ for which Plan 1 produces the larger total?',
  'mm_asvab_8_12D_1_simple_interest': 'A savings account starts with {{principal}} dollars and earns simple interest at {{r}}% per year for {{t}} years. How much interest is earned?',
};
for (const [id, prompt] of Object.entries(AR_PROMPT_OVERRIDES)) {
  const question = byId.get(id);
  if (!question) throw new Error(`${id}: ASVAB Arithmetic Reasoning prompt target not found.`);
  question.prompt = prompt;
}
const addTsiConstraints = (id, constraints) => {
  const question = byId.get(id);
  if (!question?.generator) return;
  question.generator.constraints = [...new Set([...(question.generator.constraints || []), ...constraints])];
};

// Prevent generated answer choices from collapsing to the same visible option
// on special parameter draws. These constraints preserve the intended content
// while guaranteeing that all four ASVAB options remain distinct.
addTsiConstraints('mm_asvab_A2_5C_1_exp_to_log', ['x >= 2', 'b != x']);
addTsiConstraints('mm_asvab_A2_5C_2_log_to_exp', ['x >= 2', 'b != x']);
addTsiConstraints('mm_asvab_A2_5C_5_reverse_role', ['b != x', 'x >= 2']);
addTsiConstraints('mm_asvab_A2_3B_3_matrix_check', ['x != y', 'y != z', 'x != 0']);
addTsiConstraints('mm_asvab_A2_8B_3_exponential_regression_perfect', ['a != r']);
addTsiConstraints('mm_asvab_A2_2A_4_reciprocal_asymptotes', ['h != 0', 'k != 0', 'h != k']);
addTsiConstraints('mm_asvab_A2_4A_5_choose_equation_from_points', ['b != c']);
addTsiConstraints('mm_asvab_A2_7G_5_reverse_radical', ['k != p']);
addTsiConstraints('mm_asvab_A2_4B_1_vertex_focus', ['h != k']);
addTsiConstraints('mm_asvab_A2_6G_2_reciprocal_asymptotes', ['h != 0', 'k != 0', 'h != k']);
addTsiConstraints('mm_asvab_8_8A_2_verbal_match', ['a != b']);
addTsiConstraints('mm_asvab_A2_6C_4_absolute_shift_error', ['h != 0', 'h != k']);
addTsiConstraints('mm_asvab_A2_7B_5_degree_leading', ['a != 3']);
addTsiConstraints('mm_asvab_A2_7B_4_area_model', ['dl + dw != dl * dw']);
addTsiConstraints('mm_asvab_A2_6D_3_two_solutions_to_equation', ['center != 0', 'center != d']);
addTsiConstraints('mm_asvab_A2_6G_4_reciprocal_shift_error', ['h != k']);
addTsiConstraints('mm_asvab_A2_3A_3_from_table_equations', ['m != a || b != c']);
addTsiConstraints('mm_asvab_A2_5B_3_recursive_to_explicit', ['a0 != r']);
addTsiConstraints('mm_asvab_7_10A_4_match_model', ['m != b']);
addTsiConstraints('mm_asvab_7_10C_1_equation_scenario', ['m != b']);
addTsiConstraints('mm_asvab_8_3A_5_proportion_check', ['a != c']);
addTsiConstraints('mm_asvab_6_2E_4_meaning_of_fraction', ['a != b']);
addTsiConstraints('mm_asvab_6_3A_4_equivalent_operation', ['p != q']);
const perpendicularContext = byId.get('mm_asvab_A_2F_3_context_perpendicular');
if (perpendicularContext) perpendicularContext.generator.parameters.m.max = 12;
const literalProduct = byId.get('mm_asvab_A_12E_2_solve_product_literal');
if (literalProduct) literalProduct.generator.parameters.a.max = 14;
const compareDilationAttributes = byId.get('mm_asvab_8_3B_5_compare_attributes');
if (compareDilationAttributes) compareDilationAttributes.generator.parameters.k.max = 12;
const solveLinearLiteral = byId.get('mm_asvab_A_12E_1_solve_linear_literal');
if (solveLinearLiteral) solveLinearLiteral.generator.parameters.a.max = 14;
const solveAreaHeight = byId.get('mm_asvab_A_12E_4_solve_area_height');
if (solveAreaHeight) solveAreaHeight.generator.parameters.k.max = 14;
const additiveTable = byId.get('mm_asvab_6_4A_4_table_additive');
if (additiveTable) {
  additiveTable.prompt = 'Which equation represents the constant difference shown in the table containing $(1,{{y1}})$?';
  additiveTable.taskType = 'representationTranslation';
}

for (const [id, labels] of Object.entries(ASVAB_FULL_CHOICE_OVERRIDES)) {
  const question = byId.get(id);
  if (!question) continue;
  question.choices = labels.map((label, index) => ({ id: index === 0 ? 'asvab-correct' : `asvab-d${index}`, label }));
  question.responseFields = [choiceField()];
}
for (const [id, labels] of Object.entries(ASVAB_CHOICE_COMPLETIONS)) {
  const question = byId.get(id);
  if (!question) continue;
  const retained = (question.choices || []).filter((choice) => !/insufficient|undefined|none of the stated/i.test(String(choice.label)));
  const used = new Set(retained.map((choice) => String(choice.label)));
  for (const label of labels) {
    if (retained.length >= 4) break;
    if (used.has(label)) continue;
    used.add(label);
    retained.push({ id: `asvab-d${retained.length}`, label });
  }
  if (retained.length !== 4) throw new Error(`${id}: ASVAB distractor completion produced ${retained.length} options.`);
  retained[0].id = 'asvab-correct';
  for (let index = 1; index < retained.length; index += 1) retained[index].id = `asvab-d${index}`;
  question.choices = retained;
  question.responseFields = [choiceField()];
}

for (const question of output) {
  // Calculators are not permitted on ASVAB Arithmetic Reasoning or Mathematics Knowledge.
  question.examCalculatorMode = 'none';
  question.calculatorPolicy = 'none';
}

const normalizedOutput = normalizeMathEncoding(output);

for (const question of normalizedOutput) {
  const raw = JSON.stringify(question);
  if (/\u000[0-8bcef]/i.test(raw)) throw new Error(`${question.id}: unsupported control character remained after ASVAB math normalization.`);
}

writeFileSync(OUTPUT, `${JSON.stringify({ documents: normalizedOutput }, null, 2)}\n`);
console.log(`Wrote ${output.length} ASVAB generator templates to ${path.relative(ROOT, OUTPUT)}.`);
console.log(`Standards: ${byCode.size}; MCQ: ${mcq.length}; SPR: ${spr.length}.`);
