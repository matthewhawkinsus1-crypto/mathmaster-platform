// My Math Path's tool graders against the shared graders, on the live Path items.
//
// WHY. A My Math Path tool item is graded by its own contract
// (functions/shared/pathToolContracts.mjs) while the same tool in an
// assignment is graded by the shared grader the tool itself runs
// (functions/shared/serverGrading/). Where the two disagree, the same answer is
// right in one place and wrong in the other (MP07, audit VH-45). This module
// lays the two side by side on the items a student can actually be issued, so
// each disagreement is a named, reproducible fact instead of a sentence in a
// coverage document.
//
// WHAT. Every family of the course release (grade 6, 7, 8, Algebra I and II)
// whose generated item resolves to one of PARITY_TOOL_IDS is compiled by the
// Path content compiler, drawn by the production generator and issued as
// issueNextQuestion stores it (pathBankAnswerSweep.mjs issueAsServed). Each
// item is answered with PROBES: work in the exact shape the tool sends (the
// lab's own keys, typed boxes as text), built from the authored item by
// arithmetic done here, never from either grader's key. Each probe is graded
// twice:
//
//   path    the stored private grading, through the Path contract — what
//           submitPathResponse and Live Challenge do;
//   shared  the shared grader, on the whole authored item — what an
//           assignment holding the same item does.
//
// A probe says what it is (`intent`):
//
//   right   a correct answer the tool can send;
//   wrong   an incorrect answer the tool can send;
//   near    within one grader's tolerance and outside the other's — which
//           verdict is right is a tolerance policy, so it is reported, never
//           assumed;
//   legacy  a shape today's tool never sends (an older client, a pre-reasons
//           verdict, a hand-built request): reported, but no student meets it
//           from today's tool.
//
// Nothing here writes anything. Read by
// tests/platform/pathToolSharedParity.test.mjs and by the verdict sweep
// scripts/sweep-path-tool-verdicts.mjs.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  SCHOOL_COURSES,
  compiledCourseDocuments,
  independentRegressions,
  issueAsServed,
  readCourseSeed,
} from './pathBankAnswerSweep.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shared =(relative) => import(pathToFileURL(path.join(ROOT, 'functions/shared', relative)).href);

const generation = await shared('pathQuestionGeneration.mjs');
const { default: relationMappingGrader, parseList, relationIsFunction, relationPairsOf } = await shared('serverGrading/tools/relationMapping.mjs');
const { default: systemsWorkspaceGrader } = await shared('serverGrading/tools/systemsWorkspace.mjs');
const { default: dataModelingGrader } = await shared('serverGrading/tools/dataModelingLab.mjs');
const { equationWorkspaceWork, stepAlgebraWorkGrader } = await shared('serverGrading/stepAlgebraWorkspaceGrading.mjs');
const { equationToLatex } = await shared('algebra/algebraAstEngine.mjs');
const { correctFunctionChoice, FUNCTION_STATUS_CHOICES } = await shared('relationFunctionChoice.mjs');
const { OWN_CHOICES } = await shared('toolMath/shared/judgmentChoices.mjs');
const { resolveSystemsWorkspaceMode } = await shared('toolMath/systemsWorkspace/systemsWorkspaceMode.mjs');

/** The tools MP07 names: their Path contracts still differ from the shared graders. */
export const PARITY_TOOL_IDS = Object.freeze(['relationMapping', 'systemsWorkspace', 'dataModelingLab', 'stepAlgebra']);

/** The current tree's Path contracts (the sweep passes a base tree's copy instead). */
export const currentPathContracts = await shared('pathToolContracts.mjs');

const list = (value) => (Array.isArray(value) ? value : []);
const unique = (values) => [...new Set(values)];
// A typed box holds text. Six decimal places is what a student copying a
// calculator display types, and is exact for every key the banks author.
const typed = (value) => String(Number(Number(value).toFixed(6)));
const finite = (value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));

// --- The items ------------------------------------------------------------------

/**
 * Every instance of every live family whose tool is in `toolIds`: `draws`
 * seeded draws per generated variant row, one per fixed row.
 *
 *   items    the issued instances: { courseId, id, variant, draw, toolId, question, stored }
 *   skipped  the families of these tools that did not compile, and the draws
 *            that did not generate or did not issue — none should, and a
 *            caller that ignores this list could lose a family without
 *            noticing.
 */
