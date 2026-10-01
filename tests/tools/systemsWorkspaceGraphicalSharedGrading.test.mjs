import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import systemsWorkspaceGrader from '../../functions/shared/serverGrading/tools/systemsWorkspace.mjs';
import graphicalGraders from '../../functions/shared/serverGrading/tools/systemsWorkspace/graphical.mjs';
import systemsWorkspaceDeclaration from '../../functions/shared/serverGrading/declarations/systemsWorkspace.mjs';
import graphicalModes, { graphicalModeSupport } from '../../functions/shared/serverGrading/declarations/systemsWorkspace/graphical.mjs';
import { GRADING_MANIFEST } from '../../functions/shared/serverGrading/gradingManifest.mjs';
import { GRADING_AUTHORITY } from '../../functions/shared/serverGrading/gradingAuthority.mjs';
import { TOOL_GRADERS } from '../../functions/shared/serverGrading/toolGraders.mjs';
import { resolveToolMode } from '../../functions/shared/serverGrading/toolGraderDefinition.mjs';
import { gradeServerResponse, serverResponseGradingSupport } from '../../functions/shared/serverGrading/serverResponseGrading.mjs';
import { TOOL_RESPONSE_LIMITS, boundToolWork, canonicalToolWorkJson } from '../../functions/shared/serverGrading/toolResponseContract.mjs';
import { gradeMultiAnswerResponse } from '../../functions/shared/ordinaryResponseGrading.mjs';
import { matchesNumericAnswer, parseNumericAnswer, solveTwoLines } from '../../functions/shared/toolMath/shared/toolMath.mjs';
import {
  SYSTEMS_WORKSPACE_DEFAULTS,
  matrix3x4Rows,
  samePointSet,
  satisfiesLinearInequality,
  solve2x2System,
  solve3x3System,
  solveLinearQuadratic,
  normalizeSystemsWorkspaceInequalityConfig,
} from '../../functions/shared/toolMath/systemsWorkspace/systemsMath.mjs';
import {
  authoredBoundaryFromInequality,
  boundaryFromHorizontal,
  boundaryFromTwoPoints,
  boundaryFromVertical,
  classifyFeasibleRegion,
  feasibleRegionVertices,
  lineSegmentForBounds,
  pointOnBoundaryLine,
  satisfiesBoundary,
  studentBuildInequalityEnabled,
} from '../../functions/shared/toolMath/systemsWorkspace/inequalityBuilderAdapter.mjs';
import { resolveSystemsWorkspaceMode as resolveToolModeForComponent } from '../../functions/shared/toolMath/systemsWorkspace/systemsWorkspaceMode.mjs';
import { gradeToolCheck } from '../../src/tools/shared/sharedToolGrading.js';
import { buildPrivateToolGrading, gradePathResponse } from '../../functions/shared/pathToolContracts.mjs';
import { executableSource, region } from '../platform/helpers/sourceContract.mjs';

/*
 * SYSTEMS WORKSPACE (GRAPHICAL MODES): ONE VERDICT, WHEREVER IT IS COMPUTED.
 *
 * linear, inequalities (legacy analyze / construct, and the staged
 * student-build workspace with its rewrite / modeling / reasoning steps),
 * linearQuadratic, matrix, matrix3 and spatial used to mark themselves inline
 * in SystemsWorkspace.jsx / ThreePlaneWorkspace.jsx. Each Check now asks the
 * shared grader, and the server runs the same grader over the same bytes.
 * These tests pin:
 *
 *   1. the extraction is faithful — for every fixture the shared grader
 *      returns the verdict the old inline Check returned (LEGACY_* below are
 *      that code, verbatim apart from taking state as arguments), except for
 *      the two documented fixes;
 *   2. the browser path (gradeToolCheck) and the server path
 *      (gradeServerResponse over the JSON the browser sent) agree exactly;
 *   3. the work is student work only, bounded, and tamper-proof;
 *   4. the declaration routes every question to the view the workspace draws.
 */

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const workspace = executableSource(read('src/tools/systemsWorkspace/SystemsWorkspace.jsx'));
const threePlanes = executableSource(read('src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx'));
const rewriteSource = executableSource(read('src/tools/systemsWorkspace/EmbeddedInequalityRewrite.jsx'));

const sw = (fields) => ({ type: 'systemsWorkspace', prompt: 'Systems', ...fields });

// ---------------------------------------------------------------------------
// The browser path and the server path, over the same bytes.
// ---------------------------------------------------------------------------
const gradeBothWays = (question, work) => {
  const browser = gradeToolCheck(systemsWorkspaceGrader, question, work);
  assert.ok(browser.toolResponse, 'the browser path builds the tool response it sends');
  const server = gradeServerResponse({ question, response: JSON.parse(JSON.stringify(browser.toolResponse)) });
  assert.equal(server.graded, browser.graded, `server graded=${server.graded} (${server.reason}), browser graded=${browser.graded} (${browser.reason})`);
  if (browser.graded) {
    assert.equal(server.isCorrect, browser.isCorrect, 'isCorrect');
    assert.equal(server.isComplete, browser.isComplete, 'isComplete');
    assert.equal(server.score, browser.score, 'score');
    assert.deepEqual(server.parts, browser.parts, 'parts');
    assert.equal(server.surfaceId, 'systemsWorkspace');
  } else {
    assert.equal(server.reason, browser.reason);
  }
  return browser;
};

const partIds = (result) => result.parts.map((item) => item.id);
const partOf = (result, id) => result.parts.find((item) => item.id === id);
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-12, `${message}: ${actual} vs ${expected}`);

const agreesWithLegacy = (shared, legacy, label) => {
  assert.equal(shared.isCorrect, legacy.isCorrect, `${label}: isCorrect (legacy ${legacy.isCorrect})`);
  close(shared.score, legacy.score, `${label}: score`);
};

// ===========================================================================
// LEGACY ORACLES — the pre-refactor inline Check handlers, verbatim.
// ===========================================================================
const LEGACY_DEFAULT_SYSTEM = { m1: 2, b1: 1, m2: -1, b2: 7 };
const LEGACY_DEFAULT_INEQUALITIES = [
  { m: 1, b: 1, relation: '>=' },
  { m: -0.5, b: 6, relation: '<=' },
];
const LEGACY_DEFAULT_LINEAR_QUADRATIC = {
  line: { m: 1, b: 2 },
  quadratic: { a: 1, b: 0, c: -4 },
};
const LEGACY_DEFAULT_MATRIX = { a11: 2, a12: 1, b1: 7, a21: 1, a22: -1, b2: 2 };

const LEGACY_LINEAR = (questionData, { x, y, classification }) => {
  const system = questionData.system || LEGACY_DEFAULT_SYSTEM;
  const solution = solveTwoLines(system);
  const classCorrect = classification === solution.type;
  const coordinateCorrect = solution.type !== 'one' || (matchesNumericAnswer(x, solution.x, 0.05) && matchesNumericAnswer(y, solution.y, 0.05));
  const parts = solution.type === 'one' ? [classCorrect, coordinateCorrect] : [classCorrect];
  return { isCorrect: parts.every(Boolean), score: parts.filter(Boolean).length / parts.length };
};

const LEGACY_INEQUALITY = (questionData, { construction, testChoice, x, y }) => {
  const inequalities = questionData.inequalities || LEGACY_DEFAULT_INEQUALITIES;
  const ask = Array.isArray(questionData.ask) && questionData.ask.length
    ? questionData.ask
    : questionData.interaction === 'construct' ? ['construction'] : ['testPoint', 'candidate'];
  const requiresConstruction = ask.includes('construction');
  const testPoint = questionData.testPoint || { x:2, y:4 };
  const expectedTestPoint = inequalities.every((ineq) => satisfiesLinearInequality(ineq, testPoint.x, testPoint.y));
  const parts = [];
  const responseConstruction = construction.map((entry) => ({
    points: [
      { x:parseNumericAnswer(entry.x1), y:parseNumericAnswer(entry.y1) },
      { x:parseNumericAnswer(entry.x2), y:parseNumericAnswer(entry.y2) },
    ],
    boundaryStyle:entry.boundaryStyle,
    shade:entry.shade,
  }));
  if (requiresConstruction) {
    inequalities.forEach((ineq, index) => {
      const entry = responseConstruction[index];
      const [first, second] = entry.points;
      const boundaryCorrect = [first, second].every((point) => (
        point.x != null && point.y != null
        && Math.abs(point.y - (Number(ineq.m) * point.x + Number(ineq.b))) <= 0.08
      )) && first.x != null && second.x != null
        && Math.hypot(first.x - second.x, first.y - second.y) > 0.08;
      const styleCorrect = entry.boundaryStyle === (String(ineq.relation).includes('=') ? 'solid' : 'dashed');
      const shadeCorrect = entry.shade === (String(ineq.relation).includes('>') ? 'above' : 'below');
      parts.push(boundaryCorrect, styleCorrect, shadeCorrect);
    });
  }
  const candidate = { x:parseNumericAnswer(x), y:parseNumericAnswer(y) };
  const candidateFeasible = candidate.x != null && candidate.y != null && inequalities.every((ineq)=>satisfiesLinearInequality(ineq,candidate.x,candidate.y));
  const testCorrect = (testChoice === 'yes') === expectedTestPoint;
  if (ask.includes('testPoint')) parts.push(testCorrect);
  if (ask.includes('candidate')) parts.push(candidateFeasible);
  const score = parts.length ? parts.filter(Boolean).length / parts.length : 0;
  return { isCorrect:parts.length > 0 && parts.every(Boolean), score };
};

const LEGACY_LINEAR_QUADRATIC = (questionData, { count, values }) => {
  const config = questionData.linearQuadratic || LEGACY_DEFAULT_LINEAR_QUADRATIC;
  const intersections = solveLinearQuadratic(config);
  const studentPoints = Number(count) === 1
    ? [{x:parseNumericAnswer(values.x1),y:parseNumericAnswer(values.y1)}]
    : Number(count) >= 2
      ? [{x:parseNumericAnswer(values.x1),y:parseNumericAnswer(values.y1)},{x:parseNumericAnswer(values.x2),y:parseNumericAnswer(values.y2)}]
      : [];
  const countCorrect = count !== '' && Number(count) === intersections.length;
  const allEntered = studentPoints.every((point) => point.x != null && point.y != null);
  const coordsCorrect = countCorrect && allEntered && samePointSet(studentPoints, intersections, 0.1);
  const parts = intersections.length ? [countCorrect,coordsCorrect] : [countCorrect];
  return { isCorrect:parts.every(Boolean), score:parts.filter(Boolean).length/parts.length };
};

const LEGACY_MATRIX = (questionData, { classification, x, y, z, technologyUsed }) => {
  const matrix = questionData.matrix || LEGACY_DEFAULT_MATRIX;
  const isMatrix3 = questionData.mode === 'matrix3' || Boolean(matrix3x4Rows(matrix));
  const solution = isMatrix3 ? solve3x3System(matrix) : solve2x2System(matrix);
  if (isMatrix3 && !technologyUsed) return null; // the button is disabled; nothing is submitted
  const classCorrect = classification === solution.type;
  const coordsCorrect = solution.type !== 'one' || (
    matchesNumericAnswer(x,solution.x,0.05)
    && matchesNumericAnswer(y,solution.y,0.05)
    && (!isMatrix3 || matchesNumericAnswer(z,solution.z,0.05))
  );
  const technologyCorrect = !isMatrix3 || technologyUsed;
  const parts = solution.type === 'one'
    ? [classCorrect,technologyCorrect,coordsCorrect]
    : [classCorrect,technologyCorrect];
  return { isCorrect:parts.every(Boolean), score:parts.filter(Boolean).length/parts.length };
};

const LEGACY_SPATIAL = (questionData, responses) => {
  const answerFields = Array.isArray(questionData.answerFields) ? questionData.answerFields : [];
  const grade = answerFields.length ? gradeMultiAnswerResponse({ answerFields }, responses) : { isCorrect: true, isComplete: true, parts: [] };
  return { isCorrect: grade.isCorrect, score: grade.isCorrect ? 1 : 0 };
};

