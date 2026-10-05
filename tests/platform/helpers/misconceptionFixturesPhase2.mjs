/*
 * PHASE 2 MISCONCEPTION FIXTURES — the table workbench, the composition lab,
 * relation mapping, constructed graphs, data modeling, student-build
 * inequalities and the linear representations board.
 *
 * Same contract as misconceptionFixtures.mjs (which appends these to the one
 * fixture list the behaviour and mutation suites share): every question is a
 * real authored tool question or a real platform family instance, every
 * response is produced by the REAL shared grader's own response builder
 * (gradeToolWork), and `expected` is the codes the classifier must record —
 * `[]` where the honest answer is "no code".
 */
import { getPlatformQuestionFamily } from '../../../functions/shared/questionFamilyRegistry.mjs';
import { resolveFamilyConstraints } from '../../../functions/shared/questionFamilyContract.mjs';
import { gradeToolWork } from '../../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { correlation } from '../../../functions/shared/toolMath/shared/toolMath.mjs';

const toolCase = (name, toolId, question, work, expected) => {
  const { toolResponse } = gradeToolWork({ toolId, question, work });
  return { name, question, response: toolResponse, familyValues: null, expected };
};

/**
 * A built family instance for chosen parameters and constraints, with authored
 * slot fields (requiredCards, context) beside it, exactly as the engine builds
 * one; graded through the real tool grader.
 */
export const familyToolInstance = (familyId, params, { constraints = {}, authored = {} } = {}) => {
  const family = getPlatformQuestionFamily(familyId, 1);
  if (!family) throw new Error(`unknown family ${familyId}`);
  const constraintValues = resolveFamilyConstraints(family, constraints).values;
  const values = Object.freeze({ ...params, ...family.derive(params, constraintValues) });
  const tool = family.defaultTool;
  const built = family.tools[tool](values, { constraints: constraintValues, authored, answer: family.answer(values, constraintValues) });
  const question = {
    questionId: `${familyId}-fixture`,
    activityRole: 'classwork',
    ...authored,
    ...built,
    familyId: family.id,
    familyVersion: family.version,
    familyInstance: Object.freeze({ familyId: family.id, familyVersion: family.version, fingerprint: `fixture:${JSON.stringify(params)}` }),
  };
  return { question, values, toolId: tool };
};

const familyToolCase = (name, familyId, params, options, work, expected) => {
  const { question, values, toolId } = familyToolInstance(familyId, params, options);
  const { toolResponse } = gradeToolWork({ toolId, question, work: typeof work === 'function' ? work(values) : work });
  return { name, question, response: toolResponse, familyValues: values, expected };
};

// --- Linear table workbench: y = 3x + 2 on x = 1..4 --------------------------------------
const TABLE_ROWS = [[1, 5], [2, 8], [3, 11], [4, 14]];
const RATE_TABLE = { type: 'linearTableWorkbench', mode: 'constantRate', rows: TABLE_ROWS, requiredComparisons: 2, prompt: 'Is the rate constant?' };
const DERIVE_TABLE = { type: 'linearTableWorkbench', mode: 'deriveEquation', rows: TABLE_ROWS, requiredComparisons: 2, prompt: 'Write the equation.' };
// The same line read on both sides of x = 0: −1 is an EARLIER reading (x = −1), not a later one.
const DERIVE_TWO = { ...DERIVE_TABLE, rows: [[1, 5], [2, 7], [3, 9], [4, 11]] };
const DERIVE_ACROSS_ZERO = { ...DERIVE_TABLE, rows: [[-2, -4], [-1, -1], [1, 5], [2, 8]] };
const goodIntervals = [{ i: 0, j: 1, dx: '1', dy: '3', rate: '3' }, { i: 1, j: 3, dx: '2', dy: '6', rate: '3' }];
const derive = (m, b, equation) => ({ intervals: goodIntervals, classification: 'linear', m, b, equation });