export const liveToolItems = async ({ draws = 3, courses = SCHOOL_COURSES, toolIds = PARITY_TOOL_IDS } = {}) => {
  const items = [];
  const skipped = [];
  for (const courseId of courses) {
    const { documents, errors } = compiledCourseDocuments(courseId);
    // A family the compiler refused is not issued at all; name it if it is one of these tools.
    const authored = new Map(readCourseSeed(courseId).map((item) => [String(item?.id), item]));
    errors.forEach((error) => {
      const toolId = currentPathContracts.resolvePathToolId(authored.get(String(error.questionId)) || {});
      if (toolId && toolIds.includes(toolId)) skipped.push({ courseId, id: error.questionId, variant: null, draw: null, toolId, reason: `compile-error: ${error.code}` });
    });
    for (const document of documents) {
      if (document.active === false) continue;
      for (const row of generation.effectivePathVariants(document)) {
        // The template names its tool as the instance will (`type`).
        const templateTool = currentPathContracts.resolvePathToolId(row.template);
        const generated = generation.hasPathGenerator(row.template);
        for (let draw = 0; draw < (generated ? draws : 1); draw += 1) {
          const seed = `mp07-parity-${draw}`;
          const question = generated
            ? generation.generatePathInstanceWithRetries(row.template, seed, 4)?.question
            : row.template;
          const toolId = question ? currentPathContracts.resolvePathToolId(question) : templateTool;
          if (!toolId || !toolIds.includes(toolId)) continue;
          const where = { courseId, id: document.id, variant: row.variantIndex ?? null, draw: generated ? seed : null, toolId };
          if (!question) {
            skipped.push({ ...where, reason: 'generation-failed' });
            continue;
          }
          // eslint-disable-next-line no-await-in-loop
          const { plan, stored } = await issueAsServed(question);
          if (!plan?.issuable) {
            skipped.push({ ...where, reason: plan?.reason || 'not-issuable' });
            continue;
          }
          items.push({ ...where, question, stored });
        }
      }
    }
  }
  return { items, skipped };
};

// --- Probes: the tool's own work ----------------------------------------------------

const probe = (tag, intent, raw, work = raw) => ({ tag, intent, raw, work });

/*
 * relationMapping — exactly the object RelationMapping.jsx submits: the typed
 * boxes as text, `domain` / `range` as the lab parses them (parseList, the
 * shared definition), the reason-bearing function choice. A part the item
 * does not ask for keeps the lab's starting value.
 */
const relationProbes = (question) => {
  const pairs = relationPairsOf(question.pairs);
  const ask = Array.isArray(question.ask) ? question.ask : ['mapping', 'domain', 'range'];
  const xs = unique(pairs.map(([x]) => x));
  const ys = unique(pairs.map(([, y]) => y));
  const isFunction = relationIsFunction(pairs);
  // One arrow per ordered pair: the lab cannot draw the same arrow twice.
  const arrows = unique(pairs.map(([x, y]) => `${x}|${y}`)).map((key) => key.split('|').map(Number));
  const lab = ({ drawn = arrows, domainText = xs.join(', '), rangeText = ys.join(', '), choice = correctFunctionChoice(isFunction) } = {}) => ({
    plottedPoints: [],
    arrows: ask.includes('mapping') ? drawn : [],
    domainText: ask.includes('domain') ? domainText : '',
    rangeText: ask.includes('range') ? rangeText : '',
    domain: parseList(ask.includes('domain') ? domainText : ''),
    range: parseList(ask.includes('range') ? rangeText : ''),
    isFunction: ask.includes('isFunction') ? choice : '',
    fields: [],
  });
  const probes = [probe('key', 'right', lab())];
  const typesSets = ask.includes('domain') || ask.includes('range');
  if (typesSets) {
    probes.push(probe('sets typed in another order', 'right', lab({ domainText: [...xs].reverse().join(', '), rangeText: [...ys].reverse().join(', ') })));
    // A set is the same set however often a value is written: the lab's Check
    // (and an assignment) accepts it.
    probes.push(probe('each value typed as the pairs list it', 'right', lab({
      domainText: pairs.map(([x]) => x).join(', '),
      rangeText: pairs.map(([, y]) => y).join(', '),
    })));
    probes.push(probe('a value typed twice', 'right', lab({
      domainText: [...xs, xs[0]].join(', '),
      rangeText: [...ys, ys[0]].join(', '),
    })));
    // A different number, five ten-millionths away: inside the old 1e-6.
    probes.push(probe('a value 5e-7 away', 'near', lab({
      domainText: [xs[0] + 5e-7, ...xs.slice(1)].join(', '),
      rangeText: [ys[0] + 5e-7, ...ys.slice(1)].join(', '),
    })));
    if (xs.length > 1 || ys.length > 1) {
      probes.push(probe('a value missing', 'wrong', lab({
        domainText: (xs.length > 1 ? xs.slice(0, -1) : xs).join(', '),
        rangeText: (ys.length > 1 ? ys.slice(0, -1) : ys).join(', '),
      })));
    }
  }
  if (ask.includes('mapping')) {
    probes.push(probe('arrows drawn in another order', 'right', lab({ drawn: [...arrows].reverse() })));
    if (arrows.length > 1) probes.push(probe('an arrow missing', 'wrong', lab({ drawn: arrows.slice(0, -1) })));
    // Firestore's {x, y} storage shape; the lab sends [x, y].
    probes.push(probe('arrows sent as {x, y}', 'legacy', lab({ drawn: arrows.map(([x, y]) => ({ x, y })) })));
  }
  if (ask.includes('isFunction')) {
    probes.push(probe('the opposite verdict', 'wrong', lab({ choice: correctFunctionChoice(!isFunction) })));
    probes.push(probe('the one-to-one reason', 'wrong', lab({
      choice: isFunction ? FUNCTION_STATUS_CHOICES.YES_OUTPUT_RULE : FUNCTION_STATUS_CHOICES.NO_OUTPUT_REPEAT,
    })));
    // The Yes / No select from before the reasons.
    probes.push(probe('a bare yes / no verdict', 'legacy', lab({ choice: isFunction ? 'yes' : 'no' })));
  }
  return probes;
};

