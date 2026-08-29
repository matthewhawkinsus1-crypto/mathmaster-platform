import { getTexasStandard, normalizeTeksCode } from '../../texasStandards.js';
import { teksCodeFromSkillId } from '../path/skillGraph.js';
import { EXAM_TYPES } from '../assessment/examDomainRegistry.js';
import { FRAMEWORK_LABELS, getSkillCrosswalk } from './assessmentCrosswalk.js';

// Official assessment-reference layer for CCMR.
//
// IMPORTANT: not every assessment publishes TEKS-like numbered standards.
// - ACT publishes numbered College & Career Readiness Standards (A 403, F 502, ...).
// - Digital SAT publishes official Math domains and skill names, not numbered standards.
// - TSIA2 publishes four strands and official item-content statements, not numbered standards.
// - ASVAB publishes official subtest codes (AR/MK), not a numbered mathematics-standards list.
//
// MathMaster therefore preserves the official identifier each framework actually uses instead
// of inventing fake standard numbers just to make the four assessments look alike.

export const REFERENCE_PRECISION = Object.freeze({
  STANDARD: 'standard',
  SKILL: 'skill',
  STRAND: 'strand',
  SUBTEST: 'subtest',
  DOMAIN: 'domain',
});

const SOURCES = Object.freeze({
  digitalSAT: Object.freeze({
    label: 'College Board SAT Math content domains and skills',
    url: 'https://satsuite.collegeboard.org/practice/content-domains',
  }),
  act: Object.freeze({
    label: 'ACT Mathematics College & Career Readiness Standards',
    url: 'https://www.act.org/content/act/en/college-and-career-readiness/standards/mathematics-standards.html',
  }),
  tsia2: Object.freeze({
    label: 'College Board TSIA2 Mathematics Test Specifications',
    url: 'https://accuplacer.collegeboard.org/accuplacer/pdf/tsia2-mathematics-test-specifications.pdf',
  }),
  asvab: Object.freeze({
    label: 'Official ASVAB subtests',
    url: 'https://www.officialasvab.com/applicants/subtests/',
  }),
});

const ref = ({ framework, id, code = null, title, descriptor, domainId = null, domainTitle = null, precision, scoreRange = null, topic = null }) => Object.freeze({
  framework,
  id,
  officialCode: code,
  title,
  descriptor,
  domainId,
  domainTitle,
  precision,
  scoreRange,
  topic,
  sourceLabel: SOURCES[framework]?.label || '',
  sourceUrl: SOURCES[framework]?.url || '',
});