// --- Composition: f(x) = 2x + 3, g(x) = −x + 4, x = 1 → f(g(1)) = 9, g(f(1)) = −1 ---------
const COMPOSITION = { type: 'inverseCompositionLab', mode: 'composition', f: { type: 'linear', a: 2, h: 0, k: 3 }, g: { type: 'linear', a: -1, h: 0, k: 4 }, x: 1, prompt: 'Evaluate both compositions.' };
// g(x) = x + 1 and f(x) = x + 2 commute: f(g(x)) = g(f(x)), so a swap is invisible.
const COMMUTING = { ...COMPOSITION, f: { type: 'linear', a: 1, h: 0, k: 2 }, g: { type: 'linear', a: 1, h: 0, k: 1 } };
// At x = 2, f(g(2)) = f(2) = 7 = f(2): the exchanged value is also "f(x) alone".
const COMPOSITION_AT_2 = { ...COMPOSITION, x: 2 };
// f(x) = x + 0.03, g(x) = 2x at x = 2: f(g(2)) = 4.03, g(f(2)) = 4.06 — closer than twice the 0.02 tolerance.
const CLOSE_COMPOSITIONS = { ...COMPOSITION, f: { type: 'linear', a: 1, h: 0, k: 0.03 }, g: { type: 'linear', a: 2, h: 0, k: 0 }, x: 2 };

// --- Relation mapping: {(1,4), (2,5), (3,6)}; and one whose domain IS its range ---------
const RELATION = { type: 'relationMapping', pairs: [[1, 4], [2, 5], [3, 6]], ask: ['domain', 'range'], prompt: 'Give the domain and range.' };
const SELF_RELATION = { ...RELATION, pairs: [[1, 2], [2, 3], [3, 1]] };

// --- Graphing2: y = 2x + 1; y = x + 1; point-slope through (1, 2) with slope 3 -----------
const GRAPH = { type: 'graphing2', mode: 'slopeIntercept', line: { m: 2, b: 1 }, prompt: 'Graph y = 2x + 1.' };
const GRAPH_ONE = { type: 'graphing2', mode: 'slopeIntercept', line: { m: 1, b: 1 }, prompt: 'Graph y = x + 1.' };
const GRAPH_POINT_SLOPE = { type: 'graphing2', mode: 'pointSlope', point: [1, 2], slope: 3, prompt: 'Graph y − 2 = 3(x − 1).' };

// --- Data modeling: a strong positive association; and one with almost none --------------
const POSITIVE_POINTS = [[1, 2], [2, 3], [3, 5], [4, 5], [5, 7], [6, 8], [7, 10]];
// r ≈ 0.19: positive by the grader's key, but below the weak-association line.
const FLAT_POINTS = [[1, 4], [2, 1], [3, 6], [4, 2], [5, 6], [6, 2], [7, 5]];
const ASSOCIATION = { type: 'dataModelingLab', mode: 'association', points: POSITIVE_POINTS, prompt: 'Describe the association.' };
const CORRELATION = { type: 'dataModelingLab', mode: 'correlation', points: POSITIVE_POINTS, prompt: 'Compute r.' };
const FULL_MODEL = { type: 'dataModelingLab', mode: 'full', points: POSITIVE_POINTS, prompt: 'Model the data.' };
const FLAT = { ...ASSOCIATION, points: FLAT_POINTS };
const POSITIVE_R = correlation(POSITIVE_POINTS);
const own = (work) => ({ ...work, choicesOpenUnanswered: true });
const EXPERIMENT = { ...ASSOCIATION, causationSupported: true };

// --- Student-build inequality: y ≥ x + 1 (solid, shade above) -----------------------------
const BUILD = { type: 'systemsWorkspace', mode: 'inequalities', studentBuild: true, inequalities: [{ m: 1, b: 1, relation: '>=' }], askClassification: false, askVertices: false, prompt: 'Graph y ≥ x + 1.' };
const MODELING_BUILD = { ...BUILD, modeling: { expectedConstraints: [{ m: 1, b: 1, relation: '>=' }] } };
const row = (overrides) => ({
  method: 'points', x1: 0, y1: 1, x2: 2, y2: 3, point1Plotted: true, point2Plotted: true, boundaryAttempts: 1,
  style: 'solid', styleAttempts: 1, shadePoint: [0, 4], shadeAttempts: 1, visible: true, ...overrides,
});

