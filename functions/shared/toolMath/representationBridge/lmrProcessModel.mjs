/*
 * PROCESS MODE FOR THE MULTIPLE REPRESENTATIONS BOARD — THE MODEL.
 *
 * Worksheet Mode (the default, unchanged) lets a student type every card.
 * Process Mode asks for more: the board's KEY FACTS — slope, intercepts,
 * points — are not typed into boxes. The student ESTABLISHES each one with a
 * mathematical process of their choosing, and a fact once established is
 * theirs to reuse everywhere. Representations open as soon as the student
 * has established enough mathematics to build them; nothing is in a fixed
 * order.
 *
 *     Discover → Prove → Verify → Reuse → Build representations
 *
 * RECOGNIZE WHEN IT IS VISIBLE, DERIVE WHEN IT IS NOT. A slope written in
 * y = 2x − 3 is READ (the student types m = 2 — not 2x — and that is the
 * process). A slope hidden in 2x − 4y = 12 is DERIVED: solve for y with Step
 * Algebra, or find both intercepts and use them. Which strategies a board
 * offers follows from its GIVEN and from what the student has established:
 *
 *   slope        read y = mx + b · read point-slope form · read the situation
 *                · solve for y, then read · rise over run on the graph · slope
 *                formula from two points (given, picked on the graph, or two
 *                the student established) · Δy/Δx from two table rows
 *   y-intercept  read y = mx + b (or the situation) · substitute x = 0 and
 *                solve · where the graph crosses · the table's x = 0 row ·
 *                extend the table · the slope and a known point in y = mx + b
 *   x-intercept  substitute y = 0 and solve (the GIVEN equation, the student's
 *                own y = mx + b, or the one their slope and y-intercept make)
 *                · where the graph crosses · the table's y = 0 row · extend
 *                the table
 *   a point      read point-slope form · pick a point on the graph · a table
 *                row · choose an x-value and compute y
 *
 * WHAT OPENS WHAT. Fact cards (slope, x-intercept, y-intercept, two points) are
 * established by a process; the other cards need enough mathematics:
 *
 *   slope-intercept form   slope and y-intercept, or y = mx + b from the
 *                          student's own algebra
 *   point-slope form       slope and a point
 *   standard form, table   the line: slope and a point, two points, or the
 *                          student's own y = mx + b
 *   Graph 1 (intercepts)   both intercepts
 *   Graph 2 (slope-int.)   slope and y-intercept
 *   Graph 3 (point-slope)  slope and a point, or two points
 *
 * This file is the model only: light (no mathjs), so the question-value
 * allocator, the schema and Pre-Flight can read it. The mathematics that marks
 * each process is lmrProcessVerify.mjs; the engine that resolves facts and
 * unlocks is ../../processFacts/processFactsEngine.mjs.
 */
import {
  defineProcessModel,
  missingTokens,
  processOptions,
  reachableTokens,
  requirementTokens,
} from '../../processFacts/processFactsEngine.mjs';
import { BOARD_CARD_IDS, resolveRequiredCards } from './linearMultipleRepresentationsCards.mjs';

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const clean = (value) => String(value ?? '').trim();

/* ---------------------------------------------------------------------------
 * The authoring contract: interactionMode and process.
 * ------------------------------------------------------------------------- */

export const INTERACTION_MODES = Object.freeze(['worksheet', 'process']);
export const DEFAULT_INTERACTION_MODE = 'worksheet';

/** The mode a board renders: exactly "process", or the unchanged worksheet. */
export const resolveInteractionMode = (question = {}) => (question?.interactionMode === 'process' ? 'process' : DEFAULT_INTERACTION_MODE);

export const isProcessModeQuestion = (question = {}) => (
  question?.mode === 'linearMultipleRepresentations' && resolveInteractionMode(question) === 'process'
);

/* ---------------------------------------------------------------------------
 * What a question offers, read lightly from its GIVEN.
 * ------------------------------------------------------------------------- */

// An authored table cell, read without mathjs: a number, "3", "-1/2", "−4".
const authoredRational = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const textValue = clean(value).replace(/−/g, '-');
  if (!textValue) return null;
  const fraction = /^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/.exec(textValue);
  if (fraction) {
    const denominator = Number(fraction[2]);
    return denominator ? Number(fraction[1]) / denominator : null;
  }
  const number = Number(textValue);
  return Number.isFinite(number) ? number : null;
};

