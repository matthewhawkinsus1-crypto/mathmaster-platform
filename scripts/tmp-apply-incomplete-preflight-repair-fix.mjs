import { readFileSync, writeFileSync } from 'node:fs';

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

const editFile = (path, edit) => {
  const source = readFileSync(path, 'utf8');
  writeFileSync(path, edit(source));
};

editFile('src/platform/contract/questionBatchRepairPacket.js', (input) => (
  replaceOnce(
    input,
    '    return { questionId, question };',
    [
      '    // questionId belongs to MathMaster. Outside AIs are asked to echo it for',
      '    // clarity, but an otherwise valid repair should not lose identity merely',
      '    // because the AI omitted duplicated platform metadata inside the question.',
      '    return { questionId, question: { ...question, questionId } };',
    ].join('\n'),
    'reattach immutable inner id',
  )
));

editFile('src/components/teacher/IncompleteAssignmentRepairCenter.jsx', (input) => {
  let source = input;

  source = replaceOnce(
    source,
    'const allQuestionIds = (model) => list(model?.questions).map((row) => clean(row?.questionId)).filter(Boolean);',
    'const allQuestionIds = (model) => [...new Set(list(model?.questions).map((row) => clean(row?.questionId)).filter(Boolean))];',
    'unique question ids',
  );

  const focusAnchor = "  const actualFocusedQuestionId = focusedRow?.questionId || '';";
  source = replaceOnce(source, focusAnchor, [
    focusAnchor,
    '  const validSelectedQuestionIds = useMemo(() => {',
    '    const available = new Set(questionIds);',
    '    return [...new Set(selectedQuestionIds.map(clean).filter((id) => available.has(id)))];',
    '  }, [selectedQuestionIds, questionIds]);',
    '  const validSelectedQuestionIdSet = useMemo(() => new Set(validSelectedQuestionIds), [validSelectedQuestionIds]);',
    '  const needsRepairQuestionIds = useMemo(() => allQuestionIds({',
    "    questions: repairCenterModel.questions.filter((row) => row.status === 'needsRepair'),",
    '  }), [repairCenterModel]);',
    '  const teacherFlaggedQuestionIds = useMemo(() => allQuestionIds({',
    '    questions: repairCenterModel.questions.filter((row) => row.isTeacherFlagged),',
    '  }), [repairCenterModel]);',
    '  const focusedSectionQuestionIds = useMemo(() => allQuestionIds({',
    '    questions: repairCenterModel.questions.filter((row) => row.sectionId === focusedRow?.sectionId),',
    '  }), [repairCenterModel, focusedRow?.sectionId]);',
    '  const draftAssignmentId = clean(assignmentV5?.assignment?.assignmentId) || clean(currentDraft?.id) || null;',
  ].join('\n'), 'validated selection model');

  const toggleBefore = [
    '  const toggleSelected = (questionId) => {',
    '    setSelectedQuestionIds((current) => (',
    '      current.includes(questionId)',
    '        ? current.filter((id) => id !== questionId)',
    '        : [...current, questionId]',
    '    ));',
    '  };',
  ].join('\n');
  const toggleAfter = [
    '  const toggleSelected = (questionId) => {',
    '    const normalizedQuestionId = clean(questionId);',
    '    if (!normalizedQuestionId || !questionIds.includes(normalizedQuestionId)) return;',
    '    setSelectedQuestionIds((current) => (',
    '      current.includes(normalizedQuestionId)',
    '        ? current.filter((id) => id !== normalizedQuestionId)',
    '        : [...current, normalizedQuestionId]',
    '    ));',
    '  };',
  ].join('\n');
  source = replaceOnce(source, toggleBefore, toggleAfter, 'safe individual toggle');

  source = replaceOnce(
    source,
    [
      '        repairCenterModel,',
      '        selectedQuestionIds,',
      '        assignmentId: assignmentV5?.assignment?.assignmentId,',
    ].join('\n'),
    [
      '        repairCenterModel,',
      '        selectedQuestionIds: validSelectedQuestionIds,',
      '        assignmentId: draftAssignmentId,',
    ].join('\n'),
    'copy exact selected packet',
  );

  source = replaceOnce(
    source,
    '        expectedAssignmentId: assignmentV5?.assignment?.assignmentId || null,',
    '        expectedAssignmentId: draftAssignmentId,',
    'stage draft identity',
  );
  source = replaceOnce(
    source,
    '        allowedQuestionIds: selectedQuestionIds,',
    '        allowedQuestionIds: validSelectedQuestionIds,',
    'stage exact selected packet',
  );

  source = source.replaceAll('selectedQuestionIds.length', 'validSelectedQuestionIds.length');

  source = replaceOnce(
    source,
    '          const selected = selectedQuestionIds.includes(row.questionId);',
    '          const selected = validSelectedQuestionIdSet.has(clean(row.questionId));',
    'checkbox exact state',
  );
  source = replaceOnce(
    source,
    '                <input type="checkbox" checked={selected} onChange={() => toggleSelected(row.questionId)} aria-label={`Select question ${row.questionNumber} for batch repair`} />',
    '                <input type="checkbox" checked={selected} disabled={!clean(row.questionId)} onChange={() => toggleSelected(row.questionId)} aria-label={`Select question ${row.questionNumber} for batch repair`} />',
    'checkbox missing id guard',
  );

  const intro = [
    "      <p style={{ margin: '10px 0', color: '#3c4043', fontSize: 12.5, lineHeight: 1.5 }}>",
    '        Fix one question or a selected batch without replacing the assignment. Pasted AI output is staged first; MathMaster verifies the immutable questionId, shows the before/after changes, reruns Preflight, and only then enables Apply.',
    '      </p>',
  ].join('\n');
  const banner = [
    "      <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: '#e8f0fe', color: '#174ea6', fontSize: 12.5, lineHeight: 1.45 }}>",
    '        <strong>Student preview available.</strong> The blocking issues below prevent Library publication, but a parseable V5 draft can still be opened in Student Preview / Review so you can inspect exactly what students would see while you repair it.',
    '      </div>',
  ].join('\n');
  source = replaceOnce(source, intro, `${intro}\n\n${banner}`, 'preview publication distinction');

  const selectAllButton = '          <button type="button" onClick={() => setSelectedQuestionIds(questionIds)} disabled={busy || !questionIds.length} style={button}>Select all questions</button>';
  source = replaceOnce(source, selectAllButton, [
    '          <button type="button" onClick={() => setSelectedQuestionIds(needsRepairQuestionIds)} disabled={busy || !needsRepairQuestionIds.length} style={button}>Select questions needing repair</button>',
    '          <button type="button" onClick={() => setSelectedQuestionIds(teacherFlaggedQuestionIds)} disabled={busy || !teacherFlaggedQuestionIds.length} style={button}>Select teacher-flagged</button>',
    '          <button type="button" onClick={() => setSelectedQuestionIds(focusedSectionQuestionIds)} disabled={busy || !focusedSectionQuestionIds.length} style={button}>Select this section</button>',
    selectAllButton,
  ].join('\n'), 'selection subset controls');

  return source;
});

