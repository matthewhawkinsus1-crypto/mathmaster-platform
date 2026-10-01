/*
 * systemsWorkspace — graphical mode graders: { [mode]: (question, work) => result }.
 * Every mode declared SHARED in ../../declarations/systemsWorkspace/graphical.mjs
 * must have a grader here, and no other.
 *
 * Run by SystemsWorkspace.jsx / ThreePlaneWorkspace.jsx for their Check
 * feedback (through gradeToolCheck), by QuestionEngine for the recorded
 * verdict, and by the server as the authority. Extracted check-for-check from
 * the workspace's former inline Check handlers: the same defaults for an
 * unauthored system / matrix / parabola / inequality set, the same tolerances
 * (0.05 for a typed solution, 0.1 for an intersection, 0.08 for a boundary
 * point, 0.12 / 0.15 for a boundary probe / vertex), the same part lists and
 * the same "correct parts / parts" score. The mathematics is the workspace's
 * own (functions/shared/toolMath/systemsWorkspace/*), never a second copy.
 *
 * Two deliberate fixes against the old inline Check, each pinned by
 * tests/tools/systemsWorkspaceGraphicalSharedGrading.test.mjs:
 *   - a BLANK "is the test point in the region?" answer is incorrect (it was
 *     read as "no", so leaving it blank earned the part whenever the point was
 *     outside the region);
 *   - a legacy-construct inequality authored with '≤' / '≥' (or with no
 *     relation, which the engine reads as '>=') expects the boundary style and
 *     shading of that relation (the raw-string test expected dashed + below
 *     for '≥').
 */
import { gradedResult, ungradedResult } from '../../gradingResult.mjs';
import { gradeMultiAnswerResponse, multiAnswerFields } from '../../../ordinaryResponseGrading.mjs';
import { matchesNumericAnswer, parseNumericAnswer, solveTwoLines } from '../../../toolMath/shared/toolMath.mjs';
import {
  SYSTEMS_WORKSPACE_DEFAULTS,
  inequalityRelationToken,
  matrix3x4Rows,
  samePointSet,
  satisfiesLinearInequality,
  solve2x2System,
  solve3x3System,
  solveLinearQuadratic,
} from '../../../toolMath/systemsWorkspace/systemsMath.mjs';
import {
  classifyFeasibleRegion,
  explicitBooleanAnswerMatches,
  feasibleRegionVertices,
  modelingEntryCorrect,
  modelingEntryToCanonical,
  pointMembership,
  pointOnBoundaryIndex,
  sameGraphingConstraint,
  studentBoundaryLineFromEntry,
  studentBuildConstraintStatus,
  studentBuildInequalityEnabled,
  studentBuildInequalityTask,
  studentBuildWorkingConstraints,
  vertexInclusionExpected,
} from '../../../toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';

const list = (value) => (Array.isArray(value) ? value : []);
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const entry = (value) => (value === null || value === undefined ? '' : String(value));
const typed = (value) => parseNumericAnswer(value) != null;
// A coordinate the workspace already parsed before sending it (number or null).
const parsedNumber = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const finitePair = (value) => (
  Array.isArray(value) && value.length >= 2 && value.slice(0, 2).every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ? [value[0], value[1]]
    : null
);
const answered = (value) => value === 'yes' || value === 'no';
const part = (id, label, isCorrect, isComplete, response = '') => ({ id, label, isCorrect: isCorrect === true, isComplete: isComplete === true, response });
// The workspace's own rule: correct only when every part is, and the score is
// the share of parts that are correct (gradedResult's default arithmetic).
const allOf = (parts) => parts.length > 0 && parts.every((item) => item.isCorrect);
const pairText = (x, y) => `(${entry(x)}, ${entry(y)})`;

const SOLUTION_TYPES = { one: 'Exactly one solution', none: 'No solution', infinite: 'Infinitely many solutions' };