// --- student-build: the old in-component helpers and finalCheck, verbatim ---
const legacyExplicit = (answer, expected) => (
  (answer === 'yes' || answer === 'no') && (answer === 'yes') === Boolean(expected)
);
const legacyStudentLine = (entry) => {
  if (!entry) return null;
  if (entry.method === 'points') {
    if (!entry.point1Plotted || !entry.point2Plotted) return null;
    return boundaryFromTwoPoints(
      [parseNumericAnswer(entry.x1), parseNumericAnswer(entry.y1)],
      [parseNumericAnswer(entry.x2), parseNumericAnswer(entry.y2)],
    );
  }
  if (entry.method === 'slopeIntercept') {
    if (!entry.point1Plotted || !entry.point2Plotted) return null;
    const m = parseNumericAnswer(entry.slope);
    const b = parseNumericAnswer(entry.intercept);
    const x1 = parseNumericAnswer(entry.x1);
    const y1 = parseNumericAnswer(entry.y1);
    const x2 = parseNumericAnswer(entry.x2);
    const y2 = parseNumericAnswer(entry.y2);
    if ([m, b, x1, y1, x2, y2].some((value) => value == null)) return null;
    const fromStudentPoints = boundaryFromTwoPoints([x1, y1], [x2, y2]);
    if (!fromStudentPoints || Math.abs(x1) > 0.08 || Math.abs(y1 - b) > 0.08) return null;
    const movementSlope = (y2 - y1) / (x2 - x1);
    return Math.abs(movementSlope - m) <= 0.08 ? fromStudentPoints : null;
  }
  if (entry.method === 'vertical') {
    const c = parseNumericAnswer(entry.constant);
    return c == null ? null : boundaryFromVertical(c);
  }
  if (entry.method === 'horizontal') {
    const c = parseNumericAnswer(entry.constant);
    return c == null ? null : boundaryFromHorizontal(c);
  }
  return null;
};
const legacyLinesMatch = (candidate, authored, bounds) => {
  if (!candidate) return false;
  const [p1, p2] = lineSegmentForBounds(authored, bounds);
  return pointOnBoundaryLine(candidate, p1[0], p1[1], 0.08) && pointOnBoundaryLine(candidate, p2[0], p2[1], 0.08);
};
const legacyModelingCanonical = (entry) => {
  if (!entry) return null;
  const a = parseNumericAnswer(entry.coeffA);
  const b = parseNumericAnswer(entry.coeffB);
  const rhs = parseNumericAnswer(entry.constant);
  if (a == null || b == null || rhs == null || !entry.relation) return null;
  if (Math.abs(a) <= 1e-12 && Math.abs(b) <= 1e-12) return null;
  return { A:a, B:b, C:-rhs, relation:entry.relation };
};
const legacyFlip = (relation) => ({ '>':'<', '>=':'<=', '<':'>', '<=':'>=' }[relation] || relation);
const legacyEquivalent = (actual, expected, tolerance = 1e-6) => {
  if (!actual || !expected) return false;
  const a = [Number(actual.A), Number(actual.B), Number(actual.C)];
  const e = [Number(expected.A), Number(expected.B), Number(expected.C)];
  const pivot = e.findIndex((value) => Math.abs(value) > tolerance);
  if (pivot < 0 || a.some((value) => !Number.isFinite(value)) || e.some((value) => !Number.isFinite(value))) return false;
  const scale = a[pivot] / e[pivot];
  if (!Number.isFinite(scale) || Math.abs(scale) <= tolerance) return false;
  const coefficientsMatch = a.every((value, index) => (
    Math.abs(value - scale * e[index]) <= tolerance * Math.max(1, Math.abs(value), Math.abs(scale * e[index]))
  ));
  if (!coefficientsMatch) return false;
  const expectedRelation = scale > 0 ? expected.relation : legacyFlip(expected.relation);
  return actual.relation === expectedRelation;
};
const legacyModelingCorrect = (entry, expected) => {
  if (!entry || !expected) return false;
  return legacyEquivalent(legacyModelingCanonical(entry), expected);
};
// EmbeddedInequalityRewrite's sameConstraint, verbatim — what set verifiedConstraint.
const legacyReverse = (relation) => ({ '<': '>', '<=': '>=', '>': '<', '>=': '<=', '=': '=' }[relation] || relation);
const legacySameConstraint = (actual, expected, tolerance = 1e-7) => {
  if (!actual || !expected) return false;
  const a = [actual.A, actual.B, actual.C].map(Number);
  const e = [expected.A, expected.B, expected.C].map(Number);
  const pivot = e.findIndex((value) => Math.abs(value) > tolerance);
  if (pivot < 0 || a.some((value) => !Number.isFinite(value))) return false;
  const scale = a[pivot] / e[pivot];
  if (!Number.isFinite(scale) || Math.abs(scale) <= tolerance) return false;
  if (!a.every((value, index) => (
    Math.abs(value - scale * e[index]) <= tolerance * Math.max(1, Math.abs(value), Math.abs(scale * e[index]))
  ))) return false;
  return actual.relation === (scale < 0 ? legacyReverse(expected.relation) : expected.relation);
};

const LEGACY_STUDENT_BUILD = (questionData, state) => {
  const inequalityConfig = normalizeSystemsWorkspaceInequalityConfig(questionData);
  const buildConfig = inequalityConfig.studentBuild;
  const reasoningConfig = inequalityConfig.reasoning;
  const hasBuildSteps = Object.values(buildConfig).some(Boolean);
  const legacyStudentBuild = questionData.studentBuild === true;
  const bounds = questionData.graph || { xMin:-6, xMax:8, yMin:-4, yMax:10 };
  const modeling = questionData.modeling || null;
  const rawExpectedConstraints = questionData.expectedConstraints || questionData.inequalities || LEGACY_DEFAULT_INEQUALITIES;
  const expectedConstraints = modeling
    ? (modeling.expectedConstraints || []).map((c) => ({ A:Number(c.A ?? 0), B:Number(c.B ?? 0), C:Number(c.C ?? 0), relation:c.relation || '>=' }))
    : rawExpectedConstraints.map(authoredBoundaryFromInequality);
  const constraintCount = expectedConstraints.length;
  const askClassification = questionData.askClassification != null ? Boolean(questionData.askClassification) : (legacyStudentBuild || reasoningConfig.classifyRegion);
  const askVertices = questionData.askVertices != null ? Boolean(questionData.askVertices) : reasoningConfig.vertices;
  const boundaryProbeEnabled = legacyStudentBuild || reasoningConfig.boundaryProbe;
  const teacherTestPoint = questionData.testPoint || null;
  const testPointReasoningEnabled = legacyStudentBuild
    ? Boolean(teacherTestPoint || questionData.allowStudentTestPoint)
    : (reasoningConfig.testPoint || Boolean(teacherTestPoint) || Boolean(questionData.allowStudentTestPoint));
  const allowStudentTestPoint = questionData.allowStudentTestPoint != null
    ? Boolean(questionData.allowStudentTestPoint)
    : (reasoningConfig.testPoint && !teacherTestPoint);
  const {
    modelingEntries = [], modelingSent = !modeling, rewriteEntries = [], build, regionClassification = '',
    teacherPointResponse, studentTestPoint = null, studentPointResponse, vertices = [],
  } = state;
  const modeledConstraints = modeling ? modelingEntries.map(legacyModelingCanonical) : [];
  const workingConstraints = (() => {
    if (modeling && modelingSent && modeledConstraints.every(Boolean)) return modeledConstraints;
    if (buildConfig.rewrite) return expectedConstraints.map((expected, index) => rewriteEntries[index]?.verifiedConstraint || expected);
    return expectedConstraints;
  })();
  const workingClassification = classifyFeasibleRegion(workingConstraints);
  const workingVertices = feasibleRegionVertices(workingConstraints);
  const studentLines = build.map(legacyStudentLine);
  const boundaryCorrect = (index) => !buildConfig.boundary || legacyLinesMatch(studentLines[index], workingConstraints[index], bounds);
  const styleCorrect = (index) => !buildConfig.lineStyle
    || build[index]?.style === (String(workingConstraints[index]?.relation || '>=').includes('=') ? 'solid' : 'dashed');
  const shadeCorrect = (index) => {
    if (!buildConfig.shading) return true;
    const point = build[index]?.shadePoint;
    return Boolean(point) && satisfiesBoundary(workingConstraints[index], point[0], point[1]);
  };
  const boundaryVerified = (index) => !buildConfig.boundary || (build[index]?.boundaryAttempts > 0 && boundaryCorrect(index));
  const styleVerified = (index) => !buildConfig.lineStyle || (build[index]?.styleAttempts > 0 && styleCorrect(index));
  const shadeVerified = (index) => !buildConfig.shading || (build[index]?.shadeAttempts > 0 && shadeCorrect(index));
  const rewriteVerified = (index) => !buildConfig.rewrite || Boolean(rewriteEntries[index]?.verifiedConstraint);
  const constraintVerified = (index) => rewriteVerified(index) && boundaryVerified(index) && styleVerified(index) && shadeVerified(index);
  const onBoundaryIndex = (point) => (point ? workingConstraints.findIndex((b) => pointOnBoundaryLine(b, point[0], point[1], 0.12)) : -1);
  const membership = (point) => workingConstraints.map((b) => satisfiesBoundary(b, point[0], point[1]));
  const vertexIncludedExpected = (vertex) => {
    const match = workingVertices.find((v) => Math.hypot(v.x - vertex.x, v.y - vertex.y) <= 0.15);
    return match ? match.included : null;
  };
  // finalCheck
  const perConstraint = Array.from({ length: constraintCount }, (_, index) => ({ constraintCorrect: hasBuildSteps ? constraintVerified(index) : null }));
  const modelingChecks = modeling ? (() => {
    const unmatchedExpected = new Set(expectedConstraints.map((_, index) => index));
    return modelingEntries.map((entry) => {
      const matchedIndex = expectedConstraints.findIndex((expected, index) => (
        unmatchedExpected.has(index) && legacyModelingCorrect(entry, expected)
      ));
      if (matchedIndex < 0) return false;
      unmatchedExpected.delete(matchedIndex);
      return true;
    });
  })() : [];
  const classificationCorrect = !askClassification || regionClassification === workingClassification;
  const teacherPointApplicable = Boolean(teacherTestPoint);
  const teacherMembership = teacherPointApplicable ? membership([teacherTestPoint.x, teacherTestPoint.y]) : [];
  const teacherPerInequalityCorrect = teacherPointApplicable && teacherPointResponse.perInequality.every((value, index) => legacyExplicit(value, teacherMembership[index]));
  const teacherOverallCorrect = teacherPointApplicable && legacyExplicit(teacherPointResponse.overall, teacherMembership.every(Boolean));
  const teacherBoundaryIndex = teacherPointApplicable ? onBoundaryIndex([teacherTestPoint.x, teacherTestPoint.y]) : -1;
  const teacherBoundaryApplicable = teacherPointApplicable && boundaryProbeEnabled && teacherBoundaryIndex >= 0;
  const teacherBoundaryCorrect = !teacherBoundaryApplicable
    || (teacherPointResponse.onBoundary === 'yes' && legacyExplicit(teacherPointResponse.boundaryIncluded, teacherMembership.every(Boolean)));
  const studentPointApplicable = allowStudentTestPoint && Boolean(studentTestPoint);
  const studentMembership = studentPointApplicable ? membership(studentTestPoint) : [];
  const studentPerInequalityCorrect = studentPointApplicable && studentPointResponse.perInequality.every((value, index) => legacyExplicit(value, studentMembership[index]));
  const studentOverallCorrect = studentPointApplicable && legacyExplicit(studentPointResponse.overall, studentMembership.every(Boolean));
  const vertexResults = vertices.map((vertex) => {
    const expected = vertexIncludedExpected(vertex);
    return { vertexCorrect: expected != null && legacyExplicit(vertex.includedAnswer, expected) };
  });
  const allExpectedVerticesFound = workingVertices.every((expected) => (
    vertices.some((vertex) => Math.hypot(vertex.x - expected.x, vertex.y - expected.y) <= 0.15)
  ));
  const vertexCoverageCorrect = !askVertices || (
    vertices.length === workingVertices.length
    && allExpectedVerticesFound
    && vertexResults.every((result) => result.vertexCorrect)
  );
  const parts = [
    ...(hasBuildSteps ? perConstraint.map((entry) => entry.constraintCorrect) : []),
    ...modelingChecks,
    ...(askClassification ? [classificationCorrect] : []),
    ...(testPointReasoningEnabled && teacherPointApplicable ? [teacherPerInequalityCorrect, teacherOverallCorrect] : []),
    ...(teacherBoundaryApplicable ? [teacherBoundaryCorrect] : []),
    ...(testPointReasoningEnabled && studentPointApplicable ? [studentPerInequalityCorrect, studentOverallCorrect] : []),
    ...(askVertices ? [vertexCoverageCorrect] : []),
  ];
  const score = parts.length ? parts.filter(Boolean).length / parts.length : 0;
  return { isCorrect: parts.length > 0 && parts.every(Boolean), score, partCount: parts.length };
};

