import { readFile, writeFile } from 'node:fs/promises';

const foundationPath = 'src/algebraRelationFoundation.js';
let foundation = await readFile(foundationPath, 'utf8');

const validatorNeedle = `const validateBalancedOperation = (\n  previousState,\n  nextState,\n  { operation, operandExpression, branchIndices = [0] } = {},\n) => {`;
if (!foundation.includes(validatorNeedle)) throw new Error('Could not locate balanced relation validator');

const validatorAnchor = `export const validateRelationTransition = (\n  previousState,\n  nextState,\n  context = {},\n) => {\n  if (!previousState || !nextState) {\n    return { valid: false, reason: 'The solver could not verify this algebra step.' };\n  }\n\n  const kind = context.kind || 'equivalentRewrite';\n  let valid = false;\n\n  try {\n    if (kind === 'balancedOperation') {\n      valid = validateBalancedOperation(previousState, nextState, context);\n    } else if (kind === 'equivalentRewrite') {\n      valid = validateEquivalentRewrite(previousState, nextState);\n    }\n  } catch {\n    valid = false;\n  }\n\n  return valid\n    ? { valid: true, reason: null }\n    : {\n        valid: false,\n        reason: 'That step did not preserve the relation. Your previous valid work was kept.',\n      };\n};`;

const validatorReplacement = `const validateExpectedStructuralState = (expectedState, nextState) => {\n  if (!relationFramesMatch(expectedState, nextState)) return false;\n  if (expectedState.special) return true;\n\n  const variable = expectedState.variable || 'x';\n  const expectedBranches = expectedState.branches || [];\n  const nextBranches = nextState.branches || [];\n\n  // OR branches are mathematically unordered. A student-authored absolute\n  // split may enter the negative branch first, so compare the branch set\n  // rather than forcing presentation order to define correctness.\n  if (expectedState.connective === 'OR') {\n    const used = new Set();\n    return expectedBranches.every((expectedBranch) => {\n      const matchIndex = nextBranches.findIndex((nextBranch, index) => (\n        !used.has(index) && branchExpressionsEquivalent(expectedBranch, nextBranch, variable)\n      ));\n      if (matchIndex < 0) return false;\n      used.add(matchIndex);\n      return true;\n    });\n  }\n\n  return expectedBranches.every((expectedBranch, index) => (\n    branchExpressionsEquivalent(expectedBranch, nextBranches[index], variable)\n  ));\n};\n\nexport const validateRelationTransition = (\n  previousState,\n  nextState,\n  context = {},\n) => {\n  if (!previousState || !nextState) {\n    return { valid: false, reason: 'The solver could not verify this algebra step.' };\n  }\n\n  const kind = context.kind || 'equivalentRewrite';\n  let valid = false;\n\n  try {\n    if (kind === 'balancedOperation') {\n      valid = validateBalancedOperation(previousState, nextState, context);\n    } else if (kind === 'equivalentRewrite') {\n      valid = validateEquivalentRewrite(previousState, nextState);\n    } else if (kind === 'absoluteSplit') {\n      const expected = buildAbsoluteValueSplit(\n        previousState,\n        Number(context.branchIndex) || 0,\n        context.structure,\n      );\n      valid = Boolean(expected?.ready && validateExpectedStructuralState(expected.state, nextState));\n    } else if (kind === 'squareRoot') {\n      const expected = takeSquareRootOfRelation(previousState, Number(context.branchIndex) || 0);\n      valid = Boolean(expected?.ready && validateExpectedStructuralState(expected.state, nextState));\n    } else if (kind === 'solutionClaim') {\n      valid = obviousSpecialClaim(previousState) === context.claim\n        && nextState.special === context.claim\n        && (nextState.branches?.length || 0) === 0\n        && nextState.connective == null;\n    }\n  } catch {\n    valid = false;\n  }\n\n  return valid\n    ? { valid: true, reason: null }\n    : {\n        valid: false,\n        reason: 'That step did not preserve the relation. Your previous valid work was kept.',\n      };\n};`;

if (!foundation.includes(validatorAnchor)) throw new Error('Could not locate relation transition validator block');
foundation = foundation.replace(validatorAnchor, validatorReplacement);
await writeFile(foundationPath, foundation);

const corePath = 'src/MultiRelationAlgebraCore.jsx';
let core = await readFile(corePath, 'utf8');

const importNeedle = `  takeSquareRootOfRelation,\n} from './algebraRelationFoundation.js';`;
const importReplacement = `  takeSquareRootOfRelation,\n  validateRelationTransition,\n} from './algebraRelationFoundation.js';`;
if (!core.includes(importNeedle)) throw new Error('Could not locate relation foundation import');
core = core.replace(importNeedle, importReplacement);