// ---------------------------------------------------------------------------
// linear — two lines y = m1x + b1, y = m2x + b2
//   work { classification: 'one'|'none'|'infinite', x, y }  (x/y as typed)
// ---------------------------------------------------------------------------
const linear = (question, work) => {
  const solution = solveTwoLines(question.system || SYSTEMS_WORKSPACE_DEFAULTS.system);
  const classification = entry(work.classification);
  const parts = [part('classification', 'Number of solutions', classification === solution.type, classification !== '', SOLUTION_TYPES[classification] || classification)];
  // Coordinates are graded only when the system really has one solution.
  if (solution.type === 'one') {
    parts.push(part(
      'solution',
      'Intersection point',
      matchesNumericAnswer(work.x, solution.x, 0.05) && matchesNumericAnswer(work.y, solution.y, 0.05),
      typed(work.x) && typed(work.y),
      pairText(work.x, work.y),
    ));
  }
  return gradedResult({
    parts,
    // Finished = a classification, plus the point it calls for.
    isComplete: classification !== '' && (classification !== 'one' || (typed(work.x) && typed(work.y))),
    isCorrect: allOf(parts),
  });
};

// ---------------------------------------------------------------------------
// matrix / matrix3 — an augmented matrix read as a system
//   work { classification, x, y }                        2×2
//   work { classification, x, y, z, technologyUsed }     3×3 (RREF technology)
// The 3×3 view is chosen exactly as MatrixMode chooses it: mode 'matrix3', or
// any matrix that reads as 3×4.
// ---------------------------------------------------------------------------
const matrix = (question, work) => {
  const source = question.matrix || SYSTEMS_WORKSPACE_DEFAULTS.matrix;
  const isMatrix3 = question.mode === 'matrix3' || Boolean(matrix3x4Rows(source));
  const solution = isMatrix3 ? solve3x3System(source) : solve2x2System(source);
  const classification = entry(work.classification);
  const technologyUsed = work.technologyUsed === true;
  const coordinatesTyped = typed(work.x) && typed(work.y) && (!isMatrix3 || typed(work.z));
  const parts = [
    part('classification', 'Number of solutions', classification === solution.type, classification !== '', SOLUTION_TYPES[classification] || classification),
    // Kept exactly as the workspace scored it: a 2×2 matrix has no technology
    // step, so this part is always earned there (see the test file's note).
    part(
      'matrix-technology',
      isMatrix3 ? 'Used the RREF technology' : 'Technology step (not required for 2×2)',
      !isMatrix3 || technologyUsed,
      !isMatrix3 || technologyUsed,
      isMatrix3 ? (technologyUsed ? 'used' : 'not used') : '',
    ),
  ];
  if (solution.type === 'one') {
    parts.push(part(
      'solution',
      'Solution',
      matchesNumericAnswer(work.x, solution.x, 0.05)
        && matchesNumericAnswer(work.y, solution.y, 0.05)
        && (!isMatrix3 || matchesNumericAnswer(work.z, solution.z, 0.05)),
      coordinatesTyped,
      isMatrix3 ? `(${entry(work.x)}, ${entry(work.y)}, ${entry(work.z)})` : pairText(work.x, work.y),
    ));
  }
  return gradedResult({
    parts,
    isComplete: classification !== ''
      && (classification !== 'one' || coordinatesTyped)
      && (!isMatrix3 || technologyUsed),
    isCorrect: allOf(parts),
  });
};

// ---------------------------------------------------------------------------
// linearQuadratic — a line and a parabola
//   work { count: 0|1|2|null, points: [{ x, y }] }  (parsed; null = blank)
// The points graded are the ones the chosen count shows, as on screen.
// ---------------------------------------------------------------------------
const linearQuadratic = (question, work) => {
  const intersections = solveLinearQuadratic(question.linearQuadratic || SYSTEMS_WORKSPACE_DEFAULTS.linearQuadratic);
  const count = parsedNumber(work.count);
  const sent = list(work.points);
  const shown = count === 1 ? 1 : count >= 2 ? 2 : 0;
  const studentPoints = Array.from({ length: shown }, (_, index) => ({
    x: parsedNumber(sent[index]?.x),
    y: parsedNumber(sent[index]?.y),
  }));
  const countCorrect = count !== null && count === intersections.length;
  const allEntered = studentPoints.every((point) => point.x != null && point.y != null);
  const parts = [part('count', 'Number of intersections', countCorrect, count !== null, count === null ? '' : String(count))];
  if (intersections.length) {
    parts.push(part(
      'intersections',
      'Intersection points',
      countCorrect && allEntered && samePointSet(studentPoints, intersections, 0.1),
      count !== null && allEntered,
      studentPoints.map((point) => pairText(point.x, point.y)).join(' '),
    ));
  }
  return gradedResult({ parts, isComplete: count !== null && allEntered, isCorrect: allOf(parts) });
};