// --- Linear representations board: a reading story --------------------------------------
// "Drains 6 liters every 2 minutes; after 4 minutes it holds 30 liters": rate 6, per 2,
// blocks 7, reading 2 → slope −3, start 42, empty at 14, reading (4, 30).
const READING = { given: 'scenario', scenarioStart: 'fromReading', rateRange: [2, 9], denominatorRange: [2, 3], startRange: [6, 60], durationRange: [3, 30] };
const READING_PARAMS = { rate: 6, per: 2, blocks: 7, reading: 2 };
// blocks − reading = 1: the later reading equals the stated rate (6 every 2, 6 left).
const READING_COLLIDING = { rate: 6, per: 2, blocks: 4, reading: 3 };
// 2 lost every 3 minutes, 18 left at minute 12: Δx/Δy (−3/2) is also the line through the origin and the reading.
const READING_THROUGH_ORIGIN = { rate: 2, per: 3, blocks: 13, reading: 4 };
const READING_WIDE = { ...READING, durationRange: [3, 45] };
// 1 liter a minute for 6 minutes: slope −1, so Δx/Δy IS the slope and 1 is both −m and −Δx/Δy.
const STATED_ONE = { rate: 1, duration: 6 };
// A stated story with context: 4 liters a minute for 6 minutes (slope −4, start 24).
const STATED = { given: 'scenario' };
const STATED_PARAMS = { rate: 4, duration: 6 };
const CONTEXT = { independentQuantity: 'Time (minutes)', dependentQuantity: 'Water in the tank (liters)' };
const CARDS = ['slope', 'xIntercept', 'yIntercept'];
const board = (overrides) => ({ featureSlope: '', featureXIntercept: '', featureYIntercept: '', ...overrides });

