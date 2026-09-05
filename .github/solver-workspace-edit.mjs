import { readFile, writeFile } from 'node:fs/promises';

const stepPath = 'src/StepByStepAlgebraCore.jsx';
let step = await readFile(stepPath, 'utf8');

const equationStateNeedle = `  const [equation, setEquation] = useState(savedDraft?.equation || initialEquation);\n`;
const equationStateReplacement = `  const [equation, setEquation] = useState(savedDraft?.equation || initialEquation);\n  const [committedHistory, setCommittedHistory] = useState([]);\n  const pushCommittedEquation = (snapshot) => {\n    if (!snapshot?.left || !snapshot?.right) return;\n    const copy = JSON.parse(JSON.stringify(snapshot));\n    setCommittedHistory((current) => [...current.slice(-59), copy]);\n  };\n`;
if (!step.includes(equationStateNeedle)) throw new Error('Could not locate StepByStep equation state');
step = step.replace(equationStateNeedle, equationStateReplacement);

const questionResetNeedle = `  useEffect(() => {\n    if (savedDraft) return;\n    // getInitialEquation returns { equation, error }, not an equation.`;
const questionResetReplacement = `  useEffect(() => {\n    if (savedDraft) return;\n    setCommittedHistory([]);\n    // getInitialEquation returns { equation, error }, not an equation.`;
if (!step.includes(questionResetNeedle)) throw new Error('Could not locate StepByStep question reset effect');
step = step.replace(questionResetNeedle, questionResetReplacement);

const savedQuestionHistoryAnchor = `  }, [question, savedDraft]);\n\n  useEffect(() => {\n    // A JSON author cannot turn this on for the whole class.`;
const savedQuestionHistoryReplacement = `  }, [question, savedDraft]);\n\n  // A saved draft skips the fresh-question reset block above, so clear Undo\n  // history explicitly whenever the question/draft identity changes. History\n  // belongs to this mounted work session; it is not reconstructed from old\n  // server state and can never leak into the next problem.\n  useEffect(() => {\n    setCommittedHistory([]);\n  }, [question, localDraftKey]);\n\n  useEffect(() => {\n    // A JSON author cannot turn this on for the whole class.`;
if (!step.includes(savedQuestionHistoryAnchor)) throw new Error('Could not locate StepByStep prefill effect anchor');
step = step.replace(savedQuestionHistoryAnchor, savedQuestionHistoryReplacement);

