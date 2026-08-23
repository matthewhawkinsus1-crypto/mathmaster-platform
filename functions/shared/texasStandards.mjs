import { GRADE_6_TEKS, GRADE_7_TEKS, GRADE_8_TEKS } from './texasMiddleSchoolStandards.mjs';

export const TEXAS_PERFORMANCE_LEVELS = [
  {
    key: 'didNotMeet',
    label: 'Did Not Meet Grade Level',
    shortLabel: 'Did Not Meet',
    description: 'Needs significant, ongoing academic intervention to demonstrate the assessed knowledge and skills.',
  },
  {
    key: 'approaches',
    label: 'Approaches Grade Level',
    shortLabel: 'Approaches',
    description: 'Shows developing command of the assessed knowledge and skills and is likely to benefit from targeted intervention.',
  },
  {
    key: 'meets',
    label: 'Meets Grade Level',
    shortLabel: 'Meets',
    description: 'Shows solid command of the assessed knowledge and skills and a high likelihood of success with limited targeted support.',
  },
  {
    key: 'masters',
    label: 'Masters Grade Level',
    shortLabel: 'Masters',
    description: 'Shows strong command and can apply the assessed knowledge and skills in varied contexts with little or no intervention.',
  },
];

export const TEXAS_MATH_COURSES = [
  { id: 'grade6', label: 'Grade 6', shortLabel: '6', order: 6, registryStatus: 'active', rule: '19 TAC §111.26', prerequisiteCourseIds: [] },
  { id: 'grade7', label: 'Grade 7', shortLabel: '7', order: 7, registryStatus: 'active', rule: '19 TAC §111.27', prerequisiteCourseIds: [] },
  { id: 'grade8', label: 'Grade 8', shortLabel: '8', order: 8, registryStatus: 'active', rule: '19 TAC §111.28', prerequisiteCourseIds: [] },
  { id: 'algebra1', label: 'Algebra I', shortLabel: 'Alg I', order: 9, registryStatus: 'active', rule: '19 TAC §111.39', prerequisiteCourseIds: ['grade8'] },
  { id: 'geometry', label: 'Geometry', shortLabel: 'Geo', order: 10, registryStatus: 'planned', rule: '19 TAC §111.41', prerequisiteCourseIds: ['algebra1'] },
  { id: 'algebra2', label: 'Algebra II', shortLabel: 'Alg II', order: 11, registryStatus: 'active', rule: '19 TAC §111.40', prerequisiteCourseIds: ['algebra1'] },
  { id: 'precalculus', label: 'Precalculus', shortLabel: 'Precal', order: 12, registryStatus: 'planned', rule: '19 TAC §111.42', prerequisiteCourseIds: ['algebra1', 'geometry', 'algebra2'] },
];

export const ALGEBRA_I_REPORTING_CATEGORIES = {
  1: 'Number and Algebraic Methods',
  2: 'Describing and Graphing Linear Functions, Equations and Inequalities',
  3: 'Writing and Solving Linear Functions, Equations and Inequalities',
  4: 'Quadratic Functions and Equations',
  5: 'Exponential Functions and Equations',
};

export const ALGEBRA_II_STRANDS = {
  1: 'Mathematical Process Standards',
  2: 'Attributes of Functions and Their Inverses',
  3: 'Systems of Equations and Inequalities',
  4: 'Quadratic and Square Root Functions, Equations, and Inequalities',
  5: 'Exponential and Logarithmic Functions and Equations',
  6: 'Cubic, Cube Root, Absolute Value, and Rational Functions, Equations, and Inequalities',
  7: 'Number and Algebraic Methods',
  8: 'Data',
};

const algebraIProcess = (code, description) => ({
  code,
  courseId: 'algebra1',
  course: 'Algebra I',
  strand: 1,
  strandLabel: 'Mathematical Process Standards',
  classification: 'process',
  reportingCategory: null,
  description,
});

const algebraIContent = (code, strand, reportingCategory, classification, description) => ({
  code,
  courseId: 'algebra1',
  course: 'Algebra I',
  strand,
  // The label is the STAAR REPORTING CATEGORY, so it is keyed off the reporting
  // category and nothing else. The previous guard also required the TEKS strand
  // number to be 2-5, which silently blanked every standard from A.6 onward —
  // all of quadratics (RC 4) and all of exponentials (RC 5), 26 of Algebra I's
  // 49 standards. Two things depended on it: the student-facing "what this
  // question is building" dialog, which lost its category line for half the
  // course, and the weekly Path's variety logic, which had no strand to spread
  // work across. Process standards carry no reporting category and stay null.
  strandLabel: reportingCategory ? (ALGEBRA_I_REPORTING_CATEGORIES[reportingCategory] || null) : null,
  classification,
  reportingCategory,
  description,
});