// ===========================================================================
// THE WORK EACH MODE SUBMITS — mirrors of the component's `work` objects
// (their shape is pinned against the component source further down).
// ===========================================================================
const linearWork = ({ x = '', y = '', classification = 'one' }) => ({ x, y, classification });

const inequalityWork = (question, { construction, testChoice = '', x = '', y = '' }) => {
  const ask = Array.isArray(question.ask) && question.ask.length
    ? question.ask
    : question.interaction === 'construct' ? ['construction'] : ['testPoint', 'candidate'];
  return {
    construction: construction.map((entry) => ({
      points: [
        { x: parseNumericAnswer(entry.x1), y: parseNumericAnswer(entry.y1) },
        { x: parseNumericAnswer(entry.x2), y: parseNumericAnswer(entry.y2) },
      ],
      boundaryStyle: entry.boundaryStyle,
      shade: entry.shade,
    })),
    ...(ask.includes('testPoint') ? { testChoice } : {}),
    ...(ask.includes('candidate') ? { candidate: { x: parseNumericAnswer(x), y: parseNumericAnswer(y) } } : {}),
  };
};

const lqWork = ({ count = '', values = { x1: '', y1: '', x2: '', y2: '' } }) => {
  const studentPoints = Number(count) === 1
    ? [{ x: parseNumericAnswer(values.x1), y: parseNumericAnswer(values.y1) }]
    : Number(count) >= 2
      ? [{ x: parseNumericAnswer(values.x1), y: parseNumericAnswer(values.y1) }, { x: parseNumericAnswer(values.x2), y: parseNumericAnswer(values.y2) }]
      : [];
  return { count: parseNumericAnswer(count), points: studentPoints };
};

const matrixWork = (question, { classification = 'one', x = '', y = '', z = '', technologyUsed = false }) => {
  const matrix = question.matrix || SYSTEMS_WORKSPACE_DEFAULTS.matrix;
  const isMatrix3 = question.mode === 'matrix3' || Boolean(matrix3x4Rows(matrix));
  return { classification, x, y, ...(isMatrix3 ? { z, technologyUsed } : {}) };
};

const spatialWork = (question, responses) => ({
  responses: (question.answerFields || [])
    .filter((field) => field?.id !== undefined && field?.id !== null && field?.id !== '')
    .map((field) => ({ id: field.id, value: responses?.[field.id] ?? '' })),
});

const studentBuildWork = (question, state) => {
  const config = normalizeSystemsWorkspaceInequalityConfig(question);
  const modeling = question.modeling || null;
  const teacherPointApplicable = Boolean(question.testPoint);
  const allowStudentTestPoint = question.allowStudentTestPoint != null
    ? Boolean(question.allowStudentTestPoint)
    : (config.reasoning.testPoint && !question.testPoint);
  const studentPointApplicable = allowStudentTestPoint && Boolean(state.studentTestPoint);
  return {
    ...(modeling ? { modelingEntries: state.modelingEntries, modelingSent: Boolean(state.modelingSent) } : {}),
    ...(config.studentBuild.rewrite ? {
      rewrite: (state.rewriteEntries || []).map((entry) => ({
        relation: String(entry?.committedText ?? '').slice(0, 300),
        graphingForm: entry?.graphingForm !== undefined ? entry.graphingForm : (entry?.verifiedConstraint || null),
      })),
    } : {}),
    build: state.build,
    regionClassification: state.regionClassification ?? '',
    ...(teacherPointApplicable ? { teacherPointResponse: state.teacherPointResponse } : {}),
    ...(studentPointApplicable ? { studentTestPoint: state.studentTestPoint, studentPointResponse: state.studentPointResponse } : {}),
    vertices: state.vertices || [],
  };
};

const emptyBuild = () => ({
  method: '', x1: '', y1: '', x2: '', y2: '', slope: '', intercept: '', constant: '',
  point1Plotted: false, point2Plotted: false,
  boundaryAttempts: 0, style: '', styleAttempts: 0, shadePoint: null, shadeAttempts: 0, visible: true,
});
const pointsBuild = ([x1, y1], [x2, y2], extra = {}) => ({
  ...emptyBuild(), method: 'points', x1, y1, x2, y2, point1Plotted: true, point2Plotted: true, boundaryAttempts: 1, ...extra,
});
const emptyPointResponse = (count) => ({ overall: '', perInequality: Array.from({ length: count }, () => ''), onBoundary: '', boundaryIncluded: '' });

// ===========================================================================
// DECLARATION
// ===========================================================================
test('every graphical mode is server-authoritative, and the tool grader binds a function for each', () => {
  const declaration = GRADING_MANIFEST.systemsWorkspace;
  assert.equal(declaration, systemsWorkspaceDeclaration);
  assert.equal(declaration.contractVersion, 1);
  assert.equal(declaration.defaultMode, 'linear');
  for (const mode of ['linear', 'inequalities', 'linearQuadratic', 'matrix', 'matrix3', 'spatial']) {
    assert.equal(graphicalModes[mode].authority, GRADING_AUTHORITY.SHARED_SERVER, mode);
    assert.equal(declaration.modes[mode].authority, GRADING_AUTHORITY.SHARED_SERVER, mode);
    assert.equal(typeof graphicalGraders[mode], 'function', mode);
    assert.equal(typeof systemsWorkspaceGrader.modeGraders[mode], 'function', mode);
  }
  assert.equal(TOOL_GRADERS.systemsWorkspace, systemsWorkspaceGrader);
});

// The component's routing (SystemsWorkspace default export), restated so a
// question can be routed without rendering React. Pinned to the source below.
const componentView = (question) => {
  const mode = resolveToolModeForComponent(question);
  if (mode === 'inequalities') return 'inequalities';
  if (mode === 'linearQuadratic') return 'linearQuadratic';
  if (mode === 'matrix' || mode === 'matrix3') return mode;
  if (mode === 'spatial') return 'spatial';
  if (mode === 'algebraic') return 'algebraic';
  return 'linear';
};

test('the declaration resolves every question to the view the workspace actually draws', () => {
  const dispatch = region(workspace, 'export default function SystemsWorkspace(', null, 'SystemsWorkspace dispatch');
  assert.match(dispatch, /const mode = resolveSystemsWorkspaceMode\(questionData\);/);
  assert.match(dispatch, /\{mode === 'inequalities' \? <InequalityMode[\s\S]*?: mode === 'linearQuadratic' \? <LinearQuadraticMode[\s\S]*?: \(mode === 'matrix' \|\| mode === 'matrix3'\) \? <MatrixMode[\s\S]*?: mode === 'spatial' \? <ThreePlaneWorkspace[\s\S]*?: mode === 'algebraic' \?[\s\S]*?: <LinearMode questionData=\{questionData\} onAction=\{onAction\}\/>\s*\}/,
    'the workspace falls back to the linear view for any mode it does not draw');

  const questions = [
    sw({}),
    sw({ mode: 'linear', system: { m1: 1, b1: 2, m2: -1, b2: 6 } }),
    sw({ mode: 'bogus' }),
    sw({ mode: 'algebraic3' }),
    sw({ mode: 'inequalities' }),
    sw({ mode: 'inequalities', studentBuild: true }),
    sw({ mode: 'linearQuadratic' }),
    sw({ mode: 'matrix' }),
    sw({ mode: 'matrix', matrix: { rows: [[1, 0, 0, 1], [0, 1, 0, 2], [0, 0, 1, 3]] } }),
    sw({ mode: 'matrix3' }),
    sw({ mode: 'spatial', answerFields: [{ id: 'a', answer: 'x' }] }),
    sw({ spatialModel: { kind: 'threePlanes' }, studentActions: ['connectRepresentations'], equations: ['x+y+z=6', 'x-y=0', 'z=1'], variables: ['x', 'y', 'z'] }),
    sw({ mode: 'linear', method: 'substitution', studentActions: ['solveSystem'], equations: ['y = x', 'x + y = 2'] }),
  ];
  for (const question of questions) {
    assert.equal(resolveToolMode(systemsWorkspaceDeclaration, question), componentView(question), JSON.stringify(question));
  }
  // An unknown mode is graded as the linear system it shows, not refused.
  assert.equal(gradeBothWays(sw({ mode: 'bogus' }), linearWork({ x: '2', y: '5' })).isCorrect, true);
});

test('a spatial model with no answer fields is an exploration with nothing to grade', () => {
  assert.deepEqual(graphicalModeSupport(sw({ mode: 'spatial' }), 'spatial'), { supported: false, reason: 'non-graded:spatial-exploration' });
  assert.equal(graphicalModeSupport(sw({ mode: 'spatial', answerFields: [{ id: 'a' }] }), 'spatial').supported, true);
  assert.equal(graphicalModeSupport(sw({ mode: 'linear' }), 'linear').supported, true);
  const result = gradeBothWays(sw({ mode: 'spatial' }), { responses: [] });
  assert.equal(result.graded, false);
  assert.equal(result.reason, 'non-graded:spatial-exploration');
  // Readiness and Pre-Flight ask the registry, which must say the same.
  const exploration = serverResponseGradingSupport(sw({ mode: 'spatial' }));
  assert.equal(exploration.supported, false);
  assert.equal(exploration.reason, 'non-graded:spatial-exploration');
  assert.equal(serverResponseGradingSupport(sw({ mode: 'spatial', answerFields: [{ id: 'a', answer: 'x' }] })).supported, true);
  assert.equal(serverResponseGradingSupport(sw({ mode: 'linear' })).supported, true);
});

// ===========================================================================
// LINEAR
// ===========================================================================
test('linear: correct, incorrect, partial, equivalent forms and unauthored defaults match the old Check', () => {
  const unique = sw({ mode: 'linear', system: { m1: 1, b1: 0, m2: -2, b2: 7 } }); // meets at (7/3, 7/3)
  const parallel = sw({ mode: 'linear', system: { m1: 2, b1: 1, m2: 2, b2: 5 } });
  const same = sw({ mode: 'linear', system: { m1: -1, b1: 3, m2: -1, b2: 3 } });
  const fixtures = [
    [unique, { classification: 'one', x: '7/3', y: '7/3' }, true, 1],
    [unique, { classification: 'one', x: '2.34', y: '2.32' }, true, 1],
    [unique, { classification: 'one', x: ' 2.333 ', y: '2.333' }, true, 1],
    [unique, { classification: 'one', x: '2.5', y: '2.333' }, false, 0.5],
    [unique, { classification: 'none', x: '', y: '' }, false, 0],
    // Hidden, stale coordinates keep the coordinate part, exactly as before.
    [unique, { classification: 'none', x: '7/3', y: '7/3' }, false, 0.5],
    [unique, { classification: 'one', x: '', y: '' }, false, 0.5],
    [parallel, { classification: 'none', x: '', y: '' }, true, 1],
    [parallel, { classification: 'one', x: '1', y: '3' }, false, 0],
    [same, { classification: 'infinite' }, true, 1],
    [same, { classification: 'none' }, false, 0],
    [sw({}), { classification: 'one', x: '2', y: '5' }, true, 1], // DEFAULT_SYSTEM meets at (2, 5)
    [sw({ mode: 'linear' }), { classification: 'one', x: '1', y: '3' }, false, 0.5],
  ];
  for (const [question, state, isCorrect, score] of fixtures) {
    const result = gradeBothWays(question, linearWork(state));
    assert.equal(result.isCorrect, isCorrect, JSON.stringify(state));
    close(result.score, score, JSON.stringify(state));
    agreesWithLegacy(result, LEGACY_LINEAR(question, linearWork(state)), JSON.stringify(state));
  }
  assert.deepEqual(partIds(gradeBothWays(unique, linearWork({ classification: 'one', x: '1', y: '1' }))), ['classification', 'solution']);
  assert.deepEqual(partIds(gradeBothWays(parallel, linearWork({ classification: 'none' }))), ['classification']);
});