// Digital SAT: College Board's current official skill names. There are no public
// TEKS-like numbers for these skills, so officialCode intentionally remains null.
export const DIGITAL_SAT_REFERENCES = Object.freeze({
  'sat-alg-linear-equations-1': ref({ framework: 'digitalSAT', id: 'sat-alg-linear-equations-1', title: 'Linear equations in one variable', descriptor: 'Analyze, solve, and create linear equations in one variable.', domainId: 'algebra', domainTitle: 'Algebra', precision: REFERENCE_PRECISION.SKILL }),
  'sat-alg-linear-functions': ref({ framework: 'digitalSAT', id: 'sat-alg-linear-functions', title: 'Linear functions', descriptor: 'Interpret, represent, and reason about linear functions.', domainId: 'algebra', domainTitle: 'Algebra', precision: REFERENCE_PRECISION.SKILL }),
  'sat-alg-linear-equations-2': ref({ framework: 'digitalSAT', id: 'sat-alg-linear-equations-2', title: 'Linear equations in two variables', descriptor: 'Interpret, create, and use linear equations in two variables.', domainId: 'algebra', domainTitle: 'Algebra', precision: REFERENCE_PRECISION.SKILL }),
  'sat-alg-systems': ref({ framework: 'digitalSAT', id: 'sat-alg-systems', title: 'Systems of two linear equations in two variables', descriptor: 'Solve and interpret systems of two linear equations.', domainId: 'algebra', domainTitle: 'Algebra', precision: REFERENCE_PRECISION.SKILL }),
  'sat-alg-inequalities': ref({ framework: 'digitalSAT', id: 'sat-alg-inequalities', title: 'Linear inequalities in one or two variables', descriptor: 'Interpret, solve, and represent linear inequalities.', domainId: 'algebra', domainTitle: 'Algebra', precision: REFERENCE_PRECISION.SKILL }),
  'sat-adv-equivalent': ref({ framework: 'digitalSAT', id: 'sat-adv-equivalent', title: 'Equivalent expressions', descriptor: 'Rewrite and use structure in nonlinear expressions.', domainId: 'advancedMath', domainTitle: 'Advanced Math', precision: REFERENCE_PRECISION.SKILL }),
  'sat-adv-nonlinear-equations': ref({ framework: 'digitalSAT', id: 'sat-adv-nonlinear-equations', title: 'Nonlinear equations in one variable', descriptor: 'Solve and interpret quadratic, exponential, polynomial, rational, radical, absolute-value, and other nonlinear equations.', domainId: 'advancedMath', domainTitle: 'Advanced Math', precision: REFERENCE_PRECISION.SKILL }),
  'sat-adv-systems': ref({ framework: 'digitalSAT', id: 'sat-adv-systems', title: 'Systems of equations in two variables', descriptor: 'Solve systems that include nonlinear relationships.', domainId: 'advancedMath', domainTitle: 'Advanced Math', precision: REFERENCE_PRECISION.SKILL }),
  'sat-adv-nonlinear-functions': ref({ framework: 'digitalSAT', id: 'sat-adv-nonlinear-functions', title: 'Nonlinear functions', descriptor: 'Interpret, represent, and reason about quadratic, exponential, polynomial, rational, radical, absolute-value, and other nonlinear functions.', domainId: 'advancedMath', domainTitle: 'Advanced Math', precision: REFERENCE_PRECISION.SKILL }),
  'sat-psd-ratios': ref({ framework: 'digitalSAT', id: 'sat-psd-ratios', title: 'Ratios, rates, proportional relationships, and units', descriptor: 'Apply quantitative reasoning with ratios, rates, proportional relationships, unit rates, and unit conversions.', domainId: 'problemSolvingData', domainTitle: 'Problem-Solving and Data Analysis', precision: REFERENCE_PRECISION.SKILL }),
  'sat-psd-percent': ref({ framework: 'digitalSAT', id: 'sat-psd-percent', title: 'Percentages', descriptor: 'Solve and interpret percentage problems in mathematical and contextual settings.', domainId: 'problemSolvingData', domainTitle: 'Problem-Solving and Data Analysis', precision: REFERENCE_PRECISION.SKILL }),
  'sat-psd-one-variable-data': ref({ framework: 'digitalSAT', id: 'sat-psd-one-variable-data', title: 'One-variable data: Distributions and measures of center and spread', descriptor: 'Analyze distributions and measures of center and spread for one-variable data.', domainId: 'problemSolvingData', domainTitle: 'Problem-Solving and Data Analysis', precision: REFERENCE_PRECISION.SKILL }),
  'sat-psd-two-variable-data': ref({ framework: 'digitalSAT', id: 'sat-psd-two-variable-data', title: 'Two-variable data: Models and scatterplots', descriptor: 'Analyze relationships, models, and scatterplots for two-variable data.', domainId: 'problemSolvingData', domainTitle: 'Problem-Solving and Data Analysis', precision: REFERENCE_PRECISION.SKILL }),
  'sat-psd-probability': ref({ framework: 'digitalSAT', id: 'sat-psd-probability', title: 'Probability and conditional probability', descriptor: 'Compute and interpret probability, including conditional probability.', domainId: 'problemSolvingData', domainTitle: 'Problem-Solving and Data Analysis', precision: REFERENCE_PRECISION.SKILL }),
  'sat-psd-inference': ref({ framework: 'digitalSAT', id: 'sat-psd-inference', title: 'Inference from sample statistics and margin of error', descriptor: 'Use sample statistics and margin of error to make inferences.', domainId: 'problemSolvingData', domainTitle: 'Problem-Solving and Data Analysis', precision: REFERENCE_PRECISION.SKILL }),
  'sat-psd-claims': ref({ framework: 'digitalSAT', id: 'sat-psd-claims', title: 'Evaluating statistical claims: Observational studies and experiments', descriptor: 'Evaluate conclusions and claims from observational studies and experiments.', domainId: 'problemSolvingData', domainTitle: 'Problem-Solving and Data Analysis', precision: REFERENCE_PRECISION.SKILL }),
  'sat-geo-area-volume': ref({ framework: 'digitalSAT', id: 'sat-geo-area-volume', title: 'Area and volume', descriptor: 'Solve problems involving area, surface area, and volume.', domainId: 'geometryTrigonometry', domainTitle: 'Geometry and Trigonometry', precision: REFERENCE_PRECISION.SKILL }),
  'sat-geo-lines-angles-triangles': ref({ framework: 'digitalSAT', id: 'sat-geo-lines-angles-triangles', title: 'Lines, angles, and triangles', descriptor: 'Use properties of lines, angles, triangles, similarity, and related geometric relationships.', domainId: 'geometryTrigonometry', domainTitle: 'Geometry and Trigonometry', precision: REFERENCE_PRECISION.SKILL }),
  'sat-geo-right-trig': ref({ framework: 'digitalSAT', id: 'sat-geo-right-trig', title: 'Right triangles and trigonometry', descriptor: 'Apply right-triangle relationships and trigonometric ratios.', domainId: 'geometryTrigonometry', domainTitle: 'Geometry and Trigonometry', precision: REFERENCE_PRECISION.SKILL }),
  'sat-geo-circles': ref({ framework: 'digitalSAT', id: 'sat-geo-circles', title: 'Circles', descriptor: 'Solve problems involving circles and their properties.', domainId: 'geometryTrigonometry', domainTitle: 'Geometry and Trigonometry', precision: REFERENCE_PRECISION.SKILL }),
});