// Algebra I TEKS in 19 TAC §111.39. Readiness/supporting classifications follow
// the current Algebra I STAAR blueprint structure. Process standards are tracked separately.
export const ALGEBRA_I_TEKS = [
  algebraIProcess('A.1A', 'Apply mathematics to problems arising in everyday life, society, and the workplace.'),
  algebraIProcess('A.1B', 'Use a problem-solving model to analyze information, plan, solve, justify, and evaluate reasonableness.'),
  algebraIProcess('A.1C', 'Select appropriate tools and techniques, including technology, mental math, estimation, and number sense.'),
  algebraIProcess('A.1D', 'Communicate mathematical ideas and reasoning using symbols, diagrams, graphs, and language.'),
  algebraIProcess('A.1E', 'Create and use representations to organize, record, and communicate mathematical ideas.'),
  algebraIProcess('A.1F', 'Analyze mathematical relationships to connect and communicate mathematical ideas.'),
  algebraIProcess('A.1G', 'Display, explain, and justify mathematical ideas and arguments using precise mathematical language.'),

  algebraIContent('A.2A', 2, 3, 'readiness', 'Determine domain and range of linear functions, including reasonable continuous and discrete values in context.'),
  algebraIContent('A.2B', 2, 3, 'supporting', 'Write linear equations in two variables in multiple forms from a point and slope or from two points.'),
  algebraIContent('A.2C', 2, 3, 'readiness', 'Write linear equations in two variables from a table, graph, or verbal description.'),
  algebraIContent('A.2D', 2, 3, 'supporting', 'Write and solve equations involving direct variation.'),
  algebraIContent('A.2E', 2, 3, 'supporting', 'Write the equation of a line through a point that is parallel to a given line.'),
  algebraIContent('A.2F', 2, 3, 'supporting', 'Write the equation of a line through a point that is perpendicular to a given line.'),
  algebraIContent('A.2G', 2, 3, 'supporting', 'Write equations of horizontal or vertical lines and determine whether slope is zero or undefined.'),
  algebraIContent('A.2H', 2, 3, 'supporting', 'Write linear inequalities in two variables from a table, graph, or verbal description.'),
  algebraIContent('A.2I', 2, 3, 'readiness', 'Write systems of two linear equations from a table, graph, or verbal description.'),

  algebraIContent('A.3A', 3, 2, 'supporting', 'Determine slope from a table, graph, two points, or an equation in multiple forms.'),
  algebraIContent('A.3B', 3, 2, 'readiness', 'Calculate and interpret rate of change of a linear function in mathematical and real-world contexts.'),
  algebraIContent('A.3C', 3, 2, 'readiness', 'Graph linear functions and identify key features such as intercepts, zeros, and slope.'),
  algebraIContent('A.3D', 3, 2, 'readiness', 'Graph the solution set of linear inequalities in two variables.'),
  algebraIContent('A.3E', 3, 2, 'supporting', 'Determine effects of transformations of the linear parent function.'),
  algebraIContent('A.3F', 3, 2, 'supporting', 'Graph systems of two linear equations and determine their solutions when they exist.'),
  algebraIContent('A.3G', 3, 2, 'supporting', 'Estimate graphically the solutions of systems of two linear equations in real-world problems.'),
  algebraIContent('A.3H', 3, 2, 'supporting', 'Graph the solution set of systems of two linear inequalities.'),

  algebraIContent('A.4A', 4, 2, 'supporting', 'Calculate and interpret the correlation coefficient between two quantitative variables using technology.'),
  algebraIContent('A.4B', 4, 2, 'supporting', 'Compare and contrast association and causation in real-world problems.'),
  algebraIContent('A.4C', 4, 2, 'supporting', 'Write linear functions that reasonably fit data to estimate solutions and make predictions.'),

  algebraIContent('A.5A', 5, 3, 'readiness', 'Solve linear equations in one variable, including distribution and variables on both sides.'),
  algebraIContent('A.5B', 5, 3, 'supporting', 'Solve linear inequalities in one variable, including distribution and variables on both sides.'),
  algebraIContent('A.5C', 5, 3, 'readiness', 'Solve systems of two linear equations with two variables in mathematical and real-world problems.'),

  algebraIContent('A.6A', 6, 4, 'readiness', 'Determine domain and range of quadratic functions and represent them using inequalities.'),
  algebraIContent('A.6B', 6, 4, 'supporting', 'Write quadratic equations from a vertex and another point, and convert vertex form to standard form.'),
  algebraIContent('A.6C', 6, 4, 'supporting', 'Write quadratic functions from real solutions and graphs of related equations.'),

  algebraIContent('A.7A', 7, 4, 'readiness', 'Graph quadratic functions and identify key attributes including intercepts, zeros, extrema, vertex, and axis of symmetry.'),
  algebraIContent('A.7B', 7, 4, 'supporting', 'Describe the relationship between linear factors of quadratic expressions and zeros of quadratic functions.'),
  algebraIContent('A.7C', 7, 4, 'readiness', 'Determine effects of transformations of the quadratic parent function.'),

  algebraIContent('A.8A', 8, 4, 'readiness', 'Solve quadratic equations with real solutions by factoring, square roots, completing the square, and the quadratic formula.'),
  algebraIContent('A.8B', 8, 4, 'supporting', 'Write quadratic functions that reasonably fit data to estimate solutions and make predictions using technology.'),

  algebraIContent('A.9A', 9, 5, 'supporting', 'Determine domain and range of exponential functions and represent them using inequalities.'),
  algebraIContent('A.9B', 9, 5, 'supporting', 'Interpret parameters in exponential functions in real-world problems.'),
  algebraIContent('A.9C', 9, 5, 'readiness', 'Write exponential functions to model mathematical and real-world growth and decay situations.'),
  algebraIContent('A.9D', 9, 5, 'readiness', 'Graph exponential growth and decay functions and identify key features including y-intercept and asymptote.'),
  algebraIContent('A.9E', 9, 5, 'supporting', 'Write exponential functions that reasonably fit data and make predictions using technology.'),

  algebraIContent('A.10A', 10, 1, 'supporting', 'Add and subtract polynomials of degree one and degree two.'),
  algebraIContent('A.10B', 10, 1, 'supporting', 'Multiply polynomials of degree one and degree two.'),
  algebraIContent('A.10C', 10, 1, 'supporting', 'Determine polynomial quotients when the divisor degree does not exceed the dividend degree.'),
  algebraIContent('A.10D', 10, 1, 'supporting', 'Rewrite polynomial expressions using the distributive property.'),
  algebraIContent('A.10E', 10, 1, 'readiness', 'Factor trinomials with real factors, including perfect-square trinomials.'),
  algebraIContent('A.10F', 10, 1, 'supporting', 'Recognize and factor a difference of two squares.'),

  algebraIContent('A.11A', 11, 1, 'supporting', 'Simplify numerical radical expressions involving square roots.'),
  algebraIContent('A.11B', 11, 1, 'readiness', 'Simplify numeric and algebraic expressions using laws of integral and rational exponents.'),

  algebraIContent('A.12A', 12, 1, 'supporting', 'Determine whether relations represented verbally, tabularly, graphically, or symbolically define a function.'),
  algebraIContent('A.12B', 12, 1, 'supporting', 'Evaluate functions written in function notation for values in their domains.'),
  algebraIContent('A.12C', 12, 1, 'supporting', 'Identify terms of arithmetic and geometric sequences represented recursively in function form.'),
  algebraIContent('A.12D', 12, 1, 'supporting', 'Write formulas for the nth term of arithmetic and geometric sequences from several terms.'),
  algebraIContent('A.12E', 12, 1, 'supporting', 'Solve mathematical and scientific formulas and literal equations for a specified variable.'),
];