const tableRows = (question = {}) => list(question?.source?.rows).map((row) => ({
  x: authoredRational(Array.isArray(row) ? row[0] : row?.x),
  y: authoredRational(Array.isArray(row) ? row[1] : row?.y),
}));

/**
 * The facts about a question the model's sources depend on. Pure data, so
 * the light paths (values, schema, Pre-Flight) and the board agree.
 */
export const lmrProcessContext = (question = {}) => {
  const given = clean(question?.source?.kind);
  const rows = given === 'table' ? tableRows(question) : [];
  return {
    given,
    tableZeroX: rows.some((row) => row.x !== null && Math.abs(row.x) < 1e-12),
    tableZeroY: rows.some((row) => row.y !== null && Math.abs(row.y) < 1e-12),
  };
};

/* ---------------------------------------------------------------------------
 * The model.
 * ------------------------------------------------------------------------- */

const givenIs = (...kinds) => (context) => kinds.includes(context?.given);
// The GIVENs a student can solve for y (and then work from their own
// y = mx + b). Every source that reads that equation applies only there.
const SOLVES_FOR_Y = givenIs('standardForm', 'pointSlope');
const POINT_YIELDS = Object.freeze(['point', 'anyPoint', 'twoPoints']);

// The facts that are points on the line, for "a point" and "two points".
const POINT_FACTS = Object.freeze(['yIntercept', 'xIntercept', 'point']);

const tokensOf = (facts = {}) => {
  const tokens = new Set();
  ['slope', 'yIntercept', 'xIntercept', 'siEquation'].forEach((fact) => { if (facts[fact]) tokens.add(fact); });
  const points = list(facts.point);
  if (points.length) tokens.add('point');
  const keys = new Set(POINT_FACTS.flatMap((fact) => {
    const value = facts[fact];
    return (Array.isArray(value) ? value : value ? [value] : []).map((record) => record?.pointKey).filter(Boolean);
  }));
  if (keys.size >= 1) tokens.add('anyPoint');
  if (keys.size >= 2) tokens.add('twoPoints');
  return tokens;
};

// Reachability closure: every point-bearing fact is a point; two different
// point facts (or a repeatable point strategy, which yields twoPoints itself)
// make two points. Intercepts that coincide (a line through the origin) still
// reach two points through any repeatable point strategy, which every GIVEN
// offers.
const deriveTokens = (tokens) => {
  const next = new Set(tokens);
  const pointFacts = POINT_FACTS.filter((fact) => next.has(fact));
  if (pointFacts.length) next.add('anyPoint');
  if (pointFacts.length >= 2) next.add('twoPoints');
  return next;
};