test('linear: completeness means a classification plus the point it calls for', () => {
  const unique = sw({ mode: 'linear', system: { m1: 1, b1: 0, m2: -2, b2: 7 } });
  assert.equal(gradeBothWays(unique, linearWork({ classification: 'one', x: '2', y: '' })).isComplete, false);
  assert.equal(gradeBothWays(unique, linearWork({ classification: 'one', x: '2', y: '1' })).isComplete, true);
  assert.equal(gradeBothWays(unique, linearWork({ classification: 'none' })).isComplete, true);
  assert.equal(gradeBothWays(unique, { x: '7/3', y: '7/3', classification: '' }).isComplete, false);
});

// ===========================================================================
// MATRIX / MATRIX3
// ===========================================================================
test('matrix (2×2): the old scoring, technology part included, survives the move', () => {
  const question = sw({ mode: 'matrix', matrix: { a11: 2, a12: 1, b1: 7, a21: 1, a22: -1, b2: 2 } }); // x = 3, y = 1
  const singular = sw({ mode: 'matrix', matrix: { a11: 1, a12: 2, b1: 3, a21: 2, a22: 4, b2: 6 } }); // infinite
  const fixtures = [
    [question, { classification: 'one', x: '3', y: '1' }, true, 1],
    [question, { classification: 'one', x: '3.04', y: '0.96' }, true, 1],
    [question, { classification: 'one', x: '3', y: '2' }, false, 2 / 3],
    // NOTE (kept for parity, see report): a 2×2 matrix has no technology
    // step, yet the old Check counted an always-true "technology" part, so a
    // wrong classification still earns 1/3.
    [question, { classification: 'none' }, false, 1 / 3],
    [singular, { classification: 'infinite' }, true, 1],
    [singular, { classification: 'none' }, false, 0.5],
    [sw({ mode: 'matrix' }), { classification: 'one', x: '3', y: '1' }, true, 1], // DEFAULT_MATRIX
  ];
  for (const [q, state, isCorrect, score] of fixtures) {
    const work = matrixWork(q, state);
    const result = gradeBothWays(q, work);
    assert.equal(result.isCorrect, isCorrect, JSON.stringify(state));
    close(result.score, score, JSON.stringify(state));
    agreesWithLegacy(result, LEGACY_MATRIX(q, work), JSON.stringify(state));
  }
  assert.deepEqual(partIds(gradeBothWays(question, matrixWork(question, { classification: 'one', x: '3', y: '1' }))), ['classification', 'matrix-technology', 'solution']);
});

test('matrix3: RREF technology, three coordinates, 3×4 rows read in either stored form', () => {
  const rows = [[1, 1, 1, 6], [0, 1, 1, 5], [0, 0, 1, 3]]; // x = 1, y = 2, z = 3
  const questions = [
    sw({ mode: 'matrix3', matrix: { rows } }),
    sw({ mode: 'matrix3', matrix: { rows: rows.map((cells) => ({ cells })) } }), // Firestore-safe rows
    sw({ mode: 'matrix', matrix: { rows } }), // mode 'matrix' with 3×4 rows draws the 3×3 view
    sw({ mode: 'matrix3', matrix: { a11: 1, a12: 1, a13: 1, b1: 6, a21: 0, a22: 1, a23: 1, b2: 5, a31: 0, a32: 0, a33: 1, b3: 3 } }),
  ];
  for (const q of questions) {
    const right = matrixWork(q, { classification: 'one', x: '1', y: '2', z: '3', technologyUsed: true });
    assert.ok('z' in right && 'technologyUsed' in right, 'the 3×3 view submits z and the technology flag');
    const result = gradeBothWays(q, right);
    assert.equal(result.isCorrect, true);
    agreesWithLegacy(result, LEGACY_MATRIX(q, right), 'matrix3 right');
    const wrongZ = matrixWork(q, { classification: 'one', x: '1', y: '2', z: '4', technologyUsed: true });
    const partial = gradeBothWays(q, wrongZ);
    close(partial.score, 2 / 3, 'wrong z');
    agreesWithLegacy(partial, LEGACY_MATRIX(q, wrongZ), 'matrix3 wrong z');
  }
  // The Check is disabled until the technology is used; work that arrives
  // without it anyway is incomplete and loses that part.
  const q = questions[0];
  const skipped = gradeBothWays(q, matrixWork(q, { classification: 'one', x: '1', y: '2', z: '3', technologyUsed: false }));
  assert.equal(skipped.isCorrect, false);
  assert.equal(skipped.isComplete, false);
  assert.equal(partOf(skipped, 'matrix-technology').isCorrect, false);
  close(skipped.score, 2 / 3, 'no technology');
  // A forged string flag is not the boolean the button sets.
  assert.equal(partOf(gradeBothWays(q, { classification: 'one', x: '1', y: '2', z: '3', technologyUsed: 'true' }), 'matrix-technology').isCorrect, false);
  // matrix3 with no 3×4 matrix cannot be classified; nothing matches.
  const unreadable = gradeBothWays(sw({ mode: 'matrix3' }), { classification: 'one', x: '3', y: '1', z: '0', technologyUsed: true });
  assert.equal(unreadable.isCorrect, false);
  agreesWithLegacy(unreadable, LEGACY_MATRIX(sw({ mode: 'matrix3' }), { classification: 'one', x: '3', y: '1', z: '0', technologyUsed: true }), 'unreadable');
});

// ===========================================================================
// LINEAR-QUADRATIC
// ===========================================================================
test('linearQuadratic: count and an unordered point set, with the old 0.1 tolerance', () => {
  const two = sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1, b: 2 }, quadratic: { a: 1, b: 0, c: -4 } } }); // (-2, 0), (3, 5)
  const tangent = sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 2, b: -1 }, quadratic: { a: 1, b: 0, c: 0 } } }); // (1, 1)
  const none = sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 0, b: -1 }, quadratic: { a: 1, b: 0, c: 0 } } });
  const fixtures = [
    [two, { count: '2', values: { x1: '-2', y1: '0', x2: '3', y2: '5' } }, true, 1],
    [two, { count: '2', values: { x1: '3', y1: '5', x2: '-2', y2: '0' } }, true, 1], // reordered
    [two, { count: '2', values: { x1: '3.05', y1: '4.95', x2: '-2', y2: '0.05' } }, true, 1],
    [two, { count: '2', values: { x1: '3', y1: '5', x2: '-2', y2: '1' } }, false, 0.5],
    [two, { count: '1', values: { x1: '3', y1: '5', x2: '', y2: '' } }, false, 0],
    [two, { count: '2', values: { x1: '3', y1: '5', x2: '', y2: '' } }, false, 0.5],
    [tangent, { count: '1', values: { x1: '1', y1: '1', x2: '9', y2: '9' } }, true, 1], // hidden second point ignored
    [none, { count: '0' }, true, 1],
    [none, { count: '1', values: { x1: '0', y1: '0' } }, false, 0],
    [sw({ mode: 'linearQuadratic' }), { count: '2', values: { x1: '-2', y1: '0', x2: '3', y2: '5' } }, true, 1], // default config
  ];
  for (const [q, state, isCorrect, score] of fixtures) {
    const values = { x1: '', y1: '', x2: '', y2: '', ...state.values };
    const result = gradeBothWays(q, lqWork({ count: state.count, values }));
    assert.equal(result.isCorrect, isCorrect, JSON.stringify(state));
    close(result.score, score, JSON.stringify(state));
    agreesWithLegacy(result, LEGACY_LINEAR_QUADRATIC(q, { count: state.count, values }), JSON.stringify(state));
  }
  const blank = gradeBothWays(two, lqWork({ count: '' }));
  assert.equal(blank.isComplete, false);
  assert.equal(blank.isCorrect, false);
  assert.equal(gradeBothWays(two, lqWork({ count: '2', values: { x1: '1', y1: '1', x2: '', y2: '' } })).isComplete, false);
  assert.equal(gradeBothWays(none, lqWork({ count: '0' })).isComplete, true);
});

// ===========================================================================
// INEQUALITIES — legacy analyze / construct
// ===========================================================================
const blankConstruction = (n) => Array.from({ length: n }, () => ({ x1: '', y1: '', x2: '', y2: '', boundaryStyle: '', shade: '' }));

test('inequalities (analyze): test-point judgement and a feasible point of your own', () => {
  const q = sw({ mode: 'inequalities', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }], testPoint: { x: 2, y: 4 } }); // (2,4) is inside
  const outside = sw({ mode: 'inequalities', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }], testPoint: { x: 4, y: 2 } });
  const fixtures = [
    [q, { testChoice: 'yes', x: '1', y: '4' }, true, 1],
    [q, { testChoice: 'yes', x: '1/2', y: '9/2' }, true, 1],
    [q, { testChoice: 'no', x: '1', y: '4' }, false, 0.5],
    [q, { testChoice: 'yes', x: '5', y: '0' }, false, 0.5],
    [q, { testChoice: 'yes', x: '', y: '4' }, false, 0.5],
    [outside, { testChoice: 'no', x: '0', y: '3' }, true, 1],
    [sw({ mode: 'inequalities' }), { testChoice: 'yes', x: '0', y: '3' }, true, 1], // defaults: (2,4) inside
    // The boundary itself is in a ≥ / ≤ region.
    [q, { testChoice: 'yes', x: '0', y: '1' }, true, 1],
  ];
  for (const [question, state, isCorrect, score] of fixtures) {
    const full = { construction: blankConstruction(2), ...state };
    const result = gradeBothWays(question, inequalityWork(question, full));
    assert.equal(result.isCorrect, isCorrect, JSON.stringify(state));
    close(result.score, score, JSON.stringify(state));
    agreesWithLegacy(result, LEGACY_INEQUALITY(question, full), JSON.stringify(state));
  }
  assert.deepEqual(partIds(gradeBothWays(q, inequalityWork(q, { construction: blankConstruction(2), testChoice: 'yes', x: '1', y: '4' }))), ['test-point', 'candidate-point']);
});

test('FIX: a blank test-point answer is incorrect and incomplete (it used to count as "no")', () => {
  const outside = sw({ mode: 'inequalities', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }], testPoint: { x: 4, y: 2 } });
  const state = { construction: blankConstruction(2), testChoice: '', x: '0', y: '3' };
  // Before: the blank was read as "no", which is right for an outside point.
  assert.deepEqual(LEGACY_INEQUALITY(outside, state), { isCorrect: true, score: 1 });
  // Now: an unanswered question earns nothing.
  const result = gradeBothWays(outside, inequalityWork(outside, state));
  assert.equal(result.isCorrect, false);
  assert.equal(result.isComplete, false);
  assert.equal(partOf(result, 'test-point').isCorrect, false);
  close(result.score, 0.5, 'blank test point');
  // An explicit answer is unaffected.
  assert.equal(gradeBothWays(outside, inequalityWork(outside, { ...state, testChoice: 'no' })).isCorrect, true);
});

test('inequalities (construct): two points on each boundary, solid/dashed, and the side shaded', () => {
  const q = sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }] });
  const right = [
    { x1: '0', y1: '1', x2: '2', y2: '3', boundaryStyle: 'solid', shade: 'above' },
    { x1: '0', y1: '6', x2: '4', y2: '4', boundaryStyle: 'dashed', shade: 'below' },
  ];
  const fixtures = [
    [right, true, 1],
    [[{ ...right[0], x1: '-1', y1: '0', x2: '3', y2: '4' }, right[1]], true, 1], // any two points on the line
    [[{ ...right[0], x1: '0', y1: '1.05' }, right[1]], true, 1], // within 0.08
    [[{ ...right[0], boundaryStyle: 'dashed' }, right[1]], false, 5 / 6],
    [[{ ...right[0], shade: 'below' }, { ...right[1], boundaryStyle: 'solid' }], false, 4 / 6],
    [[{ ...right[0], x2: '0', y2: '1' }, right[1]], false, 5 / 6], // the same point twice is not a line
    [[{ ...right[0], y2: '' }, right[1]], false, 5 / 6],
    [blankConstruction(2), false, 0],
  ];
  for (const [construction, isCorrect, score] of fixtures) {
    const result = gradeBothWays(q, inequalityWork(q, { construction }));
    assert.equal(result.isCorrect, isCorrect, JSON.stringify(construction));
    close(result.score, score, JSON.stringify(construction));
    agreesWithLegacy(result, LEGACY_INEQUALITY(q, { construction }), JSON.stringify(construction));
  }
  const result = gradeBothWays(q, inequalityWork(q, { construction: right }));
  assert.deepEqual(partIds(result), ['boundary-1', 'boundary-style-1', 'shade-1', 'boundary-2', 'boundary-style-2', 'shade-2']);
  assert.equal(result.isComplete, true);
  assert.equal(gradeBothWays(q, inequalityWork(q, { construction: [right[0], { ...right[1], shade: '' }] })).isComplete, false);
  // Construction plus explicit asks: every asked part is graded.
  const mixed = sw({ mode: 'inequalities', ask: ['construction', 'testPoint'], inequalities: q.inequalities, testPoint: { x: 0, y: 3 } });
  const mixedState = { construction: right, testChoice: 'yes' };
  const mixedResult = gradeBothWays(mixed, inequalityWork(mixed, mixedState));
  assert.deepEqual(partIds(mixedResult).slice(-1), ['test-point']);
  agreesWithLegacy(mixedResult, LEGACY_INEQUALITY(mixed, mixedState), 'construct + test point');
});