const algebraIIProcess = (code, description) => ({
  code,
  courseId: 'algebra2',
  course: 'Algebra II',
  strand: 1,
  strandLabel: ALGEBRA_II_STRANDS[1],
  classification: 'process',
  reportingCategory: null,
  description,
});

const algebraIIContent = (code, strand, description) => ({
  code,
  courseId: 'algebra2',
  course: 'Algebra II',
  strand,
  strandLabel: ALGEBRA_II_STRANDS[strand],
  classification: 'content',
  reportingCategory: null,
  description,
});

// Algebra II TEKS in 19 TAC §111.40. Algebra II currently has no STAAR EOC
// blueprint, so MathMaster does not invent readiness/supporting labels for these standards.
export const ALGEBRA_II_TEKS = [
  algebraIIProcess('A2.1A', 'Apply mathematics to problems arising in everyday life, society, and the workplace.'),
  algebraIIProcess('A2.1B', 'Use a problem-solving model to analyze information, formulate a plan or strategy, determine a solution, justify the solution, and evaluate reasonableness.'),
  algebraIIProcess('A2.1C', 'Select appropriate tools and techniques, including technology, mental math, estimation, and number sense, to solve problems.'),
  algebraIIProcess('A2.1D', 'Communicate mathematical ideas, reasoning, and implications using multiple representations, including symbols, diagrams, graphs, and language.'),
  algebraIIProcess('A2.1E', 'Create and use representations to organize, record, and communicate mathematical ideas.'),
  algebraIIProcess('A2.1F', 'Analyze mathematical relationships to connect and communicate mathematical ideas.'),
  algebraIIProcess('A2.1G', 'Display, explain, and justify mathematical ideas and arguments using precise mathematical language in written or oral communication.'),

  algebraIIContent('A2.2A', 2, 'Graph square root, reciprocal, cubic, cube root, exponential, absolute value, and logarithmic parent functions and analyze applicable key attributes such as domain, range, intercepts, symmetries, asymptotic behavior, and extrema on an interval.'),
  algebraIIContent('A2.2B', 2, 'Graph and write the inverse of a function using inverse-function notation.'),
  algebraIIContent('A2.2C', 2, 'Describe and analyze relationships between functions and their inverses, including quadratic/square root and logarithmic/exponential pairs and required domain restrictions.'),
  algebraIIContent('A2.2D', 2, 'Use composition of functions, including necessary domain restrictions, to determine whether two functions are inverses.'),

  algebraIIContent('A2.3A', 3, 'Formulate systems of equations, including three linear equations in three variables and systems with one linear and one quadratic equation.'),
  algebraIIContent('A2.3B', 3, 'Solve systems of three linear equations in three variables using Gaussian elimination, technology with matrices, and substitution.'),
  algebraIIContent('A2.3C', 3, 'Solve algebraically systems of two equations in two variables consisting of one linear equation and one quadratic equation.'),
  algebraIIContent('A2.3D', 3, 'Determine the reasonableness of solutions to systems consisting of a linear equation and a quadratic equation in two variables.'),
  algebraIIContent('A2.3E', 3, 'Formulate systems of at least two linear inequalities in two variables.'),
  algebraIIContent('A2.3F', 3, 'Solve systems of two or more linear inequalities in two variables.'),
  algebraIIContent('A2.3G', 3, 'Determine possible solutions in the solution set of systems of two or more linear inequalities in two variables.'),

  algebraIIContent('A2.4A', 4, 'Write a quadratic function given three specified points in the plane.'),
  algebraIIContent('A2.4B', 4, 'Write the equation of a parabola using given attributes, including vertex, focus, directrix, axis of symmetry, and direction of opening.'),
  algebraIIContent('A2.4C', 4, 'Determine the effect on the graph of the square root parent function when it is vertically or horizontally scaled, reflected, or translated.'),
  algebraIIContent('A2.4D', 4, 'Transform a quadratic function from standard form to vertex form to identify its attributes.'),
  algebraIIContent('A2.4E', 4, 'Formulate quadratic and square root equations using technology from a table of data.'),
  algebraIIContent('A2.4F', 4, 'Solve quadratic and square root equations.'),
  algebraIIContent('A2.4G', 4, 'Identify extraneous solutions of square root equations.'),
  algebraIIContent('A2.4H', 4, 'Solve quadratic inequalities.'),

  algebraIIContent('A2.5A', 5, 'Determine effects on key attributes of exponential and logarithmic graphs when they are vertically scaled/reflected or translated.'),
  algebraIIContent('A2.5B', 5, 'Formulate exponential and logarithmic equations that model real-world situations, including exponential relationships written recursively.'),
  algebraIIContent('A2.5C', 5, 'Rewrite exponential equations as corresponding logarithmic equations and logarithmic equations as corresponding exponential equations.'),
  algebraIIContent('A2.5D', 5, 'Solve exponential equations of the form y = ab^x and single logarithmic equations having real solutions.'),
  algebraIIContent('A2.5E', 5, 'Determine the reasonableness of a solution to a logarithmic equation.'),

  algebraIIContent('A2.6A', 6, 'Analyze transformations of cubic and cube root parent functions for specified positive and negative real parameter values.'),
  algebraIIContent('A2.6B', 6, 'Solve cube root equations that have real roots.'),
  algebraIIContent('A2.6C', 6, 'Analyze transformations of the absolute value parent function for specified positive and negative real parameter values.'),
  algebraIIContent('A2.6D', 6, 'Formulate absolute value linear equations.'),
  algebraIIContent('A2.6E', 6, 'Solve absolute value linear equations.'),
  algebraIIContent('A2.6F', 6, 'Solve absolute value linear inequalities.'),
  algebraIIContent('A2.6G', 6, 'Analyze transformations of the reciprocal parent function for specified positive and negative real parameter values.'),
  algebraIIContent('A2.6H', 6, 'Formulate rational equations that model real-world situations.'),
  algebraIIContent('A2.6I', 6, 'Solve rational equations that have real solutions.'),
  algebraIIContent('A2.6J', 6, 'Determine the reasonableness of a solution to a rational equation.'),
  algebraIIContent('A2.6K', 6, 'Determine asymptotic restrictions on the domain of a rational function and represent domain and range using interval notation, inequalities, and set notation.'),
  algebraIIContent('A2.6L', 6, 'Formulate and solve equations involving inverse variation.'),

  algebraIIContent('A2.7A', 7, 'Add, subtract, and multiply complex numbers.'),
  algebraIIContent('A2.7B', 7, 'Add, subtract, and multiply polynomials.'),
  algebraIIContent('A2.7C', 7, 'Determine the quotient of a polynomial of degree three or four when divided by a polynomial of degree one or two.'),
  algebraIIContent('A2.7D', 7, 'Determine linear factors of polynomial functions of degree three and four using algebraic methods.'),
  algebraIIContent('A2.7E', 7, 'Determine linear and quadratic factors of polynomial expressions of degree three and four, including sums/differences of cubes and factoring by grouping.'),
  algebraIIContent('A2.7F', 7, 'Determine sums, differences, products, and quotients of rational expressions with integral exponents of degree one and two.'),
  algebraIIContent('A2.7G', 7, 'Rewrite radical expressions containing variables into equivalent forms.'),
  algebraIIContent('A2.7H', 7, 'Solve equations involving rational exponents.'),
  algebraIIContent('A2.7I', 7, 'Write the domain and range of a function in interval notation, inequalities, and set notation.'),

  algebraIIContent('A2.8A', 8, 'Analyze data to select the appropriate model from among linear, quadratic, and exponential models.'),
  algebraIIContent('A2.8B', 8, 'Use regression methods available through technology to write linear, quadratic, and exponential functions from a given set of data.'),
  algebraIIContent('A2.8C', 8, 'Predict, make decisions, and make critical judgments from data using linear, quadratic, and exponential models.'),
];