export const LMR_PROCESS_MODEL = defineProcessModel({
  id: 'linear.multipleRepresentations',
  version: 1,
  facts: {
    slope: { label: 'Slope', contextLabel: 'Rate of change' },
    yIntercept: { label: 'y-intercept', contextLabel: 'Initial value' },
    xIntercept: { label: 'x-intercept' },
    point: { label: 'A point on the line', multiple: true },
    siEquation: { label: 'y = mx + b from your algebra' },
  },
  tokens: ['anyPoint', 'twoPoints'],
  tokensOf,
  deriveTokens,
  strategies: {
    readSlopeIntercept: {
      label: 'Read m and b',
      method: 'Read m and b from slope-intercept form',
      kind: 'recognize',
      produces: ['slope', 'yIntercept'],
      sources: [
        { id: 'given', when: givenIs('slopeIntercept'), label: 'Read it from the equation', method: 'GIVEN slope-intercept form → read m and b' },
        // Reading the equation the student solved for y finishes that
        // pathway, so an author who allows "solveForY" allows this too.
        { id: 'siEquation', needs: 'siEquation', when: SOLVES_FOR_Y, partOf: ['solveForY'], label: 'Read it from your equation', method: 'Their own y = mx + b → read m and b' },
      ],
    },
    readPointSlope: {
      label: 'Read it from the equation',
      method: 'GIVEN point-slope form → read m and the point',
      kind: 'recognize',
      produces: ['slope', 'point'],
      sources: [{ id: 'given', when: givenIs('pointSlope'), yields: ['slope', 'point', 'anyPoint'] }],
    },
    readScenario: {
      label: 'Read the situation',
      method: 'Situation → read the rate of change and initial value',
      kind: 'recognize',
      produces: ['slope', 'yIntercept'],
      sources: [{ id: 'given', when: givenIs('scenario') }],
    },
    solveForY: {
      label: 'Solve for y',
      method: 'GIVEN equation → solved for y with Step Algebra',
      kind: 'derive',
      produces: ['siEquation'],
      sources: [{
        id: 'given',
        when: SOLVES_FOR_Y,
        // The first step toward the slope and y-intercept: once the equation
        // reads y = mx + b, the student reads them from their own work.
        leadsTo: ['slope', 'yIntercept'],
      }],
    },
    substituteZero: {
      label: 'Substitute 0 and solve',
      method: 'Substituted 0 and solved with Step Algebra',
      kind: 'derive',
      produces: ['xIntercept', 'yIntercept'],
      sources: [
        {
          id: 'given',
          when: givenIs('standardForm', 'pointSlope', 'slopeIntercept'),
          // y = mx + b SHOWS its y-intercept: reading it is the process.
          targets: (context) => (context?.given === 'slopeIntercept' ? ['xIntercept'] : ['xIntercept', 'yIntercept']),
          method: 'GIVEN equation → substituted 0 and solved',
        },
        { id: 'siEquation', needs: 'siEquation', when: SOLVES_FOR_Y, targets: ['xIntercept'], label: 'Use your equation', method: 'Their own y = mx + b → substituted y = 0 and solved' },
        {
          id: 'facts',
          needs: { all: ['slope', 'yIntercept'] },
          when: (context) => context?.given !== 'slopeIntercept',
          targets: ['xIntercept'],
          label: 'Use your slope and y-intercept',
          method: 'Their slope and y-intercept → substituted y = 0 and solved',
        },
      ],
    },
    graphCrossing: {
      label: 'Find it on the graph',
      method: 'Graph → located where the line crosses the axis',
      kind: 'recognize',
      produces: ['xIntercept', 'yIntercept'],
      sources: [{ id: 'given', when: givenIs('graph') }],
    },
    graphPoint: {
      label: 'Pick a point on the graph',
      method: 'Graph → read a point on the line',
      kind: 'recognize',
      produces: ['point'],
      sources: [{ id: 'given', when: givenIs('graph'), yields: POINT_YIELDS }],
    },
    riseRun: {
      label: 'Rise over run',
      method: 'Graph → rise/run between two points',
      kind: 'derive',
      produces: ['slope'],
      sources: [{ id: 'given', when: givenIs('graph') }],
    },
    twoPointFormula: {
      label: 'Slope formula',
      method: 'Two points → (y₂ − y₁)/(x₂ − x₁)',
      kind: 'derive',
      produces: ['slope'],
      sources: [
        { id: 'given', when: givenIs('twoPoints', 'graph'), method: 'GIVEN points → (y₂ − y₁)/(x₂ − x₁)' },
        {
          id: 'points',
          needs: 'twoPoints',
          when: (context) => context?.given !== 'twoPoints',
          label: 'Use two of your points',
          method: 'Two points they established → (y₂ − y₁)/(x₂ − x₁)',
        },
      ],
    },
    tableDelta: {
      label: 'Change in y over change in x',
      method: 'Table → Δy/Δx between two rows',
      kind: 'derive',
      produces: ['slope'],
      sources: [{ id: 'given', when: givenIs('table') }],
    },
    tableRead: {
      label: 'Read it from the table',
      method: 'Table → read the intercept from its row',
      kind: 'recognize',
      produces: ['yIntercept', 'xIntercept'],
      sources: [{
        id: 'given',
        when: (context) => context?.given === 'table' && (context.tableZeroX || context.tableZeroY),
        targets: (context) => [...(context?.tableZeroX ? ['yIntercept'] : []), ...(context?.tableZeroY ? ['xIntercept'] : [])],
      }],
    },
    tableRow: {
      label: 'Use a row of the table',
      method: 'Table → a row as a point',
      kind: 'recognize',
      produces: ['point'],
      sources: [{ id: 'given', when: givenIs('table'), yields: POINT_YIELDS }],
    },
    extendTable: {
      label: 'Extend the table',
      method: 'Table → extended the pattern',
      kind: 'derive',
      produces: ['yIntercept', 'xIntercept'],
      sources: [{
        id: 'given',
        when: givenIs('table'),
        targets: (context) => [...(!context?.tableZeroX ? ['yIntercept'] : []), ...(!context?.tableZeroY ? ['xIntercept'] : [])],
      }],
    },
    solveForB: {
      label: 'Use the slope and a point',
      method: 'Slope and a point → substituted into y = mx + b',
      kind: 'derive',
      produces: ['yIntercept'],
      sources: [{
        id: 'facts',
        needs: { all: ['slope', 'anyPoint'] },
        // Where y = mx + b or the situation SHOWS b, this would be algebra
        // for its own sake.
        when: (context) => !['slopeIntercept', 'scenario'].includes(context?.given),
      }],
    },
    evaluateAtX: {
      label: 'Choose an x-value',
      method: 'Chose an x-value and computed y',
      kind: 'derive',
      produces: ['point'],
      sources: [
        { id: 'given', when: givenIs('standardForm', 'slopeIntercept', 'pointSlope'), yields: POINT_YIELDS, method: 'GIVEN equation → chose x, computed y' },
        { id: 'siEquation', needs: 'siEquation', when: SOLVES_FOR_Y, yields: POINT_YIELDS, label: 'Use your equation', method: 'Their own y = mx + b → chose x, computed y' },
        {
          id: 'facts',
          needs: { all: ['slope', 'yIntercept'] },
          when: (context) => context?.given !== 'slopeIntercept',
          yields: POINT_YIELDS,
          label: 'Use your slope and y-intercept',
          method: 'Their slope and y-intercept → chose x, computed y',
        },
      ],
    },
  },
  representations: {
    standardForm: { label: 'Standard form', unlock: { any: [{ all: ['slope', 'anyPoint'] }, 'twoPoints', 'siEquation'] } },
    slopeIntercept: { label: 'Slope-intercept form', unlock: { any: [{ all: ['slope', 'yIntercept'] }, 'siEquation'] } },
    pointSlope: { label: 'Point-slope form', unlock: { all: ['slope', 'anyPoint'] } },
    slope: { label: 'Slope', unlock: 'slope' },
    xIntercept: { label: 'x-intercept', unlock: 'xIntercept' },
    yIntercept: { label: 'y-intercept', unlock: 'yIntercept' },
    twoPoints: { label: 'Two points on the line', unlock: 'twoPoints' },
    table: { label: 'Table of values', unlock: { any: [{ all: ['slope', 'anyPoint'] }, 'twoPoints', 'siEquation'] } },
    graphIntercepts: { label: 'Graph 1 (intercepts)', unlock: { all: ['xIntercept', 'yIntercept'] } },
    graphSlopeIntercept: { label: 'Graph 2 (slope-intercept)', unlock: { all: ['slope', 'yIntercept'] } },
    graphPointSlope: { label: 'Graph 3 (point-slope)', unlock: { any: [{ all: ['slope', 'anyPoint'] }, 'twoPoints'] } },
  },
});

