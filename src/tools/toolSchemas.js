const TOOL_IDS = new Set([
  'dataModelingLab','inverseCompositionLab','systemsWorkspace','parabolaGeometryLab','polynomialWorkshop',
  'signSolutionAnalyzer','sequenceExplorer','complexPlaneLab','exponentialLogBridge','transformationsLab',
  'representationMatch','functionInvestigation2','graphing2','stepAlgebra2','solutionReview2',
  'intervalNumberLine','relationMapping',
]);

const isPositiveInteger = (value) => Number.isInteger(Number(value)) && Number(value) >= 1;
const isValidLogBase = (value) => Number.isFinite(Number(value)) && Number(value) > 0 && Math.abs(Number(value) - 1) > 1e-6;
const isFiniteComplex = (value) => value && Number.isFinite(Number(value.re)) && Number.isFinite(Number(value.im));
const FUNCTION_FAMILIES = ['linear','quadratic','absolute','cubic','cubeRoot','squareRoot','exponential','logarithmic','rational'];
const isFinitePoint = (value) => Array.isArray(value) && value.length === 2 && value.every((entry) => Number.isFinite(Number(entry)));

const validateFunctionSpec = (spec = {}, label = 'function') => {
  const errors = [];
  if (!FUNCTION_FAMILIES.includes(spec.type)) errors.push(`${label} type must be a supported function family.`);
  ['a','h','k'].forEach((key) => {
    if (spec[key] != null && !Number.isFinite(Number(spec[key]))) errors.push(`${label} ${key} must be finite.`);
  });
  if (Number.isFinite(Number(spec.a)) && Math.abs(Number(spec.a)) <= 1e-9) errors.push(`${label} vertical scale a cannot be 0.`);
  if (['exponential','logarithmic'].includes(spec.type) && !isValidLogBase(spec.base ?? 2)) errors.push(`${label} base must be positive and not equal to 1.`);
  return errors;
};

const validateSequenceSpec = (spec = {}, fallbackKind = 'arithmetic', label = 'sequence') => {
  const errors = [];
  const kind = spec.kind || fallbackKind;
  if (!['arithmetic','geometric'].includes(kind)) errors.push(`${label} kind must be arithmetic or geometric.`);
  if (spec.first != null && !Number.isFinite(Number(spec.first))) errors.push(`${label} first term must be finite.`);
  if (kind === 'arithmetic' && spec.difference != null && !Number.isFinite(Number(spec.difference))) errors.push(`${label} common difference must be finite.`);
  if (kind === 'geometric' && spec.ratio != null && !Number.isFinite(Number(spec.ratio))) errors.push(`${label} common ratio must be finite.`);
  return errors;
};

