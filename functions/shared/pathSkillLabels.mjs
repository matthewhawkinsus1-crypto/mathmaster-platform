// What a skill is called when a student is looking at it.
//
// The path engine reasons in TEKS codes because that is what the standards
// registry, the mastery wheel and every teacher report are keyed on. A student
// should never have to. "A.5A" is an index entry; "Solving linear equations" is
// a thing you can decide whether you are ready for.
//
// So this file is the one translation layer, and it is deliberately separate
// from `skillGraph.js`: the graph's `shortLabel` is still the code, because
// teacher tooling, the coverage audit and the simulator all need the code, and
// quietly changing what `shortLabel` means would have swapped the label on
// those screens instead.
//
// Two rules:
//
//   1. A curated phrase wins. It is written for a fourteen-year-old, in the
//      vocabulary their teacher actually uses.
//   2. Anything uncurated still gets something readable, derived from the
//      standard's own description rather than falling back to the code. A new
//      standard added to the registry tomorrow should not put "8.3C" on a
//      student's screen.

import { getTexasStandard, normalizeTeksCode } from './texasStandards.mjs';

// --- Curated student-facing names ---------------------------------------------

const CURATED = Object.freeze({
  // Grade 6 — reachable as an Algebra prerequisite
  '6.7A': 'Order of operations',
  '6.7D': 'Equivalent expressions',

  // Grade 7
  '7.2': 'Sets of rational numbers',
  '7.3A': 'Operations with rational numbers',
  '7.3B': 'Problem solving with rational numbers',
  '7.4A': 'Constant rates of change',
  '7.4B': 'Unit rates',
  '7.4C': 'Constant of proportionality',
  '7.4D': 'Ratios, rates and percents',
  '7.4E': 'Converting between measurement systems',
  '7.5A': 'Similar figures',
  '7.5B': 'Circumference and π',
  '7.5C': 'Scale drawings',
  '7.6A': 'Sample spaces',
  '7.6B': 'Probability simulations',
  '7.6C': 'Predictions from experimental data',
  '7.6D': 'Theoretical probability',
  '7.6E': 'Probability of an event and its complement',
  '7.6F': 'Inferences from a random sample',
  '7.6G': 'Reading graphs and data displays',
  '7.6H': 'Comparing results of experiments',
  '7.6I': 'Experimental and theoretical probability',
  '7.7': 'Linear relationships in tables and graphs',
  '7.8A': 'Volume of prisms and pyramids',
  '7.8B': 'Comparing prism and pyramid volume',
  '7.8C': 'Circle formulas',
  '7.9A': 'Volume problems',
  '7.9B': 'Circumference and area of circles',
  '7.9C': 'Area of composite figures',
  '7.9D': 'Surface area from nets',
  '7.10A': 'Writing two-step equations and inequalities',
  '7.10B': 'Inequality solutions on a number line',
  '7.10C': 'Writing a situation for an equation',
  '7.11A': 'Solving two-step equations and inequalities',
  '7.11B': 'Checking solutions',
  '7.11C': 'Equations from angle relationships',
  '7.12A': 'Comparing data sets',
  '7.12B': 'Inferences from a sample',
  '7.12C': 'Comparing two populations',
  '7.13A': 'Sales tax and income tax',
  '7.13B': 'Personal budgets',
  '7.13C': 'Assets, liabilities and net worth',
  '7.13D': 'Budget estimators',
  '7.13E': 'Simple and compound interest',
  '7.13F': 'Comparing monetary incentives',

  // Grade 8
  '8.2A': 'Sets of real numbers',
  '8.2B': 'Approximating irrational numbers',
  '8.2C': 'Scientific notation',
  '8.2D': 'Ordering real numbers',
  '8.3A': 'Similarity and dilations',
  '8.3B': 'A shape and its dilation',
  '8.3C': 'Dilations on the coordinate plane',
  '8.4A': 'Slope from similar triangles',
  '8.4B': 'Graphing proportional relationships',
  '8.4C': 'Rate of change from a table or graph',
  '8.5A': 'Proportional relationships (y = kx)',
  '8.5B': 'Non-proportional relationships (y = mx + b)',
  '8.5C': 'Recognising linear data',
  '8.5D': 'Trend lines and predictions',
  '8.5E': 'Direct variation',
  '8.5F': 'Proportional or not?',
  '8.5G': 'Identifying functions',
  '8.5H': 'Proportional and non-proportional functions',
  '8.5I': 'Writing y = mx + b from a situation',
  '8.6A': 'Volume of a cylinder',
  '8.6B': 'Cylinders and cones',
  '8.6C': 'Explaining the Pythagorean Theorem',
  '8.7A': 'Volume of cylinders, cones and spheres',
  '8.7B': 'Surface area',
  '8.7C': 'Using the Pythagorean Theorem',
  '8.7D': 'Distance on the coordinate plane',
  '8.8A': 'Writing equations with variables on both sides',
  '8.8B': 'Writing a situation for an equation',
  '8.8C': 'Solving equations with variables on both sides',
  '8.8D': 'Angle relationships',
  '8.9': 'Solutions from intersecting lines',
  '8.10A': 'Transformations and congruence',
  '8.10B': 'Which transformations preserve congruence',
  '8.10C': 'Describing transformations algebraically',
  '8.10D': 'Effects of dilation on measurements',
  '8.11A': 'Scatterplots and association',
  '8.11B': 'Mean absolute deviation',
  '8.11C': 'Random samples',
  '8.12A': 'Interest rates and the cost of credit',
  '8.12B': 'Total cost of repaying a loan',
  '8.12C': 'Investing over time',
  '8.12D': 'Simple and compound interest',
  '8.12E': 'Comparing payment methods',
  '8.12F': 'Financially responsible decisions',
  '8.12G': 'Planning for college costs',

  // Algebra I
  'A.2A': 'Domain and range of linear functions',
  'A.2B': 'Writing linear equations from a point and slope',
  'A.2C': 'Writing linear equations from a table or graph',
  'A.2D': 'Direct variation',
  'A.2E': 'Equations of parallel lines',
  'A.2F': 'Equations of perpendicular lines',
  'A.2G': 'Horizontal and vertical lines',
  'A.2H': 'Writing linear inequalities',
  'A.2I': 'Writing systems of linear equations',
  'A.3A': 'Finding slope',
  'A.3B': 'Interpreting rate of change',
  'A.3C': 'Graphing linear functions',
  'A.3D': 'Graphing linear inequalities',
  'A.3E': 'Transformations of linear functions',
  'A.3F': 'Solving systems by graphing',
  'A.3G': 'Estimating solutions of systems',
  'A.3H': 'Graphing systems of inequalities',
  'A.4A': 'Correlation coefficient',
  'A.4B': 'Association and causation',
  'A.4C': 'Linear models from data',
  'A.5A': 'Solving linear equations',
  'A.5B': 'Solving linear inequalities',
  'A.5C': 'Solving systems of equations',
  'A.6A': 'Domain and range of quadratic functions',
  'A.6B': 'Writing quadratics from a vertex',
  'A.6C': 'Writing quadratics from zeros',
  'A.7A': 'Graphing quadratic functions',
  'A.7B': 'Factors and zeros',
  'A.7C': 'Transformations of quadratics',
  'A.8A': 'Solving quadratic equations',
  'A.8B': 'Quadratic models from data',
  'A.9A': 'Domain and range of exponential functions',
  'A.9B': 'Interpreting exponential parameters',
  'A.9C': 'Writing exponential models',
  'A.9D': 'Graphing exponential functions',
  'A.9E': 'Exponential models from data',
  'A.10A': 'Adding and subtracting polynomials',
  'A.10B': 'Multiplying polynomials',
  'A.10C': 'Dividing polynomials',
  'A.10D': 'The distributive property with polynomials',
  'A.10E': 'Factoring trinomials',
  'A.10F': 'Difference of two squares',
  'A.11A': 'Simplifying radicals',
  'A.11B': 'Laws of exponents',
  'A.12A': 'Deciding whether a relation is a function',
  'A.12B': 'Function notation',
  'A.12C': 'Recursive sequences',
  'A.12D': 'Formulas for sequences',
  'A.12E': 'Solving literal equations',

  // Algebra II
  'A2.2A': 'Parent functions and their key features',
  'A2.2B': 'Graphing and writing inverses',
  'A2.2C': 'Functions and their inverses',
  'A2.2D': 'Composition and inverse functions',
  'A2.3A': 'Writing systems of equations',
  'A2.3B': 'Systems in three variables',
  'A2.3C': 'Linear–quadratic systems',
  'A2.3D': 'Reasonableness of system solutions',
  'A2.3E': 'Writing systems of inequalities',
  'A2.3F': 'Solving systems of inequalities',
  'A2.3G': 'Solution sets of inequality systems',
  'A2.4A': 'Quadratics through three points',
  'A2.4B': 'Parabolas from vertex, focus and directrix',
  'A2.4C': 'Transformations of square root functions',
  'A2.4D': 'Standard form to vertex form',
  'A2.4E': 'Quadratic and square root models from data',
  'A2.4F': 'Solving quadratic and square root equations',
  'A2.4G': 'Extraneous solutions',
  'A2.4H': 'Quadratic inequalities',
  'A2.5A': 'Transformations of exponential and logarithmic graphs',
  'A2.5B': 'Exponential and logarithmic models',
  'A2.5C': 'Exponential and logarithmic form',
  'A2.5D': 'Solving exponential and logarithmic equations',
  'A2.5E': 'Reasonableness of logarithmic solutions',
  'A2.6A': 'Transformations of cubic and cube root functions',
  'A2.6B': 'Solving cube root equations',
  'A2.6C': 'Transformations of absolute value functions',
  'A2.6D': 'Writing absolute value equations',
  'A2.6E': 'Solving absolute value equations',
  'A2.6F': 'Solving absolute value inequalities',
  'A2.6G': 'Transformations of reciprocal functions',
  'A2.6H': 'Writing rational equations',
  'A2.6I': 'Solving rational equations',
  'A2.6J': 'Reasonableness of rational solutions',
  'A2.6K': 'Asymptotes, domain and range',
  'A2.6L': 'Inverse variation',
  'A2.7A': 'Complex number arithmetic',
  'A2.7B': 'Polynomial arithmetic',
  'A2.7C': 'Dividing higher-degree polynomials',
  'A2.7D': 'Linear factors of polynomials',
  'A2.7E': 'Factoring higher-degree polynomials',
  'A2.7F': 'Operations with rational expressions',
  'A2.7G': 'Rewriting radical expressions',
  'A2.7H': 'Equations with rational exponents',
  'A2.7I': 'Writing domain and range',
  'A2.8A': 'Choosing the right model',
  'A2.8B': 'Regression models',
  'A2.8C': 'Making decisions from a model',
});