/** The board cards that ARE facts: established by a process, never typed. */
export const PROCESS_FACT_CARDS = Object.freeze({
  slope: 'slope',
  xIntercept: 'xIntercept',
  yIntercept: 'yIntercept',
  twoPoints: 'twoPoints',
});

/** The facts a student can choose to find from the board ("Find …"). */
export const FINDABLE_FACTS = Object.freeze(['slope', 'yIntercept', 'xIntercept', 'point']);

/** Classroom names for requirement tokens: "Needs the slope and a point". */
export const TOKEN_PHRASES = Object.freeze({
  slope: 'the slope',
  yIntercept: 'the y-intercept',
  xIntercept: 'the x-intercept',
  anyPoint: 'a point on the line',
  twoPoints: 'two points on the line',
  point: 'a point on the line',
  siEquation: 'y = mx + b from your algebra',
});

export const SCENARIO_TOKEN_PHRASES = Object.freeze({
  ...TOKEN_PHRASES,
  slope: 'the rate of change',
  yIntercept: 'the initial value',
});

/* ---------------------------------------------------------------------------
 * Questions: which strategies, which facts, which work.
 * ------------------------------------------------------------------------- */

/** The author's per-fact restriction ({ slope: ['riseRun'] }), or null. */
export const processStrategyRestriction = (question = {}) => {
  const strategies = question?.process?.strategies;
  return isObject(strategies) ? strategies : null;
};