/*
 * systemsWorkspace — the workspace's own work per mode: LinearMode's
 * { x, y, classification } (x and y from <input type="number">, so text), the
 * matrix view's { classification, x, y, z, technologyUsed }, the inequality
 * view's parsed construction, test choice and candidate.
 */
const systemsProbes = (question) => {
  const mode = String(question.mode || 'linear');
  if (mode === 'linear') {
    const { m1, b1, m2, b2 } = question.system || {};
    const slopeGap = Number(m1) - Number(m2);
    if (Math.abs(slopeGap) <= 1e-12) {
      const classification = Math.abs(Number(b1) - Number(b2)) <= 1e-12 ? 'infinite' : 'none';
      return [
        probe('key', 'right', { x: '', y: '', classification }),
        probe('exactly one solution claimed', 'wrong', { x: '0', y: '0', classification: 'one' }),
      ];
    }
    const x = (Number(b2) - Number(b1)) / slopeGap;
    const y = Number(m1) * x + Number(b1);
    const authored = finite(question.numericTolerance) ? Number(question.numericTolerance) : null;
    return [
      probe('key', 'right', { x: typed(x), y: typed(y), classification: 'one' }),
      probe('coordinates rounded to hundredths', 'right', { x: typed(x.toFixed(2)), y: typed(y.toFixed(2)), classification: 'one' }),
      // A graph read to the nearest tenth, a tenth off: right where the item
      // authors that much tolerance ("estimate to about the nearest tenth"),
      // wrong where it does not.
      probe('each coordinate a tenth off', authored != null && authored >= 0.1 ? 'right' : 'wrong', {
        x: typed(x + 0.1), y: typed(y + 0.1), classification: 'one',
      }),
      probe('no solution claimed', 'wrong', { x: '', y: '', classification: 'none' }),
      probe('a coordinate off by one', 'wrong', { x: typed(x + 1), y: typed(y), classification: 'one' }),
    ];
  }
  if (mode === 'matrix3') {
    const rows = list(question.matrix?.rows).map((row) => (Array.isArray(row) ? row : list(row?.cells)).map(Number));
    if (rows.length !== 3) return [];
    // Cramer's rule, independently of either grader's elimination.
    const det3 = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
      - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
      + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const coefficients = rows.map((row) => row.slice(0, 3));
    const det = det3(coefficients);
    if (Math.abs(det) < 1e-12) return [];
    const solve = (column) => det3(coefficients.map((row, index) => row.map((value, j) => (j === column ? rows[index][3] : value)))) / det;
    const [x, y, z] = [0, 1, 2].map(solve);
    const work = (overrides = {}) => ({ classification: 'one', x: typed(x), y: typed(y), z: typed(z), technologyUsed: true, ...overrides });
    return [
      probe('key', 'right', work()),
      probe('coordinates rounded to hundredths', 'right', work({ x: typed(x.toFixed(2)), y: typed(y.toFixed(2)), z: typed(z.toFixed(2)) })),
      probe('z off by one', 'wrong', work({ z: typed(z + 1) })),
      // The view refuses to send this (it waits for the RREF technology).
      probe('sent without the RREF technology', 'legacy', work({ technologyUsed: false })),
    ];
  }
  if (mode === 'inequalities') {
    const inequalities = list(question.inequalities).map((entry) => ({ m: Number(entry.m), b: Number(entry.b), relation: String(entry.relation || '>=') }));
    const holds = (entry, px, py) => {
      const rhs = entry.m * px + entry.b;
      return { '>': py > rhs, '>=': py >= rhs, '<': py < rhs, '<=': py <= rhs }[entry.relation] ?? (py >= rhs);
    };
    const ask = Array.isArray(question.ask) && question.ask.length
      ? question.ask
      : (question.interaction === 'construct' || question.requireGraphConstruction === true ? ['construction'] : ['testPoint', 'candidate']);
    const findPoint = (inside) => {
      for (let px = -10; px <= 10; px += 1) {
        for (let py = -20; py <= 20; py += 1) {
          if (inequalities.every((entry) => holds(entry, px, py)) === inside) return { x: px, y: py };
        }
      }
      return null;
    };
    const construction = (shift = 0, flipShade = false, flipStyle = false) => inequalities.map((entry) => {
      const solid = entry.relation.includes('=');
      const above = entry.relation.includes('>');
      return {
        points: [{ x: 0, y: entry.b + shift }, { x: 2, y: entry.m * 2 + entry.b + shift }],
        boundaryStyle: solid !== flipStyle ? 'solid' : 'dashed',
        shade: above !== flipShade ? 'above' : 'below',
      };
    });
    const inside = findPoint(true);
    const outside = findPoint(false);
    const testPoint = question.testPoint && finite(question.testPoint.x) && finite(question.testPoint.y)
      ? inequalities.every((entry) => holds(entry, Number(question.testPoint.x), Number(question.testPoint.y)))
      : null;
    const work = (overrides = {}) => ({
      ...(ask.includes('construction') ? { construction: construction() } : {}),
      ...(ask.includes('testPoint') && testPoint != null ? { testChoice: testPoint ? 'yes' : 'no' } : {}),
      ...(ask.includes('candidate') && inside ? { candidate: inside } : {}),
      ...overrides,
    });
    const probes = [probe('key', 'right', work())];
    if (ask.includes('construction')) {
      probes.push(probe('boundary points 0.05 off the line', 'right', work({ construction: construction(0.05) })));
      probes.push(probe('every region shaded on the other side', 'wrong', work({ construction: construction(0, true) })));
      probes.push(probe('every boundary drawn in the other style', 'wrong', work({ construction: construction(0, false, true) })));
      probes.push(probe('boundary points 0.1 off the line', 'wrong', work({ construction: construction(0.1) })));
    }
    if (ask.includes('testPoint') && testPoint != null) {
      probes.push(probe('the wrong test-point answer', 'wrong', work({ testChoice: testPoint ? 'no' : 'yes' })));
      // The view sends nothing until the choice is made.
      probes.push(probe('the test-point choice left blank', 'legacy', work({ testChoice: '' })));
    }
    if (ask.includes('candidate') && outside) probes.push(probe('a candidate outside the region', 'wrong', work({ candidate: outside })));
    return probes;
  }
  return [];
};

