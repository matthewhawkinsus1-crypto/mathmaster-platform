/*
 * THE MULTIPLE REPRESENTATIONS BOARD'S CARDS — WHICH EXIST, WHICH ARE ASKED FOR.
 *
 * Pure data and set arithmetic only: no parsing, no mathjs. Split out of
 * linearMultipleRepresentationsMath.mjs (which re-exports every name here, so
 * no import changed meaning) because more than the grader needs to know what a
 * board asks: the question-value allocator counts the work a board assigns,
 * and it runs in the authoring path, which must stay light.
 */

export const SUPPORTED_SOURCE_KINDS = Object.freeze([
  'standardForm',
  'slopeIntercept',
  'pointSlope',
  'twoPoints',
  'table',
  'graph',
  'scenario',
]);

export const DEFAULT_BOARD_CATEGORIES = Object.freeze({
  equationForms: ['standardForm', 'slopeIntercept', 'pointSlope'],
  features: ['slope', 'xIntercept', 'yIntercept', 'twoPoints'],
  table: ['table'],
  graphs: ['graphIntercepts', 'graphSlopeIntercept', 'graphPointSlope'],
});

/** Every card a student can be asked to build, in board order. */
export const BOARD_CARD_IDS = Object.freeze(Object.values(DEFAULT_BOARD_CATEGORIES).flat());

// The graded part each card produces. The graph parts keep their historical
// graph1/graph2/graph3 names so stored attempts stay readable.
export const CARD_PART_KEYS = Object.freeze({
  standardForm: 'standardForm',
  slopeIntercept: 'slopeIntercept',
  pointSlope: 'pointSlope',
  slope: 'slope',
  xIntercept: 'xIntercept',
  yIntercept: 'yIntercept',
  twoPoints: 'twoPoints',
  table: 'table',
  graphIntercepts: 'graph1',
  graphSlopeIntercept: 'graph2',
  graphPointSlope: 'graph3',
});

// Classroom names for every graded part, used wherever a student reads which
// part needs another look.
export const PART_LABELS = Object.freeze({
  standardForm: 'Standard form',
  slopeIntercept: 'Slope-intercept form',
  pointSlope: 'Point-slope form',
  slope: 'Slope',
  xIntercept: 'x-intercept',
  yIntercept: 'y-intercept',
  twoPoints: 'Two points on the line',
  table: 'Table of values',
  graph1: 'Graph 1 (intercepts)',
  graph2: 'Graph 2 (slope-intercept)',
  graph3: 'Graph 3 (point-slope)',
  contextIndependent: 'Independent quantity',
  contextDependent: 'Dependent quantity',
  contextSlopeMeaning: 'Meaning of the slope',
  contextYInterceptMeaning: 'Meaning of the y-intercept',
  contextXInterceptMeaning: 'Meaning of the x-intercept',
  contextDomain: 'Reasonable domain',
  crossRepresentationConsistency: 'Every part describes the same line',
});

// The card a source kind hands the student already built. It is GIVEN, so it
// is never asked for again and never graded.
const GIVEN_CARD_BY_KIND = Object.freeze({
  standardForm: 'standardForm',
  slopeIntercept: 'slopeIntercept',
  pointSlope: 'pointSlope',
  twoPoints: 'twoPoints',
  table: 'table',
});

export const givenCardForQuestion = (question = {}) => GIVEN_CARD_BY_KIND[question.source?.kind] || null;

const expandCardIds = (ids) => ids.flatMap((id) => DEFAULT_BOARD_CATEGORIES[id] || [id]);

/**
 * The cards this question asks the student to build, in board order.
 *
 * `requiredCards` lets an author make a shorter board (a DOL, say) from card
 * ids or whole categories (`graphs`, `features`). Absent, every card is asked
 * for. The GIVEN representation is always removed: it is the starting point,
 * not work.
 */
export const resolveRequiredCards = (question = {}) => {
  const authored = Array.isArray(question.requiredCards) && question.requiredCards.length
    ? expandCardIds(question.requiredCards.map(String))
    : BOARD_CARD_IDS;
  const given = givenCardForQuestion(question);
  return BOARD_CARD_IDS.filter((id) => authored.includes(id) && id !== given);
};

/*
 * The cards whose work describes a whole line, so they can be compared with
 * one another. Slope and the intercepts are numbers or single points: they are
 * graded on their own, never as a line.
 */
export const LINE_BEARING_CARD_IDS = Object.freeze([
  'standardForm',
  'slopeIntercept',
  'pointSlope',
  'twoPoints',
  'table',
  'graphIntercepts',
  'graphSlopeIntercept',
  'graphPointSlope',
]);

/*
 * The context parts this question grades, in board order. A meaning is graded
 * exactly when the author wrote one (source.context wins over a top-level
 * context, as everywhere on this board); the domain when either the context or
 * the question itself supplies one.
 */
export const CONTEXT_PART_FIELDS = Object.freeze([
  Object.freeze({ field: 'contextIndependent', key: 'independentQuantity' }),
  Object.freeze({ field: 'contextDependent', key: 'dependentQuantity' }),
  Object.freeze({ field: 'contextSlopeMeaning', key: 'slopeMeaning' }),
  Object.freeze({ field: 'contextYInterceptMeaning', key: 'yInterceptMeaning' }),
  Object.freeze({ field: 'contextXInterceptMeaning', key: 'xInterceptMeaning' }),
  Object.freeze({ field: 'contextDomain', key: 'domain' }),
]);

export const gradedContextFields = (question = {}) => {
  const context = question.source?.context || question.context || {};
  return CONTEXT_PART_FIELDS.filter(({ key }) => (
    key === 'domain' ? (context.domain != null || question.domain != null) : context[key] != null
  ));
};