// TSIA2: official item-content statements from the Mathematics Test Specifications.
export const TSIA2_REFERENCES = Object.freeze({
  'tsi-qr-magnitudes': ref({ framework: 'tsia2', id: 'tsi-qr-magnitudes', title: 'Compare magnitudes of rational and irrational numbers', descriptor: 'Compare and reason about rational and irrational quantities.', domainId: 'quantitativeReasoning', domainTitle: 'Quantitative Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-qr-ratios': ref({ framework: 'tsia2', id: 'tsi-qr-ratios', title: 'Solve problems with ratios, proportions, and percents', descriptor: 'Use ratios, proportions, and percents to solve quantitative problems.', domainId: 'quantitativeReasoning', domainTitle: 'Quantitative Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-qr-proportional-context': ref({ framework: 'tsia2', id: 'tsi-qr-proportional-context', title: 'Solve proportional relationship problems in context', descriptor: 'Apply proportional and linear relationships in financial literacy and numeracy contexts.', domainId: 'quantitativeReasoning', domainTitle: 'Quantitative Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-qr-linear': ref({ framework: 'tsia2', id: 'tsi-qr-linear', title: 'Identify, manipulate, and interpret linear equations, inequalities, and expressions', descriptor: 'Work with linear expressions, equations, and inequalities.', domainId: 'quantitativeReasoning', domainTitle: 'Quantitative Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ar-linear-systems': ref({ framework: 'tsia2', id: 'tsi-ar-linear-systems', title: 'Solve linear equations, inequalities, and systems of linear equations', descriptor: 'Solve linear equations and inequalities and systems of linear equations.', domainId: 'algebraicReasoning', domainTitle: 'Algebraic Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ar-linear-functions': ref({ framework: 'tsia2', id: 'tsi-ar-linear-functions', title: 'Evaluate linear functions', descriptor: 'Evaluate linear functions and interpret their values.', domainId: 'algebraicReasoning', domainTitle: 'Algebraic Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ar-context': ref({ framework: 'tsia2', id: 'tsi-ar-context', title: 'Solve quadratic and exponential relationship problems in context', descriptor: 'Solve contextual problems involving quadratic and exponential relationships, including growth and decay.', domainId: 'algebraicReasoning', domainTitle: 'Algebraic Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ar-manipulate': ref({ framework: 'tsia2', id: 'tsi-ar-manipulate', title: 'Identify and manipulate quadratic, polynomial, exponential, rational, and radical equations and expressions', descriptor: 'Recognize, rewrite, and manipulate common nonlinear equations and expressions.', domainId: 'algebraicReasoning', domainTitle: 'Algebraic Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ar-solve-functions': ref({ framework: 'tsia2', id: 'tsi-ar-solve-functions', title: 'Solve equations and evaluate functions', descriptor: 'Solve and evaluate quadratic, polynomial, exponential, rational, and radical equations and functions.', domainId: 'algebraicReasoning', domainTitle: 'Algebraic Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-gs-units': ref({ framework: 'tsia2', id: 'tsi-gs-units', title: 'Convert units within systems of measurement', descriptor: 'Convert measurements within a system of units.', domainId: 'geometricSpatial', domainTitle: 'Geometric and Spatial Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-gs-measure': ref({ framework: 'tsia2', id: 'tsi-gs-measure', title: 'Find perimeter, area, surface area and volume', descriptor: 'Find perimeter, area, surface area, and volume using exact or estimated methods.', domainId: 'geometricSpatial', domainTitle: 'Geometric and Spatial Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-gs-transform': ref({ framework: 'tsia2', id: 'tsi-gs-transform', title: 'Use transformations to investigate congruence, similarity, and symmetry', descriptor: 'Use geometric transformations to reason about congruence, similarity, and symmetry.', domainId: 'geometricSpatial', domainTitle: 'Geometric and Spatial Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-gs-trig': ref({ framework: 'tsia2', id: 'tsi-gs-trig', title: 'Apply right triangle relationships and basic trigonometry', descriptor: 'Use right-triangle relationships and basic trigonometry.', domainId: 'geometricSpatial', domainTitle: 'Geometric and Spatial Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-gs-algebra': ref({ framework: 'tsia2', id: 'tsi-gs-algebra', title: 'Make connections between geometry and algebraic equations', descriptor: 'Connect geometric relationships to algebraic equations.', domainId: 'geometricSpatial', domainTitle: 'Geometric and Spatial Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ps-probability': ref({ framework: 'tsia2', id: 'tsi-ps-probability', title: 'Compute and interpret probability', descriptor: 'Compute and interpret probabilities.', domainId: 'probabilisticStatistical', domainTitle: 'Probabilistic and Statistical Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ps-center-spread': ref({ framework: 'tsia2', id: 'tsi-ps-center-spread', title: 'Compute and describe measures of center and spread of data', descriptor: 'Compute and interpret measures of center and spread.', domainId: 'probabilisticStatistical', domainTitle: 'Probabilistic and Statistical Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ps-represent': ref({ framework: 'tsia2', id: 'tsi-ps-represent', title: 'Classify data and construct appropriate representations of data', descriptor: 'Classify data and choose or construct appropriate representations.', domainId: 'probabilisticStatistical', domainTitle: 'Probabilistic and Statistical Reasoning', precision: REFERENCE_PRECISION.SKILL }),
  'tsi-ps-analyze': ref({ framework: 'tsia2', id: 'tsi-ps-analyze', title: 'Analyze, interpret, and draw conclusions from data', descriptor: 'Analyze data and draw supported conclusions.', domainId: 'probabilisticStatistical', domainTitle: 'Probabilistic and Statistical Reasoning', precision: REFERENCE_PRECISION.SKILL }),
});

// ACT CCRS references used by the MathMaster matcher. These are official ACT
// codes, score bands, and descriptors. A TEKS can match more than one.
const act = (code, scoreRange, title, domainTitle) => ref({ framework: 'act', id: `act-${code.replace(/\s+/g, '-').toLowerCase()}`, code, title, descriptor: title, domainTitle, precision: REFERENCE_PRECISION.STANDARD, scoreRange });
export const ACT_REFERENCES = Object.freeze({
  'AF 201': act('AF 201', '13-15', 'Solve problems in one or two steps using whole numbers and decimals in the context of money', 'Algebra / Functions'),
  'A 201': act('A 201', '13-15', 'Exhibit knowledge of basic expressions', 'Algebra'),
  'A 202': act('A 202', '13-15', 'Solve equations in the form x + a = b', 'Algebra'),
  'F 201': act('F 201', '13-15', 'Extend a pattern with a constant increase or decrease', 'Functions'),
  'AF 301': act('AF 301', '16-19', 'Solve routine one-step arithmetic problems using positive rational numbers, including percent', 'Algebra / Functions'),
  'AF 302': act('AF 302', '16-19', 'Solve routine two-step arithmetic problems', 'Algebra / Functions'),
  'AF 303': act('AF 303', '16-19', 'Relate a graph to a qualitatively described situation', 'Algebra / Functions'),
  'A 301': act('A 301', '16-19', 'Substitute whole numbers for unknown quantities to evaluate expressions', 'Algebra'),
  'A 302': act('A 302', '16-19', 'Solve one-step equations', 'Algebra'),
  'A 303': act('A 303', '16-19', 'Combine like terms', 'Algebra'),
  'F 301': act('F 301', '16-19', 'Extend a pattern with a constant factor', 'Functions'),
  'AF 401': act('AF 401', '20-23', 'Solve routine two- or three-step arithmetic problems involving rate, proportion, percent, or averages', 'Algebra / Functions'),
  'AF 402': act('AF 402', '20-23', 'Perform straightforward word-to-symbol translations', 'Algebra / Functions'),
  'AF 403': act('AF 403', '20-23', 'Relate a graph to a situation with a starting value and amount per unit', 'Algebra / Functions'),
  'A 401': act('A 401', '20-23', 'Evaluate algebraic expressions by substitution', 'Algebra'),
  'A 402': act('A 402', '20-23', 'Add and subtract simple algebraic expressions', 'Algebra'),
  'A 403': act('A 403', '20-23', 'Solve routine first-degree equations', 'Algebra'),
  'A 404': act('A 404', '20-23', 'Multiply two binomials', 'Algebra'),
  'A 405': act('A 405', '20-23', 'Match simple inequalities with number-line graphs', 'Algebra'),
  'A 406': act('A 406', '20-23', 'Exhibit knowledge of slope', 'Algebra'),
  'F 401': act('F 401', '20-23', 'Evaluate linear and quadratic functions in function notation at integer values', 'Functions'),
  'AF 501': act('AF 501', '24-27', 'Solve multistep arithmetic problems involving planning or derived-unit conversions', 'Algebra / Functions'),
  'AF 502': act('AF 502', '24-27', 'Build functions and write expressions, equations, or inequalities for common pre-algebra settings', 'Algebra / Functions'),
  'AF 503': act('AF 503', '24-27', 'Match linear equations with graphs in the coordinate plane', 'Algebra / Functions'),
  'A 502': act('A 502', '24-27', 'Solve real-world problems using first-degree equations', 'Algebra'),
  'A 503': act('A 503', '24-27', 'Solve first-degree inequalities without reversing the inequality sign', 'Algebra'),
  'A 504': act('A 504', '24-27', 'Match compound inequalities with number-line graphs', 'Algebra'),
  'A 505': act('A 505', '24-27', 'Add, subtract, and multiply polynomials', 'Algebra'),
  'A 506': act('A 506', '24-27', 'Identify solutions to simple quadratic equations', 'Algebra'),
  'A 507': act('A 507', '24-27', 'Solve quadratic equations in factored form', 'Algebra'),
  'A 508': act('A 508', '24-27', 'Factor simple quadratics', 'Algebra'),
  'A 509': act('A 509', '24-27', 'Work with squares and square roots', 'Algebra'),
  'A 510': act('A 510', '24-27', 'Work with cubes and cube roots', 'Algebra'),
  'A 511': act('A 511', '24-27', 'Work with scientific notation', 'Algebra'),
  'A 512': act('A 512', '24-27', 'Work problems involving positive integer exponents', 'Algebra'),
  'A 513': act('A 513', '24-27', 'Determine when an expression is undefined', 'Algebra'),
  'A 514': act('A 514', '24-27', 'Determine the slope of a line from an equation', 'Algebra'),
  'F 501': act('F 501', '24-27', 'Evaluate polynomial functions in function notation at integer values', 'Functions'),
  'F 502': act('F 502', '24-27', 'Find the next term in a recursively described sequence', 'Functions'),
  'F 503': act('F 503', '24-27', 'Build functions and identify graphs for proportional or linear relations', 'Functions'),
  'F 504': act('F 504', '24-27', 'Distinguish a modeling function from the reality it models', 'Functions'),
  'F 505': act('F 505', '24-27', 'Understand a function as having one well-defined output for each valid input', 'Functions'),
  'F 506': act('F 506', '24-27', 'Understand domain and range in terms of valid inputs, outputs, and graphs', 'Functions'),
  'F 507': act('F 507', '24-27', 'Interpret statements that use function notation in context', 'Functions'),
  'F 508': act('F 508', '24-27', 'Find the domain of polynomial and rational functions', 'Functions'),
  'F 509': act('F 509', '24-27', 'Find the range of polynomial functions', 'Functions'),
  'F 510': act('F 510', '24-27', 'Find where a rational function has a vertical asymptote', 'Functions'),
  'AF 601': act('AF 601', '28-32', 'Solve word problems containing several rates, proportions, or percentages', 'Algebra / Functions'),
  'AF 602': act('AF 602', '28-32', 'Build functions and write expressions, equations, and inequalities for common algebra settings', 'Algebra / Functions'),
  'AF 603': act('AF 603', '28-32', 'Interpret and use information from graphs in the coordinate plane', 'Algebra / Functions'),
  'AF 604': act('AF 604', '28-32', 'Translate a graph vertically by changing an equation or function', 'Algebra / Functions'),
  'A 601': act('A 601', '28-32', 'Manipulate expressions and equations', 'Algebra'),
  'A 602': act('A 602', '28-32', 'Solve linear inequalities when reversing the inequality sign is required', 'Algebra'),
  'A 603': act('A 603', '28-32', 'Match linear inequalities with number-line graphs', 'Algebra'),
  'A 604': act('A 604', '28-32', 'Solve systems of two linear equations', 'Algebra'),
  'A 605': act('A 605', '28-32', 'Solve quadratic equations', 'Algebra'),
  'A 606': act('A 606', '28-32', 'Solve absolute value equations', 'Algebra'),
  'F 601': act('F 601', '28-32', 'Relate a graph to a situation in terms of faster or slower change', 'Functions'),
  'F 602': act('F 602', '28-32', 'Build functions for inversely proportional relations', 'Functions'),
  'F 603': act('F 603', '28-32', 'Find a recursive expression for the general term of a recursively described sequence', 'Functions'),
  'F 604': act('F 604', '28-32', 'Evaluate composite functions at integer values', 'Functions'),
  'AF 701': act('AF 701', '33-36', 'Solve complex arithmetic problems involving percent, ratios, or averages', 'Algebra / Functions'),
  'AF 702': act('AF 702', '33-36', 'Build functions and expressions, equations, and inequalities requiring strategic manipulation', 'Algebra / Functions'),
  'AF 703': act('AF 703', '33-36', 'Analyze and draw conclusions from properties of algebra and functions', 'Algebra / Functions'),
  'AF 704': act('AF 704', '33-36', 'Analyze and draw conclusions from coordinate-plane graphs', 'Algebra / Functions'),
  'AF 705': act('AF 705', '33-36', 'Identify characteristics of graphs from conditions or a general equation', 'Algebra / Functions'),
  'AF 706': act('AF 706', '33-36', 'Translate a graph horizontally and vertically by changing an equation or function', 'Algebra / Functions'),
  'A 701': act('A 701', '33-36', 'Solve simple absolute value inequalities', 'Algebra'),
  'A 702': act('A 702', '33-36', 'Match simple quadratic inequalities with number-line graphs', 'Algebra'),
  'A 703': act('A 703', '33-36', 'Apply the remainder theorem for polynomials', 'Algebra'),
  'F 701': act('F 701', '33-36', 'Compare model values with actual values to judge model fit and compare models', 'Functions'),
  'F 702': act('F 702', '33-36', 'Build functions for exponential relations', 'Functions'),
  'F 703': act('F 703', '33-36', 'Exhibit knowledge of geometric sequences', 'Functions'),
  'F 707': act('F 707', '33-36', 'Exhibit knowledge of logarithms', 'Functions'),
  'F 708': act('F 708', '33-36', 'Write an expression for the composite of two simple functions', 'Functions'),
  'G 403': act('G 403', '20-23', 'Compute area and perimeter of triangles and rectangles in simple problems', 'Geometry'),
  'G 404': act('G 404', '20-23', 'Find a right-triangle hypotenuse in very simple cases', 'Geometry'),
  'G 405': act('G 405', '20-23', 'Use geometric formulas when necessary information is given', 'Geometry'),
  'G 406': act('G 406', '20-23', 'Locate points in the coordinate plane', 'Geometry'),
  'G 407': act('G 407', '20-23', 'Translate points in the coordinate plane', 'Geometry'),
  'G 507': act('G 507', '24-27', 'Compute area and circumference of circles', 'Geometry'),
  'G 509': act('G 509', '24-27', 'Express sine, cosine, and tangent as right-triangle ratios', 'Geometry'),
  'G 510': act('G 510', '24-27', 'Determine slope from points or a graph', 'Geometry'),
  'G 512': act('G 512', '24-27', 'Rotate a point 180 degrees around a center', 'Geometry'),
  'G 601': act('G 601', '28-32', 'Use relationships among area, perimeter, and volume to compute another measure', 'Geometry'),
  'G 602': act('G 602', '28-32', 'Use the Pythagorean theorem', 'Geometry'),
  'G 603': act('G 603', '28-32', 'Apply properties of special, similar, and congruent triangles', 'Geometry'),
  'G 604': act('G 604', '28-32', 'Apply basic trigonometric ratios to right-triangle problems', 'Geometry'),
  'G 605': act('G 605', '28-32', 'Use the distance formula', 'Geometry'),
  'G 606': act('G 606', '28-32', 'Use parallel and perpendicular line properties to determine equations or coordinates', 'Geometry'),
  'G 607': act('G 607', '28-32', 'Reflect points across lines in the coordinate plane', 'Geometry'),
  'G 608': act('G 608', '28-32', 'Rotate a point 90 degrees about the origin', 'Geometry'),
  'G 609': act('G 609', '28-32', 'Recognize special characteristics of parabolas and circles', 'Geometry'),
  'G 703': act('G 703', '33-36', 'Use scale factors to determine the magnitude of a size change', 'Geometry'),
  'S 201': act('S 201', '13-15', 'Calculate the average of positive whole numbers', 'Statistics and Probability'),
  'S 301': act('S 301', '16-19', 'Calculate the average of a list of numbers', 'Statistics and Probability'),
  'S 303': act('S 303', '16-19', 'Read basic tables and charts', 'Statistics and Probability'),
  'S 304': act('S 304', '16-19', 'Extract relevant data from a basic table or chart and use it in a computation', 'Statistics and Probability'),
  'S 305': act('S 305', '16-19', 'Use the relationship between an event and its complement', 'Statistics and Probability'),
  'S 402': act('S 402', '20-23', 'Translate from one representation of data to another', 'Statistics and Probability'),
  'S 403': act('S 403', '20-23', 'Determine the probability of a simple event', 'Statistics and Probability'),
  'S 405': act('S 405', '20-23', 'Exhibit knowledge of simple counting techniques', 'Statistics and Probability'),
  'S 502': act('S 502', '24-27', 'Manipulate data from tables and charts', 'Statistics and Probability'),
  'S 503': act('S 503', '24-27', 'Compute straightforward probabilities for common situations', 'Statistics and Probability'),
  'S 601': act('S 601', '28-32', 'Calculate or use a weighted average', 'Statistics and Probability'),
  'S 602': act('S 602', '28-32', 'Interpret and use information from tables and charts, including two-way frequency tables', 'Statistics and Probability'),
  'S 604': act('S 604', '28-32', 'Compute a probability when the event or sample space is not obvious', 'Statistics and Probability'),
  'S 605': act('S 605', '28-32', 'Recognize conditional and joint probability in context', 'Statistics and Probability'),
  'S 701': act('S 701', '33-36', 'Distinguish between mean, median, and mode', 'Statistics and Probability'),
  'S 702': act('S 702', '33-36', 'Analyze and draw conclusions from tables and charts', 'Statistics and Probability'),
  'S 703': act('S 703', '33-36', 'Understand the role of randomization in surveys, experiments, and observational studies', 'Statistics and Probability'),
  'S 704': act('S 704', '33-36', 'Exhibit knowledge of conditional and joint probability', 'Statistics and Probability'),
  'S 705': act('S 705', '33-36', 'Recognize how statistical modeling uses regularity in residual differences', 'Statistics and Probability'),
});

export const ASVAB_REFERENCES = Object.freeze({
  arithmeticReasoning: ref({ framework: 'asvab', id: 'asvab-ar', code: 'AR', title: 'Arithmetic Reasoning', descriptor: 'Ability to solve basic arithmetic word problems.', domainId: 'arithmeticReasoning', domainTitle: 'Arithmetic Reasoning', precision: REFERENCE_PRECISION.SUBTEST }),
  mathematicsKnowledge: ref({ framework: 'asvab', id: 'asvab-mk', code: 'MK', title: 'Mathematics Knowledge', descriptor: 'Knowledge of key math concepts and ability to apply basic formulas.', domainId: 'mathematicsKnowledge', domainTitle: 'Mathematics Knowledge', precision: REFERENCE_PRECISION.SUBTEST }),
});

const lc = (value) => String(value || '').toLowerCase();
const includesAny = (text, terms) => terms.some((term) => text.includes(term));
const add = (list, item) => { if (item && !list.some((candidate) => candidate.id === item.id)) list.push(item); };

const inferSat = (text, domainIds) => {
  const out = [];
  // College Board's public SAT skill list does not publish a sequence-specific skill.
  // Keep mixed arithmetic/geometric sequence TEKS at domain level rather than
  // pretending "Nonlinear functions" is an exact one-to-one standard.
  if (text.includes('sequence')) return out;
  if (domainIds.includes('algebra')) {
    if (text.includes('system')) add(out, DIGITAL_SAT_REFERENCES['sat-alg-systems']);
    if (text.includes('inequal')) add(out, DIGITAL_SAT_REFERENCES['sat-alg-inequalities']);
    if (includesAny(text, ['function', 'rate of change', 'slope', 'proportional', 'constant of proportionality'])) add(out, DIGITAL_SAT_REFERENCES['sat-alg-linear-functions']);
    if (includesAny(text, ['two variables', 'equation of a line', 'standard form', 'point-slope', 'slope-intercept'])) add(out, DIGITAL_SAT_REFERENCES['sat-alg-linear-equations-2']);
    if (!out.length || includesAny(text, ['solve linear equation', 'one variable', 'literal equation'])) add(out, DIGITAL_SAT_REFERENCES['sat-alg-linear-equations-1']);
  }
  if (domainIds.includes('advancedMath')) {
    if (text.includes('system')) add(out, DIGITAL_SAT_REFERENCES['sat-adv-systems']);
    if (includesAny(text, ['factor', 'polynomial', 'equivalent', 'rewrite', 'simplif', 'rational expression', 'radical expression', 'exponent'])) add(out, DIGITAL_SAT_REFERENCES['sat-adv-equivalent']);
    if (includesAny(text, ['solve', 'equation', 'zero', 'root', 'extraneous', 'inequal'])) add(out, DIGITAL_SAT_REFERENCES['sat-adv-nonlinear-equations']);
    if (includesAny(text, ['function', 'graph', 'domain', 'range', 'sequence', 'exponential', 'quadratic', 'logarith', 'asympt', 'vertex'])) add(out, DIGITAL_SAT_REFERENCES['sat-adv-nonlinear-functions']);
    if (!out.length) add(out, DIGITAL_SAT_REFERENCES['sat-adv-nonlinear-functions']);
  }
  if (domainIds.includes('problemSolvingData')) {
    if (text.includes('percent')) add(out, DIGITAL_SAT_REFERENCES['sat-psd-percent']);
    if (includesAny(text, ['ratio', 'rate', 'proportion', 'unit', 'scale factor'])) add(out, DIGITAL_SAT_REFERENCES['sat-psd-ratios']);
    if (includesAny(text, ['scatter', 'correlation', 'two quantitative', 'regression', 'model', 'association'])) add(out, DIGITAL_SAT_REFERENCES['sat-psd-two-variable-data']);
    if (includesAny(text, ['mean', 'median', 'spread', 'distribution', 'box plot', 'histogram', 'dot plot', 'one-variable'])) add(out, DIGITAL_SAT_REFERENCES['sat-psd-one-variable-data']);
    if (text.includes('probab')) add(out, DIGITAL_SAT_REFERENCES['sat-psd-probability']);
    if (includesAny(text, ['sample', 'margin of error', 'inference'])) add(out, DIGITAL_SAT_REFERENCES['sat-psd-inference']);
    if (includesAny(text, ['causation', 'observational', 'experiment', 'statistical claim'])) add(out, DIGITAL_SAT_REFERENCES['sat-psd-claims']);
    if (!out.length) add(out, DIGITAL_SAT_REFERENCES['sat-psd-ratios']);
  }
  if (domainIds.includes('geometryTrigonometry')) {
    if (includesAny(text, ['circle', 'circumference', 'radius', 'diameter'])) add(out, DIGITAL_SAT_REFERENCES['sat-geo-circles']);
    if (includesAny(text, ['trigon', 'right triangle', 'pythagorean'])) add(out, DIGITAL_SAT_REFERENCES['sat-geo-right-trig']);
    if (includesAny(text, ['area', 'volume', 'surface area', 'perimeter'])) add(out, DIGITAL_SAT_REFERENCES['sat-geo-area-volume']);
    if (includesAny(text, ['line', 'angle', 'triangle', 'similar', 'congruen', 'transform', 'symmetr'])) add(out, DIGITAL_SAT_REFERENCES['sat-geo-lines-angles-triangles']);
    if (!out.length) add(out, DIGITAL_SAT_REFERENCES['sat-geo-lines-angles-triangles']);
  }
  return out.slice(0, 3);
};

const inferTsia = (text, domainIds) => {
  const out = [];
  // TSIA2's published item-content statements do not name sequences separately.
  if (text.includes('sequence')) return out;
  if (domainIds.includes('quantitativeReasoning')) {
    if (includesAny(text, ['rational', 'irrational', 'number line', 'magnitude', 'order'])) add(out, TSIA2_REFERENCES['tsi-qr-magnitudes']);
    if (includesAny(text, ['ratio', 'rate', 'proportion', 'percent'])) add(out, TSIA2_REFERENCES['tsi-qr-ratios']);
    if (includesAny(text, ['context', 'real-world', 'financial', 'unit rate'])) add(out, TSIA2_REFERENCES['tsi-qr-proportional-context']);
    if (includesAny(text, ['linear', 'equation', 'inequal', 'expression'])) add(out, TSIA2_REFERENCES['tsi-qr-linear']);
    if (!out.length) add(out, TSIA2_REFERENCES['tsi-qr-linear']);
  }
  if (domainIds.includes('algebraicReasoning')) {
    if (includesAny(text, ['linear equation', 'linear inequal', 'system'])) add(out, TSIA2_REFERENCES['tsi-ar-linear-systems']);
    if (includesAny(text, ['linear function', 'function notation', 'evaluate function'])) add(out, TSIA2_REFERENCES['tsi-ar-linear-functions']);
    if (includesAny(text, ['real-world', 'context', 'growth', 'decay', 'compound interest', 'depreciation'])) add(out, TSIA2_REFERENCES['tsi-ar-context']);
    if (includesAny(text, ['factor', 'polynomial', 'radical', 'rational', 'exponent', 'rewrite', 'simplif', 'logarith'])) add(out, TSIA2_REFERENCES['tsi-ar-manipulate']);
    if (includesAny(text, ['solve', 'equation', 'function', 'quadratic', 'exponential', 'root'])) add(out, TSIA2_REFERENCES['tsi-ar-solve-functions']);
    if (!out.length) add(out, TSIA2_REFERENCES['tsi-ar-solve-functions']);
  }
  if (domainIds.includes('geometricSpatial')) {
    if (text.includes('unit')) add(out, TSIA2_REFERENCES['tsi-gs-units']);
    if (includesAny(text, ['perimeter', 'area', 'surface area', 'volume'])) add(out, TSIA2_REFERENCES['tsi-gs-measure']);
    if (includesAny(text, ['transform', 'congruen', 'similar', 'symmetr', 'reflection', 'rotation', 'translation', 'dilation'])) add(out, TSIA2_REFERENCES['tsi-gs-transform']);
    if (includesAny(text, ['trigon', 'right triangle', 'pythagorean'])) add(out, TSIA2_REFERENCES['tsi-gs-trig']);
    if (includesAny(text, ['coordinate', 'equation', 'slope', 'line', 'parabola'])) add(out, TSIA2_REFERENCES['tsi-gs-algebra']);
    if (!out.length) add(out, TSIA2_REFERENCES['tsi-gs-algebra']);
  }
  if (domainIds.includes('probabilisticStatistical')) {
    if (text.includes('probab')) add(out, TSIA2_REFERENCES['tsi-ps-probability']);
    if (includesAny(text, ['mean', 'median', 'center', 'spread', 'range', 'interquartile'])) add(out, TSIA2_REFERENCES['tsi-ps-center-spread']);
    if (includesAny(text, ['represent', 'table', 'graph', 'plot', 'histogram', 'box plot', 'stem-and-leaf'])) add(out, TSIA2_REFERENCES['tsi-ps-represent']);
    if (includesAny(text, ['analy', 'interpret', 'conclusion', 'data', 'correlation', 'association'])) add(out, TSIA2_REFERENCES['tsi-ps-analyze']);
    if (!out.length) add(out, TSIA2_REFERENCES['tsi-ps-analyze']);
  }
  return out.slice(0, 3);
};

const ACT_RULES = [
  [/recursive.*sequence|sequence.*recurs/, ['F 502', 'F 603']],
  [/geometric sequence/, ['F 703', 'F 301']],
  [/arithmetic sequence|constant increase|constant decrease/, ['F 201', 'F 502']],
  [/composite function|composition of function/, ['F 604', 'F 708']],
  [/inverse variation|inversely proportional/, ['F 602']],
  [/exponential function|exponential relation|growth and decay|exponential growth|exponential decay/, ['F 702']],
  [/logarith/, ['F 707']],
  [/function notation.*evaluate|evaluate function|evaluate.*function notation/, ['F 401', 'F 501']],
  [/domain and range|domain.*range/, ['F 506', 'F 508', 'F 509']],
  [/vertical asymptote|asymptotic/, ['F 510']],
  [/define a function|relation.*function|well-defined output/, ['F 505']],
  [/function notation/, ['F 507']],
  [/model.*fit|fit data|compare.*model|regression/, ['F 701']],
  [/key attributes|intercepts|zeros|vertex|axis of symmetry|extrema|characteristics of graphs/, ['AF 705']],
  [/transformation.*function|translated|translation|parent function/, ['AF 604', 'AF 706']],
  [/system.*linear equation|systems of two linear equations/, ['A 604']],
  [/quadratic.*inequal/, ['A 702']],
  [/quadratic.*equation|solve quadratic/, ['A 605', 'A 507']],
  [/factor.*quadratic|trinom|difference of two squares/, ['A 508']],
  [/absolute value.*inequal/, ['A 701']],
  [/absolute value.*equation/, ['A 606']],
  [/linear inequal/, ['A 503', 'A 602', 'A 603']],
  [/compound inequal/, ['A 504']],
  [/solve linear equation|first-degree equation|one-variable.*equation|literal equation/, ['A 403', 'A 601']],
  [/real-world.*linear|linear.*real-world/, ['A 502', 'AF 502']],
  [/slope/, ['A 406', 'A 514', 'G 510']],
  [/linear.*graph|graph.*linear|equation of a line/, ['AF 503', 'AF 603']],
  [/rate of change|starting value|amount per unit/, ['AF 403', 'F 503']],
  [/polynomial.*quotient|divide.*polynomial|remainder theorem/, ['A 703']],
  [/add.*polynomial|subtract.*polynomial|multiply.*polynomial|polynomial.*add|polynomial.*subtract|polynomial.*multiply/, ['A 505']],
  [/multiply.*binomial|binomial/, ['A 404']],
  [/square root|radical/, ['A 509']],
  [/cube root/, ['A 510']],
  [/scientific notation/, ['A 511']],
  [/rational exponent/, ['A 512']],
  [/exponent/, ['A 512']],
  [/undefined|domain.*rational/, ['A 513', 'F 508']],
  [/equivalent expression|simplif|distributive|combine like terms|manipulate expression|rewrite.*expression|factor.*polynomial|factoring by grouping|sum.*cubes|difference.*cubes/, ['A 601']],
  [/word-to-symbol|write.*equation|formulate.*equation|represent.*equation/, ['AF 402', 'AF 502']],
  [/ratio|rate|proportion/, ['AF 401', 'AF 501', 'AF 601']],
  [/percent/, ['AF 301', 'AF 401', 'AF 701']],
  [/area.*volume|surface area|volume/, ['G 601', 'G 405']],
  [/area|perimeter/, ['G 403', 'G 405']],
  [/circle|circumference/, ['G 507']],
  [/pythagorean/, ['G 602']],
  [/right triangle|trigon/, ['G 604', 'G 509']],
  [/similar|congruen/, ['G 603']],
  [/reflect/, ['G 607']],
  [/rotate/, ['G 608', 'G 512']],
  [/scale factor|dilation/, ['G 703']],
  [/coordinate plane|graph points|ordered pair/, ['G 406']],
  [/\bmean\b|\bmedian\b|\bmode\b|measure.*center/, ['S 701', 'S 301']],
  [/probab/, ['S 403', 'S 503', 'S 604']],
  [/conditional probability|joint probability/, ['S 605', 'S 704']],
  [/table|chart|data representation|histogram|box plot|dot plot|stem-and-leaf/, ['S 502', 'S 602']],
  [/randomization|observational|experiment/, ['S 703']],
  [/\bdata\b|statistic|correlation|association|scatter/, ['S 702']],
];

const inferAct = (text) => {
  const out = [];
  ACT_RULES.forEach(([pattern, codes]) => {
    if (!pattern.test(text)) return;
    codes.forEach((code) => add(out, ACT_REFERENCES[code]));
  });
  return out.slice(0, 3);
};

const inferAsvabTopic = (text) => {
  if (includesAny(text, ['ratio', 'rate', 'percent', 'proportion', 'average', 'mean', 'unit', 'distance', 'time', 'money', 'real-world', 'context'])) return 'Applied arithmetic / word-problem reasoning';
  if (includesAny(text, ['equation', 'expression', 'factor', 'polynomial', 'radical', 'exponent', 'quadratic', 'geometry', 'area', 'volume', 'triangle', 'slope'])) return 'High-school mathematics knowledge';
  return 'Mathematics content';
};

const frameworkReferences = ({ framework, standard, crosswalkEntry }) => {
  const text = lc(standard?.description);
  const domainIds = Array.isArray(crosswalkEntry?.domainIds) && crosswalkEntry.domainIds.length
    ? crosswalkEntry.domainIds
    : [crosswalkEntry?.domainId].filter(Boolean);

  if (framework === EXAM_TYPES.DIGITAL_SAT) return inferSat(text, domainIds);
  if (framework === EXAM_TYPES.ACT) return inferAct(text);
  if (framework === EXAM_TYPES.TSIA2) return inferTsia(text, domainIds);
  if (framework === EXAM_TYPES.ASVAB) {
    return domainIds.map((domainId) => {
      const base = ASVAB_REFERENCES[domainId];
      return base ? { ...base, topic: inferAsvabTopic(text) } : null;
    }).filter(Boolean);
  }
  return [];
};

const genericDomainReference = ({ framework, entry }) => {
  if (!entry) return null;
  return ref({
    framework,
    id: `${framework}-domain-${entry.domainId || 'general'}`,
    title: entry.domainTitle || `${FRAMEWORK_LABELS[framework] || framework} Math`,
    descriptor: `This skill is crosswalked to the ${entry.domainTitle || 'mathematics'} domain, but MathMaster has not selected a more specific official reference yet.`,
    domainId: entry.domainId || null,
    domainTitle: entry.domainTitle || '',
    precision: REFERENCE_PRECISION.DOMAIN,
  });
};

export const getAssessmentStandardReferences = (skillIdOrCode, framework = null) => {
  const code = teksCodeFromSkillId(skillIdOrCode) || normalizeTeksCode(skillIdOrCode);
  const standard = code ? getTexasStandard(code) : null;
  const crosswalk = code ? getSkillCrosswalk(code) : null;
  if (!standard || !crosswalk) return framework ? [] : {};

  const build = (id) => {
    const entry = crosswalk.frameworks?.[id];
    if (!entry) return [];
    const specific = frameworkReferences({ framework: id, standard, crosswalkEntry: entry });
    const refs = specific.length ? specific : [genericDomainReference({ framework: id, entry })].filter(Boolean);
    return refs.map((reference) => ({
      ...reference,
      teksCode: code,
      coverage: entry.coverage || 'full',
      allowedAspects: entry.allowedAspects || [],
      excludedAspects: entry.excludedAspects || [],
      overlapSummary: entry.coverage === 'partial' && entry.allowedAspects?.length
        ? `This Texas standard is broader. The ${FRAMEWORK_LABELS[id] || id} connection is limited to: ${entry.allowedAspects.join('; ')}.`
        : `The Texas skill and this ${FRAMEWORK_LABELS[id] || id} reference share the same core mathematics. Texas asks students to ${standard.description}`,
      mappingPrecision: reference.precision,
    }));
  };

  if (framework) return build(framework);
  return Object.fromEntries(Object.keys(crosswalk.frameworks || {}).map((id) => [id, build(id)]));
};

export const getPrimaryAssessmentReference = (skillIdOrCode, framework) => getAssessmentStandardReferences(skillIdOrCode, framework)[0] || null;

const normalizeSearch = (value) => lc(value).replace(/[^a-z0-9]+/g, ' ').trim();
const compactSearch = (value) => normalizeSearch(value).replace(/\s+/g, '');

export const assessmentReferenceSearchText = ({ skillId, label = '', framework, domainTitle = '' } = {}) => {
  const refs = getAssessmentStandardReferences(skillId, framework);
  return normalizeSearch([
    skillId,
    label,
    FRAMEWORK_LABELS[framework] || framework,
    domainTitle,
    ...refs.flatMap((reference) => [reference.officialCode, reference.title, reference.descriptor, reference.domainTitle, reference.topic]),
  ].filter(Boolean).join(' '));
};

export const matchesAssessmentReferenceSearch = (item, query) => {
  const q = normalizeSearch(query);
  if (!q) return true;
  const haystack = assessmentReferenceSearchText(item);
  if (haystack.includes(q)) return true;
  const compact = compactSearch(query);
  return compact.length >= 2 && compactSearch(haystack).includes(compact);
};

export const referenceLabel = (reference) => {
  if (!reference) return '';
  return reference.officialCode
    ? `${reference.officialCode} · ${reference.title}`
    : `${reference.domainTitle ? `${reference.domainTitle} → ` : ''}${reference.title}`;
};

export const officialReferenceKindLabel = (referenceOrFramework) => {
  const reference = typeof referenceOrFramework === 'object' && referenceOrFramework
    ? referenceOrFramework
    : { framework: referenceOrFramework, precision: null };
  const { framework, precision } = reference;

  // A domain-level fallback is deliberately not presented as a precise
  // standard. The student can still see the real official domain/strand and
  // source, but MathMaster says plainly that the narrower public reference has
  // not been selected yet.
  if (precision === REFERENCE_PRECISION.DOMAIN) {
    if (framework === EXAM_TYPES.ACT) return 'ACT domain connection · exact CCRS not mapped yet';
    if (framework === EXAM_TYPES.DIGITAL_SAT) return 'Official SAT domain · no narrower public skill selected';
    if (framework === EXAM_TYPES.TSIA2) return 'Official TSIA2 strand · no narrower testing point selected';
    return 'Assessment domain connection';
  }
  if (framework === EXAM_TYPES.ACT) return 'Official ACT CCRS standard';
  if (framework === EXAM_TYPES.DIGITAL_SAT) return 'Official SAT skill';
  if (framework === EXAM_TYPES.TSIA2) return 'Official TSIA2 testing point';
  if (framework === EXAM_TYPES.ASVAB) return 'Official ASVAB subtest';
  return 'Official assessment reference';
};