export const TEXAS_STANDARDS_BY_COURSE = {
  grade6: GRADE_6_TEKS,
  grade7: GRADE_7_TEKS,
  grade8: GRADE_8_TEKS,
  algebra1: ALGEBRA_I_TEKS,
  algebra2: ALGEBRA_II_TEKS,
};

export const TEXAS_MATH_ACTIVE_COURSES = TEXAS_MATH_COURSES.filter((course) => TEXAS_STANDARDS_BY_COURSE[course.id]?.length);
export const ALL_TEXAS_MATH_STANDARDS = Object.values(TEXAS_STANDARDS_BY_COURSE).flat();

const STANDARD_LOOKUP = new Map(ALL_TEXAS_MATH_STANDARDS.map((standard) => [standard.code, standard]));

export const normalizeTeksCode = (value) => {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';

  // Middle school: 6.6A, 7.7, 8.5I, and parenthesized forms such as 8.5(I).
  const middleSchool = raw.match(/^([6-8])\.?([0-9]{1,2})(?:\.?\(?([A-Z])\)?)?$/);
  if (middleSchool) return `${middleSchool[1]}.${Number(middleSchool[2])}${middleSchool[3] || ''}`;

  // Algebra II: A2.4F, A2.4(F), 2A.4F, 2A.4(F), A2.4.F.
  const algebraII = raw.match(/^(?:A2|2A)\.?([1-8])\.?\(?([A-Z])\)?$/);
  if (algebraII) return `A2.${Number(algebraII[1])}${algebraII[2]}`;

  // TEA Algebra I answer-key export format, e.g. A1.3.2.I -> A.2I.
  const assessedFormat = raw.match(/^A1\.([1-5])\.(\d{1,2})\.([A-Z])$/);
  if (assessedFormat) return `A.${Number(assessedFormat[2])}${assessedFormat[3]}`;

  // Algebra I: A.2A, A2A, A.2(A), A.2.A.
  const algebraI = raw.match(/^A\.?([0-9]{1,2})\.?\(?([A-Z])\)?$/);
  if (algebraI) return `A.${Number(algebraI[1])}${algebraI[2]}`;

  return raw;
};