// ---------------------------------------------------------------------------
// inequalities (legacy analyze / construct)
//   work { construction: [{ points: [{x,y},{x,y}], boundaryStyle, shade }],
//          testChoice?: ''|'yes'|'no', candidate?: { x, y } }
// Coordinates arrive parsed (number or null), exactly as the workspace — and
// My Math Path's contract for this same response — has always sent them.
// ---------------------------------------------------------------------------
const legacyInequalities = (question, work) => {
  const inequalities = question.inequalities || SYSTEMS_WORKSPACE_DEFAULTS.inequalities;
  const ask = Array.isArray(question.ask) && question.ask.length
    ? question.ask
    : question.interaction === 'construct' ? ['construction'] : ['testPoint', 'candidate'];
  const testPoint = question.testPoint || SYSTEMS_WORKSPACE_DEFAULTS.inequalityTestPoint;
  // Evaluated up front, as the workspace does when it draws the question: a
  // question it cannot draw is refused, never guessed at.
  const expectedTestPoint = inequalities.every((ineq) => satisfiesLinearInequality(ineq, testPoint.x, testPoint.y));
  const parts = [];
  let complete = true;

  if (ask.includes('construction')) {
    const construction = list(work.construction);
    inequalities.forEach((ineq, index) => {
      const built = isRecord(construction[index]) ? construction[index] : {};
      const points = list(built.points);
      const first = { x: parsedNumber(points[0]?.x), y: parsedNumber(points[0]?.y) };
      const second = { x: parsedNumber(points[1]?.x), y: parsedNumber(points[1]?.y) };
      const boundaryCorrect = [first, second].every((point) => (
        point.x != null && point.y != null
        && Math.abs(point.y - (Number(ineq.m) * point.x + Number(ineq.b))) <= 0.08
      )) && first.x != null && second.x != null
        && Math.hypot(first.x - second.x, first.y - second.y) > 0.08;
      const relation = inequalityRelationToken(ineq.relation);
      const styleCorrect = built.boundaryStyle === (relation.includes('=') ? 'solid' : 'dashed');
      const shadeCorrect = built.shade === (relation.includes('>') ? 'above' : 'below');
      const pointsTyped = [first, second].every((point) => point.x != null && point.y != null);
      const styleChosen = built.boundaryStyle === 'solid' || built.boundaryStyle === 'dashed';
      const shadeChosen = built.shade === 'above' || built.shade === 'below';
      complete = complete && pointsTyped && styleChosen && shadeChosen;
      parts.push(
        part(`boundary-${index + 1}`, `Boundary ${index + 1}: two points on the line`, boundaryCorrect, pointsTyped, `${pairText(first.x, first.y)} ${pairText(second.x, second.y)}`),
        part(`boundary-style-${index + 1}`, `Boundary ${index + 1}: solid or dashed`, styleCorrect, styleChosen, entry(built.boundaryStyle)),
        part(`shade-${index + 1}`, `Boundary ${index + 1}: side shaded`, shadeCorrect, shadeChosen, entry(built.shade)),
      );
    });
  }

  if (ask.includes('testPoint')) {
    const testChoice = entry(work.testChoice);
    complete = complete && answered(testChoice);
    parts.push(part('test-point', 'Is the marked point in the region?', explicitBooleanAnswerMatches(testChoice, expectedTestPoint), answered(testChoice), testChoice));
  }

  if (ask.includes('candidate')) {
    const candidate = isRecord(work.candidate) ? work.candidate : {};
    const x = parsedNumber(candidate.x);
    const y = parsedNumber(candidate.y);
    const candidateFeasible = x != null && y != null && inequalities.every((ineq) => satisfiesLinearInequality(ineq, x, y));
    complete = complete && x != null && y != null;
    parts.push(part('candidate-point', 'A point in the feasible region', candidateFeasible, x != null && y != null, pairText(x, y)));
  }

  return gradedResult({ parts, isComplete: complete && parts.length > 0, isCorrect: allOf(parts) });
};

