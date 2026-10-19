/*
 * THE functionFeatures SUPPORT FAMILY, ON REAL ITEMS.
 *
 * src/platform/supports/families/functionFeatures.js gives the platform Hint
 * control, "Try a similar one" and the inclusion "Let's back up" step their
 * content for function features, graphs and relations. Every item here is one
 * a student can actually be given:
 *
 *   - the teacher-import-jsons corpus compiled by compileAuthoringIntentV5 (the
 *     way an authored document reaches a classroom): graphAnalysis (domain,
 *     range, increasing/decreasing, positive/negative, parent-function points),
 *     functionCharacteristics (intercepts, zeros, turning point, axis,
 *     asymptote, behavior, domain, range), relationshipModel (the
 *     functionModeling recipe), relationMapping, the functionGraph
 *     table-then-graph workflow, sequenceExplorer, and the multiAnswer
 *     function-attribute items (domain, range, discrete/continuous, parent
 *     family, asymptotes);
 *   - SAMPLE_*.json: every sequenceExplorer and functionInvestigation2 mode,
 *     the V5 authoring sample, the standalone relationshipModel activity, and
 *     the generated functionInvestigation / function `table` items
 *     (problemGenerator.generateQuestion, several seeds).
 *
 * Every answer the tests compare against is computed INDEPENDENTLY of the
 * family: from the shared grader's own model of the question (the graph
 * workspace model, readComposedQuestion's grading rules, the relation and the
 * table as authored, the sequence by direct arithmetic). Hints are checked
 * against that key AND against every choice the student can pick (every verdict
 * word), so a hint never names one. The worked siblings are re-solved from
 * their own prompts: the function is evaluated numerically and every stated
 * interval, point and value is checked by sampling.
 *
 * Mutation-checked (each went red, then was restored):
 *   - graphHints' orientation hint was made to end with the first accepted
 *     answer of the first analysis part ("… MUTATION: [-3,4)") and hints() lost
 *     its own leak filter → "none contains an answer" fails on the
 *     graphAnalysis items, and the ladder test fails because the platform
 *     guard drops the hint;
 *   - the same leaking hint WITH the filter kept but the graph expectedValues
 *     blinded (so the family's guard cannot see it) → only this file's
 *     independent key catches it: the leak test and the expectedValues
 *     coverage test fail (and the platform ladder would have shown it);
 *   - rangeOf was made to return the domain → the sibling re-solve fails
 *     ("range [-1, 4]: the graph reaches y = -4");
 *   - the relation's verdict value and phrases were dropped from
 *     expectedValues → the coverage test fails ("names yes-definition").
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

import * as functionFeatures from '../../src/platform/supports/families/functionFeatures.js';
import { familyFor } from '../../src/platform/supports/families/index.js';
import { buildQuestionHints } from '../../src/platform/supports/hints/questionHints.js';
import { buildSimilarWorkedExample } from '../../src/platform/supports/workedExample/similarProblem.js';
import { backUpStepFor } from '../../src/platform/supports/feedback/backUpStep.js';
import { hintRevealsAnswer } from '../../functions/shared/pathSolutionSupport.mjs';
import { compileAuthoringIntentV5 } from '../../src/platform/contract/authoringIntentV5.js';
import { generateQuestion } from '../../src/problemGenerator.js';
import { readComposedQuestion } from '../../functions/shared/toolMath/workflow/questionWorkflow.mjs';
import { buildGraphWorkspaceModel } from '../../functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs';
import { FUNCTION_CHOICES } from '../../functions/shared/relationFunctionChoice.mjs';
import { resolveFamilyQuestionInstance } from '../../functions/shared/questionFamilyInstance.mjs';
import { PLATFORM_FAMILY_IDS } from '../../functions/shared/questionFamilyRegistry.mjs';
// The functionInvestigation2 grader's own definitions ARE that tool's key.
import {
  behaviorForSpec,
  behaviorLabel,
  domainRangeForSpec,
  interceptsForSpec,
  investigationFeatures,
  normalizeInvestigationSpec,
  relationLabel,
} from '../../functions/shared/toolMath/functionInvestigation2/functionInvestigationMath.mjs';
import { evaluateFunctionSpec as evaluateFunctionSpecForTest } from '../../functions/shared/toolMath/shared/toolMath.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const text = (value) => String(value ?? '').trim();
const ascii = (value) => String(value ?? '').replace(/[−–]/g, '-');

/* ---------------------------------------------------------------------------
 * The items.
 * ------------------------------------------------------------------------- */

const questionsIn = (value) => {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if ((node.type || node.toolId) && (node.prompt || node.answerFields)) { out.push(node); return; }
    Object.values(node).forEach(visit);
  };
  visit(value);
  return out;
};

const corpusFiles = () => {
  const files = [];
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith('.json')) files.push(full);
  });
  walk(path.join(ROOT, 'teacher-import-jsons'));
  return files.sort();
};

const CORPUS = corpusFiles().flatMap((file) => {
  const compiled = compileAuthoringIntentV5(JSON.parse(readFileSync(file, 'utf8')));
  return questionsIn(compiled.package || compiled).map((question) => ({ source: path.basename(file), question }));
});

const sample = (name) => JSON.parse(readFileSync(path.join(ROOT, name), 'utf8'));
const sampleTools = (name, tools) => {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (tools.includes(node.toolId) || tools.includes(node.type)) { out.push(node); return; }
    Object.values(node).forEach(visit);
  };
  visit(sample(name));
  return out.map((question) => ({ source: name, question }));
};
const generated = (name, type, seeds) => sampleTools(name, [type])
  .flatMap(({ question }) => seeds.map((seed) => ({ source: `${name}#${seed}`, question: generateQuestion(question, seed) })));

const FUNCTION_TYPES = ['graphAnalysis', 'functionGraph', 'functionInvestigation', 'functionCharacteristics', 'relationMapping', 'relationshipModel', 'sequenceExplorer'];

// The multiAnswer items of the corpus that ARE function attributes, by prompt.
const ATTRIBUTE_PROMPTS = [
  'A taxi fare is modeled by C(t) = 3t + 5',
  'A tank is filled at 4 gallons per minute for exactly 12 minutes',
  'For f(x)=2x+1, identify the domain and range.',
  'Connect each parent function to its asymptotic behavior.',
  'Identify the family and key attributes of f(x)=√x.',
  'Identify the family and key attributes of f(x)=1/x.',
  'Identify the parent function from its equation and one defining attribute.',
  'For f(x)=2ˣ and g(x)=log₂(x), identify the matching asymptotes.',
  'Review the parent function f(x)=√x.',
  'Review f(x)=2ˣ.',
  'For f(x)=3x+2, identify its domain and range.',
];
// ...and some that are not: transformations, a vertex, inverses, compositions.
const NOT_ATTRIBUTE_PROMPTS = [
  'For g(x)=f(x−4)+3, describe the horizontal and vertical translations.',
  'For the absolute value parent function f(x)=|x|, identify its vertex, domain, and range.',
  'Review the parent function f(x)=|x|.',
  'Find the inverse of f(x)=3x−7.',
  'For f(x)=3x²−x+4 and g(x)=2x−1, find both compositions.',
  'Describe g(x)=f(−2x)+1.',
];

const corpusOf = (type) => CORPUS.filter(({ question }) => question.type === type);
const ATTRIBUTE_ITEMS = CORPUS.filter(({ question }) => question.type === 'multiAnswer' && ATTRIBUTE_PROMPTS.some((prompt) => text(question.prompt).startsWith(prompt)));

const compiledSample = questionsIn(compileAuthoringIntentV5(sample('SAMPLE_AUTHORING_INTENT_V5.json')).package)
  .map((question) => ({ source: 'SAMPLE_AUTHORING_INTENT_V5.json', question }));

