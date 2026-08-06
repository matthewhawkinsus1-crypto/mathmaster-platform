import {
  formatGraphEquationLatex,
  getGraphKeyPoint,
  getSuggestedGraphPoints,
} from './functionGraphUtils.js';
import {
  buildInteractiveGraphWindow,
  buildInteractivePointTasks,
} from './interactiveGraphEngine.js';
import { applyStudentSupportToQuestion } from './studentSupport.js';

const hashString = (value) => {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const mulberry32 = (seed) => () => {
  let value = (seed += 0x6d2b79f5);
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};

const createRandom = (seedKey) => mulberry32(hashString(seedKey));
const randomInt = (random, minimum, maximum) =>
  Math.floor(random() * (maximum - minimum + 1)) + minimum;
const choose = (random, values) => values[randomInt(random, 0, values.length - 1)];
const asRange = (value, fallback) =>
  Array.isArray(value) && value.length === 2
    ? [Number(value[0]), Number(value[1])]
    : fallback;
const round = (value, places = 8) => Number(value.toFixed(places));

const nonZeroInt = (random, range) => {
  let result = 0;
  while (result === 0) result = randomInt(random, range[0], range[1]);
  return result;
};

const formatSignedTerm = (value) => `${value >= 0 ? '+' : '-'} ${Math.abs(value)}`;
const formatVariableTerm = (coefficient, variable = 'x') => {
  if (coefficient === 1) return variable;
  if (coefficient === -1) return `-${variable}`;
  return `${coefficient}${variable}`;
};
const lineLatex = (m, b) =>
  `y = ${formatVariableTerm(m)}${b === 0 ? '' : ` ${formatSignedTerm(b)}`}`;

const generateAlgebra = (question, random) => {
  const generator = question.generator || {};
  const xRange = asRange(generator.solutionRange, [-12, 12]);
  const coefficientRange = asRange(generator.coefficientRange, [1, 9]);
  const constantRange = asRange(generator.constantRange, [-18, 18]);
  const targetX = randomInt(random, xRange[0], xRange[1]);
  const a = nonZeroInt(random, coefficientRange);
  const b = randomInt(random, constantRange[0], constantRange[1]);
  const c = a * targetX + b;
  return { ...question, a, b, c, generatedAnswer: targetX };
};

const generateStepLinearEquation = (question, random) => {
  const generator = question.generator || {};
  const variable = String(generator.variable || question.variable || 'x');
  const solutionRange = asRange(generator.solutionRange, [-9, 9]);
  const coefficientRange = asRange(generator.coefficientRange, [2, 9]);
  const constantRange = asRange(generator.constantRange, [-12, 12]);
  const solution = randomInt(random, solutionRange[0], solutionRange[1]);
  let coefficient = nonZeroInt(random, coefficientRange);
  let constant = nonZeroInt(random, constantRange);
  if (generator.modifiedOneStep) {
    if (random() < 0.5) coefficient = 1;
    else constant = 0;
  }
  const rightValue = coefficient * solution + constant;
  const leftExpression = constant === 0
    ? `${coefficient} * ${variable}`
    : `${coefficient} * ${variable} ${formatSignedTerm(constant)}`;
  const rightExpression = String(rightValue);

  return {
    ...question,
    variable,
    leftExpression,
    rightExpression,
    equation: `${leftExpression} = ${rightExpression}`,
    generatedAnswer: solution,
    mode: question.mode || generator.mode || 'rigorous',
    microQuestions:
      question.microQuestions ?? generator.microQuestions ?? true,
    allowModeToggle:
      question.allowModeToggle ?? generator.allowModeToggle ?? false,
  };
};

const generateFraction = (question, random) => {
  const generator = question.generator || {};
  const denominators = generator.denominators || [2, 3, 4, 5, 6, 8, 10, 12];
  const d1 = choose(random, denominators);
  const d2 = choose(random, denominators);
  const n1 = randomInt(random, 1, Math.max(1, d1 - 1));
  const n2 = randomInt(random, 1, Math.max(1, d2 - 1));
  return {
    ...question,
    n1,
    d1,
    n2,
    d2,
    ansNum: n1 * d2 + n2 * d1,
    ansDen: d1 * d2,
  };
};

const generateGraphingLine = (question, random) => {
  const generator = question.generator || {};
  const slopes = generator.slopeChoices || [-4, -3, -2, -1, -0.5, 0.5, 1, 2, 3, 4];
  const interceptRange = asRange(generator.interceptRange, [-8, 8]);
  const m = choose(random, slopes);
  const b = randomInt(random, interceptRange[0], interceptRange[1]);
  const generatedEquation = lineLatex(m, b);
  return {
    ...question,
    m,
    b,
    equationLatex: question.showEquation === false ? undefined : generatedEquation,
    graph: question.showGraph === false
      ? question.graph
      : {
          xMin: -10,
          xMax: 10,
          yMin: -10,
          yMax: 10,
          functions: [{ type: 'line', m, b }],
          ariaLabel: `Graph of ${generatedEquation}`,
          ...(question.graph || {}),
        },
  };
};

const generateLinearSystem = (question, random) => {
  const generator = question.generator || {};
  const xRange = asRange(generator.xRange, [-10, 10]);
  const yRange = asRange(generator.yRange, [-10, 10]);
  const slopes = generator.slopeChoices || [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
  const x = randomInt(random, xRange[0], xRange[1]);
  const y = randomInt(random, yRange[0], yRange[1]);
  const m1 = choose(random, slopes);
  let m2 = choose(random, slopes);
  while (m2 === m1) m2 = choose(random, slopes);
  const b1 = y - m1 * x;
  const b2 = y - m2 * x;
  const equationsLatex = [lineLatex(m1, b1), lineLatex(m2, b2)];

  return {
    ...question,
    solution: [x, y],
    equationsLatex,
    graph: {
      xMin: generator.graphXMin ?? -12,
      xMax: generator.graphXMax ?? 12,
      yMin: generator.graphYMin ?? -12,
      yMax: generator.graphYMax ?? 12,
      functions: [
        { type: 'line', m: m1, b: b1, stroke: '#1a73e8' },
        { type: 'line', m: m2, b: b2, stroke: '#9334e6' },
      ],
      ariaLabel: 'Graph of two linear equations with one intersection',
      ...(question.graph || {}),
    },
  };
};

const evaluateRule = (rule, x) => {
  if (rule.type === 'quadratic') {
    return Number(rule.a ?? 1) * x * x + Number(rule.b ?? 0) * x + Number(rule.c ?? 0);
  }
  return Number(rule.m ?? 1) * x + Number(rule.b ?? 0);
};

const generateFunctionTable = (question, random) => {
  const generator = question.generator || {};
  const ruleType = generator.ruleType || 'linear';
  const rowCount = Number(generator.rowCount || 5);
  const xStartRange = asRange(generator.xStartRange, [-8, 0]);
  const xStepChoices = generator.xStepChoices || [1, 2];
  const xStart = randomInt(random, xStartRange[0], xStartRange[1]);
  const xStep = choose(random, xStepChoices);
  const rule = ruleType === 'quadratic'
    ? {
        type: 'quadratic',
        a: nonZeroInt(random, asRange(generator.aRange, [1, 3])),
        b: randomInt(random, ...asRange(generator.bRange, [-4, 4])),
        c: randomInt(random, ...asRange(generator.cRange, [-8, 8])),
      }
    : {
        type: 'linear',
        m: nonZeroInt(random, asRange(generator.slopeRange, [-6, 6])),
        b: randomInt(random, ...asRange(generator.interceptRange, [-12, 12])),
      };

  const xValues = Array.from({ length: rowCount }, (_, index) => xStart + index * xStep);
  const blankCount = Math.min(rowCount, Number(generator.blankCount || 3));
  const blankRows = new Set();
  while (blankRows.size < blankCount) blankRows.add(randomInt(random, 0, rowCount - 1));

  const answers = {};
  const rows = xValues.map((x, rowIndex) => {
    const y = round(evaluateRule(rule, x));
    if (blankRows.has(rowIndex)) {
      answers[`${rowIndex}:y`] = y;
      return { x, y: null };
    }
    return { x, y };
  });

  const ruleLatex = rule.type === 'quadratic'
    ? `y = ${rule.a}x^2 ${formatSignedTerm(rule.b)}x ${formatSignedTerm(rule.c)}`
    : lineLatex(rule.m, rule.b);

  return {
    ...question,
    rule,
    ruleLatex,
    table: {
      columns: [
        { key: 'x', label: 'x' },
        { key: 'y', label: 'y' },
      ],
      rows,
      answers,
      ...(question.table || {}),
    },
  };
};

const generateOrderedPair = (question, random) => {
  const generator = question.generator || {};
  const xRange = asRange(generator.xRange, [-99, 99]);
  const yRange = asRange(generator.yRange, [-99, 99]);
  const x = randomInt(random, xRange[0], xRange[1]);
  const y = randomInt(random, yRange[0], yRange[1]);
  const windowRadius = Number(generator.windowRadius || 6);
  return {
    ...question,
    answer: [x, y],
    graph: {
      xMin: generator.graphXMin ?? x - windowRadius,
      xMax: generator.graphXMax ?? x + windowRadius,
      yMin: generator.graphYMin ?? y - windowRadius,
      yMax: generator.graphYMax ?? y + windowRadius,
      xStep: generator.xStep ?? 1,
      yStep: generator.yStep ?? 1,
      points: [{ coordinates: [x, y] }],
      ariaLabel: 'Coordinate plane with one plotted point',
      ...(question.graph || {}),
    },
  };
};


const generateLineFeatures = (question, random) => {
  const generator = question.generator || {};
  const slopes = Array.isArray(generator.slopeChoices) ? generator.slopeChoices : null;
  const slopeRange = asRange(generator.slopeRange, [-99, 99]);
  const interceptRange = asRange(generator.interceptRange, [-99, 99]);
  const m = slopes?.length ? choose(random, slopes) : nonZeroInt(random, slopeRange);
  const b = randomInt(random, interceptRange[0], interceptRange[1]);
  return {
    ...question,
    mathDisplay: { value: lineLatex(m, b), format: 'ascii-math' },
    answerFields: [
      { id: 'slope', label: 'Slope m', acceptedAnswers: [String(m)] },
      { id: 'intercept', label: 'Y-intercept b', acceptedAnswers: [String(b)] },
    ],
  };
};

const generateNumberLine = (question, random) => {
  const generator = question.generator || {};
  const targetRange = asRange(generator.targetRange, [-20, 20]);
  const target = randomInt(random, targetRange[0], targetRange[1]);
  const spacing = Number(generator.spacing || 5);
  const choices = [target - spacing * 2, target - spacing, target, target + spacing, target + spacing * 2];
  return { ...question, target, choices };
};

const generateLiteralLinear = (question, random) => {
  const generator = question.generator || {};
  const dependentSymbols = generator.dependentSymbols || ['A', 'P', 'C', 'S', 'T', 'V'];
  const variableSymbols = generator.variableSymbols || ['x', 'r', 'h', 't', 'n', 'p'];
  const dependent = choose(random, dependentSymbols);
  let solveFor = choose(random, variableSymbols);
  while (solveFor === dependent.toLowerCase()) solveFor = choose(random, variableSymbols);
  const coefficient = nonZeroInt(random, asRange(generator.coefficientRange, [2, 12]));
  const constant = nonZeroInt(random, asRange(generator.constantRange, [-15, 15]));
  const formulaLatex = `${dependent} = ${coefficient}${solveFor} ${formatSignedTerm(constant)}`;
  const answerLatex = constant >= 0
    ? `\\frac{${dependent}-${constant}}{${coefficient}}`
    : `\\frac{${dependent}+${Math.abs(constant)}}{${coefficient}}`;

  return {
    ...question,
    formulaLatex,
    solveFor,
    acceptedAnswers: [answerLatex],
  };
};


const normalizeGeneratedDomain = (source, h) => {
  if (!source || typeof source !== 'object') return null;
  const minimum = Number.isFinite(Number(source.min)) ? Number(source.min) : Number.isFinite(Number(source.minOffset)) ? h + Number(source.minOffset) : null;
  const maximum = Number.isFinite(Number(source.max)) ? Number(source.max) : Number.isFinite(Number(source.maxOffset)) ? h + Number(source.maxOffset) : null;
  if (minimum === null && maximum === null) return null;
  return {
    ...(minimum !== null ? { min: minimum, minInclusive: source.minInclusive !== false } : {}),
    ...(maximum !== null ? { max: maximum, maxInclusive: source.maxInclusive !== false } : {}),
  };
};

const chooseGraphTransform = (generator, random, type, question = {}) => {
  const hRange = asRange(generator.hRange, [-3, 3]);
  const kRange = asRange(generator.kRange, [-3, 3]);
  const h = randomInt(random, hRange[0], hRange[1]);
  const k = randomInt(random, kRange[0], kRange[1]);
  const coefficientChoices = Array.isArray(generator.coefficientChoices)
    ? generator.coefficientChoices.filter((value) => Number(value) !== 0)
    : [-2, -1, 1, 2];
  const restrictedCoefficientTypes = ['cubic', 'exponential'];
  const safeChoices = restrictedCoefficientTypes.includes(type)
    ? coefficientChoices.filter((value) => Math.abs(Number(value)) <= 1)
    : coefficientChoices;
  const a = Number(choose(random, safeChoices.length ? safeChoices : [-1, 1]));
  const baseChoices = Array.isArray(generator.baseChoices) && generator.baseChoices.length
    ? generator.baseChoices
    : [2];
  const base = Number(choose(random, baseChoices));
  const restrictionSource = question.domain || generator.domain || (Array.isArray(generator.domainChoices) && generator.domainChoices.length ? choose(random, generator.domainChoices) : null);
  const domain = normalizeGeneratedDomain(restrictionSource, h);
  return { type, a, h, k, ...(type === 'logarithmic' || type === 'exponential' ? { base } : {}), ...(domain ? { domain } : {}) };
};

const generateParentFunctionGraph = (question, random) => {
  const generator = question.generator || {};
  const allowedTypes = Array.isArray(generator.functionTypes) && generator.functionTypes.length
    ? generator.functionTypes
    : [
        'absolute',
        'quadratic',
        'squareRoot',
        'cubic',
        'cubeRoot',
        'logarithmic',
        'exponential',
        'rational',
      ];
  const type = choose(random, allowedTypes);
  const functionSpec = chooseGraphTransform(generator, random, type, question);
  const suggestedPoints = getSuggestedGraphPoints(functionSpec);
  const keyPoint = getGraphKeyPoint(functionSpec);
  const studentChoosesX =
    question.studentChoosesX ??
    question.chooseXValues ??
    generator.studentChoosesX ??
    generator.chooseXValues ??
    false;
  const pointTasks = buildInteractivePointTasks(functionSpec, {
    points: suggestedPoints,
    includeUndefinedChecks: question.includeUndefinedChecks ?? generator.includeUndefinedChecks,
    undefinedCount: question.undefinedCount ?? generator.undefinedCount,
    studentChoosesX,
  });
  const window = buildInteractiveGraphWindow(functionSpec, pointTasks, question.graph || {});

  return {
    ...question,
    functionSpec,
    equationLatex: formatGraphEquationLatex(functionSpec),
    showCoordinates: question.showCoordinates ?? generator.showCoordinates ?? true,
    includeUndefinedChecks: question.includeUndefinedChecks ?? generator.includeUndefinedChecks ?? true,
    requireEndpointMarkers: question.requireEndpointMarkers ?? generator.requireEndpointMarkers ?? true,
    studentChoosesX: Boolean(studentChoosesX),
    pointTasks,
    graph: {
      ...window,
      ariaLabel: `${type} function graphing workspace`,
    },
    graphAnswer: {
      keyPoint,
      suggestedPoints,
    },
  };
};

const generateGraphFeatureAnalysis = (question, random) => {
  const generator = question.generator || {};
  const requestedParts = Array.isArray(question.analysisRequests) && question.analysisRequests.length
    ? question.analysisRequests
    : Array.isArray(generator.analysisRequests) && generator.analysisRequests.length
      ? generator.analysisRequests
      : null;
  const pointRequest = requestedParts?.find(
    (request) => !['domain', 'range', 'increasing', 'decreasing', 'constant'].includes(request.kind),
  );
  const featureChoices = Array.isArray(generator.featureChoices) && generator.featureChoices.length
    ? generator.featureChoices
    : ['vertex', 'xIntercepts', 'yIntercept'];
  const analysisFeature = pointRequest?.feature || pointRequest?.kind || choose(random, featureChoices);
  let functionSpec;

  if (question.functionSpec) {
    functionSpec = question.functionSpec;
  } else if (analysisFeature === 'xIntercepts') {
    const h = randomInt(random, ...asRange(generator.hRange, [-4, 4]));
    const rootOffset = choose(random, generator.rootOffsetChoices || [1, 2, 3]);
    const a = Number(choose(random, generator.coefficientChoices || [-1, 1]));
    const k = -a * rootOffset ** 2;
    functionSpec = { type: 'quadratic', a, h, k };
  } else if (['vertex', 'localMaximum', 'localMinimum'].includes(analysisFeature)) {
    const requiredSign = analysisFeature === 'localMaximum' ? -1 : analysisFeature === 'localMinimum' ? 1 : null;
    const choices = (generator.coefficientChoices || [-2, -1, 1, 2]).filter((value) => !requiredSign || Math.sign(Number(value)) === requiredSign);
    const h = randomInt(random, ...asRange(generator.hRange, [-4, 4]));
    const k = randomInt(random, ...asRange(generator.kRange, [-5, 5]));
    functionSpec = { type: 'quadratic', a: Number(choose(random, choices.length ? choices : [requiredSign || 1])), h, k };
  } else {
    const allowedTypes = Array.isArray(generator.functionTypes) && generator.functionTypes.length
      ? generator.functionTypes
      : ['absolute', 'quadratic', 'cubic', 'squareRoot'];
    functionSpec = chooseGraphTransform(generator, random, choose(random, allowedTypes), question);
  }

  const suggestedPoints = getSuggestedGraphPoints(functionSpec);
  const tasks = buildInteractivePointTasks(functionSpec, { points: suggestedPoints, includeUndefinedChecks: false });
  const window = buildInteractiveGraphWindow(functionSpec, tasks, question.graph || {});
  const labels = {
    vertex: 'vertex',
    localMaximum: 'local maximum',
    localMinimum: 'local minimum',
    xIntercepts: 'x-intercepts',
    yIntercept: 'y-intercept',
    center: 'center',
  };
  const analysisRequests = requestedParts || [
    {
      id: 'feature',
      kind: 'point',
      feature: analysisFeature,
      label: labels[analysisFeature] || analysisFeature,
    },
  ];

  return {
    ...question,
    analysisFeature,
    analysisFeatureLabel: labels[analysisFeature] || analysisFeature,
    analysisRequests,
    functionSpec,
    equationLatex: formatGraphEquationLatex(functionSpec),
    showCoordinates: question.showCoordinates ?? generator.showCoordinates ?? false,
    graph: {
      ...window,
      ariaLabel: `${functionSpec.type} graph analysis workspace`,
    },
  };
};

const selectVariant = (question, random) => {
  if (!Array.isArray(question.variants) || question.variants.length === 0) return question;
  const variant = choose(random, question.variants);
  const { variants, ...base } = question;
  return { ...base, ...variant };
};

const generateQuestionFromKey = (question, generationKey) => {
  const random = createRandom(`${generationKey}|v${question.generatorVersion || 1}`);
  const variantQuestion = selectVariant(question, random);
  const kind = variantQuestion.generator?.kind;

  if (kind === 'stepLinearEquation') return generateStepLinearEquation(variantQuestion, random);
  if (kind === 'literalLinear') return generateLiteralLinear(variantQuestion, random);
  if (kind === 'linearSystem') return generateLinearSystem(variantQuestion, random);
  if (kind === 'functionTable') return generateFunctionTable(variantQuestion, random);
  if (kind === 'orderedPair') return generateOrderedPair(variantQuestion, random);
  if (kind === 'lineGraph') return generateGraphingLine(variantQuestion, random);
  if (kind === 'lineFeatures') return generateLineFeatures(variantQuestion, random);
  if (kind === 'parentFunctionGraph') return generateParentFunctionGraph(variantQuestion, random);
  if (kind === 'graphFeatureAnalysis') return generateGraphFeatureAnalysis(variantQuestion, random);

  switch (variantQuestion.type) {
    case 'algebra':
      return generateAlgebra(variantQuestion, random);
    case 'fraction':
      return generateFraction(variantQuestion, random);
    case 'numberLine':
      return generateNumberLine(variantQuestion, random);
    default:
      return variantQuestion;
  }
};

const getReplacementKeyParts = (generationKey) => {
  const match = String(generationKey).match(/^(.*)\|variant:(\d+)$/);
  if (!match) return null;
  return { baseKey: match[1], variantIndex: Number(match[2]) };
};

export const generateQuestion = (question, generationKey, studentProfile = null) => {
  if (!question) return null;
  const supportedQuestion = applyStudentSupportToQuestion(question, studentProfile).question;
  const candidate = generateQuestionFromKey(supportedQuestion, generationKey);
  const replacement = getReplacementKeyParts(generationKey);
  if (!replacement || replacement.variantIndex <= 0) return candidate;

  const previous = generateQuestionFromKey(
    supportedQuestion,
    `${replacement.baseKey}|variant:${replacement.variantIndex - 1}`,
  );
  const previousFingerprint = JSON.stringify(previous);
  if (JSON.stringify(candidate) !== previousFingerprint) return candidate;

  for (let reroll = 1; reroll <= 12; reroll += 1) {
    const rerolled = generateQuestionFromKey(
      supportedQuestion,
      `${generationKey}|replacement-reroll:${reroll}`,
    );
    if (JSON.stringify(rerolled) !== previousFingerprint) return rerolled;
  }

  return candidate;
};

export const isPersonalizedBlueprint = (question) => {
  if (!question || typeof question !== 'object') return false;
  if (['algebra', 'fraction', 'numberLine'].includes(question.type)) return true;
  if (question.generator && typeof question.generator === 'object') return true;
  return Array.isArray(question.variants) && question.variants.length >= 2;
};