export const getTexasStandard = (code) => STANDARD_LOOKUP.get(normalizeTeksCode(code)) || null;

export const getTexasStandards = (codes = []) => (Array.isArray(codes) ? codes : [codes])
  .map((code) => getTexasStandard(code))
  .filter(Boolean);

export const getTexasCourse = (courseId) => TEXAS_MATH_COURSES.find((course) => course.id === courseId) || null;

export const getTexasCoursePrerequisites = (courseId) => (getTexasCourse(courseId)?.prerequisiteCourseIds || []).map(getTexasCourse).filter(Boolean);

export const getTexasStandardsForCourse = (courseId) => TEXAS_STANDARDS_BY_COURSE[courseId] || [];

export const inferTexasCourseIdFromTeks = (code) => getTexasStandard(code)?.courseId || null;

export const getAlgebraITeksByClassification = (classification) => ALGEBRA_I_TEKS
  .filter((standard) => standard.classification === classification);

export const isKnownAlgebraITeks = (code) => getTexasStandard(code)?.courseId === 'algebra1';
export const isKnownAlgebraIITeks = (code) => getTexasStandard(code)?.courseId === 'algebra2';
export const isKnownMiddleSchoolTeks = (code) => ['grade6', 'grade7', 'grade8'].includes(getTexasStandard(code)?.courseId);
export const isKnownTexasMathTeks = (code) => Boolean(getTexasStandard(code));