/** The facts a GIVEN establishes before the student does anything. */
export const lmrBaseTokens = (question = {}) => (clean(question?.source?.kind) === 'twoPoints' ? ['point', 'anyPoint', 'twoPoints'] : []);

/**
 * Every (strategy, source) this question offers — for one target, within the
 * author's restriction, and (with `tokens`) only those whose needs are met.
 * A source that `leadsTo` the target (solve for y, on the way to the slope)
 * is offered for it until the fact it produces is established.
 */
export const lmrProcessOptions = (question = {}, { target = null, tokens = null } = {}) => {
  const context = lmrProcessContext(question);
  const allowed = processStrategyRestriction(question);
  const direct = processOptions(LMR_PROCESS_MODEL, context, { target, tokens, allowed });
  if (!target) return direct;
  const bridging = processOptions(LMR_PROCESS_MODEL, context, { tokens, allowed: null })
    .filter((option) => {
      const source = LMR_PROCESS_MODEL.strategies[option.strategy]?.sources.find((entry) => entry.id === option.source);
      if (!list(source?.leadsTo).includes(target)) return false;
      // Within the author's restriction for the target: the bridging strategy
      // itself, or the strategy that finishes its pathway, must be allowed.
      if (allowed && Array.isArray(allowed[target])) {
        const finishers = Object.entries(LMR_PROCESS_MODEL.strategies)
          .filter(([, strategy]) => strategy.produces.includes(target)
            && strategy.sources.some((entry) => list(entry.partOf).includes(option.strategy)))
          .map(([id]) => id);
        if (!allowed[target].includes(option.strategy) && !finishers.some((id) => allowed[target].includes(id))) return false;
      }
      return !(tokens instanceof Set && option.produces.every((fact) => tokens.has(fact)));
    })
    .map((option) => ({ ...option, bridgeTo: target }));
  return [...direct, ...bridging];
};

/** Everything this question's GIVEN and strategies could ever establish. */
export const lmrAchievableTokens = (question = {}, tokens = []) => {
  const options = processOptions(LMR_PROCESS_MODEL, lmrProcessContext(question), { allowed: processStrategyRestriction(question) });
  return reachableTokens(LMR_PROCESS_MODEL, options, [...lmrBaseTokens(question), ...tokens]);
};

/**
 * What a card still needs, as classroom phrases: [] when it is open, null when
 * nothing on this board can ever open it.
 */
export const lmrCardNeeds = (question = {}, cardId, tokens = new Set()) => {
  const representation = LMR_PROCESS_MODEL.representations[cardId];
  if (!representation) return [];
  const held = tokens instanceof Set ? tokens : new Set(list(tokens));
  return missingTokens(representation.unlock, held, { achievable: lmrAchievableTokens(question, [...held]) });
};

/**
 * The facts the board shows in "What I Know": the ones a required card needs
 * (directly, or to open it), in board order.
 */
export const lmrRelevantFacts = (question = {}) => {
  const required = resolveRequiredCards(question);
  const tokens = new Set();
  required.forEach((cardId) => requirementTokens(LMR_PROCESS_MODEL.representations[cardId]?.unlock, tokens));
  const facts = [];
  if (tokens.has('slope') || tokens.has('siEquation')) facts.push('slope');
  if (tokens.has('yIntercept') || tokens.has('siEquation') || tokens.has('slope')) facts.push('yIntercept');
  if (tokens.has('xIntercept')) facts.push('xIntercept');
  if (tokens.has('anyPoint') || tokens.has('twoPoints') || tokens.has('point')) facts.push('point');
  return facts;
};

/**
 * How a fact card is earned on this board, for the question's value:
 * 'recognize' when the GIVEN shows it (a reading is the process), 'derive'
 * when it must be worked out. Structure only — the GIVEN's kind and, for a
 * table, whether a row already sits on an axis — never the numbers, so every
 * version of a Question Family slot has the same value.
 */
export const lmrFactWorkKind = (question = {}, fact) => {
  const context = lmrProcessContext(question);
  const allowed = processStrategyRestriction(question);
  const options = processOptions(LMR_PROCESS_MODEL, context, { target: fact, allowed });
  if (!options.length && fact !== 'point') return null;
  return options.some((option) => option.kind === 'recognize' && !option.needs) ? 'recognize' : 'derive';
};