/*
 * dataModelingLab — the lab's work: raw input text (a cleared box is '' and
 * never 0), only the fitted function this mode grades, every judgment, and
 * OWN_CHOICES (today's lab opens every judgment unanswered).
 */
const FORCED_MODEL = Object.freeze({
  linearFit: 'linear', quadraticFit: 'quadratic', exponentialFit: 'exponential',
  linearFitPrediction: 'linear', quadraticFitPrediction: 'quadratic', exponentialFitPrediction: 'exponential', squareRootFitPrediction: 'squareRoot',
});
const FIT_PREDICTION = new Set(['linearFitPrediction', 'quadraticFitPrediction', 'exponentialFitPrediction', 'squareRootFitPrediction']);

const predictWith = (family, model, x) => {
  if (family === 'linear') return model.m * x + model.b;
  if (family === 'quadratic') return model.a * x * x + model.b * x + model.c;
  if (family === 'exponential') return model.a * model.base ** x;
  if (family === 'squareRoot') return x < model.h ? Number.NaN : model.a * Math.sqrt(x - model.h) + model.k;
  return Number.NaN;
};

const dataModelingProbes = (question) => {
  const mode = String(question.mode || 'full');
  const family = FORCED_MODEL[mode] || null;
  if (!family && mode !== 'correlation') return [];
  const points = list(question.points)
    .map((point) => (Array.isArray(point) ? [Number(point[0]), Number(point[1])] : [Number(point?.x), Number(point?.y)]))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const fits = independentRegressions(points);
  const xs = points.map(([x]) => x);
  const abs = Math.abs(fits.r);
  const descriptor = {
    direction: fits.r > 0.05 ? 'positive' : fits.r < -0.05 ? 'negative' : 'none',
    strength: abs >= 0.8 ? 'strong' : abs >= 0.5 ? 'moderate' : abs >= 0.2 ? 'weak' : 'none',
  };
  const fitWork = (places, nudge = {}) => {
    const round = (value) => typed(Number(value).toFixed(places));
    if (family === 'quadratic') return { a: round(fits.quadratic.a), b: round(fits.quadratic.b), c: round(fits.quadratic.c) };
    if (family === 'exponential') return { a: round(fits.exponential.a), base: round(fits.exponential.base) };
    if (family === 'squareRoot') return { a: round(fits.squareRoot.a), h: round(fits.squareRoot.h), k: round(fits.squareRoot.k) };
    if (family === 'linear') return { m: round(fits.linear.m), b: round(fits.linear.b + (nudge.intercept || 0)) };
    return {};
  };
  const predictionX = finite(question.predictionX) ? Number(question.predictionX) : null;
  const asksPrediction = FIT_PREDICTION.has(mode) && predictionX != null;
  const model = family ? (fits[family] || null) : null;
  const work = ({ places = 6, nudge = {}, overrides = {} } = {}) => ({
    ...fitWork(places, nudge),
    r: mode === 'correlation' ? typed(fits.r.toFixed(Math.max(2, places))) : '',
    direction: mode === 'correlation' ? descriptor.direction : '',
    strength: mode === 'correlation' ? descriptor.strength : '',
    causation: '',
    modelChoice: '',
    predictionX: predictionX ?? '',
    predictionY: asksPrediction && model ? typed(predictWith(family, model, predictionX).toFixed(places)) : '',
    predictionType: asksPrediction
      ? (predictionX >= Math.min(...xs) && predictionX <= Math.max(...xs) ? 'interpolation' : 'extrapolation')
      : '',
    ...OWN_CHOICES,
    ...overrides,
  });
  const probes = [
    probe('key', 'right', work()),
    probe('rounded to hundredths', 'right', work({ places: 2 })),
  ];
  if (mode === 'correlation') {
    probes.push(probe('r with the opposite sign', 'wrong', work({ overrides: { r: typed(-fits.r) } })));
    // The lab will not send an empty box (it waits for every graded input).
    probes.push(probe('r left blank', 'legacy', work({ overrides: { r: '' } })));
  }
  if (asksPrediction) {
    const keyWork = work();
    probes.push(probe('the prediction type flipped', 'wrong', work({
      overrides: { predictionType: keyWork.predictionType === 'interpolation' ? 'extrapolation' : 'interpolation' },
    })));
  }
  if (family === 'linear') {
    // Nine tenths off the intercept: inside Path's max(0.8, 8% of |b|) when
    // |b| is above 11.25, outside the lab's 0.8 always.
    probes.push(probe('the intercept 0.9 off', 'near', work({ nudge: { intercept: 0.9 } })));
  }
  return probes;
};