// Vertical links are instructional connections, not a TEA claim that one standard
// is the exclusive prerequisite of another. They preserve the grade-level target
// while giving MathMaster a transparent route to prior-course support.
export const TEXAS_VERTICAL_ALIGNMENT = {
  // Algebra I <- Grade 8 foundations
  'A.2A': ['8.5G', '8.5H', '8.5I'],
  'A.2B': ['8.4A', '8.4C', '8.5I'],
  'A.2C': ['8.4C', '8.5A', '8.5B', '8.5I'],
  'A.2D': ['8.5A', '8.5E', '8.5F'],
  'A.2E': ['8.4A', '8.5I'],
  'A.2F': ['8.4A', '8.5I'],
  'A.2G': ['8.4A', '8.5I'],
  'A.2H': ['8.8A', '8.8C'],
  'A.2I': ['8.5I', '8.9'],
  'A.3A': ['8.4A', '8.4C'],
  'A.3B': ['8.4B', '8.4C'],
  'A.3C': ['8.4B', '8.4C', '8.5A', '8.5B', '8.5I'],
  'A.3D': ['8.8A', '8.8C'],
  'A.3E': ['8.5A', '8.5B', '8.10C'],
  'A.3F': ['8.5I', '8.9'],
  'A.3G': ['8.5I', '8.9'],
  'A.3H': ['8.8A', '8.8C'],
  'A.4A': ['8.11A'],
  'A.4B': ['8.11A'],
  'A.4C': ['8.5C', '8.5D', '8.11A'],
  'A.5A': ['8.8A', '8.8C'],
  'A.5B': ['8.8A', '8.8C'],
  'A.5C': ['8.5I', '8.9'],
  'A.6A': ['8.5G', '8.5H'],
  'A.6B': ['8.5G', '8.8C'],
  'A.6C': ['8.5G', '8.8C'],
  'A.7A': ['8.5G', '8.5I'],
  'A.7B': ['8.7C', '8.8C'],
  'A.7C': ['8.10A', '8.10C'],
  'A.8A': ['8.2B', '8.8C'],
  'A.8B': ['8.5C', '8.5D', '8.11A'],
  'A.9A': ['8.5G', '8.5H'],
  'A.9B': ['8.5H', '8.12C', '8.12D'],
  'A.9C': ['8.5G', '8.5H', '8.12C', '8.12D'],
  'A.9D': ['8.5G', '8.5H'],
  'A.9E': ['8.5C', '8.5D', '8.11A'],
  'A.10A': ['7.3A', '7.3B', '7.7'],
  'A.10B': ['7.3A', '7.3B', '7.7'],
  'A.10C': ['7.3A', '7.3B', '7.7'],
  'A.10D': ['7.7', '7.11A'],
  'A.10E': ['7.7', '7.11A'],
  'A.10F': ['7.7', '7.11A'],
  'A.11A': ['8.2B', '7.3A'],
  'A.11B': ['6.7A', '6.7D', '8.2C'],
  'A.12A': ['8.5G', '8.5H', '8.5I'],
  'A.12B': ['8.5G', '8.5I'],
  'A.12C': ['8.5G', '8.12C', '8.12D'],
  'A.12D': ['8.5G', '8.12C', '8.12D'],
  'A.12E': ['8.5G', '8.5H'],

  // Grade 8 <- Grade 7 foundations (selected high-leverage vertical links)
  '8.2A': ['7.2'],
  '8.2D': ['7.2', '7.3A'],
  '8.4A': ['7.4A', '7.4B', '7.4C', '7.7'],
  '8.4B': ['7.4A', '7.4B', '7.4C', '7.7'],
  '8.4C': ['7.4A', '7.4B', '7.4C', '7.7'],
  '8.5A': ['7.4A', '7.4C', '7.7'],
  '8.5B': ['7.7'],
  '8.5E': ['7.4A', '7.4B', '7.4C'],
  '8.5F': ['7.4A', '7.4C', '7.7'],
  '8.5G': ['7.7'],
  '8.5H': ['7.7'],
  '8.5I': ['7.4A', '7.7'],
  '8.8A': ['7.10A', '7.10B', '7.11A'],
  '8.8C': ['7.11A', '7.11B'],
  '8.9': ['7.7', '7.11A'],
  '8.11A': ['7.12A', '7.12B', '7.12C'],
  '8.12C': ['7.13E'],
  '8.12D': ['7.13E'],

  // Grade 7 <- Grade 6 foundations (selected high-leverage vertical links)
  '7.2': ['6.2A', '6.2C', '6.2D'],
  '7.3A': ['6.3D', '6.3E'],
  '7.3B': ['6.3A', '6.3D', '6.3E'],
  '7.4A': ['6.4B', '6.4D', '6.5A', '6.6C'],
  '7.4B': ['6.4B', '6.4D', '6.5A'],
  '7.4C': ['6.4C', '6.4D', '6.5A'],
  '7.7': ['6.6A', '6.6B', '6.6C'],
  '7.10A': ['6.9A', '6.9C'],
  '7.10B': ['6.9B'],
  '7.11A': ['6.10A', '6.10B'],
  '7.11B': ['6.10B'],
  '7.12A': ['6.12A', '6.12B', '6.12C'],
  '7.12B': ['6.13A', '6.13B'],
  '7.12C': ['6.12A', '6.13A'],
  '7.13E': ['6.5B', '6.14D'],

  'A2.2A': ['A.3C', 'A.6A', 'A.7A', 'A.9A', 'A.9D', 'A.12A', 'A.12B'],
  'A2.2B': ['A.12A', 'A.12B', 'A.3C', 'A.7A'],
  'A2.2C': ['A.6A', 'A.7A', 'A.9A', 'A.9D', 'A.12A'],
  'A2.2D': ['A.12A', 'A.12B'],
  'A2.3A': ['A.2I', 'A.5C'],
  'A2.3B': ['A.5C'],
  'A2.3C': ['A.5C', 'A.7A', 'A.8A'],
  'A2.3D': ['A.5C', 'A.7A', 'A.8A'],
  'A2.3E': ['A.2H', 'A.3D', 'A.3H'],
  'A2.3F': ['A.3D', 'A.3H'],
  'A2.3G': ['A.3D', 'A.3H'],
  'A2.4A': ['A.6B', 'A.6C', 'A.7A'],
  'A2.4B': ['A.6B', 'A.7A'],
  'A2.4C': ['A.7C', 'A.11B'],
  'A2.4D': ['A.6B', 'A.7A', 'A.8A'],
  'A2.4E': ['A.8B', 'A.4C'],
  'A2.4F': ['A.8A', 'A.10E', 'A.11A', 'A.11B'],
  'A2.4G': ['A.8A', 'A.11A'],
  'A2.4H': ['A.5B', 'A.7A', 'A.8A'],
  'A2.5A': ['A.9A', 'A.9D'],
  'A2.5B': ['A.9B', 'A.9C', 'A.12C', 'A.12D'],
  'A2.5C': ['A.9C', 'A.9D', 'A.11B'],
  'A2.5D': ['A.9C', 'A.11B'],
  'A2.5E': ['A.9C', 'A.11B'],
  'A2.6A': ['A.7C', 'A.11B', 'A.12A'],
  'A2.6B': ['A.11A', 'A.11B'],
  'A2.6C': ['A.3E', 'A.7C'],
  'A2.6D': ['A.2C', 'A.5A'],
  'A2.6E': ['A.5A'],
  'A2.6F': ['A.5B'],
  'A2.6G': ['A.7C', 'A.12A'],
  'A2.6H': ['A.2D', 'A.12E'],
  'A2.6I': ['A.5A', 'A.10E', 'A.10F', 'A.12E'],
  'A2.6J': ['A.5A', 'A.12E'],
  'A2.6K': ['A.2A', 'A.6A', 'A.9A', 'A.12A'],
  'A2.6L': ['A.2D'],
  'A2.7A': ['A.11A', 'A.11B'],
  'A2.7B': ['A.10A', 'A.10B', 'A.10D'],
  'A2.7C': ['A.10C', 'A.10D'],
  'A2.7D': ['A.7B', 'A.10E', 'A.10F'],
  'A2.7E': ['A.7B', 'A.10E', 'A.10F'],
  'A2.7F': ['A.10A', 'A.10B', 'A.10C', 'A.10D'],
  'A2.7G': ['A.11A', 'A.11B'],
  'A2.7H': ['A.11B'],
  'A2.7I': ['A.2A', 'A.6A', 'A.9A', 'A.12A'],
  'A2.8A': ['A.4A', 'A.4B', 'A.4C', 'A.8B', 'A.9E'],
  'A2.8B': ['A.4A', 'A.4C', 'A.8B', 'A.9E'],
  'A2.8C': ['A.4B', 'A.4C', 'A.8B', 'A.9E'],
};

