/*
 * THE SOLVER IS TWO FILES NOW, AND A TEST ABOUT IT MEANS BOTH.
 *
 * StepByStepAlgebra.jsx and MultiRelationAlgebra.jsx were split: a wrapper that
 * supplies the workspace frame, the focus panel and the work history, and a core
 * that implements the interaction. The implementation moved; nothing was lost.
 *
 * Every test in this suite that inspects the solver reads its source as text and
 * matches patterns against it. After the split those reads found a 2KB wrapper
 * instead of a 90KB component, so 56 of them failed — not because behaviour
 * changed, but because the code they describe is next door. Concatenating the
 * two files and re-running the suite passes all 3417 tests, which is what
 * establishes that the failures were about location rather than substance.
 *
 * READING BOTH, RATHER THAN POINTING EACH TEST AT THE CORE, is deliberate.
 * These tests assert about "the Step Algebra solver", and that is now the pair.
 * A test aimed only at the core silently stops covering anything the wrapper
 * owns — the frame, the history, the props it forwards — and would pass while
 * that code was deleted. Reading the pair also survives the next split: this
 * file changes, and nothing else does.
 *
 * WHAT THIS DOES NOT DO. These are source-inspection tests. They never execute
 * the component, so they cannot catch a behavioural regression and never could.
 * Restoring them restores exactly the guard that existed before the refactor —
 * no more. Real confidence in the solver needs a rendering harness, not a
 * stronger regex.
 */

import { readFileSync } from 'node:fs';

const read = (relativePath) => readFileSync(new URL(`../../../src/${relativePath}`, import.meta.url), 'utf8');

const combine = (wrapper, core) => `${read(wrapper)}\n${read(core)}`;

/** The whole Step Algebra solver: wrapper and core. */
export const stepAlgebraSource = () => combine('StepByStepAlgebra.jsx', 'StepByStepAlgebraCore.jsx');

/** The whole multi-relation solver: wrapper and core. */
export const multiRelationSource = () => combine('MultiRelationAlgebra.jsx', 'MultiRelationAlgebraCore.jsx');

export default { stepAlgebraSource, multiRelationSource };