// ---------------------------------------------------------------------------
// inequalities (student-build: rewrite / boundary / line style / shading /
// modeling / region / test point / vertex reasoning)
//   work {
//     build: [{ method, x1, y1, x2, y2, slope, intercept, constant,
//               point1Plotted, point2Plotted, boundaryAttempts, style,
//               styleAttempts, shadePoint: [x, y]|null, shadeAttempts, visible }],
//     rewrite?: [{ relation, graphingForm: { A, B, C, relation }|null }],
//     modelingEntries?: [{ coeffA, coeffB, relation, constant }], modelingSent?,
//     regionClassification, teacherPointResponse?, studentTestPoint?,
//     studentPointResponse?, vertices: [{ x, y, includedAnswer }] }
// ---------------------------------------------------------------------------
const INEQUALITY_RELATIONS = new Set(['>', '>=', '<', '<=']);

// The browser always holds exactly one row per constraint; a response that
// does not is read that way too, so a short or padded list can neither crash
// nor change how many parts are graded.
const rowsOf = (value, count) => Array.from({ length: count }, (_, index) => (isRecord(list(value)[index]) ? list(value)[index] : null));

const buildRow = (row) => (row ? { ...row, shadePoint: finitePair(row.shadePoint) } : null);

const modelingRow = (row) => (row ? { ...row, relation: INEQUALITY_RELATIONS.has(row.relation) ? row.relation : '' } : null);

/**
 * A student's rewritten constraint, accepted only when it is in graphing form
 * (y alone on the left: coefficient 1, as EmbeddedInequalityRewrite produces)
 * and is the same half-plane as the expected constraint — the workspace's own
 * unlock rule (sameGraphingConstraint).
 */
