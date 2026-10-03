/*
 * MATH VOCABULARY — which terms an item or a tool can explain.
 *
 * This file is the small, always-available INDEX: term ids, the English
 * forms that find a term in a prompt, and the vocabulary each rich tool's own
 * controls use. It decides whether the Vocabulary tool has anything to show
 * here (and so whether it is "available" at all) without loading a single
 * definition. The definitions, examples and translations live in
 * ./glossary/mathGlossaryEntries.js and are loaded only when a student with
 * the support opens the tool (loadMathGlossary below).
 *
 * Every term comes from vocabulary MathMaster's Algebra I / Algebra II tools
 * and assignments actually use. A definition explains a WORD; it never solves
 * the item it appears beside.
 */
import { segmentMathText } from './mathSafeText.js';

/** id → English forms that mark the term in prose (lowercase; longest first wins). */
export const VOCABULARY_INDEX = Object.freeze({
  coefficient: ['coefficients', 'coefficient'],
  constant: ['constants', 'constant term', 'constant'],
  variable: ['variables', 'variable'],
  expression: ['expressions', 'expression'],
  equation: ['equations', 'equation'],
  term: ['terms', 'term'],
  'like-terms': ['like terms', 'combine like terms'],
  distribute: ['distributive property', 'distributing', 'distributes', 'distribute'],
  'inverse-operation': ['inverse operations', 'inverse operation'],
  solution: ['solutions', 'solution', 'solve', 'solves', 'solving'],
  inequality: ['inequalities', 'inequality'],
  system: ['system of equations', 'system of inequalities', 'systems', 'system'],
  substitution: ['substitution', 'substitute', 'substituting'],
  elimination: ['elimination', 'eliminate', 'eliminating'],
  intersection: ['point of intersection', 'intersection', 'intersect', 'intersects'],
  equivalent: ['equivalent'],
  factor: ['factored form', 'factors', 'factoring', 'factored', 'factor'],
  product: ['products', 'product'],
  sum: ['sum'],
  difference: ['difference'],
  quotient: ['quotient'],
  slope: ['slopes', 'slope'],
  'y-intercept': ['y-intercepts', 'y-intercept'],
  'x-intercept': ['x-intercepts', 'x-intercept'],
  intercept: ['intercepts', 'intercept'],
  'rate-of-change': ['average rate of change', 'rate of change', 'rates of change', 'constant rate'],
  linear: ['linear'],
  function: ['functions', 'function'],
  input: ['inputs', 'input'],
  output: ['outputs', 'output'],
  domain: ['domain'],
  range: ['range'],
  'independent-variable': ['independent variable'],
  'dependent-variable': ['dependent variable'],
  'ordered-pair': ['ordered pairs', 'ordered pair'],
  'coordinate-plane': ['coordinate plane', 'coordinate grid'],
  origin: ['origin'],
  axis: ['x-axis', 'y-axis', 'axes', 'axis'],
  boundary: ['boundary lines', 'boundary line', 'boundary'],
  dashed: ['dashed line', 'dashed'],
  solid: ['solid line', 'solid'],
  shade: ['shaded region', 'shaded', 'shading', 'shade'],
  correlation: ['correlations', 'correlation', 'correlated'],
  causation: ['causation', 'causal'],
  outlier: ['outliers', 'outlier'],
  residual: ['residuals', 'residual'],
  'line-of-best-fit': ['line of best fit', 'best-fit line', 'trend line', 'line of fit'],
  regression: ['regression'],
  scatterplot: ['scatterplots', 'scatterplot', 'scatter plot'],
  sequence: ['sequences', 'sequence'],
  'common-difference': ['common difference'],
  'common-ratio': ['common ratio'],
  arithmetic: ['arithmetic sequence', 'arithmetic'],
  geometric: ['geometric sequence', 'geometric'],
  discrete: ['discrete'],
  continuous: ['continuous'],
  transformation: ['transformations', 'transformation', 'transformed', 'transform'],
  translation: ['translation', 'translated', 'translate'],
  reflection: ['reflections', 'reflection', 'reflected', 'reflect'],
  dilation: ['dilations', 'dilation', 'vertical stretch', 'stretch', 'compression', 'compress'],
  vertex: ['vertices', 'vertex'],
  parabola: ['parabolas', 'parabola'],
  quadratic: ['quadratics', 'quadratic'],
  exponential: ['exponential growth', 'exponential decay', 'exponential'],
  'absolute-value': ['absolute value'],
  zero: ['zeros of the function', 'zeros', 'roots'],
  maximum: ['maximum', 'maximum value'],
  minimum: ['minimum', 'minimum value'],
  'axis-of-symmetry': ['axis of symmetry'],
  interval: ['intervals', 'interval'],
  increasing: ['increasing', 'increases'],
  decreasing: ['decreasing', 'decreases'],
  evaluate: ['evaluate', 'evaluating'],
  simplify: ['simplify', 'simplest form', 'simplified'],
  justify: ['justify', 'justification', 'justifies'],
  explain: ['explain', 'explanation'],
  determine: ['determine', 'determines'],
  estimate: ['estimate', 'estimated', 'estimation'],
  interpret: ['interpret', 'interpretation'],
  compare: ['compare', 'comparison'],
  represent: ['represents', 'represent', 'representation'],
  graph: ['graph', 'graphs', 'graphed', 'graphing'],
  model: ['model', 'models', 'modeling'],
});