// --- Fallback derivation -------------------------------------------------------

// Verb phrases the TEKS use to open almost every description. Stripping them
// leaves the mathematics, which is the part a student recognises.
const LEADING_VERBS = [
  'determine whether', 'determine possible', 'determine the', 'determine',
  'analyze and compare', 'analyze data to select', 'analyze', 'apply and extend previous understandings of',
  'apply', 'approximate', 'calculate and compare', 'calculate and interpret', 'calculate',
  'compare and contrast', 'compare', 'construct and organize', 'construct',
  'convert between', 'convert', 'create and use', 'create and organize', 'create',
  'describe and analyze', 'describe', 'differentiate between', 'distinguish between',
  'estimate graphically', 'estimate', 'evaluate', 'explain how', 'explain verbally and symbolically',
  'explain', 'extend previous knowledge of', 'find the probabilities of', 'find',
  'formulate and solve', 'formulate', 'generalize that', 'generalize the', 'generalize',
  'generate equivalent', 'generate', 'graph and write', 'graph', 'identify and explain',
  'identify and verify', 'identify examples of', 'identify', 'interpret', 'locate',
  'make predictions and determine solutions using', 'make predictions', 'model and solve',
  'model the relationship between', 'model', 'multiply', 'order a set of', 'order',
  'predict', 'recognize and factor', 'represent solutions for', 'represent', 'rewrite',
  'select and use', 'select', 'simplify', 'simulate', 'solve algebraically', 'solve',
  'transform', 'use a', 'use data from', 'use informal arguments to', 'use models and diagrams to',
  'use models to', 'use previous knowledge of', 'use similar right triangles to develop an understanding that',
  'use', 'write a corresponding', 'write and solve', 'write the equation of', 'write the domain and range of',
  'write formulas for', 'write', 'add, subtract, and multiply', 'add, subtract, multiply, and divide',
  'add and subtract',
];