const commitNeedle = `  const commitState = async (next, label, kind = 'relation-step') => {\n    const before = cloneRelationState(relationState);\n    setHistory((current) => [...current, before]);\n    setRelationState(next);\n    setRepresentationCorrect(null);\n    setCandidateChecks({});\n    setCancellationSelection({});\n    setDragCancellationKey(null);\n    setDragStroke(null);\n    dragStrokeRef.current = null;\n    setRelationPicker(null);\n    setPlacementByKey({});\n    setActiveBranch((current) => Math.min(current, Math.max(0, (next.branches?.length || 1) - 1)));\n    await persistStep(before, next, label, kind);\n  };`;
const commitReplacement = `  const commitState = async (\n    next,\n    label,\n    kind = 'relation-step',\n    validationContext = { kind: 'equivalentRewrite' },\n  ) => {\n    const before = cloneRelationState(relationState);\n    const validation = validateRelationTransition(before, next, validationContext);\n    if (!validation.valid) {\n      setMessage({ tone: 'error', text: validation.reason });\n      return false;\n    }\n\n    setHistory((current) => [...current, before]);\n    setRelationState(next);\n    setRepresentationCorrect(null);\n    setCandidateChecks({});\n    setCancellationSelection({});\n    setDragCancellationKey(null);\n    setDragStroke(null);\n    dragStrokeRef.current = null;\n    setRelationPicker(null);\n    setPlacementByKey({});\n    setActiveBranch((current) => Math.min(current, Math.max(0, (next.branches?.length || 1) - 1)));\n    await persistStep(before, next, label, kind);\n    return true;\n  };`;
if (!core.includes(commitNeedle)) throw new Error('Could not locate commitState block');
core = core.replace(commitNeedle, commitReplacement);

const flipStageNeedle = `        const flip = flipResults[0];\n        const before = cloneRelationState(relationState);\n        setHistory((current) => [...current, before]);\n        setRelationState(result.state);\n        setRepresentationCorrect(null);\n        setCancellationSelection({});\n        setPlacementByKey({});\n        setPendingRelationFlip({\n          branchIndex: flip.branchIndex,\n          expectedRelations: flip.expectedRelations,\n          before,\n          label: operationLabel,\n        });`;
const flipStageReplacement = `        const flip = flipResults[0];\n        const before = cloneRelationState(relationState);\n        setRelationState(result.state);\n        setRepresentationCorrect(null);\n        setCancellationSelection({});\n        setPlacementByKey({});\n        setPendingRelationFlip({\n          branchIndex: flip.branchIndex,\n          expectedRelations: flip.expectedRelations,\n          before,\n          label: operationLabel,\n          validationContext: {\n            kind: 'balancedOperation',\n            operation,\n            operandExpression: operand,\n            branchIndices: [flip.branchIndex],\n          },\n        });`;
if (!core.includes(flipStageNeedle)) throw new Error('Could not locate pending relation-flip staging block');
core = core.replace(flipStageNeedle, flipStageReplacement);

const normalCommitNeedle = `        await commitState(\n          result.state,\n          branchCount > 1\n            ? \`${'${operationLabel}'} across ${'${branchCount}'} branches\`\n            : operationLabel,\n          branchCount > 1 ? 'multi-branch-relation-step' : 'relation-step',\n        );`;
const normalCommitReplacement = `        const committed = await commitState(\n          result.state,\n          branchCount > 1\n            ? \`${'${operationLabel}'} across ${'${branchCount}'} branches\`\n            : operationLabel,\n          branchCount > 1 ? 'multi-branch-relation-step' : 'relation-step',\n          {\n            kind: 'balancedOperation',\n            operation,\n            operandExpression: operand,\n            branchIndices: stagedBranchIndices,\n          },\n        );\n        if (!committed) return;`;
if (!core.includes(normalCommitNeedle)) throw new Error('Could not locate normal balanced-operation commit');
core = core.replace(normalCommitNeedle, normalCommitReplacement);

const rewriteNeedle = `    await commitState(\n      next,\n      \`Student rewrite of expression ${'${rewriteIndex + 1}'} on Branch ${'${branchLabel(activeBranch)}'}\`,\n      'student-rewrite',\n    );`;
const rewriteReplacement = `    const committed = await commitState(\n      next,\n      \`Student rewrite of expression ${'${rewriteIndex + 1}'} on Branch ${'${branchLabel(activeBranch)}'}\`,\n      'student-rewrite',\n      { kind: 'equivalentRewrite' },\n    );\n    if (!committed) return;`;
if (!core.includes(rewriteNeedle)) throw new Error('Could not locate student rewrite commit');
core = core.replace(rewriteNeedle, rewriteReplacement);

const cancelNeedle = `    await commitState(\n      next,\n      \`Cancel matching ${'${result.kind === \'fraction\' ? \'factors\' : \'terms\'}'} in expression ${'${expressionIndex + 1}'}\`,\n      'student-cancellation',\n    );`;
const cancelReplacement = `    const committed = await commitState(\n      next,\n      \`Cancel matching ${'${result.kind === \'fraction\' ? \'factors\' : \'terms\'}'} in expression ${'${expressionIndex + 1}'}\`,\n      'student-cancellation',\n      { kind: 'equivalentRewrite' },\n    );\n    if (!committed) return;`;
if (!core.includes(cancelNeedle)) throw new Error('Could not locate cancellation commit');
core = core.replace(cancelNeedle, cancelReplacement);

