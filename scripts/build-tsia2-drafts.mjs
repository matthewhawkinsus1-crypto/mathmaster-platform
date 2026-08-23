// Build the direct TSIA2 Math Path bank from the verified generative
// course bank. This is not a relabel operation: every output is converted to
// one of the two TSIA2 response formats (4-option MCQ or numeric SPR),
// tool-only course interactions become discrete assessment items, and each
// question declares direct ACT-domain alignment.

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getExamDomainIds, TEKS_EXAM_CROSSWALK } from '../src/platform/assessment/teksExamCrosswalk.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const SEED_DIR = path.join(ROOT, 'functions/seeds/pathQuestionBank');
const OUTPUT = path.join(ROOT, 'drafts/tsia2.json');
const FRAMEWORK = 'tsia2';
const TARGET_SPR = 0; // TSIA2 Math uses multiple-choice items; no student-produced response items.

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

const tsiCodes = new Set(Object.keys(TEKS_EXAM_CROSSWALK).filter((code) => getExamDomainIds(code, FRAMEWORK).length));
const courseQuestions = [];
for (const name of readdirSync(SEED_DIR).filter((entry) => entry.endsWith('_pathQuestionBank_seed.json')).sort()) {
  const parsed = JSON.parse(readFileSync(path.join(SEED_DIR, name), 'utf8'));
  for (const q of documentsIn(parsed)) {
    if (q?.assessmentContext?.framework && q.assessmentContext.framework !== 'course') continue;
    if (tsiCodes.has(codeOf(q))) courseQuestions.push(q);
  }
}