/*
 * stepAlgebra — the equation workspace's committed equation. The shared
 * grader reads it as { left, right } (equationWorkspaceWork); Path reads the
 * LaTeX My Math Path's raw builder sends (pathToolResponses.js:
 * `finalEquation`, the workspace's equationToLatex of the same equation).
 */
const stepAlgebraProbes = (question) => {
  if (question.solverGrader || list(question.algebraPrompts).length) return [];
  const variable = String(question.variable || question.objective?.variable || 'x');
  const answer = Number(question.answer ?? question.solution ?? question.expected);
  if (!Number.isFinite(answer)) return [];
  const equation = (left, right) => {
    const sides = { left, right };
    let latex = `${left} = ${right}`;
    try { latex = equationToLatex(sides); } catch { /* keep the plain form */ }
    return { raw: { finalEquation: latex }, work: equationWorkspaceWork({ equation: sides, promptAnswers: {} }) };
  };
  const make = (tag, intent, left, right) => {
    const { raw, work } = equation(left, right);
    return probe(tag, intent, raw, work);
  };
  return [
    make('key', 'right', variable, String(answer)),
    make('sides swapped', 'right', String(answer), variable),
    make('the value as an unsimplified fraction', 'right', variable, `${2 * answer}/2`),
    make('the value off by one', 'wrong', variable, String(answer + 1)),
    make('the variable not yet isolated', 'wrong', `2${variable}`, String(2 * answer)),
  ];
};