const relationChoiceNeedle = `    if (complete) {\n      setPendingRelationFlip(null);\n      await persistStep(pending.before, next, pending.label, 'student-relation-direction');\n      setMessage({ tone: 'success', text: 'Relation symbols accepted. Continue solving.' });\n    } else {`;
const relationChoiceReplacement = `    if (complete) {\n      const validation = validateRelationTransition(\n        pending.before,\n        next,\n        pending.validationContext || { kind: 'equivalentRewrite' },\n      );\n      if (!validation.valid) {\n        setRelationState(pending.before);\n        setPendingRelationFlip(null);\n        setRelationPicker(null);\n        setMessage({ tone: 'error', text: validation.reason });\n        return;\n      }\n      setHistory((current) => [...current, cloneRelationState(pending.before)]);\n      setPendingRelationFlip(null);\n      await persistStep(pending.before, next, pending.label, 'student-relation-direction');\n      setMessage({ tone: 'success', text: 'Relation symbols accepted. Continue solving.' });\n    } else {`;
if (!core.includes(relationChoiceNeedle)) throw new Error('Could not locate completed relation-symbol choice');
core = core.replace(relationChoiceNeedle, relationChoiceReplacement);

const absoluteNeedle = `    await commitState(result.state, \`Reverse absolute value as ${'${structure === \'or\' ? \'OR branches\' : \'an AND compound relation\'}'}\`, 'absolute-value-split');`;
const absoluteReplacement = `    const committed = await commitState(\n      result.state,\n      \`Reverse absolute value as ${'${structure === \'or\' ? \'OR branches\' : \'an AND compound relation\'}'}\`,\n      'absolute-value-split',\n      { kind: 'absoluteSplit', branchIndex: activeBranch, structure },\n    );\n    if (!committed) return;`;
if (!core.includes(absoluteNeedle)) throw new Error('Could not locate generated absolute split commit');
core = core.replace(absoluteNeedle, absoluteReplacement);

const studentAbsoluteNeedle = `    await commitState(\n      result.state,\n      'Reverse absolute value using student-authored OR branch values',\n      'absolute-value-split',\n    );`;
const studentAbsoluteReplacement = `    const committed = await commitState(\n      result.state,\n      'Reverse absolute value using student-authored OR branch values',\n      'absolute-value-split',\n      {\n        kind: 'absoluteSplit',\n        branchIndex: activeBranch,\n        structure: absoluteSplitStructure,\n      },\n    );\n    if (!committed) return;`;
if (!core.includes(studentAbsoluteNeedle)) throw new Error('Could not locate student absolute split commit');
core = core.replace(studentAbsoluteNeedle, studentAbsoluteReplacement);

const squareRootNeedle = `      await commitState(result.state, 'Take square roots', 'square-root');`;
const squareRootReplacement = `      const committed = await commitState(\n        result.state,\n        'Take square roots',\n        'square-root',\n        { kind: 'squareRoot', branchIndex: activeBranch },\n      );\n      if (!committed) return;`;
if (!core.includes(squareRootNeedle)) throw new Error('Could not locate square-root commit');
core = core.replace(squareRootNeedle, squareRootReplacement);

const claimNeedle = `      await commitState(\n        next,\n        requested === 'noSolution' ? 'Declare no solution' : 'Declare all real numbers',\n        'solution-claim',\n      );`;
const claimReplacement = `      const committed = await commitState(\n        next,\n        requested === 'noSolution' ? 'Declare no solution' : 'Declare all real numbers',\n        'solution-claim',\n        { kind: 'solutionClaim', claim: requested },\n      );\n      if (!committed) return;`;
if (!core.includes(claimNeedle)) throw new Error('Could not locate solution-claim commit');
core = core.replace(claimNeedle, claimReplacement);

const completeSquareNeedle = `      await commitState(\n        result.state,\n        \`Complete-square choice: add ${'${latexToExpression(completeSquareValue)}'}\`,\n        'complete-square',\n      );`;
const completeSquareReplacement = `      const committed = await commitState(\n        result.state,\n        \`Complete-square choice: add ${'${latexToExpression(completeSquareValue)}'}\`,\n        'complete-square',\n        {\n          kind: 'balancedOperation',\n          operation: 'add',\n          operandExpression: completeSquareValue,\n          branchIndices: [activeBranch],\n        },\n      );\n      if (!committed) return;`;
if (!core.includes(completeSquareNeedle)) throw new Error('Could not locate complete-square commit');
core = core.replace(completeSquareNeedle, completeSquareReplacement);

await writeFile(corePath, core);