if (courseQuestions.length !== 1125) {
  throw new Error(`Expected 1125 TSIA2-mapped course families, found ${courseQuestions.length}.`);
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
  const stem = `tsi_${safe(baseName).slice(0, 24)}`;
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

const choiceField = () => ({ id: 'answer', label: 'Choose the correct answer', inputProfile: 'choice', expected: 'tsi-correct' });

const makeChoicesFromExpected = (q, profile, expected) => {
  const correct = mathWrap(profile, expected);
  if (profile === 'inequality') {
    const ops = ['<=', '>=', '<', '>'];
    const present = ops.find((op) => String(expected).includes(op));
    if (present) {
      const alternatives = ops.filter((op) => op !== present).map((op) => mathWrap(profile, String(expected).replace(present, op)));
      return [
        { id: 'tsi-correct', label: correct },
        { id: 'tsi-d1', label: alternatives[0] },
        { id: 'tsi-d2', label: alternatives[1] },
        { id: 'tsi-d3', label: alternatives[2] },
      ];
    }
  }

  if (String(expected) === 'x' && profile === 'expression') {
    return [
      { id: 'tsi-correct', label: '$x$' },
      { id: 'tsi-d1', label: '$-x$' },
      { id: 'tsi-d2', label: '$x+1$' },
      { id: 'tsi-d3', label: '$1/x$' },
    ];
  }

  const hit = firstPlaceholder(expected);
  if (!hit) {
    const fallback = profile === 'text'
      ? ['The opposite conclusion is true.', 'The result is undefined.', 'The information given is insufficient to determine the result.']
      : ['$0$', '$1$', '$-1$'];
    return [
      { id: 'tsi-correct', label: correct },
      { id: 'tsi-d1', label: fallback[0] },
      { id: 'tsi-d2', label: fallback[1] },
      { id: 'tsi-d3', label: fallback[2] },
    ];
  }

  const names = ensureDerived(q, hit.name);
  const variants = names.map((name) => mathWrap(profile, replaceFirstPlaceholder(expected, name, hit.filter)));
  return [
    { id: 'tsi-correct', label: correct },
    { id: 'tsi-d1', label: variants[0] },
    { id: 'tsi-d2', label: variants[1] },
    { id: 'tsi-d3', label: variants[2] },
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
  const options = [{ id: 'tsi-correct', label: correct.label }];
  for (const choice of original) {
    if (String(choice.id) === expectedId) continue;
    const label = String(choice.label ?? '');
    if (!label || used.has(label)) continue;
    used.add(label);
    options.push({ id: `tsi-d${options.length}`, label });
    if (options.length === 4) break;
  }
  // A sibling choice from the SAME TEKS is a better distractor than a generic
  // escape hatch, but only when every placeholder it uses is bound by this
  // template. That prevents borrowing a label that mentions another family's
  // parameter (the first TSIA2 draft correctly failed on exactly that defect).
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
    options.push({ id: `tsi-d${options.length}`, label });
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
    options.push({ id: `tsi-d${options.length}`, label });
  }
  return options;
};

const baseItem = (source, familyIndex) => {
  const code = codeOf(source);
  const domains = getExamDomainIds(code, FRAMEWORK);
  const sourceSlug = String(source.familyId || source.id).split(':').pop().replace(/^gen-/, '');
  const out = {
    id: `mm_tsi_${safe(code)}_${familyIndex + 1}_${safe(sourceSlug)}`,
    active: true,
    alignmentKeys: [`texas:${code}`],
    alignments: [
      { framework: 'teks', code, role: 'primary', evidenceLevel: 'assessed' },
      ...domains.map((domainId, index) => ({ framework: FRAMEWORK, domainId, role: index === 0 ? 'primary' : 'secondary', evidenceMode: 'direct' })),
    ],
    assessmentContext: { framework: FRAMEWORK, examStyle: true },
    courseId: source.courseId,
    familyId: `mathmaster:tsia2:${code}:${sourceSlug}`,
    familyVersion: 1,
    questionType: 'response',
    activityRole: 'practice',
    difficultyBand: source.difficultyBand,
    dok: Math.min(3, Math.max(1, Number(source.dok) || 1)),
    calculatorPolicy: 'graphing',
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

// First pass: normalize every course family to one TSIA2-answerable field. We do
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
    headline: `TSIA2 placement reasoning: ${String(q.solutionReview?.headline || 'use the defining relationship').replace(/[.]$/, '')}.`,
  };

  normalized.push({ q, source, profile, expected, sourceWasChoice, fixedChoices });
}

// Numeric answers are the only eligible Student-Produced Responses. Choose a
// deterministic spread of exactly 261 so the whole bank is essentially the
// official 75/25 MCQ/SPR mix while every other answer shape becomes 4-option MCQ.
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
      q.choices = fixedChoices.map((label, index) => ({ id: index === 0 ? 'tsi-correct' : `tsi-d${index}`, label }));
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
if (byCode.size !== 225 || badFamilies.length) {
  throw new Error(`TSIA2 family count mismatch: ${byCode.size} standards; bad=${JSON.stringify(badFamilies.map(([c, qs]) => [c, qs.length]))}`);
}
const mcq = output.filter((q) => q.assessmentItemFormat === 'multipleChoice');
const spr = output.filter((q) => q.assessmentItemFormat === 'studentProducedResponse');
if (mcq.length !== 1125 || spr.length !== 0) throw new Error(`TSIA2 format mismatch MCQ=${mcq.length}, SPR=${spr.length}`);
if (mcq.some((q) => q.choices?.length !== 4)) throw new Error('Every TSIA2 MCQ must have exactly four options.');

const TSI_FULL_CHOICE_OVERRIDES = {
  'mm_tsi_A2_2A_3_cube_root_graph': ['all real numbers', '$x \\ge 0$', '$x > 0$', '$x \\ne 0$'],
  'mm_tsi_8_3B_5_compare_attributes': [
    'They are similar; side lengths are multiplied by {{k}}.',
    'They are congruent because all corresponding angles have equal measure.',
    'They are similar; side lengths are divided by {{k}}.',
    'They are not similar because the image has different side lengths.',
  ],
  'mm_tsi_6_8A_2_triangle_inequality': [
    'Yes; the sum of every two side lengths is greater than the third side length.',
    'No; the two shorter side lengths add to exactly the longest side length.',
    'No; the longest side length is greater than the sum of the other two side lengths.',
    'Yes; any three positive side lengths can form a triangle.',
  ],
  'mm_tsi_6_8A_3_not_a_triangle': [
    'No; the sum of two side lengths is not greater than the third side length.',
    'Yes; all three side lengths are positive.',
    'Yes; the longest side length is at least as large as either shorter side length.',
    'No; a triangle can be formed only when all three side lengths are equal.',
  ],
  'mm_tsi_A_12E_1_solve_linear_literal': [
    '$P/{{a}}-w$',
    '$P/{{a}}+w$',
    '$P-{{a}}w$',
    '$(P-w)/{{a}}$',
  ],
  'mm_tsi_A_12E_4_solve_area_height': [
    '$A/({{k}}b)$',
    '$A/{{k}}-b$',
    '${{k}}A/b$',
    '$A/({{k}}+b)$',
  ],
};

const TSI_CHOICE_COMPLETIONS = {
  'mm_tsi_A2_6K_4_notation_error': ['Only values $x<{{h}}$ are allowed.'],
  'mm_tsi_6_4B_3_compare_unit_rates': ['Both stores have the same cost per item.'],
  'mm_tsi_6_4C_4_same_attribute_check': ['${{a}}$ red marbles to ${{b}}$ kilograms'],
  'mm_tsi_6_4D_3_ratio_or_rate': ['A percent', 'A scale factor'],
  'mm_tsi_6_4G_5_equivalent_form_choice': ['${{dec}}\\%$'],
  'mm_tsi_6_6B_5_choose_equation': ['$y=x/{{k}}$'],
  'mm_tsi_6_6C_5_representation_match': ['$y=x/{{k}}$', '$y={{k}}+x$'],
  'mm_tsi_6_8B_5_formula_from_decomposition': ['${{b2}}{{h}}/2$'],
  'mm_tsi_6_8C_4_trapezoid_equation': ['$({{b1}}+{{b2}})x/2=2{{A}}$'],
  'mm_tsi_6_10B_1_equation_true': ['The equation has no solution.'],
  'mm_tsi_6_10B_2_equation_false': ['Every value of $x$ makes the equation true.'],
  'mm_tsi_6_10B_3_inequality_true': ['The inequality has no solutions.', 'Every real number satisfies the inequality.'],
  'mm_tsi_6_10B_4_inequality_boundary': ['The inequality has no solutions.', 'Only values less than {{a}} satisfy it.'],
  'mm_tsi_6_12A_5_choose_display': ['Scatterplot'],
  'mm_tsi_6_12C_5_summary_comparison': ['The data sets have the same range.', 'Neither data set has a range.'],
  'mm_tsi_6_12D_4_percent_bar_largest': ['A and C are tied.'],
  'mm_tsi_6_13A_5_boxplot_center_compare': ['The distributions have the same median.', 'Neither distribution has a median.'],
  'mm_tsi_7_4A_4_match_equation': ['$y={{r}}$'],
  'mm_tsi_7_4B_5_compare_unit_rates': ['The plans have the same cost per unit.', 'Both plans cost $0$ per unit.'],
  'mm_tsi_7_4C_5_compare_k': ['The constants of proportionality are equal.', 'Both constants of proportionality are 0.'],
  'mm_tsi_7_4E_5_choose_conversion': ['${{inch}}\\times25$'],
  'mm_tsi_7_5B_5_compare_circles': ['Both ratios are approximately 1.'],
  'mm_tsi_7_5C_5_compare_scales': ['The drawing lengths are equal.', 'Both drawing lengths are 0.'],
  'mm_tsi_7_6A_4_missing_outcome': ['A list with exactly {{s}} total outcomes'],
  'mm_tsi_7_6C_5_reasonableness': ['About 0 occurrences'],
  'mm_tsi_7_6D_5_compare_probabilities': ['The events are equally likely.', 'Neither event can occur.'],
  'mm_tsi_7_6E_5_complement_check': ['No, because complementary events must have equal probabilities.', 'Yes, but only when $P(E)=0$.'],
  'mm_tsi_7_7_4_compare_representations': ['The relationships have the same rate of change.', 'Their rates of change cannot be determined from the information given.'],
  'mm_tsi_7_8A_1_volume_ratio': ['The pyramid volume is three times the prism volume.'],
  'mm_tsi_7_9A_5_compare_solids': ['The prism has one-third the volume of the pyramid.'],
  'mm_tsi_7_9B_5_area_vs_circumference_formula': ['$\\pi{{r}}$', '$2\\pi({{r}})^2$'],
  'mm_tsi_7_9C_5_decomposition_choice': ['${{w}}{{h}}+({{b}}+{{t}})/2$'],
  'mm_tsi_7_9D_5_net_method': ['$2lw+2h$'],
  'mm_tsi_7_10A_4_match_model': ['${{m}}x={{total}}+{{b}}$'],
  'mm_tsi_7_11B_3_boundary_inclusive': ['No value of $x$ satisfies the inequality.'],
  'mm_tsi_7_11C_5_angle_equation_choice': ['$x+{{a}}=360$'],
  'mm_tsi_7_12B_3_sample_method': ['Select the first residents alphabetically from the city list.'],
  'mm_tsi_7_13A_5_compare_tax_rates': ['The two purchases have equal tax.', 'No tax is collected on either purchase.'],
  'mm_tsi_7_13E_4_compare_interest': ['Neither account earns interest.'],
  'mm_tsi_8_2B_5_pi_comparison': ['$\\pi={{n}}/100$', '$\\pi=0$'],
  'mm_tsi_8_2C_3_valid_form': ['$10^{{e}}+{{c}}$'],
  'mm_tsi_8_2C_5_compare_magnitudes': ['The quantities are equal.', 'Quantity A is 10 times smaller than Quantity B.'],
  'mm_tsi_8_3A_5_proportion_check': ['${{ak}}/{{a}}={{c}}/{{ck}}$', '${{ak}}+{{a}}={{ck}}+{{c}}$'],
  'mm_tsi_8_3C_5_error_translation': ['It is a rotation because the coordinates are multiplied by {{k}}.', 'It is a reflection because every coordinate changes sign.'],
  'mm_tsi_8_4A_5_similar_triangles': ['The second triangle has twice the slope of the first.', 'Slope cannot be compared using rise and run.'],
  'mm_tsi_8_4B_5_proportional_check': ['$y=x+{{k}}$', '$y={{k}}$'],
  'mm_tsi_8_4C_5_error_rate': ['Divide the run {{dx}} by the rise {{rise}}.', 'Use only the $y$-intercept to determine slope.'],
  'mm_tsi_8_5A_5_compare_representations': ['$y=x+{{k}}$', '$y={{k}}$'],
  'mm_tsi_8_5B_5_contrast_proportional': ['$y=({{m}}+1)x$', '$y=x/{{m}}$'],
  'mm_tsi_8_5D_5_extrapolation_error': ['Predictions are always more accurate outside the observed range.', 'The input must be changed to {{hi}} before the model can be used.'],
  'mm_tsi_8_5E_5_error_intercept': ['Direct variation must have slope 0.', 'A direct-variation relationship cannot be graphed.'],
  'mm_tsi_8_5I_5_error_model': ['$y={{b}}-{{r}}$'],
  'mm_tsi_8_6A_5_formula_meaning': ['Volume is circumference times height.', 'Volume is base area divided by height.'],
  'mm_tsi_8_6C_5_error_lengths': ['${{a}}^2+{{b}}^2=({{a}}+{{b}})^2$'],
  'mm_tsi_8_7A_5_compare_solids': ['The solids have equal volume.', 'The cone volume is three times the cylinder volume.'],
  'mm_tsi_8_7B_5_lateral_vs_total': ['Total surface area equals lateral area minus the two bases.', 'Lateral area includes the bases but total surface area does not.'],
  'mm_tsi_8_7C_5_error_sum': ['Check whether ${{a}}^2+{{b}}^2=({{a}}+{{b}})^2$.'],
  'mm_tsi_8_7D_5_error_manhattan': ['Use the larger of {{a}} and {{b}} as the distance.', 'Use $|{{a}}-{{b}}|$ as the distance.'],
  'mm_tsi_8_8A_2_verbal_match': ['${{m}}x-{{a}}={{n}}x+{{b}}$', '${{m}}x+{{a}}={{n}}x-{{b}}$'],
  'mm_tsi_8_8A_5_error_sign': ['${{start}}-{{d}}t={{other}}-{{f}}t$', '${{start}}+{{d}}t={{other}}-{{f}}t$'],
  'mm_tsi_8_8C_5_special_case': ['Exactly two solutions'],
  'mm_tsi_8_9_5_parallel_error': ['Infinitely many intersections.', 'Exactly two intersections.'],
  'mm_tsi_8_10C_2_reflection_name': ['A $180^\\circ$ rotation about the origin'],
  'mm_tsi_8_10D_5_error_area_factor': ['Area is multiplied by ${{k}}^3$.', 'Area is multiplied by $2{{k}}$.'],
  'mm_tsi_8_11B_5_compare_spread': ['The data sets have equal spread.', 'Neither data set has measurable spread.'],
  'mm_tsi_8_12B_5_compare_total_cost': ['The loans have equal total repayment.', 'Both total repayments are $0$.'],
  'mm_tsi_8_12C_5_early_saving': ['Fewer contributions but more time for growth.', 'The same number of contributions and the same growth time.'],
  'mm_tsi_8_12D_5_compare_methods': ['The methods always earn exactly the same amount.', 'Neither method earns interest.'],
};

// Human-authored TSIA2 editorial overrides. These are intentionally small and
// explicit: the compiler handles response-format mechanics, while these edits
// preserve content quality where an automatic conversion would leave a thin or
// near-duplicate family.
const byId = new Map(output.map((question) => [question.id, question]));
const addTsiConstraints = (id, constraints) => {
  const question = byId.get(id);
  if (!question?.generator) return;
  question.generator.constraints = [...new Set([...(question.generator.constraints || []), ...constraints])];
};

// Prevent generated answer choices from collapsing to the same visible option
// on special parameter draws. These constraints preserve the intended content
// while guaranteeing that all four TSIA2 options remain distinct.
addTsiConstraints('mm_tsi_A2_5C_1_exp_to_log', ['x >= 2', 'b != x']);
addTsiConstraints('mm_tsi_A2_5C_2_log_to_exp', ['x >= 2', 'b != x']);
addTsiConstraints('mm_tsi_A2_5C_5_reverse_role', ['b != x', 'x >= 2']);
addTsiConstraints('mm_tsi_A2_3B_3_matrix_check', ['x != y', 'y != z', 'x != 0']);
addTsiConstraints('mm_tsi_A2_8B_3_exponential_regression_perfect', ['a != r']);
addTsiConstraints('mm_tsi_A2_2A_4_reciprocal_asymptotes', ['h != 0', 'k != 0', 'h != k']);
addTsiConstraints('mm_tsi_A2_4A_5_choose_equation_from_points', ['b != c']);
addTsiConstraints('mm_tsi_A2_7G_5_reverse_radical', ['k != p']);
addTsiConstraints('mm_tsi_A2_4B_1_vertex_focus', ['h != k']);
addTsiConstraints('mm_tsi_A2_6G_2_reciprocal_asymptotes', ['h != 0', 'k != 0', 'h != k']);
addTsiConstraints('mm_tsi_8_8A_2_verbal_match', ['a != b']);
addTsiConstraints('mm_tsi_A2_6C_4_absolute_shift_error', ['h != 0', 'h != k']);
addTsiConstraints('mm_tsi_A2_7B_5_degree_leading', ['a != 3']);
addTsiConstraints('mm_tsi_A2_7B_4_area_model', ['dl + dw != dl * dw']);
addTsiConstraints('mm_tsi_A2_6D_3_two_solutions_to_equation', ['center != 0', 'center != d']);
addTsiConstraints('mm_tsi_A2_6G_4_reciprocal_shift_error', ['h != k']);
addTsiConstraints('mm_tsi_A2_3A_3_from_table_equations', ['m != a || b != c']);
addTsiConstraints('mm_tsi_A2_5B_3_recursive_to_explicit', ['a0 != r']);
addTsiConstraints('mm_tsi_7_10A_4_match_model', ['m != b']);
addTsiConstraints('mm_tsi_7_10C_1_equation_scenario', ['m != b']);
addTsiConstraints('mm_tsi_8_3A_5_proportion_check', ['a != c']);
addTsiConstraints('mm_tsi_6_2E_4_meaning_of_fraction', ['a != b']);
addTsiConstraints('mm_tsi_6_3A_4_equivalent_operation', ['p != q']);
const perpendicularContext = byId.get('mm_tsi_A_2F_3_context_perpendicular');
if (perpendicularContext) perpendicularContext.generator.parameters.m.max = 12;
const literalProduct = byId.get('mm_tsi_A_12E_2_solve_product_literal');
if (literalProduct) literalProduct.generator.parameters.a.max = 14;
const compareDilationAttributes = byId.get('mm_tsi_8_3B_5_compare_attributes');
if (compareDilationAttributes) compareDilationAttributes.generator.parameters.k.max = 12;
const solveLinearLiteral = byId.get('mm_tsi_A_12E_1_solve_linear_literal');
if (solveLinearLiteral) solveLinearLiteral.generator.parameters.a.max = 14;
const solveAreaHeight = byId.get('mm_tsi_A_12E_4_solve_area_height');
if (solveAreaHeight) solveAreaHeight.generator.parameters.k.max = 14;
const additiveTable = byId.get('mm_tsi_6_4A_4_table_additive');
if (additiveTable) {
  additiveTable.prompt = 'Which equation represents the constant difference shown in the table containing $(1,{{y1}})$?';
  additiveTable.taskType = 'representationTranslation';
}

for (const [id, labels] of Object.entries(TSI_FULL_CHOICE_OVERRIDES)) {
  const question = byId.get(id);
  if (!question) continue;
  question.choices = labels.map((label, index) => ({ id: index === 0 ? 'tsi-correct' : `tsi-d${index}`, label }));
  question.responseFields = [choiceField()];
}
for (const [id, labels] of Object.entries(TSI_CHOICE_COMPLETIONS)) {
  const question = byId.get(id);
  if (!question) continue;
  const retained = (question.choices || []).filter((choice) => !/insufficient|undefined|none of the stated/i.test(String(choice.label)));
  const used = new Set(retained.map((choice) => String(choice.label)));
  for (const label of labels) {
    if (retained.length >= 4) break;
    if (used.has(label)) continue;
    used.add(label);
    retained.push({ id: `tsi-d${retained.length}`, label });
  }
  if (retained.length !== 4) throw new Error(`${id}: TSIA2 distractor completion produced ${retained.length} options.`);
  retained[0].id = 'tsi-correct';
  for (let index = 1; index < retained.length; index += 1) retained[index].id = `tsi-d${index}`;
  question.choices = retained;
  question.responseFields = [choiceField()];
}

const tsiCalculatorMode = (question) => {
  const blob = `${question.prompt || ''} ${JSON.stringify(question.solutionReview || {})}`.toLowerCase();
  const rep = String(question.representation || '').toLowerCase();
  const task = String(question.taskType || '').toLowerCase();
  // Radical/trigonometric work is where the official TSIA2 commonly exposes a
  // square-root-capable calculator. MathMaster's scientific drawer is the
  // closest available mode because it includes sqrt while basic does not.
  if (/\\sqrt|square root|radical|pythag|hypotenuse|trig|sine|cosine|tangent/.test(blob)) return 'scientific';
  // Regression/exponential or graph interpretation can legitimately receive
  // the graphing calculator on TSIA2 items.
  if (/regression|exponential|logarith|scatterplot|best[- ]fit|quadratic model/.test(blob) || rep === 'graph') return 'graphing';
  // Pure classification/definition/structure items should remain hand-reasoned.
  if (/classif|identify|which statement|which expression is equivalent|meaning|property/.test(`${task} ${blob}`)) return 'none';
  return 'basic';
};

for (const question of output) {
  const mode = tsiCalculatorMode(question);
  question.examCalculatorMode = mode;
  question.calculatorPolicy = mode;
}

const normalizedOutput = normalizeMathEncoding(output);

for (const question of normalizedOutput) {
  const raw = JSON.stringify(question);
  if (/\u000[0-8bcef]/i.test(raw)) throw new Error(`${question.id}: unsupported control character remained after TSIA2 math normalization.`);
}

writeFileSync(OUTPUT, `${JSON.stringify({ documents: normalizedOutput }, null, 2)}\n`);
console.log(`Wrote ${output.length} TSIA2 generator templates to ${path.relative(ROOT, OUTPUT)}.`);
console.log(`Standards: ${byCode.size}; MCQ: ${mcq.length}; SPR: ${spr.length}.`);