// More table-then-graph items, authored the way the L1 Day 2 lesson authors
// its own and compiled by the same compiler (new functions and x-values).
const authoredTableGraph = (() => {
  const lesson = JSON.parse(readFileSync(path.join(ROOT, 'teacher-import-jsons/algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json'), 'utf8'));
  const section = lesson.sections.find(({ questions }) => questions.some((question) => question.table && question.function?.family === 'linear'));
  const base = section.questions.find((question) => question.table && question.function?.family === 'linear');
  const item = (m, b, xs, rangeText, extra = {}) => ({
    ...base,
    prompt: `Complete the table for f(x) = ${m}x ${b < 0 ? '−' : '+'} ${Math.abs(b)} over x ∈ {${xs.join(', ')}}, plot only those points, state the domain and range, and classify the relation as discrete or continuous.`,
    function: { family: 'linear', m, b },
    table: { columns: ['x', 'f(x)'], rows: xs.map((x) => [x, null]) },
    answerModel: { domain: `{${xs.join(', ')}}`, range: rangeText, continuity: 'discrete' },
    ...extra,
  });
  const questions = [
    item(2, -3, [-1, 1, 3, 5], '{-5, -1, 3, 7}'),
    item(-3, 2, [-2, -1, 0, 1, 2], '{-4, -1, 2, 5, 8}', { studentActions: ['completeTable', 'constructGraph', 'analyzeRange', 'classifyContinuity'] }),
    item(0.25, 2, [0, 4, 8, 12], '{2, 3, 4, 5}'),
  ];
  return questionsIn(compileAuthoringIntentV5({ ...lesson, sections: [{ ...section, questions }] }).package)
    .map((question) => ({ source: 'authored L1 Day 2 table items', question }));
})();

/** Every item, by the sub-kind the family claims it as. */
const KINDS = {
  graph: [
    ...corpusOf('graphAnalysis').filter(({ question }) => !question.recipe),
    ...generated('SAMPLE_MERGED_FUNCTION_INVESTIGATION_ALGEBRA_QA.json', 'functionInvestigation', ['seed-1', 'seed-2']),
    ...generated('SAMPLE_PRACTICE_WITH_DOL.json', 'functionInvestigation', ['seed-1', 'seed-3']),
    ...generated('SAMPLE_GUIDED_NOTES_CLASSWORK.json', 'functionInvestigation', ['seed-1', 'seed-2']),
    ...generated('SAMPLE_LOCAL_PERSISTENCE_RESUME_SOLUTION_QA.json', 'functionInvestigation', ['seed-1']),
    // A construct-only functionGraph (no workflow): the graph workspace.
    ...compiledSample.filter(({ question }) => question.type === 'functionGraph' && !readComposedQuestion(question).composed),
  ],
  characteristics: corpusOf('functionCharacteristics'),
  modeling: [
    ...corpusOf('relationshipModel'),
    ...compiledSample.filter(({ question }) => question.type === 'relationshipModel'),
    ...sampleTools('SAMPLE_ACTIVITY_1_1_AXIS_BUILDER.json', ['relationshipModel']),
  ],
  tableGraph: [...corpusOf('functionGraph'), ...compiledSample.filter(({ question }) => question.type === 'functionGraph' && readComposedQuestion(question).composed), ...authoredTableGraph],
  relation: [...corpusOf('relationMapping'), ...compiledSample.filter(({ question }) => question.type === 'relationMapping')],
  table: [
    ...generated('SAMPLE_GUIDED_NOTES_CLASSWORK.json', 'table', ['seed-1', 'seed-2', 'seed-3']),
    ...generated('SAMPLE_LOCAL_PERSISTENCE_RESUME_SOLUTION_QA.json', 'table', ['seed-1', 'seed-2', 'seed-3']),
    ...generated('SAMPLE_PRACTICE_WITH_DOL.json', 'table', ['seed-1', 'seed-2']),
  ],
  sequence: [
    ...corpusOf('sequenceExplorer'),
    ...sampleTools('SAMPLE_BATCH_C_DEEP_DIVE.json', ['sequenceExplorer']),
    ...sampleTools('SAMPLE_MISSING_MATH_TOOLS.json', ['sequenceExplorer']),
  ],
  investigation: [
    ...sampleTools('SAMPLE_BATCH_D_DEEP_DIVE.json', ['functionInvestigation2']),
    ...sampleTools('SAMPLE_MISSING_MATH_TOOLS.json', ['functionInvestigation2']),
  ],
  attributes: ATTRIBUTE_ITEMS,
};
const ALL_ITEMS = Object.entries(KINDS).flatMap(([kind, items]) => items.map((item) => ({ ...item, kind })));
const label = ({ kind, source, question }) => `${kind} ${source}: ${text(question.prompt).slice(0, 70) || question.mode || question.type}`;

/* ---------------------------------------------------------------------------
 * The key, computed without the family.
 * ------------------------------------------------------------------------- */

/** Display spellings of a grader's compact interval / inequality text. */
const spellings = (value) => {
  const raw = text(value);
  if (!raw) return [];
  const pretty = ascii(raw)
    .replace(/-inf/g, '-∞').replace(/inf/g, '∞')
    .replace(/\)u\(/g, ') ∪ (').replace(/\)u\[/g, ') ∪ [').replace(/\]u\(/g, '] ∪ (')
    .replace(/,(?=\S)/g, ', ')
    .replace(/<=/g, ' ≤ ').replace(/>=/g, ' ≥ ').replace(/!=/g, ' ≠ ')
    .replace(/(?<![≤≥ ])<(?![=])/g, ' < ').replace(/(?<![≤≥ ])>(?![=])/g, ' > ')
    .replace(/\s+/g, ' ')
    .trim();
  return [...new Set([raw, ascii(raw), pretty, pretty.replace(/-/g, '−')])];
};
const pointText = ([x, y]) => `(${x}, ${y})`;

const linearRhs = (equation) => {
  const match = /^\s*[A-Za-z]\s*\(\s*([a-z])\s*\)\s*=\s*(.+)$/.exec(ascii(equation));
  if (!match) return null;
  const variable = match[1];
  const evaluate = (x) => Function('x', `return ${match[2].replace(new RegExp(variable, 'g'), '*(x)').replace(/^\*/, '').replace(/([+-])\*/g, '$1')};`)(x);
  return evaluate;
};

const sequenceReadings = (question) => {
  const raw = question.sequence || {};
  const kind = raw.kind || question.kind || 'arithmetic';
  const first = Number(raw.first ?? 1);
  const graderChange = kind === 'arithmetic' ? Number(raw.difference ?? raw.change ?? 1) : Number(raw.ratio ?? raw.change ?? 2);
  const readings = [{ kind, first, change: graderChange }];
  const alias = kind === 'arithmetic' ? raw.commonDifference : raw.commonRatio;
  if (alias !== undefined) readings.push({ kind, first, change: Number(alias) });
  return readings;
};
const termOf = ({ kind, first, change }, n) => (kind === 'arithmetic' ? first + (n - 1) * change : first * change ** (n - 1));