const buildReverseVerticalAlignment = () => {
  const reverse = {};
  Object.entries(TEXAS_VERTICAL_ALIGNMENT).forEach(([nextCode, priorCodes]) => {
    priorCodes.forEach((priorCode) => {
      if (!reverse[priorCode]) reverse[priorCode] = [];
      if (!reverse[priorCode].includes(nextCode)) reverse[priorCode].push(nextCode);
    });
  });
  return reverse;
};

export const TEXAS_VERTICAL_ALIGNMENT_NEXT = buildReverseVerticalAlignment();

export const getTexasVerticalAlignment = (code) => {
  const normalized = normalizeTeksCode(code);
  const current = getTexasStandard(normalized);
  return {
    current,
    prior: (TEXAS_VERTICAL_ALIGNMENT[normalized] || []).map(getTexasStandard).filter(Boolean),
    next: (TEXAS_VERTICAL_ALIGNMENT_NEXT[normalized] || []).map(getTexasStandard).filter(Boolean),
  };
};

export const getTexasVerticalPath = (code, { direction = 'prior', maxDepth = 3 } = {}) => {
  const start = getTexasStandard(code);
  if (!start) return [];
  const visited = new Set([start.code]);
  const levels = [{ depth: 0, courseId: start.courseId, standards: [start] }];
  let frontier = [start];
  for (let depth = 1; depth <= Math.max(0, Number(maxDepth) || 0); depth += 1) {
    const next = [];
    frontier.forEach((standard) => {
      const linked = getTexasVerticalAlignment(standard.code)[direction] || [];
      linked.forEach((item) => {
        if (visited.has(item.code)) return;
        visited.add(item.code);
        next.push(item);
      });
    });
    if (!next.length) break;
    const byCourse = new Map();
    next.forEach((standard) => {
      if (!byCourse.has(standard.courseId)) byCourse.set(standard.courseId, []);
      byCourse.get(standard.courseId).push(standard);
    });
    byCourse.forEach((standards, courseId) => levels.push({ depth, courseId, standards }));
    frontier = next;
  }
  return levels;
};