const PROBE_BUILDERS = Object.freeze({
  relationMapping: relationProbes,
  systemsWorkspace: systemsProbes,
  dataModelingLab: dataModelingProbes,
  stepAlgebra: stepAlgebraProbes,
});

export const probesFor = (toolId, question) => (PROBE_BUILDERS[toolId] ? PROBE_BUILDERS[toolId](question) : []);

// --- The two verdicts ---------------------------------------------------------------

const SHARED_GRADERS = Object.freeze({
  relationMapping: relationMappingGrader,
  systemsWorkspace: systemsWorkspaceGrader,
  dataModelingLab: dataModelingGrader,
  stepAlgebra: stepAlgebraWorkGrader,
});

/** The shared grader's verdict on the whole authored item: { graded, isCorrect, score, reason }. */
export const sharedVerdict = (toolId, question, work) => {
  const result = SHARED_GRADERS[toolId].grade(question, JSON.parse(JSON.stringify(work)));
  return { graded: result.graded === true, isCorrect: result.isCorrect === true, score: Number(result.score) || 0, reason: result.reason || null };
};

/**
 * The Path verdict from a stored private grading, through a copy of the Path
 * contract (the current tree's by default): { rejected, isCorrect, score, reason }.
 * The raw work is serialized first, as the callable receives it.
 */
export const pathVerdict = (privateGrading, raw, contracts = currentPathContracts) => {
  const result = contracts.gradePathResponse({ privateGrading, raw: JSON.parse(JSON.stringify(raw)) });
  return { rejected: result.rejected === true, isCorrect: result.isCorrect === true, score: Number(result.score) || 0, reason: result.reason || null };
};

/** The mode the shared grader resolves for a systems item, beside the one Path reads. */
export const systemsModes = (question) => ({ path: String(question.mode || 'linear'), shared: resolveSystemsWorkspaceMode(question) });

/** The mode a parity row is filed under (systems and data modeling have several). */
export const parityModeOf = (toolId, question) => {
  if (toolId === 'systemsWorkspace') return String(question.mode || 'linear');
  if (toolId === 'dataModelingLab') return String(question.mode || 'full');
  return '';
};

/**
 * Every (item, probe) graded both ways.
 * { courseId, id, draw, toolId, mode, tag, intent, path, shared }
 */
export const parityRows = (items) => items.flatMap((item) => probesFor(item.toolId, item.question).map((entry) => ({
  courseId: item.courseId,
  id: item.id,
  draw: item.draw,
  toolId: item.toolId,
  mode: parityModeOf(item.toolId, item.question),
  tag: entry.tag,
  intent: entry.intent,
  path: pathVerdict(item.stored.privateGrading, entry.raw),
  shared: sharedVerdict(item.toolId, item.question, entry.work),
})));

/**
 * How a row's two verdicts differ, or null when they agree.
 *   'path-only'      Path right, the shared grader wrong
 *   'shared-only'    the shared grader right, Path wrong
 *   'path-refuses'   Path refuses the response as malformed (no attempt
 *                    spent); the shared grader marks it
 */
export const divergenceOf = (row) => {
  if (row.path.rejected) return row.shared.graded ? 'path-refuses' : null;
  if (row.path.isCorrect === row.shared.isCorrect) return null;
  return row.path.isCorrect ? 'path-only' : 'shared-only';
};

/** A divergence's identity across draws: tool, mode, probe and direction. */
export const divergenceKey = (row) => {
  const kind = divergenceOf(row);
  return kind ? [row.toolId, row.mode, row.tag, kind].filter(Boolean).join(' · ') : null;
};