export const MISCONCEPTION_FIXTURES_PHASE2 = Object.freeze([
  // --- linearTableWorkbench --------------------------------------------------------------
  toolCase('table: correct', 'linearTableWorkbench', RATE_TABLE, { intervals: goodIntervals, classification: 'linear' }, []),
  toolCase('table: rate inverted (Δx/Δy) on every interval', 'linearTableWorkbench', RATE_TABLE, { intervals: [{ i: 0, j: 1, dx: '1', dy: '3', rate: '1/3' }, { i: 1, j: 3, dx: '2', dy: '6', rate: '1/3' }], classification: 'linear' }, ['slope-run-over-rise']),
  toolCase('table: rate inverted, rows taken in click order', 'linearTableWorkbench', RATE_TABLE, { intervals: [{ i: 1, j: 0, dx: '-1', dy: '-3', rate: '1/3' }, { i: 1, j: 3, dx: '2', dy: '6', rate: '3' }], classification: 'linear' }, ['slope-run-over-rise']),
  toolCase('table: Δx and Δy typed into each other is not named', 'linearTableWorkbench', RATE_TABLE, { intervals: [{ i: 0, j: 1, dx: '3', dy: '1', rate: '1/3' }, { i: 1, j: 3, dx: '6', dy: '2', rate: '1/3' }], classification: 'linear' }, []),
  toolCase('table: an inverted rate beside a different wrong rate is not named', 'linearTableWorkbench', RATE_TABLE, { intervals: [{ i: 0, j: 1, dx: '1', dy: '3', rate: '1/3' }, { i: 1, j: 3, dx: '2', dy: '6', rate: '4' }], classification: 'linear' }, []),
  toolCase('table: an unmodeled wrong rate is not named', 'linearTableWorkbench', RATE_TABLE, { intervals: [{ i: 0, j: 1, dx: '1', dy: '3', rate: '2' }, { i: 1, j: 3, dx: '2', dy: '6', rate: '3' }], classification: 'linear' }, []),
  toolCase('table derive: correct', 'linearTableWorkbench', DERIVE_TABLE, derive('3', '2', 'y = 3x + 2'), []),
  toolCase('table derive: slope as Δx/Δy', 'linearTableWorkbench', DERIVE_TABLE, derive('1/3', '2', 'y = 1/3x + 2'), ['slope-run-over-rise']),
  toolCase('table derive: the reading at x = 1 used as the starting value', 'linearTableWorkbench', DERIVE_TABLE, derive('3', '5', 'y = 3x + 5'), ['initial-value-from-later-reading']),
  toolCase('table derive: the reading at x = 3 used as the starting value', 'linearTableWorkbench', DERIVE_TABLE, derive('3', '11', ''), ['initial-value-from-later-reading']),
  // 14 is the reading at x = 4, and ALSO 8 + 3·2, the sign error working back from x = 2.
  toolCase('table derive: a reading that is also the sign error working back is not named', 'linearTableWorkbench', DERIVE_TABLE, derive('3', '14', 'y = 3x + 14'), []),
  // y = 2x + 3: 5 is the reading at x = 1, and ALSO 7 − 2, "subtracted x instead of m·x" from x = 2.
  toolCase('table derive: a reading that is also "subtracted x" is not named', 'linearTableWorkbench', DERIVE_TWO, { intervals: [{ i: 0, j: 1, dx: '1', dy: '2', rate: '2' }, { i: 1, j: 3, dx: '2', dy: '4', rate: '2' }], classification: 'linear', m: '2', b: '5', equation: 'y = 2x + 5' }, []),
  toolCase('table derive: a starting value that is no reading is not named', 'linearTableWorkbench', DERIVE_TABLE, derive('3', '6', 'y = 3x + 6'), []),
  toolCase('table derive: a reading with the wrong slope is not named', 'linearTableWorkbench', DERIVE_TABLE, derive('4', '5', 'y = 4x + 5'), []),
  toolCase('table derive: an earlier reading (x < 0) is not named', 'linearTableWorkbench', DERIVE_ACROSS_ZERO, { intervals: [{ i: 0, j: 1, dx: '1', dy: '3', rate: '3' }, { i: 2, j: 3, dx: '1', dy: '3', rate: '3' }], classification: 'linear', m: '3', b: '-1', equation: 'y = 3x - 1' }, []),
  // --- inverseCompositionLab --------------------------------------------------------------
  toolCase('composition: correct', 'inverseCompositionLab', COMPOSITION, { x: 1, fogAnswer: '9', gofAnswer: '-1' }, []),
  toolCase('composition: f(g(x)) and g(f(x)) exchanged', 'inverseCompositionLab', COMPOSITION, { x: 1, fogAnswer: '-1', gofAnswer: '9' }, ['composition-order-reversed']),
  toolCase('composition: one box exchanged and the other unmodeled is not named', 'inverseCompositionLab', COMPOSITION, { x: 1, fogAnswer: '-1', gofAnswer: '4' }, []),
  toolCase('composition: one order used for both boxes is not named', 'inverseCompositionLab', COMPOSITION, { x: 1, fogAnswer: '-1', gofAnswer: '-1' }, []),
  toolCase('composition: f(x)·g(x) and f(x) + g(x) are not an order swap', 'inverseCompositionLab', COMPOSITION, { x: 1, fogAnswer: '15', gofAnswer: '8' }, []),
  toolCase('composition: commuting functions cannot show a swap', 'inverseCompositionLab', COMMUTING, { x: 1, fogAnswer: '5', gofAnswer: '5' }, []),
  toolCase('composition: an exchanged value that is also f(x) is not named', 'inverseCompositionLab', COMPOSITION_AT_2, { x: 2, fogAnswer: '-3', gofAnswer: '7' }, []),
  toolCase('composition: compositions closer than twice the tolerance are not named', 'inverseCompositionLab', CLOSE_COMPOSITIONS, { x: 2, fogAnswer: '4.06', gofAnswer: '4.03' }, []),
  // --- relationMapping --------------------------------------------------------------------
  toolCase('relation: correct', 'relationMapping', RELATION, { domainText: '1, 2, 3', rangeText: '4, 5, 6' }, []),
  toolCase('relation: domain and range exchanged', 'relationMapping', RELATION, { domainText: '4, 5, 6', rangeText: '1, 2, 3' }, ['domain-range-swapped']),
  toolCase('relation: exchanged, written as sets', 'relationMapping', RELATION, { domainText: '{4, 5, 6}', rangeText: '{1, 2, 3}' }, ['domain-range-swapped']),
  toolCase('relation: a partial domain is not a swap', 'relationMapping', RELATION, { domainText: '4, 5', rangeText: '1, 2, 3' }, []),
  toolCase('relation: unrelated wrong sets are not a swap', 'relationMapping', RELATION, { domainText: '1, 2', rangeText: '4, 5' }, []),
  toolCase('relation: the range in the domain box alone is not a swap', 'relationMapping', RELATION, { domainText: '4, 5, 6', rangeText: '1, 2' }, []),
  toolCase('relation: a list with a non-number is not read as a swap', 'relationMapping', RELATION, { domainText: '4, 5, 6, x', rangeText: '1, 2, 3' }, []),
  toolCase('relation: a domain equal to its range cannot show a swap', 'relationMapping', SELF_RELATION, { domainText: '1, 2', rangeText: '3' }, []),
  // --- graphing2 --------------------------------------------------------------------------
  toolCase('graph: correct', 'graphing2', GRAPH, { points: [[0, 1], [1, 3]] }, []),
  toolCase('graph: reciprocal slope from the right y-intercept', 'graphing2', GRAPH, { points: [[0, 1], [2, 2]] }, ['slope-run-over-rise']),
  toolCase('graph: opposite slope from the right y-intercept', 'graphing2', GRAPH, { points: [[0, 1], [1, -1]] }, ['slope-sign-reversed']),
  toolCase('graph: reciprocal and opposite at once is not named', 'graphing2', GRAPH, { points: [[0, 1], [2, 0]] }, []),
  toolCase('graph: slope 1, where −1 is both −m and −1/m, is not named', 'graphing2', GRAPH_ONE, { points: [[0, 1], [1, 0]] }, []),
  toolCase('graph: a reciprocal slope from the wrong intercept is not named', 'graphing2', GRAPH, { points: [[0, 2], [2, 3]] }, []),
  toolCase('graph: point-slope, reciprocal slope from the given point', 'graphing2', GRAPH_POINT_SLOPE, { points: [[1, 2], [4, 3]] }, ['slope-run-over-rise']),
  toolCase('graph: a third point off the line is not named', 'graphing2', GRAPH, { points: [[0, 1], [2, 2], [3, 5]] }, []),
  // --- dataModelingLab --------------------------------------------------------------------
  toolCase('data: correct', 'dataModelingLab', ASSOCIATION, own({ direction: 'positive', strength: 'strong', causation: 'association' }), []),
  toolCase('data: positive association called negative', 'dataModelingLab', ASSOCIATION, own({ direction: 'negative', strength: 'strong', causation: 'association' }), ['correlation-direction-reversed']),
  toolCase('data: r typed with the opposite sign', 'dataModelingLab', CORRELATION, own({ r: String(-Math.round(POSITIVE_R * 100) / 100), direction: 'positive', strength: 'strong' }), []),
  toolCase('data: r and direction both reversed', 'dataModelingLab', CORRELATION, own({ r: String(-Math.round(POSITIVE_R * 100) / 100), direction: 'negative', strength: 'strong' }), ['correlation-direction-reversed']),
  toolCase('data: association stated as causation', 'dataModelingLab', ASSOCIATION, own({ direction: 'positive', strength: 'strong', causation: 'causation' }), ['correlation-treated-as-causation']),
  toolCase('data: reversed direction and causation coexist', 'dataModelingLab', ASSOCIATION, own({ direction: 'negative', strength: 'strong', causation: 'causation' }), ['correlation-direction-reversed', 'correlation-treated-as-causation']),
  toolCase('data: a borderline association cannot show a reversal', 'dataModelingLab', FLAT, own({ direction: 'negative', strength: 'weak', causation: 'association' }), []),
  toolCase('data: causation chosen where the key supports it is not named', 'dataModelingLab', EXPERIMENT, own({ direction: 'negative', strength: 'strong', causation: 'causation' }), ['correlation-direction-reversed']),
  toolCase('data: a pre-selected direction is not the student\'s choice', 'dataModelingLab', { ...ASSOCIATION, points: POSITIVE_POINTS.map(([x, y]) => [x, 12 - y]) }, { direction: 'positive', strength: 'strong', causation: 'association' }, []),
  toolCase('data: an unrelated regression error is not a direction code', 'dataModelingLab', FULL_MODEL, own({ m: '5', b: '9', direction: 'positive', strength: 'strong', causation: 'association', modelChoice: 'linear', predictionX: '8', predictionY: '11', predictionType: 'extrapolation' }), []),
  // --- systemsWorkspace / inequalities, student-build ---------------------------------------
  toolCase('build: correct', 'systemsWorkspace', BUILD, { build: [row({})] }, []),
  toolCase('build: dashed boundary for ≥', 'systemsWorkspace', BUILD, { build: [row({ style: 'dashed' })] }, ['inequality-boundary-style']),
  toolCase('build: shaded the wrong side', 'systemsWorkspace', BUILD, { build: [row({ shadePoint: [2, 0] })] }, ['inequality-shaded-wrong-side']),
  toolCase('build: style and side wrong together', 'systemsWorkspace', BUILD, { build: [row({ style: 'dashed', shadePoint: [2, 0] })] }, ['inequality-boundary-style', 'inequality-shaded-wrong-side']),
  toolCase('build: style on a wrong boundary is not judged', 'systemsWorkspace', BUILD, { build: [row({ y2: 5, style: 'dashed' })] }, []),
  toolCase('build: an unchosen style is not a style error', 'systemsWorkspace', BUILD, { build: [row({ style: '', shadePoint: [2, 0] })] }, []),
  toolCase('build: a shading point hugging the boundary is not named', 'systemsWorkspace', BUILD, { build: [row({ shadePoint: [0.5, 1.4] })] }, []),
  toolCase('build: a modeling question is not read', 'systemsWorkspace', MODELING_BUILD, { build: [row({ style: 'dashed' })], modelingEntries: [{ coeffA: '-1', coeffB: '1', relation: '>=', constant: '1' }], modelingSent: true }, []),
  // --- linear.multipleRepresentations ------------------------------------------------------
  familyToolCase('representations: correct', 'linear.multipleRepresentations', READING_PARAMS, { constraints: READING, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-3', featureXIntercept: '(14, 0)', featureYIntercept: '(0, 42)' }), []),
  familyToolCase('representations: inverted rate', 'linear.multipleRepresentations', READING_PARAMS, { constraints: READING, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-1/3', featureXIntercept: '(14, 0)', featureYIntercept: '(0, 42)' }), ['slope-run-over-rise']),
  familyToolCase('representations: the stated rate without its period is not named', 'linear.multipleRepresentations', READING_PARAMS, { constraints: READING, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-6', featureXIntercept: '(14, 0)', featureYIntercept: '(0, 42)' }), []),
  familyToolCase('representations: Δx/Δy that is also the line through the reading is not named', 'linear.multipleRepresentations', READING_THROUGH_ORIGIN, { constraints: READING_WIDE, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-3/2', featureXIntercept: '(39, 0)', featureYIntercept: '(0, 26)' }), []),
  familyToolCase('representations: slope −1, where 1 is −m and −Δx/Δy, is not named', 'linear.multipleRepresentations', STATED_ONE, { constraints: STATED, authored: { requiredCards: CARDS } },
    board({ featureSlope: '1', featureXIntercept: '(6, 0)', featureYIntercept: '(0, 6)' }), []),
  familyToolCase('representations: the later reading as the starting amount', 'linear.multipleRepresentations', READING_PARAMS, { constraints: READING, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-3', featureXIntercept: '(14, 0)', featureYIntercept: '(0, 30)' }), ['initial-value-from-later-reading']),
  familyToolCase('representations: the later reading with a wrong rate is not named', 'linear.multipleRepresentations', READING_PARAMS, { constraints: READING, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-6', featureXIntercept: '(14, 0)', featureYIntercept: '(0, 30)' }), []),
  familyToolCase('representations: a later reading equal to the stated rate is not named', 'linear.multipleRepresentations', READING_COLLIDING, { constraints: READING, authored: { requiredCards: CARDS } },
    (values) => board({ featureSlope: '-3', featureXIntercept: `(${values.zero}, 0)`, featureYIntercept: `(0, ${values.readAmount})` }), []),
  familyToolCase('representations: intercepts exchanged', 'linear.multipleRepresentations', STATED_PARAMS, { constraints: STATED, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-4', featureXIntercept: '(24, 0)', featureYIntercept: '(0, 6)' }), ['intercepts-swapped']),
  familyToolCase('representations: intercepts written (y, x)', 'linear.multipleRepresentations', STATED_PARAMS, { constraints: STATED, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-4', featureXIntercept: '(0, 6)', featureYIntercept: '(24, 0)' }), ['ordered-pair-reversed']),
  familyToolCase('representations: one intercept wrong is not named', 'linear.multipleRepresentations', STATED_PARAMS, { constraints: STATED, authored: { requiredCards: CARDS } },
    board({ featureSlope: '-4', featureXIntercept: '(24, 0)', featureYIntercept: '(0, 24)' }), []),
  familyToolCase('representations: quantities exchanged', 'linear.multipleRepresentations', STATED_PARAMS, { constraints: STATED, authored: { requiredCards: CARDS, context: CONTEXT } },
    board({ featureSlope: '-4', featureXIntercept: '(6, 0)', featureYIntercept: '(0, 24)', contextIndependent: CONTEXT.dependentQuantity, contextDependent: CONTEXT.independentQuantity }), ['independent-dependent-swapped']),
  familyToolCase('representations: the dependent quantity as independent alone is not a swap', 'linear.multipleRepresentations', STATED_PARAMS, { constraints: STATED, authored: { requiredCards: CARDS, context: CONTEXT } },
    board({ featureSlope: '-4', featureXIntercept: '(6, 0)', featureYIntercept: '(0, 24)', contextIndependent: CONTEXT.dependentQuantity, contextDependent: 'Liters per minute' }), []),
  familyToolCase('representations: the story text alone is no evidence', 'linear.multipleRepresentations', READING_PARAMS, { constraints: READING, authored: { requiredCards: CARDS } },
    board({ featureSlope: '2', featureXIntercept: '(5, 0)', featureYIntercept: '(0, 7)' }), []),
]);