export const validateToolQuestion = (question = {}) => {
  const errors = [];
  const warnings = [];
  const toolId = question.toolId || question.type;
  if (!TOOL_IDS.has(toolId)) errors.push(`Unknown missing-tool id: ${toolId || '(missing)'}.`);
  if (question.difficultyBand != null && (!Number.isInteger(Number(question.difficultyBand)) || Number(question.difficultyBand) < 1 || Number(question.difficultyBand) > 5)) errors.push('difficultyBand must be an integer from 1 to 5.');
  if (question.dok != null && (!Number.isInteger(Number(question.dok)) || Number(question.dok) < 1 || Number(question.dok) > 4)) errors.push('dok must be an integer from 1 to 4.');
  const hasStandardsAlignment = Array.isArray(question.alignments) && question.alignments.some((entry) => entry && String(entry.framework || 'teks') === 'teks' && entry.code);
  if (!question.masteryEvidenceKeys?.length && !hasStandardsAlignment) warnings.push('No standards alignment supplied; this item should not produce standards mastery until aligned.');

  if (toolId === 'dataModelingLab') {
    if (question.points && (!Array.isArray(question.points) || question.points.length < 3)) errors.push('dataModelingLab requires at least 3 data points.');
    const modes = ['full','lineFit','association','prediction','modelCompare'];
    if (question.mode && !modes.includes(question.mode)) errors.push(`Unsupported dataModelingLab mode: ${question.mode}.`);
    if (question.predictionTolerance != null && Number(question.predictionTolerance) <= 0) errors.push('predictionTolerance must be positive.');
  }
  if (toolId === 'systemsWorkspace') {
    const modes = ['linear','inequalities','linearQuadratic','matrix'];
    const mode = question.mode || 'linear';
    if (!modes.includes(mode)) errors.push(`Unsupported systemsWorkspace mode: ${mode}.`);
    if (mode === 'linear' && question.system?.m1 === question.system?.m2 && question.system?.b1 == null) warnings.push('Parallel/coincident system should explicitly provide both intercepts.');
    if (mode === 'inequalities' && question.inequalities && (!Array.isArray(question.inequalities) || question.inequalities.length < 2)) errors.push('Inequality mode requires at least two inequalities.');
    if (mode === 'linearQuadratic' && Number(question.linearQuadratic?.quadratic?.a ?? 1) === 0) errors.push('linearQuadratic mode requires a nonzero quadratic coefficient.');
  }
  if (toolId === 'inverseCompositionLab') {
    const modes = ['full','composition','inverse','restriction'];
    if (question.mode && !modes.includes(question.mode)) errors.push(`Unsupported inverseCompositionLab mode: ${question.mode}.`);
    const f = question.f || {};
    if (f.type === 'quadratic' && !f.inverseBranch && f.domain?.min == null && f.domain?.max == null) warnings.push('Quadratic inverse family should declare inverseBranch or a one-sided domain restriction.');
    if (['exponential','logarithmic'].includes(f.type)) {
      const base = Number(f.base ?? 2);
      if (!(base > 0) || base === 1) errors.push('Inverse/composition exponential or logarithmic base must be positive and not equal to 1.');
    }
  }
  if (toolId === 'parabolaGeometryLab') {
    const modes = ['features','equidistance','fromGeometry','equation'];
    if (question.mode && !modes.includes(question.mode)) errors.push(`Unsupported parabolaGeometryLab mode: ${question.mode}.`);
    if (question.mode !== 'fromGeometry' && Number(question.p) === 0) errors.push('Parabola parameter p cannot be 0.');
    if (question.orientation && !['vertical','horizontal'].includes(question.orientation)) errors.push('Parabola orientation must be vertical or horizontal.');
    if (question.mode === 'fromGeometry') {
      if (!Array.isArray(question.focus) || question.focus.length !== 2) errors.push('fromGeometry mode requires focus [x,y].');
      if (!['horizontal','vertical'].includes(question.directrix?.kind) || !Number.isFinite(Number(question.directrix?.value))) errors.push('fromGeometry mode requires a horizontal/vertical directrix with finite value.');
    }
  }
  if (toolId === 'polynomialWorkshop') {
    const modes = ['factorZero','multiplyArea','factorQuadratic','division','graphConnection','rationalFeatures'];
    if (question.mode && !modes.includes(question.mode)) errors.push(`Unsupported polynomialWorkshop mode: ${question.mode}.`);
    if (question.coefficients && (!Array.isArray(question.coefficients) || question.coefficients.length < 2)) errors.push('Polynomial must have degree at least 1.');
    if (question.mode === 'multiplyArea' && (!Array.isArray(question.leftBinomial) || question.leftBinomial.length !== 2 || !Array.isArray(question.rightBinomial) || question.rightBinomial.length !== 2)) errors.push('multiplyArea mode requires two binomial coefficient arrays of length 2.');
    if (question.mode === 'division') {
      if (!Array.isArray(question.dividend) || question.dividend.length < 2) errors.push('division mode requires a dividend coefficient array.');
      if (!Array.isArray(question.divisor) || question.divisor.length < 1 || question.divisor.every((value) => Number(value) === 0)) errors.push('division mode requires a nonzero divisor coefficient array.');
    }
    if (question.mode === 'graphConnection' && (!Array.isArray(question.roots) || question.roots.length < 1)) errors.push('graphConnection mode requires at least one root/multiplicity entry.');
    if (question.mode === 'rationalFeatures' && (!Array.isArray(question.denominatorRoots) || question.denominatorRoots.length < 1)) errors.push('rationalFeatures mode requires denominatorRoots.');
  }
  if (toolId === 'signSolutionAnalyzer') {
    const modes = ['polynomial','rational','radicalCheck'];
    if (question.mode && !modes.includes(question.mode)) errors.push(`Unsupported signSolutionAnalyzer mode: ${question.mode}.`);
    if (question.relation && !['>','>=','<','<='].includes(question.relation)) errors.push('Sign analyzer relation must be >, >=, <, or <=.');
    if (question.mode === 'rational' && (!Array.isArray(question.denominatorFactors) || question.denominatorFactors.length < 1)) errors.push('rational mode requires denominatorFactors.');
    if (question.mode === 'radicalCheck') {
      if (!Array.isArray(question.candidates) || question.candidates.length < 1) errors.push('radicalCheck mode requires candidate values.');
      if (!question.radicalEquation?.radicand || !question.radicalEquation?.rhs) errors.push('radicalCheck mode requires radicand and rhs linear specs.');
    }
  }
  if (toolId === 'sequenceExplorer') {
    const modes = ['analyze','ruleBridge','missingTerm','partialSum','compare'];
    const mode = question.mode || 'analyze';
    if (!modes.includes(mode)) errors.push(`Unsupported sequenceExplorer mode: ${mode}.`);
    if (mode === 'compare') {
      if (!question.left || !question.right) errors.push('compare mode requires left and right sequence specifications.');
      if (question.left) errors.push(...validateSequenceSpec(question.left, question.left.kind || 'arithmetic', 'left sequence'));
      if (question.right) errors.push(...validateSequenceSpec(question.right, question.right.kind || 'geometric', 'right sequence'));
      if (!isPositiveInteger(question.compareN)) errors.push('compare mode requires compareN as a positive integer.');
    } else {
      const spec = question.sequence || {};
      errors.push(...validateSequenceSpec(spec, spec.kind || question.kind || 'arithmetic'));
      if (question.kind && !['arithmetic','geometric'].includes(question.kind)) errors.push('sequenceExplorer kind must be arithmetic or geometric.');
      if (question.targetN != null && !isPositiveInteger(question.targetN)) errors.push('sequenceExplorer targetN must be a positive integer.');
      if (mode === 'missingTerm' && !isPositiveInteger(question.missingIndex)) errors.push('missingTerm mode requires missingIndex as a positive integer.');
      if (mode === 'partialSum' && !isPositiveInteger(question.sumN)) errors.push('partialSum mode requires sumN as a positive integer.');
    }
    if (question.displayCount != null && (!isPositiveInteger(question.displayCount) || Number(question.displayCount) > 20)) errors.push('sequenceExplorer displayCount must be an integer from 1 to 20.');
    if (mode === 'analyze' && question.revealTargetTerm !== true && question.displayCount != null && question.targetN != null && Number(question.displayCount) >= Number(question.targetN)) {
      errors.push('sequenceExplorer analyze mode must not display the requested target term before the student answers. Use displayCount < targetN, or set revealTargetTerm: true only when intentionally showing the answer as worked evidence.');
    }
  }
  if (toolId === 'complexPlaneLab') {
    const modes = ['features','operations','division','powers','rotation','quadraticRoots'];
    const mode = question.mode || 'features';
    if (!modes.includes(mode)) errors.push(`Unsupported complexPlaneLab mode: ${mode}.`);
    if (question.z && !isFiniteComplex(question.z)) errors.push('complexPlaneLab z must contain finite re and im values.');
    if (['operations','division'].includes(mode)) {
      if (!isFiniteComplex(question.z) || !isFiniteComplex(question.w)) errors.push(`${mode} mode requires finite complex z and w values.`);
    }
    if (mode === 'operations' && !['add','subtract','multiply'].includes(question.operation || 'multiply')) errors.push('operations mode supports add, subtract, or multiply.');
    if (mode === 'division' && isFiniteComplex(question.w) && Number(question.w.re) ** 2 + Number(question.w.im) ** 2 <= 1e-6) errors.push('division mode divisor w cannot be 0 + 0i.');
    if (mode === 'powers') {
      if (!isFiniteComplex(question.z)) errors.push('powers mode requires a finite complex z value.');
      if (!Number.isInteger(Number(question.exponent)) || Math.abs(Number(question.exponent)) > 12) errors.push('powers mode exponent must be an integer from -12 to 12.');
      if (Number(question.exponent) < 0 && isFiniteComplex(question.z) && Number(question.z.re) === 0 && Number(question.z.im) === 0) errors.push('powers mode cannot use a negative exponent with z = 0 + 0i.');
    }
    if (mode === 'rotation') {
      if (!isFiniteComplex(question.z)) errors.push('rotation mode requires a finite complex z value.');
      if (!Number.isInteger(Number(question.quarterTurns))) errors.push('rotation mode quarterTurns must be an integer.');
    }
    if (mode === 'quadraticRoots') {
      const q = question.quadratic || {};
      if (![q.a,q.b,q.c].every((value) => Number.isFinite(Number(value)))) errors.push('quadraticRoots mode requires finite a, b, and c coefficients.');
      if (Number.isFinite(Number(q.a)) && Math.abs(Number(q.a)) <= 1e-6) errors.push('quadraticRoots mode requires a nonzero quadratic coefficient a.');
    }
  }
  if (toolId === 'exponentialLogBridge') {
    const modes = ['equivalentForms','solveExponential','solveLogarithmic','inverse','composition'];
    const mode = question.mode || 'equivalentForms';
    if (!modes.includes(mode)) errors.push(`Unsupported exponentialLogBridge mode: ${mode}.`);
    if (mode === 'equivalentForms') {
      if (!isValidLogBase(question.base ?? 2)) errors.push('Logarithm base must be positive and not equal to 1.');
      if (question.exponent != null && !Number.isFinite(Number(question.exponent))) errors.push('equivalentForms exponent must be finite.');
    }
    if (mode === 'solveExponential') {
      const eq = question.equation || {};
      if (!isValidLogBase(eq.base ?? question.base ?? 2)) errors.push('solveExponential requires a positive base not equal to 1.');
      if (!Number.isFinite(Number(eq.m)) || Math.abs(Number(eq.m)) <= 1e-6 || !Number.isFinite(Number(eq.c))) errors.push('solveExponential requires finite m/c and nonzero exponent coefficient m.');
      if (!(Number(eq.rhs) > 0) || !Number.isFinite(Number(eq.rhs))) errors.push('solveExponential rhs must be positive for this real-number bridge mode.');
    }
    if (mode === 'solveLogarithmic') {
      const eq = question.equation || {};
      if (!isValidLogBase(eq.base ?? question.base ?? 2)) errors.push('solveLogarithmic requires a positive base not equal to 1.');
      if (!Number.isFinite(Number(eq.m)) || Math.abs(Number(eq.m)) <= 1e-6 || !Number.isFinite(Number(eq.c)) || !Number.isFinite(Number(eq.result))) errors.push('solveLogarithmic requires finite m, c, result and nonzero argument coefficient m.');
    }
    if (['inverse','composition'].includes(mode)) {
      const spec = question.function || question.exponential || question;
      if (!isValidLogBase(spec.base ?? 2)) errors.push(`${mode} mode requires a positive exponential base not equal to 1.`);
      if (!Number.isFinite(Number(spec.a ?? 1)) || Math.abs(Number(spec.a ?? 1)) <= 1e-6 || !Number.isFinite(Number(spec.h ?? 0)) || !Number.isFinite(Number(spec.k ?? 0))) errors.push(`${mode} mode requires finite a/h/k and nonzero vertical scale a.`);
      if (question.x != null && !Number.isFinite(Number(question.x))) errors.push(`${mode} mode x must be finite.`);
      if (mode === 'composition' && question.y != null && Number.isFinite(Number(question.y))) {
        const a = Number(spec.a ?? 1); const k = Number(spec.k ?? 0);
        if (!((Number(question.y) - k) / a > 0)) errors.push('composition mode y must lie in the exponential range / logarithm domain.');
      }
    }
  }
  if (toolId === 'transformationsLab') {
    const modes = ['match','identify','pointMap','describe','anchor'];
    const mode = question.mode || 'match';
    if (!modes.includes(mode)) errors.push(`Unsupported transformationsLab mode: ${mode}.`);
    const requestedFamily = question.family || question.function?.type || (FUNCTION_FAMILIES.includes(question.type) ? question.type : 'quadratic');
    if (!FUNCTION_FAMILIES.includes(requestedFamily)) errors.push('transformationsLab family must be a supported function family.');
    const source = mode === 'match' ? { type: requestedFamily, ...question.target } : question.function;
    if (mode !== 'match' && !question.function) errors.push(`${mode} mode requires a function specification.`);
    if (source) errors.push(...validateFunctionSpec({ type: requestedFamily, ...source }, 'transformationsLab function'));
    if (mode === 'pointMap' && !isFinitePoint(question.parentPoint)) errors.push('pointMap mode requires a finite parentPoint [x,y].');
  }
  if (toolId === 'representationMatch') {
    const modes = ['completeSet','findMismatch','tableAudit','graphMatch'];
    const mode = question.mode || 'completeSet';
    if (!modes.includes(mode)) errors.push(`Unsupported representationMatch mode: ${mode}.`);
    // Every mode reads `sets`. `findMismatch` builds its cards from them just
    // as `completeSet` does, so leaving it out of this rule would have kept one
    // mode quietly rendering the demo relationships instead of the authored
    // ones — the failure this rule exists to stop.
    if (['completeSet', 'findMismatch', 'graphMatch'].includes(mode) && (!Array.isArray(question.sets) || question.sets.length < 2)) {
      errors.push(`representationMatch ${mode} mode requires an explicit sets array with at least two relationships; do not rely on hidden fallback content.`);
    }
    if (question.sets) {
      if (!Array.isArray(question.sets) || question.sets.length < 2) errors.push('representationMatch sets must contain at least two relationships.');
      else {
        const ids = question.sets.map((set) => set?.id);
        if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.push('representationMatch set ids must be present and unique.');
        if (question.targetId && !ids.includes(question.targetId)) errors.push('representationMatch targetId must reference one of the provided sets.');
      }
    }
    if (mode === 'findMismatch') {
      if (!question.mixedSet) errors.push('findMismatch mode requires mixedSet source ids.');
      if (!question.targetId) errors.push('findMismatch mode requires targetId.');
      if (question.mixedSet && question.targetId) {
        const mixedIds = ['equationId','tableId','contextId'].map((key) => question.mixedSet[key]);
        if (mixedIds.some((id) => !id)) errors.push('findMismatch mixedSet requires equationId, tableId, and contextId.');
        if (mixedIds.filter((id) => id !== question.targetId).length !== 1) errors.push('findMismatch mode requires exactly one mismatched representation source.');
      }
    }
    if (mode === 'tableAudit') {
      if (!question.function) errors.push('tableAudit mode requires a function specification.');
      else errors.push(...validateFunctionSpec(question.function, 'tableAudit function'));
      if (!Array.isArray(question.rows) || question.rows.length < 3 || question.rows.some((row) => !isFinitePoint(row))) errors.push('tableAudit mode requires at least three finite [x,y] rows.');
    }
    if (mode === 'graphMatch') {
      if (Array.isArray(question.sets) && question.sets.length >= 2) question.sets.forEach((set, index) => errors.push(...validateFunctionSpec(set.graphSpec || {}, `graphMatch set ${index + 1} graphSpec`)));
      if (!question.targetId) errors.push('graphMatch mode requires targetId.');
    }
  }
  if (toolId === 'functionInvestigation2') {
    const modes = ['features','domainRange','intercepts','behavior','compare'];
    const mode = question.mode || 'features';
    if (!modes.includes(mode)) errors.push(`Unsupported functionInvestigation2 mode: ${mode}.`);
    if (mode === 'compare') {
      if (!question.left || !question.right) errors.push('compare mode requires left and right function specifications.');
      if (question.left) errors.push(...validateFunctionSpec(question.left, 'compare left function'));
      if (question.right) errors.push(...validateFunctionSpec(question.right, 'compare right function'));
      if (!Number.isFinite(Number(question.x))) errors.push('compare mode requires a finite comparison x-value.');
    } else {
      if (!question.function) errors.push(`${mode} mode requires a function specification.`);
      else errors.push(...validateFunctionSpec(question.function, 'functionInvestigation2 function'));
    }
  }
  if (toolId === 'graphing2') {
    const modes = ['slopeIntercept','throughPoints','pointSlope','standardForm','verticalHorizontal'];
    const mode = question.mode || 'slopeIntercept';
    if (!modes.includes(mode)) errors.push(`Unsupported graphing2 mode: ${mode}.`);
    if (mode === 'slopeIntercept') {
      if (!question.line || !Number.isFinite(Number(question.line.m)) || !Number.isFinite(Number(question.line.b))) errors.push('slopeIntercept mode requires finite line m and b values.');
    }
    if (mode === 'throughPoints') {
      if (!Array.isArray(question.givenPoints) || question.givenPoints.length !== 2 || question.givenPoints.some((point) => !isFinitePoint(point))) errors.push('throughPoints mode requires exactly two finite points.');
      else if (question.givenPoints[0][0] === question.givenPoints[1][0] && question.givenPoints[0][1] === question.givenPoints[1][1]) errors.push('throughPoints points must be distinct.');
    }
    if (mode === 'pointSlope') {
      if (!isFinitePoint(question.point) || !Number.isFinite(Number(question.slope))) errors.push('pointSlope mode requires a finite point and slope.');
    }
    if (mode === 'standardForm') {
      const standard = question.standard || {};
      if (![standard.A,standard.B,standard.C].every((value) => Number.isFinite(Number(value)))) errors.push('standardForm mode requires finite A, B, and C coefficients.');
      else if (Math.abs(Number(standard.A)) <= 1e-9 && Math.abs(Number(standard.B)) <= 1e-9) errors.push('standardForm A and B cannot both be 0.');
    }
    if (mode === 'verticalHorizontal') {
      if (!['vertical','horizontal'].includes(question.orientation) || !Number.isFinite(Number(question.value))) errors.push('verticalHorizontal mode requires vertical/horizontal orientation and a finite value.');
    }
  }
  if (toolId === 'relationMapping') {
    if (!Array.isArray(question.pairs) || question.pairs.length < 1) errors.push('relationMapping requires at least one pair.');
    else question.pairs.forEach((pair, index) => {
      const x = Array.isArray(pair) ? pair[0] : pair?.x;
      const y = Array.isArray(pair) ? pair[1] : pair?.y;
      if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) errors.push(`relationMapping pair ${index + 1} must have finite x and y values.`);
    });
  }
  if (toolId === 'stepAlgebra2' && Number(question.equation?.a ?? 1) === 0) errors.push('stepAlgebra2 linear coefficient a cannot be 0.');

  return { isValid: errors.length === 0, errors, warnings };
};

export const MISSING_TOOL_IDS = [...TOOL_IDS];