export const getCoursePathwayNeighbors = (courseId) => {
  const current = getTexasCourse(courseId);
  if (!current) return { previous: null, current: null, next: null };
  const ordered = [...TEXAS_MATH_COURSES].sort((a, b) => a.order - b.order);
  const index = ordered.findIndex((course) => course.id === courseId);
  return {
    previous: index > 0 ? ordered[index - 1] : null,
    current,
    next: index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null,
  };
};

export const TEXAS_STANDARDS_FRAMEWORK = {
  state: 'TX',
  standardsName: 'TEKS',
  defaultCourseId: 'algebra1',
  activeCourseIds: TEXAS_MATH_ACTIVE_COURSES.map((course) => course.id),
  courses: {
    grade6: { rule: '19 TAC §111.26', expectationCount: 59, processCount: 7, contentCount: 52 },
    grade7: { rule: '19 TAC §111.27', expectationCount: 50, processCount: 7, contentCount: 43 },
    grade8: { rule: '19 TAC §111.28', expectationCount: 52, processCount: 7, contentCount: 45 },
    algebra1: {
      rule: '19 TAC §111.39',
      stateAssessmentBlueprint: 'STAAR Algebra I',
      readinessCount: 16,
      supportingCount: 33,
      processCount: 7,
    },
    algebra2: {
      rule: '19 TAC §111.40',
      stateAssessmentBlueprint: null,
      contentCount: 48,
      processCount: 7,
      note: 'Algebra II is tracked as course TEKS. MathMaster does not assign Algebra I STAAR readiness/supporting labels to Algebra II standards.',
    },
  },
  note: 'MathMaster performance levels are instructional estimates, not official STAAR classifications or scale scores.',
};