editFile('src/AssignmentIntake.jsx', (input) => {
  let source = input;
  const oldBranch = [
    '      } else if (canSalvageV5IntakeResult(result)) {',
    "        toastInfo?.('This draft still needs repair', `${result.errors?.length || 1} blocking issue${result.errors?.length === 1 ? '' : 's'} remain. The saved draft is still safe in Incomplete Assignments.`);",
  ].join('\n');
  const nextBranch = [
    '      } else if (canSalvageV5IntakeResult(result) && result.previewOpened === true) {',
    "        toastInfo?.('Student Preview opened', `${result.errors?.length || 1} blocking issue${result.errors?.length === 1 ? '' : 's'} still prevent Library publication, but you can inspect the assignment exactly as a student while you repair it.`);",
    '      } else if (canSalvageV5IntakeResult(result)) {',
    "        toastInfo?.('This draft still needs repair', `${result.errors?.length || 1} blocking issue${result.errors?.length === 1 ? '' : 's'} remain. The saved draft is still safe in Incomplete Assignments.`);",
  ].join('\n');
  source = replaceOnce(source, oldBranch, nextBranch, 'incomplete preview toast');
  source = replaceOnce(
    source,
    "{busy ? 'Opening…' : 'Recheck / Open Review'}",
    "{busy ? 'Opening…' : 'Open Student Preview / Review'}",
    'preview button name',
  );
  return source;
});

editFile('src/App.jsx', (input) => {
  let source = input;
  const modelImport = "import { buildAssignmentV5PreflightModel } from './platform/preflight/assignmentV5PreflightModel.js';";
  source = replaceOnce(
    source,
    modelImport,
    `${modelImport}\nimport { canSalvageV5IntakeResult } from './platform/preflight/assignmentAuthoringState.js';`,
    'salvage import',
  );

  source = replaceOnce(
    source,
    [
      '    const result = readAssignmentJson(sourceText);',
      '    if (!result.ok) return result;',
      '    const bankWarnings = [];',
    ].join('\n'),
    [
      '    const result = readAssignmentJson(sourceText);',
      '    const bankWarnings = [];',
    ].join('\n'),
    'remove hard preflight gate',
  );

  const warningsAnchor = '    const warnings = [...(result.warnings || []), ...bankWarnings];';
  const salvageBranch = [
    '',
    '    if (!result.ok) {',
    '      if (!canSalvageV5IntakeResult(result)) return { ...result, warnings };',
    '',
    '      // Publication validity and previewability are different boundaries.',
    '      // A parseable V5 with question-level blockers still opens Preflight.',
    '      const preflightModel = buildAssignmentV5PreflightModel(result.parsed.assignmentV5);',
    '      const salvageResult = {',
    '        ...result,',
    '        ok: false,',
    '        errors: [...new Set([...(result.errors || []), ...(preflightModel.errors || [])])],',
    '        warnings: [...new Set([...warnings, ...(preflightModel.warnings || [])])],',
    '        parsed: {',
    '          ...result.parsed,',
    '          assignmentV5: preflightModel.assignmentV5,',
    '          questions: preflightModel.questions,',
    '        },',
    '      };',
    '      const previewOpenResult = openAssignmentPreflight(',
    '        { ...salvageResult.parsed, authoringWarnings: salvageResult.warnings },',
    '        sourceName,',
    '        {},',
    '        { incompleteDraftId },',
    '      );',
    '      if (previewOpenResult !== true) {',
    '        return {',
    '          ...salvageResult,',
    "          errors: [...salvageResult.errors, previewOpenResult?.error || 'Could not build Assignment Review from this assignment.'],",
    '          previewOpened: false,',
    '        };',
    '      }',
    '      return { ...salvageResult, previewOpened: true, ccmrAudit };',
    '    }',
  ].join('\n');
  source = replaceOnce(source, warningsAnchor, `${warningsAnchor}${salvageBranch}`, 'open parseable blockers in preflight');
  return source;
});

console.log('Applied incomplete Preflight / Repair Center production patch.');