test('FIX: a construct inequality written with ≥ / ≤ (or no relation) expects that relation\'s style and side', () => {
  const unicode = sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 1, b: 1, relation: '≥' }, { m: -0.5, b: 6, relation: '≤' }] });
  const right = [
    { x1: '0', y1: '1', x2: '2', y2: '3', boundaryStyle: 'solid', shade: 'above' },
    { x1: '0', y1: '6', x2: '4', y2: '4', boundaryStyle: 'solid', shade: 'below' },
  ];
  // Before: the raw string '≥' contains neither '=' nor '>', so the old Check
  // expected dashed + below for y ≥ x + 1 and marked the true answer wrong.
  assert.equal(LEGACY_INEQUALITY(unicode, { construction: right }).isCorrect, false);
  const result = gradeBothWays(unicode, inequalityWork(unicode, { construction: right }));
  assert.equal(result.isCorrect, true);
  // The engine reads a missing relation as '>=' — so does the construction check.
  const unstated = sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 1, b: 1 }, { m: -0.5, b: 6, relation: '<=' }] });
  assert.equal(gradeBothWays(unstated, inequalityWork(unstated, { construction: right })).isCorrect, true);
  // ASCII relations are untouched by the fix (pinned by the parity fixtures above).
});

// ===========================================================================
// INEQUALITIES — student build
// ===========================================================================
const LEGACY_SB = sw({
  mode: 'inequalities',
  studentBuild: true,
  inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }],
  testPoint: { x: 2, y: 4 },
});
const legacySbBuild = () => [
  pointsBuild([0, 1], [2, 3], { style: 'solid', styleAttempts: 1, shadePoint: [0, 5], shadeAttempts: 1 }),
  { ...emptyBuild(), method: 'slopeIntercept', slope: '-1/2', intercept: '6', x1: 0, y1: 6, x2: 2, y2: 5, point1Plotted: true, point2Plotted: true, boundaryAttempts: 1, style: 'solid', styleAttempts: 1, shadePoint: [0.4, -1.3], shadeAttempts: 1 },
];
const legacySbState = (patch = {}) => ({
  build: legacySbBuild(),
  regionClassification: 'unbounded',
  teacherPointResponse: { overall: 'yes', perInequality: ['yes', 'yes'], onBoundary: '', boundaryIncluded: '' },
  vertices: [],
  ...patch,
});

const studentBuildCase = (question, state, label) => {
  const work = studentBuildWork(question, state);
  const result = gradeBothWays(question, work);
  const legacy = LEGACY_STUDENT_BUILD(question, state);
  agreesWithLegacy(result, legacy, label);
  assert.equal(result.parts.length, legacy.partCount, `${label}: the same number of graded parts`);
  return result;
};

test('student build (studentBuild: true): every step verified, the region classified, the teacher point reasoned', () => {
  assert.equal(studentBuildInequalityEnabled(LEGACY_SB), true);
  const right = studentBuildCase(LEGACY_SB, legacySbState(), 'all right');
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);
  assert.deepEqual(partIds(right), ['constraint-1', 'constraint-2', 'region-classification', 'teacher-point-inequalities', 'teacher-point-system']);

  const wrongShade = legacySbState({ build: [legacySbBuild()[0], { ...legacySbBuild()[1], shadePoint: [0, 8] }] });
  close(studentBuildCase(LEGACY_SB, wrongShade, 'wrong shade').score, 4 / 5, 'wrong shade');
  const wrongStyle = legacySbState({ build: [{ ...legacySbBuild()[0], style: 'dashed' }, legacySbBuild()[1]] });
  close(studentBuildCase(LEGACY_SB, wrongStyle, 'wrong style').score, 4 / 5, 'wrong style');
  // A correct step that was never checked is not verified.
  const unchecked = legacySbState({ build: [{ ...legacySbBuild()[0], styleAttempts: 0 }, legacySbBuild()[1]] });
  const uncheckedResult = studentBuildCase(LEGACY_SB, unchecked, 'unchecked style');
  assert.equal(partOf(uncheckedResult, 'constraint-1').isCorrect, false);
  assert.equal(uncheckedResult.isComplete, false);
  // Slope-intercept needs both plotted points; the slope alone draws nothing.
  const unplotted = legacySbState({ build: [legacySbBuild()[0], { ...legacySbBuild()[1], point2Plotted: false }] });
  assert.equal(partOf(studentBuildCase(LEGACY_SB, unplotted, 'unplotted'), 'constraint-2').isCorrect, false);
  // Blank yes/no answers never earn credit.
  const blank = legacySbState({ teacherPointResponse: emptyPointResponse(2), regionClassification: '' });
  const blankResult = studentBuildCase(LEGACY_SB, blank, 'blank reasoning');
  close(blankResult.score, 2 / 5, 'blank reasoning');
  assert.equal(blankResult.isComplete, false);
  studentBuildCase(LEGACY_SB, legacySbState({ regionClassification: 'bounded' }), 'wrong classification');
  studentBuildCase(LEGACY_SB, legacySbState({ teacherPointResponse: { overall: 'yes', perInequality: ['yes', 'no'], onBoundary: '', boundaryIncluded: '' } }), 'one inequality misjudged');
});

test('student build: a teacher point ON a boundary adds the boundary-inclusion probe', () => {
  const q = { ...LEGACY_SB, testPoint: { x: 0, y: 1 } }; // on y = x + 1, which is solid (≥)
  const right = studentBuildCase(q, legacySbState({ teacherPointResponse: { overall: 'yes', perInequality: ['yes', 'yes'], onBoundary: 'yes', boundaryIncluded: 'yes' } }), 'probe right');
  assert.equal(right.isCorrect, true);
  assert.deepEqual(partIds(right).slice(-1), ['teacher-point-boundary']);
  const wrong = studentBuildCase(q, legacySbState({ teacherPointResponse: { overall: 'yes', perInequality: ['yes', 'yes'], onBoundary: 'yes', boundaryIncluded: 'no' } }), 'probe wrong');
  assert.equal(partOf(wrong, 'teacher-point-boundary').isCorrect, false);
  assert.equal(studentBuildCase(q, legacySbState({ teacherPointResponse: { overall: 'yes', perInequality: ['yes', 'yes'], onBoundary: '', boundaryIncluded: '' } }), 'probe blank').isComplete, false);
});

test('student build (reasoning only): region classification and full vertex coverage with inclusion', () => {
  const q = sw({
    mode: 'inequalities',
    reasoning: { classifyRegion: true, vertices: true },
    inequalities: [{ m: 0, b: 0, relation: '>=' }, { orientation: 'vertical', x: 0, relation: '>=' }, { m: -1, b: 4, relation: '<' }],
  });
  const corners = feasibleRegionVertices(q.inequalities.map(authoredBoundaryFromInequality));
  assert.equal(corners.length, 3);
  const marked = corners.map((corner) => ({ x: corner.x, y: corner.y, includedAnswer: corner.included ? 'yes' : 'no' }));
  const build = Array.from({ length: 3 }, emptyBuild);
  const right = studentBuildCase(q, { build, regionClassification: 'bounded', vertices: marked }, 'vertices right');
  assert.equal(right.isCorrect, true);
  assert.deepEqual(partIds(right), ['region-classification', 'vertices']);
  // A strict boundary through a corner excludes it.
  const flipped = marked.map((vertex) => ({ ...vertex, includedAnswer: 'yes' }));
  assert.equal(studentBuildCase(q, { build, regionClassification: 'bounded', vertices: flipped }, 'excluded corner called included').isCorrect, false);
  // Every corner must be found; an extra point does not count.
  assert.equal(studentBuildCase(q, { build, regionClassification: 'bounded', vertices: marked.slice(0, 2) }, 'missing a corner').isCorrect, false);
  assert.equal(studentBuildCase(q, { build, regionClassification: 'bounded', vertices: [...marked, { x: 1, y: 1, includedAnswer: 'yes' }] }, 'extra point').isCorrect, false);
  // Marking one real corner twice (each mark right on its own) is still not
  // "every vertex, once": the count must match.
  const twice = [...marked, { ...marked[0], x: marked[0].x + 0.05 }];
  assert.equal(studentBuildCase(q, { build, regionClassification: 'bounded', vertices: twice }, 'a corner marked twice').isCorrect, false);
  // Tapped within 0.15 of a corner is that corner.
  const nudged = marked.map((vertex) => ({ ...vertex, x: vertex.x + 0.1 }));
  assert.equal(studentBuildCase(q, { build, regionClassification: 'bounded', vertices: nudged }, 'nudged').isCorrect, true);
  assert.equal(studentBuildCase(q, { build, regionClassification: 'bounded', vertices: marked.map((v) => ({ ...v, includedAnswer: '' })) }, 'unanswered').isComplete, false);
});

test('student build (modeling): an unordered set of constraints, single-use, scaled forms accepted', () => {
  const q = sw({
    mode: 'inequalities',
    studentBuild: { boundary: true },
    reasoning: { classifyRegion: true },
    modeling: {
      variables: [{ symbol: 'a', label: 'adults' }, { symbol: 'c', label: 'children' }],
      expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }, { A: 12, B: 8, C: -96, relation: '<=' }],
    },
  });
  const rows = [
    { coeffA: '3', coeffB: '2', relation: '<=', constant: '24' }, // 12a + 8c ≤ 96, scaled
    { coeffA: '-1', coeffB: '-1', relation: '>=', constant: '-10' }, // a + c ≤ 10, negated
  ];
  const build = [pointsBuild([0, 12], [8, 0]), pointsBuild([0, 10], [10, 0])];
  const right = studentBuildCase(q, { modelingEntries: rows, modelingSent: true, build, regionClassification: 'unbounded' }, 'modeled, reordered');
  assert.equal(right.isCorrect, true);
  assert.deepEqual(partIds(right), ['constraint-1', 'constraint-2', 'model-1', 'model-2', 'region-classification']);
  // A duplicated correct row cannot satisfy two requirements.
  const duplicated = [rows[1], rows[1]];
  const dup = studentBuildCase(q, { modelingEntries: duplicated, modelingSent: true, build: [pointsBuild([0, 10], [10, 0]), pointsBuild([0, 10], [10, 0])], regionClassification: 'unbounded' }, 'duplicated row');
  assert.deepEqual([partOf(dup, 'model-1').isCorrect, partOf(dup, 'model-2').isCorrect], [true, false]);
  // Follow-through: the build is checked against the student's own model.
  const wrongModel = [{ coeffA: '1', coeffB: '1', relation: '<=', constant: '12' }, rows[0]];
  const follow = studentBuildCase(q, { modelingEntries: wrongModel, modelingSent: true, build: [pointsBuild([0, 12], [12, 0]), pointsBuild([0, 12], [8, 0])], regionClassification: 'unbounded' }, 'follow-through');
  assert.equal(partOf(follow, 'constraint-1').isCorrect, true);
  assert.equal(partOf(follow, 'model-1').isCorrect, false);
  // Not sent yet: the expected constraints stand in.
  const unsent = studentBuildCase(q, { modelingEntries: rows, modelingSent: false, build, regionClassification: 'unbounded' }, 'not sent');
  assert.equal(unsent.isComplete, false);
});