/** { keys: the correct answers, vocabulary: every choice and verdict word a student can pick }. */
const independentKey = ({ kind, question }) => {
  const keys = [];
  const vocabulary = [];
  const addKey = (value) => spellings(value).forEach((form) => keys.push(form));
  if (kind === 'graph') {
    const model = buildGraphWorkspaceModel(question, { analysisMode: question.type === 'graphAnalysis' });
    model.analysisParts.forEach((part) => {
      (part.acceptedAnswers || []).forEach(addKey);
      (part.expected || []).forEach((point) => Array.isArray(point) && addKey(pointText(point)));
    });
    (model.constructionEnabled ? model.tasks : []).forEach((task) => Array.isArray(task.expected) && addKey(pointText(task.expected)));
    vocabulary.push('does not exist', 'none');
  } else if (['characteristics', 'modeling', 'tableGraph'].includes(kind) && readComposedQuestion(question).composed) {
    const composed = readComposedQuestion(question);
    const grading = composed.grading || {};
    composed.workflow.forEach((stage) => {
      const rule = grading[stage.id];
      (stage.choices || []).forEach((choice) => vocabulary.push(text(choice)));
      if (typeof rule === 'string' || typeof rule === 'number') addKey(rule);
      if (Array.isArray(rule)) rule.forEach(addKey);
      if (rule && typeof rule === 'object') {
        (rule.points || []).forEach((point) => addKey(pointText(point)));
        if (rule.none) keys.push('does not exist');
        Object.values(rule.values || {}).forEach(addKey);
        if (rule.consistentWith === 'equation') {
          const evaluate = linearRhs(question.correctEquation);
          (stage.xValues || question.tableXValues || []).forEach((x) => evaluate && addKey(Math.round(evaluate(Number(x)) * 1e6) / 1e6));
        }
      }
    });
  } else if (kind === 'modeling') {
    addKey(question.relationshipType);
    vocabulary.push('discrete', 'continuous');
  } else if (kind === 'relation') {
    const pairs = (question.pairs || []).map((pair) => (Array.isArray(pair) ? pair : [pair.x, pair.y]).map(Number));
    const xs = [...new Set(pairs.map(([x]) => x))].sort((a, b) => a - b);
    const ys = [...new Set(pairs.map(([, y]) => y))].sort((a, b) => a - b);
    const ask = Array.isArray(question.ask) ? question.ask : ['mapping', 'domain', 'range'];
    if (ask.includes('domain')) { addKey(xs.join(', ')); addKey(`{${xs.join(', ')}}`); }
    if (ask.includes('range')) { addKey(ys.join(', ')); addKey(`{${ys.join(', ')}}`); }
    if (ask.includes('isFunction')) {
      const isFunction = pairs.every(([x, y]) => pairs.every(([otherX, otherY]) => otherX !== x || otherY === y));
      keys.push(isFunction ? 'yes-definition' : 'no-input-repeat', isFunction ? 'is a function' : 'is not a function');
      FUNCTION_CHOICES.forEach((choice) => vocabulary.push(choice.label, choice.value));
      vocabulary.push('is a function', 'is not a function', 'not a function');
    }
  } else if (kind === 'table') {
    Object.values(question.table.answers).forEach(addKey);
  } else if (kind === 'sequence') {
    const mode = question.mode || 'analyze';
    vocabulary.push('arithmetic', 'geometric');
    if (mode === 'compare') {
      const left = { kind: question.left.kind, first: question.left.first, change: question.left.difference ?? question.left.ratio };
      const right = { kind: question.right.kind, first: question.right.first, change: question.right.ratio ?? question.right.difference };
      const n = Number(question.compareN ?? 7);
      const [a, b] = [termOf(left, n), termOf(right, n)];
      addKey(Math.abs(a - b));
      keys.push(a > b ? question.leftLabel : b > a ? question.rightLabel : 'They are equal');
      vocabulary.push(question.leftLabel, question.rightLabel);
    } else {
      sequenceReadings(question).forEach((reading) => {
        if (mode === 'analyze') { keys.push(reading.kind); addKey(reading.change); addKey(termOf(reading, Number(question.targetN ?? 8))); }
        if (mode === 'missingTerm') { keys.push(reading.kind); addKey(termOf(reading, Number(question.missingIndex ?? 4))); }
        if (mode === 'partialSum') {
          const n = Number(question.sumN ?? 6);
          addKey(termOf(reading, n));
          addKey(Array.from({ length: n }, (_, index) => termOf(reading, index + 1)).reduce((sum, value) => sum + value, 0));
        }
        if (mode === 'ruleBridge') addKey(reading.first);
      });
    }
  } else if (kind === 'investigation') {
    const mode = question.mode || 'features';
    if (mode === 'compare') {
      const x = Number(question.x ?? 2);
      const left = normalizeInvestigationSpec(question.left);
      const right = normalizeInvestigationSpec(question.right);
      const [a, b] = [evaluateFunctionSpecForTest(left, x), evaluateFunctionSpecForTest(right, x)];
      addKey(a); addKey(b);
      keys.push(a > b ? 'left' : b > a ? 'right' : 'equal');
      vocabulary.push('f(x) — the solid blue curve', 'g(x) — the dashed red curve', 'They are equal', 'At least one is undefined here');
    } else {
      const spec = normalizeInvestigationSpec({ type: 'rational', a: 2, h: 1, k: -2, ...question.function });
      if (mode === 'features') {
        const features = investigationFeatures(spec);
        addKey(pointText(features.anchor.point));
        features.anchor.point.forEach(addKey);
        [...features.verticalAsymptotes, ...features.horizontalAsymptotes].forEach(addKey);
      }
      if (mode === 'domainRange') {
        const key = domainRangeForSpec(spec);
        addKey(relationLabel(key.domainCode, spec));
        addKey(relationLabel(key.rangeCode, spec));
        ['allReal', 'xGteH', 'xGtH', 'xNotH', 'yGteK', 'yLteK', 'yGtK', 'yLtK', 'yNotK'].forEach((code) => vocabulary.push(relationLabel(code, spec)));
      }
      if (mode === 'intercepts') {
        const key = interceptsForSpec(spec);
        key.x.forEach(addKey);
        if (key.y !== null) addKey(key.y);
      }
      if (mode === 'behavior') {
        const code = behaviorForSpec(spec);
        keys.push(code, behaviorLabel(code));
        ['minimum', 'maximum', 'increasing', 'decreasing', 'increasingBranches', 'decreasingBranches'].forEach((code) => vocabulary.push(behaviorLabel(code)));
      }
    }
  } else if (kind === 'attributes') {
    question.answerFields.forEach((field) => {
      addKey(field.answer);
      (field.options || []).forEach((option) => vocabulary.push(text(option)));
    });
  }
  return { keys: [...new Set(keys.map(text).filter(Boolean))], vocabulary: [...new Set(vocabulary.map(text).filter(Boolean))] };
};

const canonical = (value) => ascii(value).replace(/∞/g, 'inf').replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=').replace(/∪/g, 'u').replace(/\s+/g, '').toLowerCase();

/* ---------------------------------------------------------------------------
 * Re-solving a worked sibling from its own prompt.
 * ------------------------------------------------------------------------- */

