import React, { useCallback, useMemo, useRef } from 'react';
import { evaluate } from 'mathjs';
import MultiRelationAlgebraCore from '../../MultiRelationAlgebraCore.jsx';
import { parseRelationSource } from '../../algebraRelationFoundation.js';

const affineCoefficients = (expression) => {
  try {
    const at = (x, y) => Number(evaluate(expression, { x, y }));
    const c = at(0, 0);
    const a = at(1, 0) - c;
    const b = at(0, 1) - c;
    if (![a, b, c].every(Number.isFinite)) return null;
    // Reject nonlinear expressions instead of mistaking three samples for a line.
    if (Math.abs(at(2, 3) - (2 * a + 3 * b + c)) > 1e-7) return null;
    return { a, b, c };
  } catch {
    return null;
  }
};

export const graphableConstraintFromRelation = (text) => {
  try {
    const state = parseRelationSource(text, 'y');
    const branch = state.branches?.[0];
    if (state.branches?.length !== 1 || branch?.expressions?.length !== 2 || branch.relations?.length !== 1) return null;
    const left = affineCoefficients(branch.expressions[0]);
    const right = affineCoefficients(branch.expressions[1]);
    if (!left || !right) return null;

    // The graphing handoff deliberately requires the target variable visibly
    // isolated on the LEFT. Equivalent forms such as x + 1 >= y are valid
    // inequalities, but they are not the slope-intercept graphing form this
    // lesson is asking the student to produce.
    if (
      Math.abs(left.a) > 1e-7
      || Math.abs(left.b - 1) > 1e-7
      || Math.abs(left.c) > 1e-7
      || Math.abs(right.b) > 1e-7
    ) return null;

    return {
      A: left.a - right.a,
      B: left.b - right.b,
      C: left.c - right.c,
      relation: branch.relations[0],
    };
  } catch {
    return null;
  }
};

const reverseRelation = (relation) => ({
  '<': '>',
  '<=': '>=',
  '>': '<',
  '>=': '<=',
  '=': '=',
}[relation] || relation);

const sameConstraint = (actual, expected, tolerance = 1e-7) => {
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
  return actual.relation === (scale < 0 ? reverseRelation(expected.relation) : expected.relation);
};

/**
 * Systems Workspace's rewrite phase deliberately reuses the SAME mature
 * relation solver used by absolute-value inequalities.
 *
 * This is not a second mini-solver. Students choose an operation, enter its
 * value, place it on BOTH sides of the inequality, commit it, explicitly fix
 * the inequality direction after a negative multiply/divide, and use the same
 * Rewrite / Simplify and cancellation interactions as the standalone solver.
 *
 * Once the student's visible relation is an equivalent y-on-the-left graphing
 * form, this adapter marks the rewrite complete and Systems Workspace advances
 * to boundary plotting / line style / shading for that constraint.
 */
export default function EmbeddedInequalityRewrite({
  source,
  expectedConstraint,
  value,
  onChange,
  draftKey = null,
}) {
  // Preserve any valid in-progress state produced by the older lightweight
  // rewrite widget when a student resumes after deployment. A pending sign
  // flip from that widget cannot be safely reconstructed, so restart that rare
  // transient state from the authored source rather than hydrating a relation
  // with the wrong inequality direction.
  const seedSourceRef = useRef(null);
  if (seedSourceRef.current == null) {
    seedSourceRef.current = (
      value?.verifiedText
      || (!value?.pendingFlip && value?.committedText)
      || source
    );
  }
  const seedSource = seedSourceRef.current;

  const solverQuestion = useMemo(() => ({
    type: 'stepAlgebra',
    equation: seedSource,
    solveFor: 'y',
    prompt: `Rewrite ${source} into slope-intercept inequality form. Choose each operation, place it on both sides, and commit it before moving to the graph.`,
    workspaceDifficulty: 4,
  }), [seedSource, source]);

  const handleStateChange = useCallback((payload) => {
    const relation = payload?.parts?.find((part) => part?.id === 'relation-work')?.response;
    if (!relation) return;

    const candidate = graphableConstraintFromRelation(relation);
    const verified = candidate && sameConstraint(candidate, expectedConstraint)
      ? candidate
      : null;

    if (
      relation === value?.committedText
      && Boolean(verified) === Boolean(value?.verifiedConstraint)
      && (!verified || value?.verifiedText === relation)
    ) return;

    onChange({
      ...value,
      source,
      committedText: relation,
      draft: relation,
      pendingFlip: null,
      verifiedText: verified ? relation : '',
      verifiedConstraint: verified,
      // Keep a lightweight breadcrumb for old persistence/debug surfaces.
      steps: relation === source
        ? (value?.steps || [])
        : [...(value?.steps || []).filter((step) => step?.engine !== 'relationSolver'), {
          engine: 'relationSolver',
          result: relation,
        }],
    });
  }, [expectedConstraint, onChange, source, value]);

  return (
    <div style={{ padding: 10, border: '1px solid #b8cdf0', borderRadius: 10, background: '#f8fbff' }}>
      <div style={{ marginBottom: 8 }}>
        <strong>Rewrite for graphing · balanced-operation solver</strong>
        <div style={{ marginTop: 4, color: '#5f6368', fontSize: 12.5 }}>
          Use the same solver as absolute-value inequalities. Place every operation on both sides; graphing unlocks when y is isolated in an equivalent slope-intercept inequality.
        </div>
      </div>
      <MultiRelationAlgebraCore
        question={solverQuestion}
        questionRecord={null}
        draftKey={draftKey}
        denseWorkspace
        onStateChange={handleStateChange}
        onStepGrade={null}
        onUndoStateChange={null}
      />
    </div>
  );
}