/* ---------------------------------------------------------------------------
 * The authoring contract, checked: teacher-facing problems, [] when valid.
 * ------------------------------------------------------------------------- */

const STRATEGY_IDS = Object.keys(LMR_PROCESS_MODEL.strategies);
const GIVEN_NAMES = Object.freeze({
  standardForm: 'a standard form equation',
  slopeIntercept: 'a slope-intercept equation',
  pointSlope: 'a point-slope equation',
  twoPoints: 'two points',
  table: 'a table',
  graph: 'a graph',
  scenario: 'a situation',
});
const CARD_NAMES = Object.freeze(Object.fromEntries(Object.entries(LMR_PROCESS_MODEL.representations).map(([id, entry]) => [id, entry.label])));

const strategyGivens = (strategyId) => {
  const kinds = Object.keys(GIVEN_NAMES).filter((kind) => processOptions(LMR_PROCESS_MODEL, { given: kind, tableZeroX: true, tableZeroY: true })
    .some((option) => option.strategy === strategyId));
  return kinds.map((kind) => GIVEN_NAMES[kind]);
};

/**
 * The interactionMode / process block of one board, judged against its GIVEN
 * and required cards. Every message says what to change.
 */
export const lmrProcessConfigProblems = (question = {}) => {
  const problems = [];
  const prefix = 'Multiple Representations';
  const mode = question?.interactionMode;
  if (mode !== undefined && mode !== null && !INTERACTION_MODES.includes(mode)) {
    problems.push(`${prefix}: interactionMode must be "worksheet" (students fill in the board directly) or "process" (students establish key facts with a process first), not ${JSON.stringify(mode)}.`);
    return problems;
  }
  const processBlock = question?.process;
  if (processBlock !== undefined && processBlock !== null) {
    if (resolveInteractionMode(question) !== 'process') {
      problems.push(`${prefix}: this board has Process Mode settings ("process") but interactionMode is not "process". Set interactionMode to "process", or remove the process settings.`);
      return problems;
    }
    if (!isObject(processBlock)) {
      problems.push(`${prefix}: "process" must be an object, such as { "strategies": { "slope": ["riseRun"] } }.`);
      return problems;
    }
    const unknownKeys = Object.keys(processBlock).filter((key) => key !== 'strategies');
    if (unknownKeys.length) problems.push(`${prefix}: "process" has unknown setting(s) ${unknownKeys.map((key) => `"${key}"`).join(', ')}. The only setting is "strategies".`);
    const strategies = processBlock.strategies;
    if (strategies !== undefined) {
      if (!isObject(strategies)) {
        problems.push(`${prefix}: process.strategies must map a fact (slope, yIntercept, xIntercept, point) to a list of methods.`);
        return problems;
      }
      const context = lmrProcessContext(question);
      Object.entries(strategies).forEach(([fact, ids]) => {
        if (!FINDABLE_FACTS.includes(fact)) {
          problems.push(`${prefix}: process.strategies names "${fact}", which is not a fact a student finds. Use slope, yIntercept, xIntercept or point.`);
          return;
        }
        if (!Array.isArray(ids) || !ids.length) {
          problems.push(`${prefix}: process.strategies.${fact} must be a non-empty list of methods.`);
          return;
        }
        ids.forEach((id) => {
          const strategy = LMR_PROCESS_MODEL.strategies[id];
          if (!strategy) {
            problems.push(`${prefix}: process.strategies.${fact} names "${id}", which is not a Process Mode method. Use: ${STRATEGY_IDS.join(', ')}.`);
            return;
          }
          const reaches = strategy.produces.includes(fact) || strategy.sources.some((source) => list(source.leadsTo).includes(fact));
          if (!reaches) {
            problems.push(`${prefix}: process.strategies.${fact} names "${id}" (${strategy.label.toLowerCase()}), which cannot establish the ${LMR_PROCESS_MODEL.facts[fact].label.toLowerCase()}.`);
            return;
          }
          const offered = processOptions(LMR_PROCESS_MODEL, context).some((option) => option.strategy === id);
          if (!offered) {
            const where = strategyGivens(id);
            problems.push(`${prefix}: process.strategies.${fact} names "${id}" (${strategy.label.toLowerCase()}), which works from ${where.join(' or ') || 'a different GIVEN'} — this board's GIVEN is ${GIVEN_NAMES[context.given] || 'not one it can use'}.`);
          }
        });
      });
    }
  }
  if (resolveInteractionMode(question) !== 'process' || problems.length) return problems;

  // Every card the board asks for must be reachable by SOME pathway on this
  // GIVEN, within the author's restriction. When one is not, the message
  // names the FACT at the root of it (the slope, not the six cards that need
  // the slope) and whether the methods allowed for it go round in a circle.
  const achievable = lmrAchievableTokens(question);
  const base = new Set(lmrBaseTokens(question));
  const blocked = resolveRequiredCards(question)
    .filter((cardId) => LMR_PROCESS_MODEL.representations[cardId]
      && missingTokens(LMR_PROCESS_MODEL.representations[cardId].unlock, base, { achievable }) === null);
  if (!blocked.length) return [...new Set(problems)];
  const context = lmrProcessContext(question);
  const restriction = processStrategyRestriction(question);
  const options = processOptions(LMR_PROCESS_MODEL, context, { allowed: restriction });
  const factOf = (token) => (token === 'anyPoint' || token === 'twoPoints' ? 'point' : token);
  const roots = [...new Set(blocked.flatMap((cardId) => [...requirementTokens(LMR_PROCESS_MODEL.representations[cardId].unlock)]))]
    .filter((token) => !achievable.has(token))
    .map(factOf)
    .filter((fact, index, all) => FINDABLE_FACTS.includes(fact) && all.indexOf(fact) === index && !achievable.has(fact === 'point' ? 'anyPoint' : fact));
  const phrase = (fact) => (context.given === 'scenario' ? SCENARIO_TOKEN_PHRASES : TOKEN_PHRASES)[fact] || fact;
  const neededBy = (fact) => blocked.filter((cardId) => [...requirementTokens(LMR_PROCESS_MODEL.representations[cardId].unlock)]
    .some((token) => factOf(token) === fact)).map((cardId) => CARD_NAMES[cardId] || cardId);
  const needsOf = (fact) => [...new Set(options.filter((option) => option.yields.includes(fact))
    .flatMap((option) => [...requirementTokens(option.needs)].map(factOf)))];
  // A fact blocked only because it needs another blocked fact is not a root:
  // its cards are reported with that fact's message.
  const consequenceOf = (fact) => roots.find((other) => other !== fact && needsOf(fact).includes(other) && !needsOf(other).includes(fact)) || null;
  const extraCards = {};
  roots.filter(consequenceOf).forEach((fact) => {
    const root = consequenceOf(fact);
    extraCards[root] = [...(extraCards[root] || []), ...neededBy(fact)];
  });
  roots.filter((fact) => !consequenceOf(fact)).forEach((fact) => {
    const producers = options.filter((option) => option.yields.includes(fact));
    const cards = [...new Set([...neededBy(fact), ...(extraCards[fact] || [])])];
    if (producers.length) {
      const needs = [...new Set(producers.flatMap((option) => [...requirementTokens(option.needs)]))].map(phrase);
      problems.push(`${prefix}: in Process Mode ${phrase(fact)} can never be established on this board: every method allowed for it (${[...new Set(producers.map((option) => option.label.toLowerCase()))].join(', ')}) first needs ${needs.join(' and ')}, which cannot be established without it. Allow another method in process.strategies. It is needed for: ${cards.join(', ')}.`);
    } else {
      problems.push(`${prefix}: in Process Mode nothing on a board whose GIVEN is ${GIVEN_NAMES[context.given] || 'this one'} can establish ${phrase(fact)}${restriction ? ' with the methods allowed in process.strategies' : ''}. It is needed for: ${cards.join(', ')}. Allow a method that can, or remove ${cards.length === 1 ? 'that card' : 'those cards'} from requiredCards.`);
    }
  });
  if (!roots.length) {
    problems.push(`${prefix}: in Process Mode nothing on this board can open ${blocked.map((cardId) => CARD_NAMES[cardId] || cardId).join(', ')}. Remove ${blocked.length === 1 ? 'it' : 'them'} from requiredCards, or allow more methods in process.strategies.`);
  }
  return [...new Set(problems)];
};

/** Every board card the model knows how to open (a model-coverage check). */
export const PROCESS_MODEL_COVERS_BOARD = BOARD_CARD_IDS.every((cardId) => Boolean(LMR_PROCESS_MODEL.representations[cardId]));