const undoStart = step.indexOf(`  useEffect(() => {\n    onUndoStateChange?.({`);
const undoEnd = step.indexOf(`\n  const triggerShake`, undoStart);
if (undoStart < 0 || undoEnd <= undoStart) throw new Error('Could not locate StepByStep Undo effect');
const stepUndoReplacement = `  const hasTransientUndo = Boolean(\n    pendingMove\n    || crossedSides.length\n    || Object.keys(cancelledPairIds).some((side) => cancelledPairIds[side]?.length)\n    || Object.values(selectedCancellationIndices).some((indices) => indices?.length)\n    || Object.keys(simplificationAnswers).length\n    || rewriteOpen\n    || Object.values(rewriteAnswers).some((value) => String(value || '').trim())\n    || armedTile\n    || placedOperationSides.length\n    || tapPlacementArmed\n    || String(operand || '').trim()\n  );\n\n  useEffect(() => {\n    onUndoStateChange?.({\n      canUndo: hasTransientUndo || committedHistory.length > 0,\n      onUndo: () => {\n        const answerKeys = Object.keys(simplificationAnswers);\n        const pairSides = Object.keys(cancelledPairIds).filter((side) => cancelledPairIds[side]?.length);\n        const hasSelectedCancellation = Object.values(selectedCancellationIndices)\n          .some((indices) => indices?.length);\n        const hasRewriteEntry = rewriteOpen\n          || Object.values(rewriteAnswers).some((value) => String(value || '').trim());\n        const hasOperationStaging = Boolean(\n          armedTile\n          || placedOperationSides.length\n          || tapPlacementArmed\n          || String(operand || '').trim()\n        );\n\n        if (answerKeys.length) {\n          setSimplificationAnswers((current) => {\n            const next = { ...current };\n            delete next[answerKeys[answerKeys.length - 1]];\n            return next;\n          });\n        } else if (hasSelectedCancellation) {\n          setSelectedCancellationIndices({});\n        } else if (pairSides.length) {\n          const side = pairSides[pairSides.length - 1];\n          setCancelledPairIds((current) => ({ ...current, [side]: current[side].slice(0, -1) }));\n          setCrossedSides((current) => current.filter((entry) => entry !== side));\n        } else if (crossedSides.length) {\n          setCrossedSides((current) => current.slice(0, -1));\n        } else if (pendingMove) {\n          setPendingMove(null);\n          setCancelledPairIds({});\n          setSelectedCancellationIndices({});\n          setSimplificationAnswers({});\n        } else if (hasRewriteEntry) {\n          setRewriteOpen(false);\n          setRewriteAnswers({ left: '', right: '' });\n        } else if (hasOperationStaging) {\n          setArmedTile(null);\n          setOperand('');\n          setPlacedOperationSides([]);\n          setPlacedOperationPositions({});\n          setTapPlacementArmed(false);\n        } else if (committedHistory.length) {\n          setCommittedHistory((current) => {\n            if (!current.length) return current;\n            const previous = current[current.length - 1];\n            setEquation(previous);\n            setPendingMove(null);\n            setCrossedSides([]);\n            setCancelledPairIds({});\n            setSelectedCancellationIndices({});\n            setSimplificationAnswers({});\n            setRewriteOpen(false);\n            setRewriteAnswers({ left: '', right: '' });\n            setArmedTile(null);\n            setOperand('');\n            setPlacedOperationSides([]);\n            setPlacedOperationPositions({});\n            setTapPlacementArmed(false);\n            setMessage({ tone: 'growth', text: 'Last completed algebra step undone.' });\n            return current.slice(0, -1);\n          });\n          return;\n        }\n\n        setMessage({ tone: 'growth', text: 'The pending algebra action was undone before it changed your saved equation.' });\n      },\n      label: committedHistory.length && !hasTransientUndo\n        ? 'Undo the last completed algebra step'\n        : 'Undo the pending algebra action',\n    });\n    return () => onUndoStateChange?.(null);\n  }, [\n    armedTile,\n    cancelledPairIds,\n    committedHistory,\n    crossedSides,\n    hasTransientUndo,\n    onUndoStateChange,\n    operand,\n    pendingMove,\n    placedOperationSides,\n    rewriteAnswers,\n    rewriteOpen,\n    selectedCancellationIndices,\n    simplificationAnswers,\n    tapPlacementArmed,\n  ]);\n`;
step = step.slice(0, undoStart) + stepUndoReplacement + step.slice(undoEnd);

const commitMoveNeedle = `      await saveStep({ move, earned, possible: 2, countsAttempt: false, accepted: true, equationAfter: nextEquation });\n      setEquation(nextEquation);`;
const commitMoveReplacement = `      await saveStep({ move, earned, possible: 2, countsAttempt: false, accepted: true, equationAfter: nextEquation });\n      pushCommittedEquation(equation);\n      setEquation(nextEquation);`;
if (!step.includes(commitMoveNeedle)) throw new Error('Could not locate StepByStep balanced commit');
step = step.replace(commitMoveNeedle, commitMoveReplacement);

const rewriteNeedle = `    await persistStudentRewrite(equation, nextEquation, changedSides);\n    setEquation(nextEquation);`;
const rewriteReplacement = `    await persistStudentRewrite(equation, nextEquation, changedSides);\n    pushCommittedEquation(equation);\n    setEquation(nextEquation);`;
if (!step.includes(rewriteNeedle)) throw new Error('Could not locate StepByStep rewrite commit');
step = step.replace(rewriteNeedle, rewriteReplacement);

const cancellationNeedle = `        setEquation(nextEquation);\n        setCancelledPairIds((current) => ({ ...current, [side]: [] }));`;
const cancellationReplacement = `        pushCommittedEquation(beforeEquation);\n        setEquation(nextEquation);\n        setCancelledPairIds((current) => ({ ...current, [side]: [] }));`;
if (!step.includes(cancellationNeedle)) throw new Error('Could not locate StepByStep standalone cancellation commit');
step = step.replace(cancellationNeedle, cancellationReplacement);

const resetNeedle = `    setEquation(pristineEquation);\n    setOperand('');`;
const resetReplacement = `    setEquation(pristineEquation);\n    setCommittedHistory([]);\n    setOperand('');`;
if (!step.includes(resetNeedle)) throw new Error('Could not locate StepByStep Reset Work');
step = step.replace(resetNeedle, resetReplacement);

await writeFile(stepPath, step);

const relationPath = 'src/MultiRelationAlgebraCore.jsx';
let relation = await readFile(relationPath, 'utf8');