const verifiedRewrite = (form, expected) => {
  if (!isRecord(form) || !INEQUALITY_RELATIONS.has(form.relation)) return null;
  const candidate = { A: form.A, B: form.B, C: form.C, relation: form.relation };
  if (![candidate.A, candidate.B, candidate.C].every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
  if (Math.abs(candidate.B - 1) > 1e-6) return null;
  return sameGraphingConstraint(candidate, expected) ? candidate : null;
};

const pointResponse = (value, count) => {
  const response = isRecord(value) ? value : {};
  const perInequality = list(response.perInequality);
  return {
    overall: entry(response.overall),
    onBoundary: entry(response.onBoundary),
    boundaryIncluded: entry(response.boundaryIncluded),
    // One answer per working constraint, read by position.
    perInequality: Array.from({ length: count }, (_, index) => entry(perInequality[index])),
  };
};

const studentBuildInequalities = (question, work) => {
  const task = studentBuildInequalityTask(question);
  const {
    buildConfig, hasBuildSteps, modeling, expectedConstraints, constraintCount, bounds,
    askClassification, askVertices, boundaryProbeEnabled, teacherTestPoint,
    testPointReasoningEnabled, allowStudentTestPoint,
  } = task;

  const build = rowsOf(work.build, constraintCount).map(buildRow);
  const modelingEntries = modeling ? rowsOf(work.modelingEntries, constraintCount).map(modelingRow) : [];
  const modelingSent = work.modelingSent === true;
  const rewriteRows = rowsOf(work.rewrite, constraintCount);
  const rewriteConstraints = buildConfig.rewrite
    ? expectedConstraints.map((expected, index) => verifiedRewrite(rewriteRows[index]?.graphingForm, expected))
    : [];
  const workingConstraints = studentBuildWorkingConstraints({ task, modelingEntries, modelingSent, rewriteConstraints });
  const workingClassification = classifyFeasibleRegion(workingConstraints);
  const workingVertices = feasibleRegionVertices(workingConstraints);

  const statuses = Array.from({ length: constraintCount }, (_, index) => studentBuildConstraintStatus({
    buildConfig,
    entry: build[index],
    workingConstraint: workingConstraints[index],
    bounds,
    rewriteVerified: Boolean(rewriteConstraints[index]),
  }));
  const constraintComplete = (index) => {
    const row = build[index];
    return (!buildConfig.rewrite || isRecord(rewriteRows[index]?.graphingForm))
      && (!buildConfig.boundary || (row?.boundaryAttempts > 0 && Boolean(studentBoundaryLineFromEntry(row))))
      && (!buildConfig.lineStyle || (row?.styleAttempts > 0 && (row.style === 'solid' || row.style === 'dashed')))
      && (!buildConfig.shading || (row?.shadeAttempts > 0 && Boolean(row.shadePoint)));
  };

  // A mathematical model is a SET of constraints, not an ordered answer list:
  // each student row is matched to one still-unmatched expected constraint, so
  // an equivalent system earns full credit in any order and a duplicated
  // correct row cannot satisfy two requirements.
  const unmatchedExpected = new Set(expectedConstraints.map((_, index) => index));
  const modelingChecks = modelingEntries.map((row) => {
    const matchedIndex = expectedConstraints.findIndex((expected, index) => (
      unmatchedExpected.has(index) && modelingEntryCorrect(row, expected)
    ));
    if (matchedIndex < 0) return false;
    unmatchedExpected.delete(matchedIndex);
    return true;
  });
  const modelComplete = modelingSent && modelingEntries.every((row) => Boolean(modelingEntryToCanonical(row)));

  const regionClassification = entry(work.regionClassification);
  const classificationCorrect = !askClassification || regionClassification === workingClassification;

  const teacherResponse = pointResponse(work.teacherPointResponse, workingConstraints.length);
  const teacherPointApplicable = Boolean(teacherTestPoint);
  const teacherPoint = teacherPointApplicable ? [teacherTestPoint.x, teacherTestPoint.y] : null;
  const teacherMembership = teacherPointApplicable ? pointMembership(workingConstraints, teacherPoint) : [];
  const teacherInSystem = teacherMembership.every(Boolean);
  const teacherPerInequalityCorrect = teacherPointApplicable
    && teacherMembership.every((member, index) => explicitBooleanAnswerMatches(teacherResponse.perInequality[index], member));
  const teacherOverallCorrect = teacherPointApplicable && explicitBooleanAnswerMatches(teacherResponse.overall, teacherInSystem);
  const teacherBoundaryIndex = teacherPointApplicable ? pointOnBoundaryIndex(workingConstraints, teacherPoint) : -1;
  const teacherBoundaryApplicable = teacherPointApplicable && boundaryProbeEnabled && teacherBoundaryIndex >= 0;
  const teacherBoundaryCorrect = !teacherBoundaryApplicable
    || (teacherResponse.onBoundary === 'yes' && explicitBooleanAnswerMatches(teacherResponse.boundaryIncluded, teacherInSystem));

  const studentTestPoint = finitePair(work.studentTestPoint);
  const studentResponse = pointResponse(work.studentPointResponse, workingConstraints.length);
  const studentPointApplicable = allowStudentTestPoint && Boolean(studentTestPoint);
  const studentMembership = studentPointApplicable ? pointMembership(workingConstraints, studentTestPoint) : [];
  const studentPerInequalityCorrect = studentPointApplicable
    && studentMembership.every((member, index) => explicitBooleanAnswerMatches(studentResponse.perInequality[index], member));
  const studentOverallCorrect = studentPointApplicable && explicitBooleanAnswerMatches(studentResponse.overall, studentMembership.every(Boolean));

  const vertices = list(work.vertices).map((vertex) => (isRecord(vertex) ? vertex : {}));
  const vertexResults = vertices.map((vertex) => {
    const expected = vertexInclusionExpected(workingVertices, vertex);
    return expected != null && explicitBooleanAnswerMatches(vertex.includedAnswer, expected);
  });
  const allExpectedVerticesFound = workingVertices.every((expected) => (
    vertices.some((vertex) => Math.hypot(vertex.x - expected.x, vertex.y - expected.y) <= 0.15)
  ));
  const vertexCoverageCorrect = !askVertices || (
    vertices.length === workingVertices.length
    && allExpectedVerticesFound
    && vertexResults.every(Boolean)
  );
  const verticesComplete = vertices.every((vertex) => answered(vertex.includedAnswer))
    && (vertices.length > 0 || workingVertices.length === 0);

  const teacherAsked = testPointReasoningEnabled && teacherPointApplicable;
  const studentAsked = testPointReasoningEnabled && studentPointApplicable;
  const teacherInequalitiesAnswered = teacherResponse.perInequality.every(answered);
  const studentInequalitiesAnswered = studentResponse.perInequality.every(answered);
  const boundaryAnswered = answered(teacherResponse.onBoundary) && answered(teacherResponse.boundaryIncluded);

  const parts = [
    ...(hasBuildSteps ? statuses.map((status, index) => part(`constraint-${index + 1}`, `Constraint ${index + 1}: rewrite, boundary, style and shading`, status.constraintVerified, constraintComplete(index))) : []),
    ...modelingChecks.map((correct, index) => part(`model-${index + 1}`, `Modeled constraint ${index + 1}`, correct, modelComplete)),
    ...(askClassification ? [part('region-classification', 'Classify the solution region', classificationCorrect, regionClassification !== '', regionClassification)] : []),
    ...(teacherAsked ? [
      part('teacher-point-inequalities', 'Marked point: each inequality', teacherPerInequalityCorrect, teacherInequalitiesAnswered, teacherResponse.perInequality.join(',')),
      part('teacher-point-system', 'Marked point: the whole system', teacherOverallCorrect, answered(teacherResponse.overall), teacherResponse.overall),
    ] : []),
    ...(teacherBoundaryApplicable ? [part('teacher-point-boundary', 'Marked point: on a boundary, and included?', teacherBoundaryCorrect, boundaryAnswered, `${teacherResponse.onBoundary},${teacherResponse.boundaryIncluded}`)] : []),
    ...(studentAsked ? [
      part('student-point-inequalities', 'Your point: each inequality', studentPerInequalityCorrect, studentInequalitiesAnswered, studentResponse.perInequality.join(',')),
      part('student-point-system', 'Your point: the whole system', studentOverallCorrect, answered(studentResponse.overall), studentResponse.overall),
    ] : []),
    ...(askVertices ? [part('vertices', 'Every vertex found and judged', vertexCoverageCorrect, verticesComplete, `${vertices.length} marked`)] : []),
  ];

  const isComplete = parts.length > 0
    && (!hasBuildSteps || statuses.every((_, index) => constraintComplete(index)))
    && (!modeling || modelComplete)
    && (!askClassification || regionClassification !== '')
    && (!teacherAsked || (teacherInequalitiesAnswered && answered(teacherResponse.overall)))
    && (!teacherBoundaryApplicable || boundaryAnswered)
    && (!studentAsked || (studentInequalitiesAnswered && answered(studentResponse.overall)))
    && (!askVertices || verticesComplete);

  return gradedResult({ parts, isComplete, isCorrect: allOf(parts) });
};

const inequalities = (question, work) => (
  studentBuildInequalityEnabled(question)
    ? studentBuildInequalities(question, work)
    : legacyInequalities(question, work)
);

// ---------------------------------------------------------------------------
// spatial — the three-plane model's "Interpret what you found" answers
//   work { responses: [{ id, value }] }  (one per answer field, by id)
// A list of { id, value } rather than an object keyed by field id, so no field
// id can ever collide with a key the response contract strips.
// All or nothing, as the workspace scored it; each field is still a part.
// ---------------------------------------------------------------------------
const spatial = (question, work) => {
  const answerFields = Array.isArray(question.answerFields) ? question.answerFields : [];
  // An exploration-only model has no Check: nothing to grade.
  if (!answerFields.length) return ungradedResult('non-graded:spatial-exploration');
  const sent = list(work.responses).filter(isRecord);
  const responsesById = Object.create(null);
  multiAnswerFields({ answerFields }).forEach((field) => {
    const match = sent.find((item) => item.id !== null && item.id !== undefined && String(item.id) === String(field.id));
    responsesById[field.id] = match ? match.value : '';
  });
  const grade = gradeMultiAnswerResponse({ answerFields }, responsesById);
  return gradedResult({
    parts: grade.parts,
    isComplete: grade.isComplete,
    isCorrect: grade.isCorrect,
    score: grade.isCorrect ? 1 : 0,
  });
};

export default {
  linear,
  inequalities,
  linearQuadratic,
  matrix,
  matrix3: matrix,
  spatial,
};