const CLAUSE_BREAK = /\s*(?:,\s*including\b|,\s*and\s+connect\b|\s+\(|,\s*such as\b|\s+using technology\b|\s+in mathematical and real-world\b|\s+within mathematical and real-world\b|,\s*and\s+determine\b)/i;

const titleCaseFirst = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/**
 * A readable name for a standard nobody has curated yet.
 *
 * Never returns the code: a code on a student screen is the thing this module
 * exists to remove.
 */
export const deriveStudentLabel = (description, code = '') => {
  let text = String(description || '').trim().replace(/\.$/, '');
  // A standard with no description gets a generic phrase, NOT "Skill A.5A".
  // The `code` parameter is kept because callers pass it, but it is used only
  // to decide that there is nothing to derive from — never rendered. The
  // previous fallback contradicted this function's own contract and was the
  // one code leak that reached the wheel, the modal and the retention banner.
  if (!text) return 'This skill';
  const lower = text.toLowerCase();
  const verb = LEADING_VERBS.find((candidate) => lower.startsWith(`${candidate} `));
  if (verb) text = text.slice(verb.length).trim();
  const [head] = text.split(CLAUSE_BREAK);
  text = (head || text).trim().replace(/[,;:]$/, '');
  const words = text.split(/\s+/);
  if (words.length > 9) text = `${words.slice(0, 9).join(' ')}…`;
  return titleCaseFirst(text) || 'This skill';
};

/**
 * The student-facing name of a TEKS code.
 *
 * Safe for any input: an unknown code still produces a phrase rather than
 * leaking the identifier.
 */
export const studentLabelForTeks = (code) => {
  const normalized = normalizeTeksCode(code);
  if (!normalized) return 'This skill';
  if (CURATED[normalized]) return CURATED[normalized];
  const standard = getTexasStandard(normalized);
  return deriveStudentLabel(standard?.description, normalized);
};

/** Whether a code has a hand-written student name (used by content QA). */
export const hasCuratedStudentLabel = (code) => Boolean(CURATED[normalizeTeksCode(code)]);

export const CURATED_STUDENT_LABELS = CURATED;

export default studentLabelForTeks;