test('student build (rewrite): the student\'s graphing form is re-checked against the key', () => {
  const q = sw({
    mode: 'inequalities',
    studentBuild: { rewrite: true, boundary: true },
    sourceConstraints: ['2x + y >= 4', 'x - y <= 1'],
    expectedConstraints: [{ A: 2, B: 1, C: -4, relation: '>=' }, { A: 1, B: -1, C: -1, relation: '<=' }],
  });
  const forms = [{ A: 2, B: 1, C: -4, relation: '>=' }, { A: -1, B: 1, C: 1, relation: '>=' }]; // y ≥ −2x + 4, y ≥ x − 1
  const rewriteEntry = (text, form, expected) => ({
    source: text, steps: [], committedText: text, draft: text, pendingFlip: null,
    verifiedText: legacySameConstraint(form, expected) ? text : '',
    verifiedConstraint: legacySameConstraint(form, expected) ? form : null,
    graphingForm: form,
  });
  const build = [pointsBuild([0, 4], [2, 0]), pointsBuild([0, -1], [1, 0])];
  const rewriteEntries = [rewriteEntry('y >= -2 x + 4', forms[0], q.expectedConstraints[0]), rewriteEntry('y >= x - 1', forms[1], q.expectedConstraints[1])];
  const right = studentBuildCase(q, { rewriteEntries, build }, 'rewrite right');
  assert.equal(right.isCorrect, true);
  assert.equal(right.isComplete, true);

  // A graphable but wrong rewrite does not verify, even with a right boundary.
  const wrongForm = { A: -1, B: 1, C: 2, relation: '>=' };
  const wrong = studentBuildCase(q, { rewriteEntries: [rewriteEntries[0], rewriteEntry('y >= x - 2', wrongForm, q.expectedConstraints[1])], build }, 'rewrite wrong');
  assert.equal(partOf(wrong, 'constraint-2').isCorrect, false);
  // Still mid-rewrite (y not yet alone): nothing to verify, and not complete.
  const midway = studentBuildCase(q, { rewriteEntries: [rewriteEntries[0], { ...rewriteEntry('x - y <= 1', forms[1], q.expectedConstraints[1]), graphingForm: null, verifiedConstraint: null, verifiedText: '' }], build }, 'mid rewrite');
  assert.equal(partOf(midway, 'constraint-2').isCorrect, false);
  assert.equal(midway.isComplete, false);
  // A draft saved before graphingForm existed falls back to its verified form.
  const { graphingForm: _dropped, ...oldDraft } = rewriteEntries[1];
  assert.equal(studentBuildCase(q, { rewriteEntries: [rewriteEntries[0], oldDraft], build }, 'old draft').isCorrect, true);
  // A forged form that is not y-alone (B ≠ 1) is refused even when equivalent.
  const forged = studentBuildWork(q, { rewriteEntries, build });
  forged.rewrite[1].graphingForm = { A: -2, B: 2, C: 2, relation: '>=' };
  assert.equal(partOf(gradeBothWays(q, forged), 'constraint-2').isCorrect, false);
  // The shared rule is the rewrite's own unlock rule.
  assert.match(rewriteSource, /import \{ sameGraphingConstraint as sameConstraint \} from '\.\/inequalityBuilderAdapter\.js';/);
  assert.match(rewriteSource, /graphingForm: candidate \|\| null/);
});

test('student build: line style and shading with vertical / horizontal boundaries and strict relations', () => {
  const q = sw({
    mode: 'inequalities',
    studentBuild: { boundary: true, lineStyle: true, shading: true },
    inequalities: [{ orientation: 'vertical', x: 2, relation: '<' }, { orientation: 'horizontal', y: -1, relation: '>=' }],
  });
  const build = [
    { ...emptyBuild(), method: 'vertical', constant: '2', boundaryAttempts: 1, style: 'dashed', styleAttempts: 1, shadePoint: [0, 0], shadeAttempts: 2 },
    { ...emptyBuild(), method: 'horizontal', constant: '-1', boundaryAttempts: 1, style: 'solid', styleAttempts: 1, shadePoint: [3, 3], shadeAttempts: 1 },
  ];
  assert.equal(studentBuildCase(q, { build }, 'vertical/horizontal right').isCorrect, true);
  const swapped = [{ ...build[0], style: 'solid', shadePoint: [3, 0] }, { ...build[1], constant: '1' }];
  assert.equal(studentBuildCase(q, { build: swapped }, 'vertical/horizontal wrong').isCorrect, false);
});

test('student build: a student-chosen test point is reasoned about when the question allows one', () => {
  const q = sw({ mode: 'inequalities', reasoning: { testPoint: true }, inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }] });
  const build = Array.from({ length: 2 }, emptyBuild);
  const right = studentBuildCase(q, { build, studentTestPoint: [1, 5], studentPointResponse: { overall: 'yes', perInequality: ['yes', 'yes'], onBoundary: '', boundaryIncluded: '' } }, 'student point');
  assert.deepEqual(partIds(right), ['student-point-inequalities', 'student-point-system']);
  assert.equal(right.isCorrect, true);
  const outside = studentBuildCase(q, { build, studentTestPoint: [5, 0], studentPointResponse: { overall: 'yes', perInequality: ['no', 'yes'], onBoundary: '', boundaryIncluded: '' } }, 'student point outside');
  assert.equal(partOf(outside, 'student-point-system').isCorrect, false);
  // No point placed: nothing was asked yet, so nothing is graded.
  const none = gradeBothWays(q, studentBuildWork(q, { build }));
  assert.equal(none.isCorrect, false);
  assert.equal(none.score, 0);
  assert.equal(LEGACY_STUDENT_BUILD(q, { build }).score, 0);
});

test('student build: tampered rows cannot shrink, pad or crash the grading', () => {
  const work = studentBuildWork(LEGACY_SB, legacySbState());
  // A short build list grades the missing constraint as not built.
  const short = gradeBothWays(LEGACY_SB, { ...work, build: [work.build[0]] });
  assert.equal(short.graded, true);
  assert.deepEqual(partIds(short), partIds(gradeBothWays(LEGACY_SB, work)));
  assert.equal(partOf(short, 'constraint-2').isCorrect, false);
  // An empty per-inequality list cannot vacuously pass.
  const vacuous = gradeBothWays(LEGACY_SB, { ...work, teacherPointResponse: { ...work.teacherPointResponse, perInequality: [] } });
  assert.equal(partOf(vacuous, 'teacher-point-inequalities').isCorrect, false);
  // Garbage shade points and vertices are wrong, not crashes.
  const garbage = gradeBothWays(LEGACY_SB, { ...work, build: work.build.map((row) => ({ ...row, shadePoint: ['a', null] })), vertices: [7, 'x'] });
  assert.equal(garbage.graded, true);
  assert.equal(partOf(garbage, 'constraint-1').isCorrect, false);
  // Modeling rows padded or with an unknown relation are read one per constraint.
  const modelQ = sw({ mode: 'inequalities', modeling: { variables: [{ symbol: 'x' }, { symbol: 'y' }], expectedConstraints: [{ A: 1, B: 1, C: -4, relation: '<=' }] }, reasoning: { classifyRegion: true } });
  const padded = gradeBothWays(modelQ, { modelingEntries: [{ coeffA: '1', coeffB: '1', relation: '<=', constant: '4' }, { coeffA: '1', coeffB: '1', relation: '<=', constant: '4' }], modelingSent: true, build: [emptyBuild()], regionClassification: 'unbounded' });
  assert.deepEqual(partIds(padded), ['model-1', 'region-classification']);
  assert.equal(padded.isCorrect, true);
  const unknownRelation = gradeBothWays(modelQ, { modelingEntries: [{ coeffA: '1', coeffB: '1', relation: '=<', constant: '4' }], modelingSent: true, build: [emptyBuild()], regionClassification: 'unbounded' });
  assert.equal(unknownRelation.graded, true);
  assert.equal(partOf(unknownRelation, 'model-1').isCorrect, false);
});

// ===========================================================================
// SPATIAL
// ===========================================================================
const SPATIAL = sw({
  mode: 'spatial',
  spatialModel: { kind: 'threePlanes' },
  equations: ['x + y + z = 6', '2x - y + z = 3', '-x + 2y + z = 5'],
  answerFields: [
    { id: 'meaning', label: 'What is the solution?', options: ['A point on all three planes.', 'A different point on each plane.', 'Three intercepts.'], answer: 'A point on all three planes.' },
    { id: 'solution', label: 'The ordered triple', answer: '(1, 2, 3)' },
  ],
});

test('spatial: all-or-nothing interpretation, field by field, including a field named like a stripped key', () => {
  const right = { meaning: 'A point on all three planes.', solution: '(1, 2, 3)' };
  const fixtures = [
    [right, true, 1],
    [{ ...right, meaning: 'Three intercepts.' }, false, 0],
    [{ ...right, solution: '(1,2,3)' }, true, 1],
    [{ meaning: 'A point on all three planes.' }, false, 0],
    [{}, false, 0],
  ];
  for (const [responses, isCorrect, score] of fixtures) {
    const work = spatialWork(SPATIAL, responses);
    assert.deepEqual(boundToolWork(work).dropped, [], 'a field id "solution" survives because ids are values, not keys');
    const result = gradeBothWays(SPATIAL, work);
    assert.equal(result.isCorrect, isCorrect, JSON.stringify(responses));
    close(result.score, score, JSON.stringify(responses));
    agreesWithLegacy(result, LEGACY_SPATIAL(SPATIAL, responses), JSON.stringify(responses));
  }
  const result = gradeBothWays(SPATIAL, spatialWork(SPATIAL, right));
  assert.deepEqual(partIds(result), ['meaning', 'solution']);
  assert.equal(gradeBothWays(SPATIAL, spatialWork(SPATIAL, { meaning: right.meaning })).isComplete, false);
  // Grading reads the selection against the key, never the option list: a
  // support that trims the choices to two changes nothing.
  const trimmed = { ...SPATIAL, answerFields: [{ ...SPATIAL.answerFields[0], options: ['Three intercepts.', 'A point on all three planes.'] }, SPATIAL.answerFields[1]] };
  assert.equal(gradeBothWays(trimmed, spatialWork(trimmed, right)).isCorrect, true);
  // Forged extra entries and junk are ignored; the field's own entry decides.
  const forged = { responses: [{ id: 'meaning', value: 'A point on all three planes.' }, { id: 'solution', value: '(1, 2, 3)' }, { id: 'isCorrect', value: true }, 'junk', null] };
  assert.equal(gradeBothWays(SPATIAL, forged).isCorrect, true);
});

// ===========================================================================
// TAMPERING, MALFORMED AND OVERSIZE WORK
// ===========================================================================
test('injected verdict and key fields are stripped and change nothing', () => {
  const q = sw({ mode: 'linear', system: { m1: 1, b1: 0, m2: -2, b2: 7 } });
  const wrong = linearWork({ classification: 'one', x: '1', y: '1' });
  const forged = { ...wrong, isCorrect: true, score: 1, expected: { x: 1, y: 1 }, checks: { classCorrect: true }, solution: { type: 'one', x: 1, y: 1 } };
  const forgedResult = gradeBothWays(q, forged);
  assert.deepEqual(boundToolWork(forged).dropped.sort(), ['checks', 'expected', 'isCorrect', 'score', 'solution']);
  const honest = gradeBothWays(q, wrong);
  assert.equal(forgedResult.isCorrect, false);
  assert.equal(forgedResult.score, honest.score);
  assert.deepEqual(forgedResult.parts, honest.parts);
  const sbForged = { ...studentBuildWork(LEGACY_SB, legacySbState({ regionClassification: 'bounded' })), correct: true, verdict: 'correct', partialCredit: 100 };
  assert.equal(gradeBothWays(LEGACY_SB, sbForged).isCorrect, false);
});