const relationUndoStart = relation.indexOf(`  useEffect(() => {\n    onUndoStateChange?.({`);
const relationUndoEnd = relation.indexOf(`\n  const persistStep`, relationUndoStart);
if (relationUndoStart < 0 || relationUndoEnd <= relationUndoStart) throw new Error('Could not locate MultiRelation Undo effect');
const relationUndoReplacement = `  const hasTransientUndo = Boolean(\n    pendingRelationFlip\n    || operation\n    || String(operand || '').trim()\n    || Object.keys(placementByKey).length\n    || rewriteOpen\n    || String(rewriteValue || '').trim()\n    || completeSquareOpen\n    || String(completeSquareValue || '').trim()\n    || Object.keys(cancellationSelection).length\n    || relationPicker\n    || absoluteSplitOpen\n    || absoluteSplitStructure\n    || absoluteSplitValues.some((value) => String(value || '').trim())\n  );\n\n  useEffect(() => {\n    onUndoStateChange?.({\n      canUndo: hasTransientUndo || history.length > 0,\n      label: hasTransientUndo ? 'Undo the pending relation action' : 'Undo the last relation step',\n      onUndo: () => {\n        if (hasTransientUndo) {\n          if (pendingRelationFlip?.before) {\n            setRelationState(cloneRelationState(pendingRelationFlip.before));\n          }\n          setOperation(null);\n          setOperand('');\n          setPlacementByKey({});\n          setRewriteOpen(false);\n          setRewriteValue('');\n          setCompleteSquareOpen(false);\n          setCompleteSquareValue('');\n          setCancellationSelection({});\n          setDragCancellationKey(null);\n          setDragStroke(null);\n          dragStrokeRef.current = null;\n          setPendingRelationFlip(null);\n          setRelationPicker(null);\n          setAbsoluteSplitOpen(false);\n          setAbsoluteSplitStructure(null);\n          setAbsoluteSplitValues(['', '']);\n          setMessage({ tone: 'growth', text: 'Pending relation action undone.' });\n          return;\n        }\n\n        setHistory((current) => {\n          if (!current.length) return current;\n          setRelationState(current[current.length - 1]);\n          setActiveBranch(0);\n          setRepresentationCorrect(null);\n          setCandidateChecks({});\n          setCancellationSelection({});\n          setPlacementByKey({});\n          setPendingRelationFlip(null);\n          setRelationPicker(null);\n          setAbsoluteSplitOpen(false);\n          setAbsoluteSplitStructure(null);\n          setAbsoluteSplitValues(['', '']);\n          setMessage({ tone: 'growth', text: 'Last relation step undone.' });\n          return current.slice(0, -1);\n        });\n      },\n    });\n    return () => onUndoStateChange?.(null);\n  }, [\n    absoluteSplitOpen,\n    absoluteSplitStructure,\n    absoluteSplitValues,\n    cancellationSelection,\n    completeSquareOpen,\n    completeSquareValue,\n    hasTransientUndo,\n    history,\n    onUndoStateChange,\n    operand,\n    operation,\n    pendingRelationFlip,\n    placementByKey,\n    relationPicker,\n    rewriteOpen,\n    rewriteValue,\n  ]);\n`;
relation = relation.slice(0, relationUndoStart) + relationUndoReplacement + relation.slice(relationUndoEnd);

relation = relation.replaceAll(
  `setHistory((current) => [...current, before]);`,
  `setHistory((current) => [...current.slice(-59), before]);`,
);

await writeFile(relationPath, relation);

const testPath = 'tests/platform/solverUndoHistory.test.mjs';
let testSource = await readFile(testPath, 'utf8');
const oldResetTest = `  const questionReset = blockBetween(source, 'useEffect(() => {\\n    if (savedDraft) return;', '  useEffect(() => {\\n    // A JSON author');\n  const resetBlock = blockBetween(source, 'const resetQuestionWork = () =>', '  const attemptMove');\n\n  assert.match(questionReset, /setCommittedHistory\\(\\[\\]\\)/);`;
const newResetTest = `  const questionReset = blockBetween(source, 'useEffect(() => {\\n    if (savedDraft) return;', '  useEffect(() => {\\n    // A JSON author');\n  const identityReset = blockBetween(source, '// A saved draft skips the fresh-question reset block above', '  useEffect(() => {\\n    // A JSON author');\n  const resetBlock = blockBetween(source, 'const resetQuestionWork = () =>', '  const attemptMove');\n\n  assert.match(questionReset, /setCommittedHistory\\(\\[\\]\\)/);\n  assert.match(identityReset, /setCommittedHistory\\(\\[\\]\\)/);`;
if (!testSource.includes(oldResetTest)) throw new Error('Could not locate StepByStep reset contract test');
testSource = testSource.replace(oldResetTest, newResetTest);
await writeFile(testPath, testSource);