/** The family's function text as a JavaScript function (independent of the family's evaluator). */
const functionOf = (rhs) => {
  let js = ascii(rhs).trim()
    .replace(/log₂\(/g, 'L(')
    .replace(/√\(/g, 'S(').replace(/√x/g, 'S(x)')
    .replace(/∛\(/g, 'C(').replace(/∛x/g, 'C(x)')
    .replace(/\|([^|]+)\|/g, 'A($1)')
    .replace(/\(([^()]*)\)²/g, '(($1)**2)').replace(/x²/g, '(x**2)')
    .replace(/\(([^()]*)\)³/g, '(($1)**3)').replace(/x³/g, '(x**3)')
    .replace(/\^/g, '**')
    .replace(/·/g, '*')
    .replace(/(\d)\s*(?=[xLSCA(])/g, '$1*');
  js = js.replace(/L\(/g, 'Math.log2(').replace(/S\(/g, 'Math.sqrt(').replace(/C\(/g, 'Math.cbrt(').replace(/A\(/g, 'Math.abs(');
  // eslint-disable-next-line no-new-func
  const compiled = Function('x', `return ${js};`);
  return (x) => {
    const value = compiled(x);
    return Number.isFinite(value) ? value : Number.NaN;
  };
};

const NUMBER = '-?\\d+(?:\\.\\d+)?';
const restrictionOf = (prompt) => {
  const match = new RegExp(`for (${NUMBER}) ≤ x ≤ (${NUMBER})`).exec(ascii(prompt));
  return match ? [Number(match[1]), Number(match[2])] : null;
};
const equationIn = (prompt, name = '[a-z]') => {
  const match = new RegExp(`${name}\\(x\\) = (.+?)(?= for | over |: | and [a-z]\\(x\\)|, [a-z]\\(x\\)| is shown|\\.(?:\\s|$)|,\\s|$)`).exec(ascii(prompt));
  return match ? match[1].trim() : null;
};

/** A stated set of x- or y-values ("[2, 5]", "(-∞, 1) ∪ (1, ∞)", "x ≥ 3", "-2 ≤ y ≤ 7", "all real numbers", "x ≠ 1") as a test. */
const setPredicate = (statement) => {
  const value = ascii(statement).trim();
  if (/^all real numbers$/i.test(value)) return { test: () => true, bounds: [] };
  let match = new RegExp(`^[a-zA-Z()]+ ≠ (${NUMBER})$`).exec(value);
  if (match) return { test: (v) => Math.abs(v - Number(match[1])) > 1e-9, bounds: [] };
  match = new RegExp(`^(${NUMBER}) (≤|<) [a-zA-Z()]+ (≤|<) (${NUMBER})$`).exec(value);
  if (match) {
    const [low, high] = [Number(match[1]), Number(match[4])];
    return { test: (v) => (match[2] === '≤' ? v >= low - 1e-9 : v > low + 1e-9) && (match[3] === '≤' ? v <= high + 1e-9 : v < high - 1e-9), bounds: [[low, match[2] === '≤'], [high, match[3] === '≤']] };
  }
  match = new RegExp(`^[a-zA-Z()]+ (≥|>|≤|<) (${NUMBER})$`).exec(value);
  if (match) {
    const bound = Number(match[2]);
    const relation = match[1];
    const tests = { '≥': (v) => v >= bound - 1e-9, '>': (v) => v > bound + 1e-9, '≤': (v) => v <= bound + 1e-9, '<': (v) => v < bound - 1e-9 };
    return { test: tests[relation], bounds: [[bound, relation === '≥' || relation === '≤']] };
  }
  const pieces = value.split(' ∪ ').map((piece) => new RegExp(`^([[(])(-∞|${NUMBER}), (∞|${NUMBER})([\\])])$`).exec(piece.trim()));
  if (pieces.every(Boolean)) {
    const parsed = pieces.map(([, open, low, high, close]) => ({
      low: low === '-∞' ? -Infinity : Number(low), high: high === '∞' ? Infinity : Number(high), lowIn: open === '[', highIn: close === ']',
    }));
    return {
      test: (v) => parsed.some((piece) => (piece.lowIn ? v >= piece.low - 1e-9 : v > piece.low + 1e-9) && (piece.highIn ? v <= piece.high + 1e-9 : v < piece.high - 1e-9)),
      bounds: parsed.flatMap((piece) => [[piece.low, piece.lowIn], [piece.high, piece.highIn]]).filter(([bound]) => Number.isFinite(bound)),
      pieces: parsed,
    };
  }
  return null;
};

const grid = (low, high, step = 0.01) => {
  const out = [];
  for (let x = low; x <= high + 1e-9; x += step) out.push(Math.round(x * 1e6) / 1e6);
  for (let x = Math.ceil(low); x <= high; x += 1) out.push(x);
  return [...new Set(out)].sort((a, b) => a - b);
};

/** Verify one clause of a sibling's answer against the function itself. */
const verifyClause = (f, window, restriction, clause) => {
  const [low, high] = window;
  const xs = grid(low, high).filter((x) => !restriction || (x >= restriction[0] - 1e-9 && x <= restriction[1] + 1e-9));
  const defined = xs.filter((x) => Number.isFinite(f(x)));
  const ys = defined.map(f);
  let match;
  if ((match = /^domain (.+)$/.exec(clause))) {
    const predicate = setPredicate(match[1]);
    assert.ok(predicate, `unreadable domain: ${clause}`);
    grid(low, high, 0.05).forEach((x) => {
      const inRestriction = !restriction || (x >= restriction[0] - 1e-9 && x <= restriction[1] + 1e-9);
      const nearBound = predicate.bounds.some(([bound]) => Math.abs(bound - x) < 1e-6);
      if (!nearBound) assert.equal(predicate.test(x), inRestriction && Number.isFinite(f(x)), `${clause} at x = ${x}`);
    });
    predicate.bounds.forEach(([bound, closed]) => {
      if (bound >= low && bound <= high) assert.equal(Number.isFinite(f(bound)) && (!restriction || (bound >= restriction[0] && bound <= restriction[1])), closed, `${clause}: endpoint ${bound}`);
    });
    return;
  }
  if ((match = /^range (.+)$/.exec(clause))) {
    const predicate = setPredicate(match[1]);
    assert.ok(predicate, `unreadable range: ${clause}`);
    ys.forEach((y) => assert.ok(predicate.test(y), `${clause}: the graph reaches y = ${y}`));
    predicate.bounds.forEach(([bound, closed]) => {
      const nearest = Math.min(...ys.map((y) => Math.abs(y - bound)));
      assert.ok(nearest < (closed ? 1e-6 : 0.25), `${clause}: boundary ${bound} is ${closed ? 'attained' : 'approached'} (nearest ${nearest})`);
    });
    return;
  }
  const monotone = (piece, direction) => {
    const inside = defined.filter((x) => x > piece.low + 1e-6 && x < piece.high - 1e-6);
    assert.ok(inside.length > 2, `${clause}: interval has samples`);
    inside.slice(1).forEach((x, index) => {
      const change = f(x) - f(inside[index]);
      if (Math.abs(x - inside[index]) < 0.5) assert.ok(direction * change > 0, `${clause}: monotone at ${x}`);
    });
  };
  if ((match = /^(increasing|decreasing) (.+)$/.exec(clause))) {
    const direction = match[1] === 'increasing' ? 1 : -1;
    if (match[2] === 'never') {
      defined.slice(1).forEach((x, index) => {
        if (Math.abs(x - defined[index]) < 0.5) assert.ok(direction * (f(x) - f(defined[index])) <= 1e-12, `${clause}: never ${match[1]} near ${x}`);
      });
      return;
    }
    const predicate = setPredicate(match[2]);
    assert.ok(predicate?.pieces, `unreadable interval: ${clause}`);
    predicate.pieces.forEach((piece) => monotone(piece, direction));
    return;
  }
  if (clause === 'constant never') {
    defined.slice(2).forEach((x, index) => {
      const [a, b] = [defined[index], defined[index + 1]];
      assert.ok(!(Math.abs(f(x) - f(b)) < 1e-12 && Math.abs(f(b) - f(a)) < 1e-12), `${clause}: flat near ${x}`);
    });
    return;
  }
  if ((match = /^(positive|negative) (.+)$/.exec(clause))) {
    const sign = match[1] === 'positive' ? 1 : -1;
    if (match[2] === 'never') { ys.forEach((y) => assert.ok(sign * y <= 1e-12, clause)); return; }
    const predicate = setPredicate(match[2]);
    assert.ok(predicate, `unreadable interval: ${clause}`);
    defined.forEach((x) => {
      if (predicate.bounds.some(([bound]) => Math.abs(bound - x) < 1e-6)) return;
      assert.equal(predicate.test(x), sign * f(x) > 1e-12, `${clause} at x = ${x}`);
    });
    return;
  }
  const points = (value) => [...ascii(value).matchAll(new RegExp(`\\((${NUMBER}), (${NUMBER})\\)`, 'g'))].map((m) => [Number(m[1]), Number(m[2])]);
  const signChanges = () => ys.slice(1).filter((y, index) => Math.sign(y) !== Math.sign(ys[index]) && Math.sign(y) !== 0).length;
  if ((match = /^x-intercepts (.+?)(?:, zeros \{(.*)\})?$/.exec(clause))) {
    if (match[1] === 'never') {
      assert.ok(ys.every((y) => Math.abs(y) > 1e-9) && signChanges() === 0, `${clause}: the graph never meets the x-axis`);
      return;
    }
    const stated = points(match[1]);
    stated.forEach(([x, y]) => { assert.equal(y, 0); assert.ok(Math.abs(f(x)) < 1e-9, `${clause}: f(${x}) = 0`); });
    if (match[2] !== undefined) assert.deepEqual(match[2].split(', ').map(Number), stated.map(([x]) => x), `${clause}: zeros are the intercepts' x-values`);
    return;
  }
  if ((match = /^y-intercept (.+)$/.exec(clause))) {
    if (match[1] === 'never') { assert.ok(!Number.isFinite(f(0)) || (restriction && (restriction[0] > 0 || restriction[1] < 0)), clause); return; }
    const [[x, y]] = points(match[1]);
    assert.equal(x, 0);
    assert.ok(Math.abs(f(0) - y) < 1e-9, `${clause}: f(0) = ${f(0)}`);
    return;
  }
  if ((match = /^(vertex|lowest point|highest point|local minimum|local maximum) (.+)$/.exec(clause))) {
    if (match[2] === 'never') {
      const wantMin = /minimum/.test(match[1]);
      const interior = defined.filter((x) => x > low + 0.5 && x < high - 0.5);
      interior.forEach((x) => assert.ok(!(wantMin ? f(x) < f(x - 0.25) && f(x) < f(x + 0.25) : f(x) > f(x - 0.25) && f(x) > f(x + 0.25)), `${clause}: no ${match[1]} at ${x}`));
      return;
    }
    const [[x, y]] = points(match[2]);
    assert.ok(Math.abs(f(x) - y) < 1e-9, `${clause}: f(${x}) = ${f(x)}`);
    if (/lowest|minimum/.test(match[1])) ys.forEach((value) => assert.ok(value >= y - 1e-9, `${clause}: ${value} lies below`));
    if (/highest|maximum/.test(match[1])) ys.forEach((value) => assert.ok(value <= y + 1e-9, `${clause}: ${value} lies above`));
    if (match[1] === 'vertex') assert.ok((f(x - 0.5) - y) * (f(x + 0.5) - y) > 0, `${clause}: the graph turns at ${x}`);
    return;
  }
  if ((match = new RegExp(`^axis x = (${NUMBER})$`).exec(clause))) {
    const h = Number(match[1]);
    [0.5, 1, 2].forEach((t) => assert.ok(Math.abs(f(h - t) - f(h + t)) < 1e-9, `${clause}: symmetric at ±${t}`));
    return;
  }
  if ((match = new RegExp(`^asymptote y = (${NUMBER})$`).exec(clause))) {
    const k = Number(match[1]);
    assert.ok([-1e9, 1e9].some((x) => Math.abs(f(x) - k) < 1e-6), `${clause}: the graph approaches y = ${k}`);
    return;
  }
  if ((match = /^(rises|falls) everywhere$/.exec(clause))) {
    const direction = match[1] === 'rises' ? 1 : -1;
    defined.slice(1).forEach((x, index) => assert.ok(direction * (f(x) - f(defined[index])) > 0, `${clause} at ${x}`));
    return;
  }
  if ((match = /^(rises|falls), then (rises|falls)$/.exec(clause))) {
    const changes = defined.slice(1).map((x, index) => Math.sign(f(x) - f(defined[index]))).filter(Boolean);
    const flips = changes.slice(1).filter((value, index) => value !== changes[index]).length;
    assert.equal(flips, 1, `${clause}: turns exactly once`);
    assert.equal(changes[0], match[1] === 'rises' ? 1 : -1, clause);
    return;
  }
  if ((match = /^center (.+)$/.exec(clause))) {
    const [[x, y]] = points(match[1]);
    assert.ok(Math.abs(f(x) - y) < 1e-9 || !Number.isFinite(f(x)), clause);
    return;
  }
  assert.fail(`no check for sibling clause "${clause}"`);
};

const verifyFunctionSibling = (example) => {
  const prompt = ascii(example.prompt);
  const rhs = equationIn(prompt);
  assert.ok(rhs, `sibling prompt names a function: ${prompt}`);
  const f = functionOf(rhs);
  const restriction = restrictionOf(prompt);
  const window = restriction || [-12, 12];
  const clauses = example.answer.split('; ').map(text);
  clauses.forEach((clause) => verifyClause(f, window, restriction, clause));
  return { f, rhs, restriction };
};

const verifyGraphSibling = (example) => {
  if (example.prompt.startsWith('Graph ')) {
    const f = functionOf(equationIn(example.prompt));
    const stated = [...ascii(example.answer).matchAll(new RegExp(`\\((${NUMBER}), (${NUMBER})\\)`, 'g'))].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(stated.length >= 3, 'a construction sibling plots at least three points');
    stated.forEach(([x, y]) => assert.ok(Math.abs(f(x) - y) < 1e-9, `(${x}, ${y}) is on the graph`));
    return;
  }
  verifyFunctionSibling(example);
};

const verifyModelingSibling = (example) => {
  const prompt = ascii(example.prompt);
  const rate = Number((/(?:\$|steady |packs )(\d+)/.exec(prompt) || [])[1]);
  const max = Number((/(?:at most|up to) (\d+)/.exec(prompt) || [])[1]);
  assert.ok(rate > 0 && max > 0, `sibling scenario has a rate and a limit: ${prompt}`);
  const connected = /hose|cyclist/.test(prompt);
  example.answer.split('; ').forEach((clause) => {
    let match;
    if ((match = /^([A-Z])\(([a-z])\) = (\d+)([a-z])$/.exec(clause))) { assert.equal(Number(match[3]), rate, clause); return; }
    if ((match = /^table (.+)$/.exec(clause))) {
      [...match[1].matchAll(/\((\d+), (\d+)\)/g)].forEach(([, x, y]) => assert.equal(Number(y), rate * Number(x), clause));
      return;
    }
    if (clause === 'separate points') { assert.equal(connected, false); return; }
    if (clause === 'a connected graph') { assert.equal(connected, true); return; }
    if ((match = /^domain (.+)$/.exec(clause))) {
      const expected = connected ? [`[0, ${max}]`, `0 ≤ t ≤ ${max}`] : [`{0, 1, 2, ..., ${max}}`];
      assert.ok(expected.includes(match[1]), `${clause} should be one of ${expected}`);
      return;
    }
    if ((match = /^range (.+)$/.exec(clause))) {
      const top = rate * max;
      const expected = connected ? [`[0, ${top}]`] : [`{0, ${rate}, ${2 * rate}, ..., ${top}}`];
      assert.ok(expected.includes(match[1]) || new RegExp(`^0 ≤ [A-Z]\\(t\\) ≤ ${top}$`).test(match[1]), `${clause}`);
      return;
    }
    if (/^input .+, output .+$/.test(clause) || /^x-axis .+, y-axis .+$/.test(clause) || clause.startsWith('the start is (0, 0)')) return;
    assert.fail(`no check for modeling clause "${clause}"`);
  });
};

const verifyTableGraphSibling = (example) => {
  const prompt = ascii(example.prompt);
  const f = functionOf(equationIn(prompt, 'g'));
  const xs = /x ∈ \{([^}]+)\}/.exec(prompt)[1].split(', ').map(Number);
  const ys = xs.map(f);
  example.answer.split('; ').forEach((clause) => {
    let match;
    if ((match = /^table (.+)$/.exec(clause))) {
      const rows = [...match[1].matchAll(new RegExp(`\\((${NUMBER}), (${NUMBER})\\)`, 'g'))].map((m) => [Number(m[1]), Number(m[2])]);
      assert.deepEqual(rows, xs.map((x, index) => [x, ys[index]]), clause);
      return;
    }
    if (clause === 'separate points') return;
    if ((match = /^domain \{(.+)\}$/.exec(clause))) { assert.deepEqual(match[1].split(', ').map(Number), [...xs].sort((a, b) => a - b)); return; }
    if ((match = /^range \{(.+)\}$/.exec(clause))) { assert.deepEqual(match[1].split(', ').map(Number), [...new Set(ys)].sort((a, b) => a - b)); return; }
    assert.fail(`no check for table clause "${clause}"`);
  });
};

const verifyRelationSibling = (example) => {
  const pairs = [...ascii(/\{(.+)\}/.exec(example.prompt)[1]).matchAll(new RegExp(`\\((${NUMBER}), (${NUMBER})\\)`, 'g'))].map((m) => [Number(m[1]), Number(m[2])]);
  assert.ok(pairs.length >= 3);
  const xs = [...new Set(pairs.map(([x]) => x))].sort((a, b) => a - b);
  const ys = [...new Set(pairs.map(([, y]) => y))].sort((a, b) => a - b);
  const isFunction = pairs.every(([x, y]) => pairs.every(([otherX, otherY]) => otherX !== x || otherY === y));
  example.answer.split('; ').forEach((clause) => {
    let match;
    if ((match = /^arrows (.+)$/.exec(clause))) {
      const arrows = match[1].split(', ').map((arrow) => ascii(arrow).split(' → ').map(Number));
      assert.deepEqual(arrows, pairs, clause);
      return;
    }
    if ((match = /^domain \{(.+)\}$/.exec(clause))) { assert.deepEqual(ascii(match[1]).split(', ').map(Number), xs); return; }
    if ((match = /^range \{(.+)\}$/.exec(clause))) { assert.deepEqual(ascii(match[1]).split(', ').map(Number), ys); return; }
    if (clause === 'passes the function test') { assert.equal(isFunction, true); return; }
    if (clause === 'fails the function test') { assert.equal(isFunction, false); return; }
    if (clause.startsWith('points ')) return;
    assert.fail(`no check for relation clause "${clause}"`);
  });
};

const verifyTableSibling = (example) => {
  const prompt = ascii(example.prompt);
  const f = functionOf(/y = (.+) at x =/.exec(prompt)[1]);
  const xs = /at x = (.+)\.$/.exec(prompt)[1].split(', ').map(Number);
  assert.deepEqual(ascii(/^y-values (.+)$/.exec(example.answer)[1]).split(', ').map(Number), xs.map(f));
};

const verifySequenceSibling = (example) => {
  const prompt = ascii(example.prompt);
  const answer = ascii(example.answer);
  const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh', 'twelfth'];
  let match;
  if ((match = /Sequence P starts at (-?\d+) and adds (-?\d+) each time; sequence Q starts at (-?\d+) and doubles each time\. Which has the larger (\w+) term/.exec(prompt))) {
    const n = ORD.indexOf(match[4]);
    const p = termOf({ kind: 'arithmetic', first: Number(match[1]), change: Number(match[2]) }, n);
    const q = termOf({ kind: 'geometric', first: Number(match[3]), change: 2 }, n);
    assert.equal(answer, p === q ? `equal, by 0` : `${p > q ? 'P' : 'Q'}, by ${Math.abs(p - q)}`);
    return;
  }
  const terms = (/(?:begins|sequence|term:) ((?:-?\d+|__)(?:, (?:-?\d+|__))+)/.exec(prompt) || [])[1].split(', ');
  const known = terms.map((value, index) => [index + 1, value]).filter(([, value]) => value !== '__').map(([n, value]) => [n, Number(value)]);
  const [[n1, t1], [n2, t2]] = known;
  const arithmetic = known.every(([n, value]) => value === t1 + ((n - n1) * (t2 - t1)) / (n2 - n1));
  const ratio = (t2 / t1) ** (1 / (n2 - n1));
  const reading = arithmetic
    ? { kind: 'arithmetic', first: t1 - (n1 - 1) * ((t2 - t1) / (n2 - n1)), change: (t2 - t1) / (n2 - n1) }
    : { kind: 'geometric', first: t1 / ratio ** (n1 - 1), change: ratio };
  known.forEach(([n, value]) => assert.equal(termOf(reading, n), value, `${prompt}: one rule fits every shown term`));
  if ((match = /find the (\w+) term\./.exec(prompt))) {
    const n = ORD.indexOf(match[1]);
    assert.equal(answer, `${arithmetic ? `a common difference of ${reading.change}` : `a common ratio of ${reading.change}`}; ${match[1]} term ${termOf(reading, n)}`);
    return;
  }
  if (prompt.startsWith('Find the missing term')) {
    const gap = terms.indexOf('__') + 1;
    assert.ok(answer.startsWith(`${ORD[gap]} term ${termOf(reading, gap)} `), answer);
    return;
  }
  if ((match = /find the (\w+) term and the sum of the first (\d+) terms/.exec(prompt))) {
    const n = Number(match[2]);
    const sum = Array.from({ length: n }, (_, index) => termOf(reading, index + 1)).reduce((total, value) => total + value, 0);
    assert.equal(answer, `${match[1]} term ${termOf(reading, n)}; sum ${sum}`);
    return;
  }
  if (/explicit rule and a recursive rule/.test(prompt)) {
    const explicit = /aₙ = ([^;]+);/.exec(answer)[1]
      .replace(/·/g, '*').replace(/\^/g, '**').replace(/\(n - 1\)\*/g, '(n - 1)*');
    const rule = Function('n', `return ${explicit.replace(/(\d)\(/g, '$1*(')};`);
    [1, 2, 3, 4, 7].forEach((n) => assert.ok(Math.abs(rule(n) - termOf(reading, n)) < 1e-9, `explicit rule at n = ${n}`));
    assert.ok(answer.includes(`first term ${reading.first},`), answer);
    const recursive = /aₙ = (.+)$/.exec(answer.split(', ').slice(1).join(', '))[1];
    const step = recursive.replace(/aₙ₋₁/g, 'p').replace(/·/g, '*').replace(/\((-?\d+)\)/g, '($1)');
    const next = Function('p', `return ${step};`);
    [1, 2, 3].forEach((n) => assert.ok(Math.abs(next(termOf(reading, n)) - termOf(reading, n + 1)) < 1e-9, `recursive rule from term ${n}`));
    return;
  }
  assert.fail(`no check for sequence sibling "${prompt}"`);
};

const verifyInvestigationSibling = (example) => {
  const prompt = ascii(example.prompt);
  let match;
  if ((match = /^Compare f\(x\) = (.+) and g\(x\) = (.+) at x = (-?\d+):/.exec(prompt))) {
    const x = Number(match[3]);
    const [a, b] = [functionOf(match[1])(x), functionOf(match[2])(x)];
    assert.equal(example.answer, a === b ? 'They are equal' : `${a > b ? 'f' : 'g'} is greater (${a} vs ${b})`);
    return;
  }
  const rhs = /Investigate f\(x\) = (.+): find/.exec(prompt)[1];
  const f = functionOf(rhs);
  const answer = ascii(example.answer);
  if (/defining feature/.test(prompt)) {
    const [[x, y]] = [...answer.matchAll(new RegExp(`\\((${NUMBER}), (${NUMBER})\\)`, 'g'))].map((m) => [Number(m[1]), Number(m[2])]);
    if (/asymptote intersection/.test(answer)) {
      assert.ok(!Number.isFinite(f(x)) || Math.abs(f(x + 1e-7)) > 1e5, 'the vertical asymptote is at the center');
      assert.ok(Math.abs(f(1e6) - y) < 1e-4, 'the horizontal asymptote is at the center');
    } else {
      assert.ok(Math.abs(f(x) - y) < 1e-9, `${answer}: the feature is on the graph`);
    }
    return;
  }
  if (/domain and range/.test(prompt)) {
    const [, domain, rangeText] = /^domain (.+); range (.+)$/.exec(answer);
    verifyClause(f, [-12, 12], null, `domain ${domain}`);
    verifyClause(f, [-12, 12], null, `range ${rangeText}`);
    return;
  }
  if (/intercepts/.test(prompt)) {
    const [, xsText, y] = /^x-intercepts (.+); y-intercept (.+)$/.exec(answer);
    xsText.split(', ').map(Number).forEach((x) => assert.ok(Math.abs(f(x)) < 1e-9, `f(${x}) = 0`));
    assert.ok(Math.abs(f(0) - Number(y)) < 1e-9, 'f(0) is the y-intercept');
    return;
  }
  if ((match = /^(lowest|highest) point at (.+)$/.exec(answer))) {
    verifyClause(f, [-12, 12], null, `${match[1]} point ${match[2]}`);
    return;
  }
  if ((match = /^each branch (rises|falls)$/.exec(answer))) {
    const h = Number(/\(x ([+-]) (\d+)\)/.exec(rhs) ? (/\(x ([+-]) (\d+)\)/.exec(rhs)[1] === '-' ? 1 : -1) * Number(/\(x ([+-]) (\d+)\)/.exec(rhs)[2]) : 0);
    [[h - 6, h - 0.1], [h + 0.1, h + 6]].forEach(([low, high]) => verifyClause(f, [low, high], null, `${match[1]} everywhere`));
    return;
  }
  verifyClause(f, [-6, 6], null, answer);
};

const verifyAttributesSibling = (example) => {
  const prompt = ascii(example.prompt);
  let match;
  if ((match = /costs C\(t\) = (\d+)t \+ (\d+) dollars for any real riding time t from 0 to (\d+) minutes/.exec(prompt))) {
    const [rate, start, max] = match.slice(1).map(Number);
    example.answer.split('; ').forEach((clause) => {
      if (clause === 'connected') return;
      if (clause.startsWith('domain')) { assert.equal(clause, `domain [0, ${max}]`); return; }
      assert.equal(clause, `range [${start}, ${rate * max + start}]`);
    });
    return;
  }
  if (prompt.startsWith('Identify the asymptotes of ')) {
    const names = example.answer.split('; ').map((part) => /^([a-z]): (.+)$/.exec(part));
    names.forEach(([, name, clause]) => {
      const f = functionOf(equationIn(prompt, name));
      clause.replace(/^asymptotes /, '').split(', ').forEach((line) => {
        const [, direction, value] = new RegExp(`^(vertical x|horizontal y) = (${NUMBER})$`).exec(ascii(line));
        if (direction === 'vertical x') assert.ok(!Number.isFinite(f(Number(value))) && (Math.abs(f(Number(value) + 1e-9)) > 10 || Number.isNaN(f(Number(value) - 1e-9))), `${name}: vertical asymptote x = ${value}`);
        else assert.ok([-1e9, 1e9].some((x) => Math.abs(f(x) - Number(value)) < 1e-6), `${name}: horizontal asymptote y = ${value}`);
      });
    });
    return;
  }
  const rhs = equationIn(prompt, 'g');
  const f = functionOf(rhs);
  const restriction = restrictionOf(prompt);
  example.answer.split('; ').forEach((clause) => {
    let part;
    if ((part = /^family (.+)$/.exec(clause))) {
      const marks = { 'square root': /√/, 'cube root': /∛/, reciprocal: /\/\(?x/, logarithmic: /log/, exponential: /\^/, 'absolute value': /\|/, quadratic: /²/, cubic: /³/, linear: /^-?\d*x/ };
      assert.ok(marks[part[1]]?.test(rhs), `${rhs} is in the ${part[1]} family`);
      return;
    }
    if ((part = /^asymptotes (.+)$/.exec(clause))) {
      part[1].split(', ').forEach((line) => {
        const [, direction, value] = new RegExp(`^(vertical x|horizontal y) = (${NUMBER})$`).exec(ascii(line));
        if (direction === 'vertical x') assert.ok(!Number.isFinite(f(Number(value))), `vertical asymptote x = ${value}`);
        else assert.ok([-1e9, 1e9].some((x) => Math.abs(f(x) - Number(value)) < 1e-6), `horizontal asymptote y = ${value}`);
      });
      return;
    }
    if (clause === 'connected') return;
    verifyClause(f, restriction || [-12, 12], restriction, clause);
  });
};

const VERIFY = {
  graph: verifyGraphSibling,
  characteristics: verifyFunctionSibling,
  modeling: verifyModelingSibling,
  tableGraph: verifyTableGraphSibling,
  relation: verifyRelationSibling,
  table: verifyTableSibling,
  sequence: verifySequenceSibling,
  investigation: verifyInvestigationSibling,
  attributes: verifyAttributesSibling,
};

/* ---------------------------------------------------------------------------
 * The tests.
 * ------------------------------------------------------------------------- */

test('the corpus and samples give several real items of every sub-kind the family claims', () => {
  const minimum = { graph: 20, characteristics: 15, modeling: 6, tableGraph: 5, relation: 8, table: 6, sequence: 6, investigation: 5, attributes: 10 };
  Object.entries(minimum).forEach(([kind, count]) => assert.ok(KINDS[kind].length >= count, `${kind}: ${KINDS[kind].length} items`));
  assert.equal(ATTRIBUTE_ITEMS.length, ATTRIBUTE_PROMPTS.length, 'every listed attribute prompt is in the corpus');
  // Every function-type item of the corpus is one of the kinds above.
  CORPUS.filter(({ question }) => FUNCTION_TYPES.includes(question.type)).forEach((item) => {
    assert.ok(ALL_ITEMS.some((entry) => entry.question === item.question), `${item.source}: ${item.question.type} is tested`);
  });
});

test('matches(): every item is claimed, and the index gives it to this family', () => {
  ALL_ITEMS.forEach((item) => {
    assert.equal(functionFeatures.matches(item.question), true, label(item));
    assert.equal(familyFor(item.question)?.family, 'functionFeatures', `${label(item)} is owned by functionFeatures`);
  });
});

test('matches(): multiAnswer items that are transformations, vertices, inverses or compositions are not claimed, nor is any platform family instance', () => {
  NOT_ATTRIBUTE_PROMPTS.forEach((prompt) => {
    const item = CORPUS.find(({ question }) => text(question.prompt) === prompt);
    assert.ok(item, `corpus has "${prompt}"`);
    assert.equal(functionFeatures.matches(item.question), false, prompt);
  });
  PLATFORM_FAMILY_IDS.forEach((familyId) => {
    for (let seat = 0; seat < 4; seat += 1) {
      const instance = resolveFamilyQuestionInstance({
        question: { type: 'multiAnswer', questionFamily: { id: familyId }, prompt: '' },
        assignmentId: 'support-family-functionFeatures',
        storageIndex: 0,
        allocation: { seat, variant: 0, stride: 40, index: seat, basis: 'seated' },
      });
      const question = instance?.question || instance;
      assert.equal(functionFeatures.matches(question), false, `${familyId} seat ${seat}`);
    }
  });
  assert.equal(functionFeatures.matches({ type: 'stepAlgebra', equation: '2x + 3 = 7' }), false);
  assert.equal(functionFeatures.matches(null), false);
});

test('expectedValues(): every independently computed answer is listed, in a spelling the guard can match', () => {
  ALL_ITEMS.forEach((item) => {
    const expected = new Set(functionFeatures.expectedValues(item.question).map(canonical));
    assert.ok(expected.size > 0, `${label(item)} lists its answers`);
    const { keys } = independentKey(item);
    assert.ok(keys.length > 0, `${label(item)} has an independent key`);
    keys.forEach((key) => assert.ok(expected.has(canonical(key)), `${label(item)}: expectedValues names "${key}"`));
  });
});

test('hints(): two to four, and none contains an answer or names any choice the student could pick', () => {
  ALL_ITEMS.forEach((item) => {
    const hints = functionFeatures.hints(item.question);
    assert.ok(hints.length >= 2 && hints.length <= 4, `${label(item)}: ${hints.length} hints`);
    const { keys, vocabulary } = independentKey(item);
    const answers = [...new Set([...functionFeatures.expectedValues(item.question), ...keys, ...vocabulary])];
    hints.forEach((hint) => {
      assert.equal(typeof hint, 'string');
      assert.ok(hint.length > 20 && !/\b(NaN|false|null)\b|=\s*undefined|\(undefined|undefined\)/.test(hint), `${label(item)}: "${hint}"`);
      assert.equal(hintRevealsAnswer(hint, answers), false, `${label(item)} hint leaks: "${hint}" (${answers.filter((answer) => hintRevealsAnswer(hint, [answer])).join(' | ')})`);
    });
  });
});

test('hints(): built from the problem\'s own numbers where the student can see them', () => {
  const quoting = [
    ...KINDS.graph.filter(({ question }) => question.type === 'graphAnalysis'),
    ...KINDS.relation.filter(({ question }) => question.type === 'relationMapping' && !question.recipe),
  ];
  assert.ok(quoting.length >= 20);
  quoting.forEach((item) => {
    const hints = functionFeatures.hints(item.question).join(' ');
    if (item.question.type === 'graphAnalysis') assert.match(hints, /f\(x\) = /, `${label(item)} quotes its equation`);
    else assert.match(hints, /\(-?\d+, -?\d+\)/, `${label(item)} quotes its pairs`);
  });
});

test('buildQuestionHints(): the platform ladder carries this family\'s hints, and drops none of them', () => {
  ALL_ITEMS.forEach((item) => {
    const family = functionFeatures.hints(item.question);
    const ladder = buildQuestionHints(item.question);
    const fromFamily = ladder.filter((hint) => hint.source === 'family').map((hint) => hint.text);
    const authored = ladder.filter((hint) => hint.source === 'authored').length;
    assert.deepEqual(fromFamily, family.slice(0, Math.max(0, 6 - authored)), label(item));
    assert.ok(fromFamily.length >= 1, `${label(item)} shows at least one family hint`);
  });
});

test('similarProblem(): a worked sibling on new numbers, re-solved from its own prompt, never this question\'s answer', () => {
  ALL_ITEMS.forEach((item) => {
    const { keys } = independentKey(item);
    const answers = [...new Set([...functionFeatures.expectedValues(item.question), ...keys])];
    // The platform asks for seeds 0..5 until one is safe; every one it could show is checked.
    [0, 1, 2].forEach((seed) => {
      const example = functionFeatures.similarProblem(item.question, { seed });
      assert.ok(example, `${label(item)} has a sibling for seed ${seed}`);
      assert.ok(text(example.prompt) && text(example.answer) && example.steps.length >= 1, label(item));
      assert.notEqual(text(example.prompt), text(item.question.prompt));
      assert.ok(!answers.some((answer) => canonical(answer) === canonical(example.answer)), `${label(item)}: the sibling's answer is not this one's`);
      example.steps.forEach((step) => assert.equal(hintRevealsAnswer(step, answers), false, `${label(item)} sibling step leaks: "${step}"`));
      assert.ok(!/\b(undefined|NaN|null|false)\b/.test(`${example.prompt} ${example.steps.join(' ')} ${example.answer}`), label(item));
      try {
        VERIFY[item.kind](example);
      } catch (error) {
        error.message = `${label(item)} (seed ${seed})\n  sibling: ${example.prompt}\n  answer: ${example.answer}\n  ${error.message}`;
        throw error;
      }
    });
    const platform = buildSimilarWorkedExample(item.question);
    assert.ok(platform, `${label(item)}: the platform offers the sibling`);
    assert.notEqual(canonical(platform.answer), canonical(text(item.question.answer)));
  });
});

test('similarProblem(): deterministic for a seed, and a different seed may give a different sibling', () => {
  const sampleItems = Object.values(KINDS).map((items) => items[0]);
  sampleItems.forEach((item) => {
    assert.deepEqual(functionFeatures.similarProblem(item.question, { seed: 3 }), functionFeatures.similarProblem(item.question, { seed: 3 }), label(item));
  });
  const varied = sampleItems.filter((item) => JSON.stringify(functionFeatures.similarProblem(item.question, { seed: 0 })) !== JSON.stringify(functionFeatures.similarProblem(item.question, { seed: 1 })));
  assert.ok(varied.length >= 5, 'most kinds vary with the seed');
});

test('backUpQuestion(): two choices about the first move, the right one among them, none an answer', () => {
  ALL_ITEMS.forEach((item) => {
    const step = functionFeatures.backUpQuestion(item.question);
    assert.ok(step, label(item));
    assert.equal(step.options.length, 2);
    assert.ok(step.options.includes(step.correct), label(item));
    const { keys, vocabulary } = independentKey(item);
    const answers = [...new Set([...functionFeatures.expectedValues(item.question), ...keys, ...vocabulary])];
    [step.prompt, ...step.options].forEach((value) => assert.equal(hintRevealsAnswer(value, answers), false, `${label(item)}: "${value}"`));
    const platform = backUpStepFor(item.question);
    assert.equal(platform.source, 'family', label(item));
    assert.equal(platform.correct, step.correct);
  });
});

test('every verdict a student can choose gets the same hints: the ladder never depends on which choice is right', () => {
  // A relation that is a function and the same relation with one input repeated.
  const base = KINDS.relation.find(({ question }) => !question.recipe && (question.ask || []).includes('isFunction')).question;
  const pairs = base.pairs.map((pair) => (Array.isArray(pair) ? pair : [pair.x, pair.y]));
  const asFunction = { ...base, pairs: pairs.map(([x], index) => [x + index * 100, index]) };
  const notFunction = { ...base, pairs: [...asFunction.pairs.slice(0, -1), [asFunction.pairs[0][0], 99]] };
  const strip = (question) => functionFeatures.hints(question).map((hint) => hint.replace(/\{[^}]*\}/g, '{pairs}').replace(/\d+ pairs, so \d+ arrows/, 'N pairs'));
  assert.deepEqual(strip(asFunction), strip(notFunction));
  // A functionCharacteristics quadratic opening up and the same one opening down.
  const up = KINDS.characteristics.find(({ question }) => question.extreme?.kind === 'minimum').question;
  const down = KINDS.characteristics.find(({ question }) => question.extreme?.kind === 'maximum').question;
  assert.deepEqual(functionFeatures.hints(up), functionFeatures.hints(down));
});