/**
 * The vocabulary a rich tool's own controls use, so a student meets
 * "Distribute" or "Boundary" in the tool with a definition one tap away even
 * when the prompt never says the word. Keys are tool/question types.
 */
export const TOOL_VOCABULARY = Object.freeze({
  stepAlgebra: ['coefficient', 'constant', 'distribute', 'inverse-operation', 'like-terms', 'term', 'equivalent', 'solution'],
  stepAlgebra2: ['coefficient', 'constant', 'distribute', 'inverse-operation', 'like-terms', 'term', 'equivalent', 'solution'],
  algebra: ['coefficient', 'constant', 'inverse-operation', 'solution', 'equivalent'],
  literal: ['variable', 'coefficient', 'inverse-operation', 'equivalent'],
  graphing2: ['slope', 'y-intercept', 'x-intercept', 'boundary', 'dashed', 'solid', 'shade', 'ordered-pair'],
  functionGraph: ['slope', 'y-intercept', 'x-intercept', 'ordered-pair', 'coordinate-plane'],
  intervalNumberLine: ['inequality', 'interval', 'solution', 'boundary'],
  system: ['system', 'substitution', 'elimination', 'intersection', 'solution', 'ordered-pair'],
  systemsWorkspace: ['system', 'substitution', 'elimination', 'intersection', 'solution', 'boundary', 'shade'],
  regressionCalculator: ['regression', 'line-of-best-fit', 'correlation', 'residual', 'outlier', 'model', 'causation'],
  dataModelingLab: ['scatterplot', 'line-of-best-fit', 'correlation', 'residual', 'outlier', 'model', 'causation'],
  functionInvestigation: ['domain', 'range', 'x-intercept', 'y-intercept', 'maximum', 'minimum', 'increasing', 'decreasing'],
  functionInvestigation2: ['domain', 'range', 'x-intercept', 'y-intercept', 'maximum', 'minimum', 'increasing', 'decreasing'],
  sequenceExplorer: ['sequence', 'term', 'common-difference', 'common-ratio', 'arithmetic', 'geometric', 'discrete'],
  transformationsLab: ['transformation', 'translation', 'reflection', 'dilation', 'vertex', 'axis-of-symmetry'],
  parabolaGeometryLab: ['parabola', 'vertex', 'axis-of-symmetry', 'quadratic', 'zero'],
  polynomialWorkshop: ['factor', 'term', 'coefficient', 'zero', 'like-terms'],
  table: ['input', 'output', 'function', 'rate-of-change'],
  relationMapping: ['function', 'input', 'output', 'domain', 'range'],
  representationMatch: ['function', 'slope', 'y-intercept', 'rate-of-change'],
  exponentialLogBridge: ['exponential', 'function', 'input', 'output'],
  inverseCompositionLab: ['function', 'input', 'output', 'domain', 'range'],
  signSolutionAnalyzer: ['inequality', 'interval', 'zero', 'solution'],
  constraintFunctionBuilder: ['inequality', 'boundary', 'shade', 'solution'],
});

/** Every id in the index (for tests and the lazy pack's completeness check). */
export const VOCABULARY_IDS = Object.freeze(Object.keys(VOCABULARY_INDEX));

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One pattern per form, longest forms first so "rate of change" beats "change".
const FORMS = Object.entries(VOCABULARY_INDEX)
  .flatMap(([id, forms]) => forms.map((form) => ({ id, form })))
  .sort((a, b) => b.form.length - a.form.length)
  .map(({ id, form }) => ({ id, pattern: new RegExp(`(^|[^A-Za-z-])${escapeRegExp(form)}(?![A-Za-z-])`, 'i') }));

/**
 * Term ids found in the PROSE of a text, in order of first appearance. Math is
 * removed first, so the "x" of "x-axis" in an equation never matches.
 */
export const vocabularyInText = (text) => {
  const prose = segmentMathText(text).filter((segment) => segment.kind === 'text').map((segment) => segment.value).join(' ');
  if (!prose.trim()) return [];
  const found = [];
  let remaining = ` ${prose} `;
  FORMS.forEach(({ id, pattern }) => {
    const match = remaining.match(pattern);
    if (!match) return;
    if (!found.some((entry) => entry.id === id)) found.push({ id, at: prose.toLowerCase().indexOf(match[0].trim().toLowerCase()) });
    // Blank the match so a shorter form inside it ("change" in "rate of
    // change") does not also match.
    remaining = remaining.replace(pattern, (whole, lead) => `${lead}${' '.repeat(whole.length - lead.length)}`);
  });
  return found.sort((a, b) => a.at - b.at).map((entry) => entry.id);
};

/**
 * The vocabulary for one item in one tool: terms the prose uses first, then the
 * tool's own control vocabulary. Capped so the panel stays short on a phone.
 */
export const vocabularyForContext = ({ text = '', toolType = '', limit = 10 } = {}) => {
  const ids = [...vocabularyInText(text), ...(TOOL_VOCABULARY[toolType] || [])];
  return [...new Set(ids)].slice(0, limit);
};

let glossaryPromise = null;
/**
 * The definitions, loaded once and only when asked for. A student without the
 * support never downloads them.
 */
export const loadMathGlossary = () => {
  if (!glossaryPromise) {
    glossaryPromise = import('./glossary/mathGlossaryEntries.js')
      .then((module) => module.MATH_GLOSSARY)
      .catch((error) => { glossaryPromise = null; throw error; });
  }
  return glossaryPromise;
};