test('wrong types grade as wrong; non-object and oversize work is not graded at all', () => {
  const q = sw({ mode: 'linear', system: { m1: 1, b1: 0, m2: -2, b2: 7 } });
  const typed = gradeBothWays(q, { classification: ['one'], x: { v: 1 }, y: true });
  assert.equal(typed.graded, true);
  assert.equal(typed.isCorrect, false);
  for (const work of [null, 'one', 42, ['one']]) {
    const result = gradeBothWays(q, work);
    assert.equal(result.graded, false, JSON.stringify(work));
  }
  const oversize = { build: Array.from({ length: 300 }, () => 'x'.repeat(1000)) };
  const huge = gradeBothWays(LEGACY_SB, oversize);
  assert.equal(huge.graded, false);
  assert.equal(huge.reason, 'oversize-response');
  // A question the workspace cannot draw is refused, never guessed.
  const broken = gradeBothWays(sw({ mode: 'inequalities', inequalities: [{ orientation: 'vertical', x: 1, relation: '>=' }, { m: 1, b: 0, relation: '<=' }] }), { construction: [], testChoice: 'yes', candidate: { x: 0, y: 0 } });
  assert.equal(broken.graded, false);
  assert.equal(broken.reason, 'malformed-response');
});

test('the work of every mode is student work only, and realistic maximal work fits the contract', () => {
  const sixConstraints = Array.from({ length: 6 }, (_, index) => ({ m: index - 2.5, b: index, relation: index % 2 ? '<=' : '>' }));
  const big = sw({ mode: 'inequalities', studentBuild: { rewrite: true, boundary: true, lineStyle: true, shading: true }, reasoning: { classifyRegion: true, vertices: true, testPoint: true, boundaryProbe: true }, inequalities: sixConstraints, testPoint: { x: 0.123456789, y: 1.987654321 }, allowStudentTestPoint: true });
  const longText = 'y >= -2.718281828459045 x + 3.141592653589793';
  const bigState = {
    rewriteEntries: sixConstraints.map(() => ({ committedText: longText, graphingForm: { A: 2.718281828459045, B: 1, C: -3.141592653589793, relation: '>=' } })),
    build: sixConstraints.map(() => ({ ...pointsBuild([-5.123456789012345, 7.987654321098765], [6.123456789012345, -3.987654321098765]), method: 'slopeIntercept', slope: '-2.718281828459045', intercept: '3.141592653589793', style: 'dashed', styleAttempts: 12, shadePoint: [1.2345678901234567, -7.654321098765432], shadeAttempts: 9 })),
    regionClassification: 'bounded',
    teacherPointResponse: { overall: 'yes', perInequality: sixConstraints.map(() => 'yes'), onBoundary: 'no', boundaryIncluded: 'no' },
    studentTestPoint: [1.2345678901234567, -7.654321098765432],
    studentPointResponse: { overall: 'no', perInequality: sixConstraints.map(() => 'no'), onBoundary: '', boundaryIncluded: '' },
    vertices: Array.from({ length: 15 }, (_, index) => ({ x: index + 0.123456789012345, y: -index - 0.987654321098765, includedAnswer: 'yes' })),
  };
  const modelQ = sw({ mode: 'inequalities', modeling: { variables: [{ symbol: 'a' }, { symbol: 'c' }], expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }] }, reasoning: { classifyRegion: true } });
  const works = [
    linearWork({ classification: 'one', x: '-12345.6789', y: '98765.4321' }),
    inequalityWork(sw({ mode: 'inequalities', ask: ['construction', 'testPoint', 'candidate'] }), { construction: blankConstruction(2).map(() => ({ x1: '-1.5', y1: '2.25', x2: '3', y2: '4', boundaryStyle: 'dashed', shade: 'below' })), testChoice: 'no', x: '1', y: '2' }),
    lqWork({ count: '2', values: { x1: '-1.23456', y1: '2.34567', x2: '3.45678', y2: '-4.56789' } }),
    matrixWork(sw({ mode: 'matrix3' }), { classification: 'one', x: '1', y: '2', z: '3', technologyUsed: true }),
    spatialWork(SPATIAL, { meaning: 'A point on all three planes.', solution: '(1, 2, 3)' }),
    studentBuildWork(big, bigState),
    studentBuildWork(modelQ, { modelingEntries: [{ coeffA: '1', coeffB: '1', relation: '<=', constant: '10' }], modelingSent: true, build: [emptyBuild()], regionClassification: 'unbounded' }),
  ];
  for (const work of works) {
    const bounded = boundToolWork(work);
    assert.deepEqual(bounded.dropped, [], `no field of this work is a stripped key: ${Object.keys(work)}`);
    assert.equal(bounded.truncated, false);
    assert.ok(canonicalToolWorkJson(work).length < TOOL_RESPONSE_LIMITS.maxJsonLength, 'well under the size limit');
  }
  assert.ok(canonicalToolWorkJson(works[5]).length < TOOL_RESPONSE_LIMITS.maxJsonLength / 2, `six constraints with every step: ${canonicalToolWorkJson(works[5]).length} chars`);
  assert.equal(gradeBothWays(big, works[5]).graded, true);
});

// ===========================================================================
// EDGES — each tolerance, gate and follow-through rule at the point where it
// decides, with the old Check agreeing. (Added in review: a mutation of each of
// these rules survived the fixtures above.)
// ===========================================================================
test('edges: tolerances, the boundary-probe gate and follow-through decide exactly where the old Check did', () => {
  // Legacy construct: a boundary point counts within 0.08 of the line, not beyond.
  const construct = sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }] });
  const right = [
    { x1: '0', y1: '1', x2: '2', y2: '3', boundaryStyle: 'solid', shade: 'above' },
    { x1: '0', y1: '6', x2: '4', y2: '4', boundaryStyle: 'dashed', shade: 'below' },
  ];
  for (const [y1, boundaryRight] of [['1.07', true], ['1.1', false], ['0.9', false]]) {
    const construction = [{ ...right[0], y1 }, right[1]];
    const result = gradeBothWays(construct, inequalityWork(construct, { construction }));
    assert.equal(partOf(result, 'boundary-1').isCorrect, boundaryRight, `boundary point (0, ${y1})`);
    agreesWithLegacy(result, LEGACY_INEQUALITY(construct, { construction }), `boundary point (0, ${y1})`);
  }

  // A teacher point ON a boundary adds the inclusion probe only when the
  // question enables it (studentBuild: true does; reasoning.testPoint alone
  // does not).
  const onLine = { x: 0, y: 1 }; // on y = x + 1
  const answered = { overall: 'yes', perInequality: ['yes', 'yes'], onBoundary: '', boundaryIncluded: '' };
  const noProbe = sw({ mode: 'inequalities', reasoning: { testPoint: true }, inequalities: LEGACY_SB.inequalities, testPoint: onLine });
  const unprobed = studentBuildCase(noProbe, { build: [emptyBuild(), emptyBuild()], teacherPointResponse: answered }, 'probe disabled');
  assert.deepEqual(partIds(unprobed), ['teacher-point-inequalities', 'teacher-point-system']);
  assert.equal(unprobed.isCorrect, true);
  const probe = sw({ ...noProbe, reasoning: { testPoint: true, boundaryProbe: true } });
  const probed = studentBuildCase(probe, { build: [emptyBuild(), emptyBuild()], teacherPointResponse: { ...answered, onBoundary: 'yes', boundaryIncluded: 'yes' } }, 'probe enabled');
  assert.deepEqual(partIds(probed), ['teacher-point-inequalities', 'teacher-point-system', 'teacher-point-boundary']);

  // "On a boundary" means within 0.12 of it: (0, 1.1) is 0.07 away, (0, 1.3) is 0.21 away.
  const near = studentBuildCase({ ...LEGACY_SB, testPoint: { x: 0, y: 1.1 } }, legacySbState({ teacherPointResponse: { ...answered, onBoundary: 'yes', boundaryIncluded: 'yes' } }), 'near a boundary');
  assert.equal(partIds(near).includes('teacher-point-boundary'), true);
  const off = studentBuildCase({ ...LEGACY_SB, testPoint: { x: 0, y: 1.3 } }, legacySbState({ teacherPointResponse: answered }), 'off the boundary');
  assert.equal(partIds(off).includes('teacher-point-boundary'), false);
  assert.equal(off.isCorrect, true);

  // Linear-quadratic: the right points under a wrong (forged) count are not credited.
  const two = sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1, b: 2 }, quadratic: { a: 1, b: 0, c: -4 } } });
  const forgedCount = gradeBothWays(two, { count: 3, points: [{ x: -2, y: 0 }, { x: 3, y: 5 }] });
  assert.equal(partOf(forgedCount, 'intersections').isCorrect, false);
  agreesWithLegacy(forgedCount, LEGACY_LINEAR_QUADRATIC(two, { count: '3', values: { x1: '-2', y1: '0', x2: '3', y2: '5' } }), 'count 3');

  // Vertices: every corner must have a mark within 0.15 — a corner 0.9 from
  // the nearest mark is missed, even when the mark count matches.
  const triangle = sw({ mode: 'inequalities', reasoning: { vertices: true }, inequalities: [{ m: 0, b: 0, relation: '>=' }, { orientation: 'vertical', x: 0, relation: '>=' }, { m: -1, b: 1, relation: '<=' }] });
  const corners = feasibleRegionVertices(triangle.inequalities.map(authoredBoundaryFromInequality));
  const marks = corners.map((corner) => ({ x: corner.x, y: corner.y, includedAnswer: 'yes' }));
  const triangleBuild = [emptyBuild(), emptyBuild(), emptyBuild()];
  assert.equal(studentBuildCase(triangle, { build: triangleBuild, vertices: marks }, 'small triangle').isCorrect, true);
  const missed = [...marks.filter((mark) => !(mark.x === 1 && mark.y === 0)), { x: 0.1, y: 0, includedAnswer: 'yes' }];
  assert.equal(missed.length, marks.length);
  assert.equal(studentBuildCase(triangle, { build: triangleBuild, vertices: missed }, 'corner (1, 0) missed').isCorrect, false);

  // Follow-through: the region is classified from the student's own sent
  // model, not the key's (here the key is an unbounded strip, the model empty).
  const strip = sw({
    mode: 'inequalities',
    reasoning: { classifyRegion: true },
    modeling: {
      variables: [{ symbol: 'a', label: 'adults' }, { symbol: 'c', label: 'children' }],
      expectedConstraints: [{ A: 1, B: 1, C: -10, relation: '<=' }, { A: 1, B: 1, C: -2, relation: '>=' }],
    },
  });
  assert.equal(classifyFeasibleRegion(strip.modeling.expectedConstraints), 'unbounded');
  const ownModel = [{ coeffA: '1', coeffB: '1', relation: '<=', constant: '10' }, { coeffA: '1', coeffB: '1', relation: '>=', constant: '12' }];
  const followed = studentBuildCase(strip, { modelingEntries: ownModel, modelingSent: true, build: [emptyBuild(), emptyBuild()], regionClassification: 'empty' }, 'classification follow-through');
  assert.deepEqual(followed.parts.map((item) => [item.id, item.isCorrect]), [['model-1', true], ['model-2', false], ['region-classification', true]]);

  // Rewrite: the right line with the inequality reversed is not the same half-plane.
  const rewriteQ = sw({
    mode: 'inequalities',
    studentBuild: { rewrite: true, boundary: true },
    sourceConstraints: ['2x + y >= 4'],
    expectedConstraints: [{ A: 2, B: 1, C: -4, relation: '>=' }],
  });
  const reversed = { A: 2, B: 1, C: -4, relation: '<=' }; // y <= -2x + 4
  assert.equal(legacySameConstraint(reversed, rewriteQ.expectedConstraints[0]), false);
  const reversedEntry = { source: '2x + y >= 4', steps: [], committedText: 'y <= -2 x + 4', draft: 'y <= -2 x + 4', pendingFlip: null, verifiedText: '', verifiedConstraint: null, graphingForm: reversed };
  const reversedResult = studentBuildCase(rewriteQ, { rewriteEntries: [reversedEntry], build: [pointsBuild([0, 4], [2, 0])] }, 'reversed rewrite');
  assert.equal(partOf(reversedResult, 'constraint-1').isCorrect, false);
  const verifiedEntry = { ...reversedEntry, committedText: 'y >= -2 x + 4', verifiedText: 'y >= -2 x + 4', verifiedConstraint: { ...reversed, relation: '>=' }, graphingForm: { ...reversed, relation: '>=' } };
  assert.equal(studentBuildCase(rewriteQ, { rewriteEntries: [verifiedEntry], build: [pointsBuild([0, 4], [2, 0])] }, 'verified rewrite').isCorrect, true);

  // Modeling: a relation the screen cannot produce never reads as one it can.
  const single = sw({ mode: 'inequalities', reasoning: { classifyRegion: true }, modeling: { variables: [{ symbol: 'x' }, { symbol: 'y' }], expectedConstraints: [{ A: 1, B: 1, C: -4, relation: '>=' }] } });
  const modelWork = (relation) => ({ modelingEntries: [{ coeffA: '1', coeffB: '1', relation, constant: '4' }], modelingSent: true, build: [emptyBuild()], regionClassification: 'unbounded' });
  assert.equal(partOf(gradeBothWays(single, modelWork('>=')), 'model-1').isCorrect, true);
  const unknown = gradeBothWays(single, modelWork('ge'));
  assert.equal(unknown.graded, true);
  assert.equal(partOf(unknown, 'model-1').isCorrect, false);
});

// ===========================================================================
// DISCRIMINATION — correct work against an altered key is wrong.
// ===========================================================================
test('correct work graded against an altered key fails, in every mode', () => {
  const pairs = [
    [sw({ mode: 'linear', system: { m1: 1, b1: 0, m2: -2, b2: 7 } }), sw({ mode: 'linear', system: { m1: 1, b1: 0, m2: -2, b2: 8 } }), linearWork({ classification: 'one', x: '7/3', y: '7/3' })],
    [sw({ mode: 'matrix', matrix: { a11: 2, a12: 1, b1: 7, a21: 1, a22: -1, b2: 2 } }), sw({ mode: 'matrix', matrix: { a11: 2, a12: 1, b1: 8, a21: 1, a22: -1, b2: 2 } }), { classification: 'one', x: '3', y: '1' }],
    [sw({ mode: 'matrix3', matrix: { rows: [[1, 1, 1, 6], [0, 1, 1, 5], [0, 0, 1, 3]] } }), sw({ mode: 'matrix3', matrix: { rows: [[1, 1, 1, 6], [0, 1, 1, 5], [0, 0, 1, 4]] } }), { classification: 'one', x: '1', y: '2', z: '3', technologyUsed: true }],
    [sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1, b: 2 }, quadratic: { a: 1, b: 0, c: -4 } } }), sw({ mode: 'linearQuadratic', linearQuadratic: { line: { m: 1, b: 2 }, quadratic: { a: 1, b: 0, c: -3 } } }), lqWork({ count: '2', values: { x1: '-2', y1: '0', x2: '3', y2: '5' } })],
    [sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }] }), sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 1, b: 1, relation: '>' }, { m: -0.5, b: 6, relation: '<' }] }), inequalityWork(sw({ interaction: 'construct' }), { construction: [{ x1: '0', y1: '1', x2: '2', y2: '3', boundaryStyle: 'solid', shade: 'above' }, { x1: '0', y1: '6', x2: '4', y2: '4', boundaryStyle: 'dashed', shade: 'below' }] })],
    [sw({ mode: 'inequalities', testPoint: { x: 2, y: 4 } }), sw({ mode: 'inequalities', testPoint: { x: 4, y: 2 } }), inequalityWork(sw({}), { construction: blankConstruction(2), testChoice: 'yes', x: '0', y: '3' })],
    [LEGACY_SB, { ...LEGACY_SB, inequalities: [{ m: 1, b: 2, relation: '>=' }, LEGACY_SB.inequalities[1]] }, studentBuildWork(LEGACY_SB, legacySbState())],
    [SPATIAL, { ...SPATIAL, answerFields: [SPATIAL.answerFields[0], { ...SPATIAL.answerFields[1], answer: '(1, 2, 4)' }] }, spatialWork(SPATIAL, { meaning: 'A point on all three planes.', solution: '(1, 2, 3)' })],
  ];
  for (const [question, altered, work] of pairs) {
    assert.equal(gradeBothWays(question, work).isCorrect, true, `${question.mode}: the work is right for its own key`);
    assert.equal(gradeBothWays(altered, work).isCorrect, false, `${question.mode}: the same work against another key`);
  }
});

// ===========================================================================
// THE COMPONENTS ASK THE SHARED GRADER — AND ONLY IT.
// ===========================================================================
test('every Check handler marks through gradeToolCheck with the shared grader and reports the same work', () => {
  assert.match(workspace, /import systemsWorkspaceGrader from '\.\.\/\.\.\/\.\.\/functions\/shared\/serverGrading\/tools\/systemsWorkspace\.mjs';/);
  assert.match(workspace, /import \{ gradeToolCheck \} from '\.\.\/shared\/sharedToolGrading\.js';/);
  assert.match(workspace, /import useReportToolWork from '\.\.\/shared\/useReportToolWork\.js';/);
  const modes = [
    ['function LinearMode(', 'function InequalityMode(', 'linear', /const work = \{ x, y, classification \};/],
    [null, null, 'inequalities', /const work = \{\s*construction:construction\.map\(\(entry\) => \(\{\s*points: \[\s*\{ x:parseNumericAnswer\(entry\.x1\), y:parseNumericAnswer\(entry\.y1\) \},\s*\{ x:parseNumericAnswer\(entry\.x2\), y:parseNumericAnswer\(entry\.y2\) \},\s*\],\s*boundaryStyle:entry\.boundaryStyle,\s*shade:entry\.shade,\s*\}\)\),\s*\.\.\.\(ask\.includes\('testPoint'\) \? \{ testChoice \} : \{\}\),\s*\.\.\.\(ask\.includes\('candidate'\) \? \{ candidate:\{ x:parseNumericAnswer\(x\), y:parseNumericAnswer\(y\) \} \} : \{\}\),\s*\};/],
    ['function StudentBuildInequalityMode(', 'function LinearQuadraticMode(', 'inequalities-studentBuild', /modelingEntries, modelingSent: Boolean\(modelingSent\)[\s\S]*?rewrite: rewriteEntries\.map[\s\S]*?graphingForm: entry\?\.graphingForm !== undefined \? entry\.graphingForm : \(entry\?\.verifiedConstraint \|\| null\)[\s\S]*?build,\s*regionClassification,\s*\.\.\.\(teacherPointApplicable \? \{ teacherPointResponse \} : \{\}\),\s*\.\.\.\(studentPointApplicable \? \{ studentTestPoint, studentPointResponse \} : \{\}\),\s*vertices,/],
    ['function LinearQuadraticMode(', 'function MatrixMode(', 'linearQuadratic', /const work = \{ count:parseNumericAnswer\(count\), points:studentPoints \};/],
    ['function MatrixMode(', 'const MODE_TASKS', "mode:isMatrix3?'matrix3':'matrix'", /const work = \{classification,x,y,\.\.\.\(isMatrix3\?\{z,technologyUsed\}: \{\}\)\};/],
  ];
  for (const [from, to, mode, workShape] of modes) {
    const body = mode === 'inequalities'
      ? region(region(workspace, 'function InequalityMode(', 'const CONSTRUCTION_METHODS', 'InequalityMode'), 'const updateConstruction', 'const shownPolygon', 'InequalityMode check')
      : region(workspace, from, to, mode);
    assert.match(body, workShape, `${mode}: the work the grader reads is the work the screen holds`);
    assert.match(body, /useReportToolWork\(work\);/, `${mode}: live work is reported for deadlines`);
    assert.match(body, /const result = gradeToolCheck\(systemsWorkspaceGrader, questionData, work\);\s*submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode:\s*['"a-zA-Z:?-]+[^}]*parts: result\.parts \}\);/, `${mode}: Check submits the shared verdict`);
    assert.ok(body.includes(mode), mode);
  }
  // Nothing in the workspace marks a typed answer itself any more.
  assert.doesNotMatch(workspace, /matchesNumericAnswer|samePointSet|satisfiesLinearInequality\(|\bchecks:\s*\{|expected:\s*(solution|intersections)/);
  assert.doesNotMatch(workspace, /parts\.filter\(Boolean\)\.length/);

  const spatialCheck = region(threePlanes, 'const answerSurface', 'const revealLabel', 'ThreePlaneWorkspace check');
  assert.match(spatialCheck, /responses: answerFields[\s\S]*?\.map\(\(field\) => \(\{ id: field\.id, value: responses\?\.\[field\.id\] \?\? '' \}\)\)/);
  assert.match(spatialCheck, /useReportToolWork\(work, \{ enabled: answerSurface \}\);/);
  assert.match(spatialCheck, /const answerSurface = !earnedResult && answerFields\.length > 0;/, 'the 3D connection inside an algebraic outcome does not report work');
  assert.match(spatialCheck, /const result = gradeToolCheck\(systemsWorkspaceGrader, questionData, work\);\s*submit\(\{ isCorrect: result\.isCorrect, score: result\.score \}, work, \{ mode: 'spatial', parts: result\.parts \}\);/);
  assert.doesNotMatch(threePlanes, /gradeMultiAnswerResponse|classification: classification\.type/, 'the system\'s own classification never rides in the submit metadata');
});

test('feedback messages read the shared grader\'s parts', () => {
  assert.match(region(workspace, 'function LinearMode(', 'function InequalityMode(', 'LinearMode'), /if \(!partCorrect\(feedback, 'classification'\)\)/);
  const inequality = region(workspace, 'function InequalityMode(', 'const CONSTRUCTION_METHODS', 'InequalityMode');
  assert.match(inequality, /const testCorrect = partCorrect\(feedback, 'test-point'\);\s*const candidateFeasible = partCorrect\(feedback, 'candidate-point'\);/);
  assert.match(region(workspace, 'function LinearQuadraticMode(', 'function MatrixMode(', 'LinearQuadraticMode'), /if \(!partCorrect\(feedback, 'count'\)\)/);
  const matrix = region(workspace, 'function MatrixMode(', 'const MODE_TASKS', 'MatrixMode');
  assert.match(matrix, /isMatrix3 && !partCorrect\(feedback, 'matrix-technology'\)/);
  assert.match(matrix, /if \(!partCorrect\(feedback, 'classification'\)\)/);
  // The ids those messages read are ids the grader really emits.
  const q = sw({ mode: 'inequalities' });
  assert.deepEqual(partIds(gradeBothWays(q, inequalityWork(q, { construction: blankConstruction(2) }))), ['test-point', 'candidate-point']);
});

// ===========================================================================
// MY MATH PATH READS THE SAME WORK
// ===========================================================================
test('on My Math Path the same work still satisfies Path\'s own contract (shape unchanged)', () => {
  // In a Path session QuestionEngine sends the tool's `work` to Path's server
  // contract (functions/shared/pathToolContracts.mjs, not changed here). These
  // modes must keep sending exactly the fields that contract validates.
  const cases = [
    [sw({ mode: 'linear', system: { m1: 1, b1: 0, m2: -2, b2: 7 } }), linearWork({ classification: 'one', x: '2.3333', y: '2.3333' })],
    [sw({ mode: 'matrix3', matrix: { rows: [[1, 1, 1, 6], [0, 1, 1, 5], [0, 0, 1, 3]] } }), matrixWork(sw({ mode: 'matrix3' }), { classification: 'one', x: '1', y: '2', z: '3', technologyUsed: true })],
    [sw({ mode: 'inequalities', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<=' }], testPoint: { x: 2, y: 4 } }), inequalityWork(sw({}), { construction: blankConstruction(2), testChoice: 'yes', x: '1', y: '4' })],
    [sw({ mode: 'inequalities', interaction: 'construct', inequalities: [{ m: 1, b: 1, relation: '>=' }, { m: -0.5, b: 6, relation: '<' }] }), inequalityWork(sw({ interaction: 'construct' }), { construction: [{ x1: '0', y1: '1', x2: '2', y2: '3', boundaryStyle: 'solid', shade: 'above' }, { x1: '0', y1: '6', x2: '4', y2: '4', boundaryStyle: 'dashed', shade: 'below' }] })],
  ];
  for (const [question, work] of cases) {
    const privateGrading = buildPrivateToolGrading(question);
    assert.ok(privateGrading, `${question.mode}: Path grades this question`);
    const path = gradePathResponse({ privateGrading, raw: JSON.parse(JSON.stringify(work)) });
    assert.equal(path.rejected, false, `${question.mode}: Path accepts the work (${path.detail || path.reason})`);
    assert.equal(path.isCorrect, true, `${question.mode}: and agrees it is right`);
    assert.equal(gradeBothWays(question, work).isCorrect, true);
  }
});
