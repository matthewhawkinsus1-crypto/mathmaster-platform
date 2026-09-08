import { readFileSync, writeFileSync } from 'node:fs';

const replaceOnce = (source, before, after, label) => {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
};

const patchFile = (path, patches) => {
  let source = readFileSync(path, 'utf8');
  patches.forEach(({ before, after, label }) => {
    source = replaceOnce(source, before, after, `${path} / ${label}`);
  });
  writeFileSync(path, source);
};

patchFile('src/platform/contract/questionBatchRepairPacket.js', [
  {
    label: 'reattach immutable inner id',
    before: '    return { questionId, question };',
    after: `    // questionId belongs to MathMaster. Outside AIs are asked to echo it for\n    // clarity, but an otherwise valid repair should not lose identity merely\n    // because the AI omitted duplicated platform metadata inside the question.\n    return { questionId, question: { ...question, questionId } };`,
  },
]);

patchFile('src/components/teacher/IncompleteAssignmentRepairCenter.jsx', [
  {
    label: 'unique question ids',
    before: 'const allQuestionIds = (model) => list(model?.questions).map((row) => clean(row?.questionId)).filter(Boolean);',
    after: 'const allQuestionIds = (model) => [...new Set(list(model?.questions).map((row) => clean(row?.questionId)).filter(Boolean))];',
  },
  {
    label: 'validated selection model',
    before: `  const questionIds = useMemo(() => allQuestionIds(repairCenterModel), [repairCenterModel]);\n  const focusedRow = repairCenterModel.questions.find((row) => row.questionId === focusedQuestionId)\n    || repairCenterModel.questions.find((row) => row.status !== 'passed')\n    || repairCenterModel.questions[0]\n    || null;\n  const actualFocusedQuestionId = focusedRow?.questionId || '';`,
    after: `  const questionIds = useMemo(() => allQuestionIds(repairCenterModel), [repairCenterModel]);\n  const focusedRow = repairCenterModel.questions.find((row) => row.questionId === focusedQuestionId)\n    || repairCenterModel.questions.find((row) => row.status !== 'passed')\n    || repairCenterModel.questions[0]\n    || null;\n  const actualFocusedQuestionId = focusedRow?.questionId || '';\n  const validSelectedQuestionIds = useMemo(() => {\n    const available = new Set(questionIds);\n    return [...new Set(selectedQuestionIds.map(clean).filter((id) => available.has(id)))];\n  }, [selectedQuestionIds, questionIds]);\n  const validSelectedQuestionIdSet = useMemo(() => new Set(validSelectedQuestionIds), [validSelectedQuestionIds]);\n  const needsRepairQuestionIds = useMemo(() => allQuestionIds({\n    questions: repairCenterModel.questions.filter((row) => row.status === 'needsRepair'),\n  }), [repairCenterModel]);\n  const teacherFlaggedQuestionIds = useMemo(() => allQuestionIds({\n    questions: repairCenterModel.questions.filter((row) => row.isTeacherFlagged),\n  }), [repairCenterModel]);\n  const focusedSectionQuestionIds = useMemo(() => allQuestionIds({\n    questions: repairCenterModel.questions.filter((row) => row.sectionId === focusedRow?.sectionId),\n  }), [repairCenterModel, focusedRow?.sectionId]);\n  const draftAssignmentId = clean(assignmentV5?.assignment?.assignmentId) || clean(currentDraft?.id) || null;`,
  },
  {
    label: 'safe individual toggle',
    before: `  const toggleSelected = (questionId) => {\n    setSelectedQuestionIds((current) => (\n      current.includes(questionId)\n        ? current.filter((id) => id !== questionId)\n        : [...current, questionId]\n    ));\n  };`,
    after: `  const toggleSelected = (questionId) => {\n    const normalizedQuestionId = clean(questionId);\n    if (!normalizedQuestionId || !questionIds.includes(normalizedQuestionId)) return;\n    setSelectedQuestionIds((current) => (\n      current.includes(normalizedQuestionId)\n        ? current.filter((id) => id !== normalizedQuestionId)\n        : [...current, normalizedQuestionId]\n    ));\n  };`,
  },
  {
    label: 'copy exact selected packet',
    before: `  const copySelectedRepairRequest = async () => {\n    if (!selectedQuestionIds.length) {\n      setMessage('Select at least one question before building a batch repair request.');\n      return;\n    }\n    try {\n      if (!navigator.clipboard?.writeText) throw new Error('Clipboard copy is unavailable in this browser.');\n      const request = buildQuestionBatchRepairRequest({\n        assignmentV5,\n        repairCenterModel,\n        selectedQuestionIds,\n        assignmentId: assignmentV5?.assignment?.assignmentId,\n        baseRevision: revision,\n      });\n      await navigator.clipboard.writeText(request);\n      setMessage(`${selectedQuestionIds.length} selected question${selectedQuestionIds.length === 1 ? '' : 's'} copied as a compact repair request. The rest of the assignment was not included.`);\n    } catch (error) {\n      setMessage(error.message);\n    }\n  };`,
    after: `  const copySelectedRepairRequest = async () => {\n    if (!validSelectedQuestionIds.length) {\n      setMessage('Select at least one question before building a batch repair request.');\n      return;\n    }\n    try {\n      if (!navigator.clipboard?.writeText) throw new Error('Clipboard copy is unavailable in this browser.');\n      const request = buildQuestionBatchRepairRequest({\n        assignmentV5,\n        repairCenterModel,\n        selectedQuestionIds: validSelectedQuestionIds,\n        assignmentId: draftAssignmentId,\n        baseRevision: revision,\n      });\n      await navigator.clipboard.writeText(request);\n      setMessage(`${validSelectedQuestionIds.length} selected question${validSelectedQuestionIds.length === 1 ? '' : 's'} copied as a compact repair request. The rest of the assignment was not included.`);\n    } catch (error) {\n      setMessage(error.message);\n    }\n  };`,
  },
  {
    label: 'stage exact selected packet',
    before: `  const stageBatch = () => {\n    if (!selectedQuestionIds.length) {\n      setMessage('Select the questions this batch reply is allowed to replace before pasting it.');\n      return;\n    }\n    try {\n      const parsedResponse = parseQuestionBatchRepairResponse(batchJson, {\n        expectedAssignmentId: assignmentV5?.assignment?.assignmentId || null,\n        expectedBaseRevision: revision,\n        allowedQuestionIds: selectedQuestionIds,\n      });`,
    after: `  const stageBatch = () => {\n    if (!validSelectedQuestionIds.length) {\n      setMessage('Select the questions this batch reply is allowed to replace before pasting it.');\n      return;\n    }\n    try {\n      const parsedResponse = parseQuestionBatchRepairResponse(batchJson, {\n        expectedAssignmentId: draftAssignmentId,\n        expectedBaseRevision: revision,\n        allowedQuestionIds: validSelectedQuestionIds,\n      });`,
  },
  {
    label: 'preview publication distinction',
    before: `      <p style={{ margin: '10px 0', color: '#3c4043', fontSize: 12.5, lineHeight: 1.5 }}>\n        Fix one question or a selected batch without replacing the assignment. Pasted AI output is staged first; MathMaster verifies the immutable questionId, shows the before/after changes, reruns Preflight, and only then enables Apply.\n      </p>`,
    after: `      <p style={{ margin: '10px 0', color: '#3c4043', fontSize: 12.5, lineHeight: 1.5 }}>\n        Fix one question or a selected batch without replacing the assignment. Pasted AI output is staged first; MathMaster verifies the immutable questionId, shows the before/after changes, reruns Preflight, and only then enables Apply.\n      </p>\n\n      <div style={{ marginTop: 10, padding: 10, borderRadius: 9, background: '#e8f0fe', color: '#174ea6', fontSize: 12.5, lineHeight: 1.45 }}>\n        <strong>Student preview available.</strong> The blocking issues below prevent Library publication, but a parseable V5 draft can still be opened in Student Preview / Review so you can inspect exactly what students would see while you repair it.\n      </div>`,
  },
  {
    label: 'checkbox exact state',
    before: `          const focused = row.questionId === actualFocusedQuestionId;\n          const selected = selectedQuestionIds.includes(row.questionId);`,
    after: `          const focused = row.questionId === actualFocusedQuestionId;\n          const selected = validSelectedQuestionIdSet.has(clean(row.questionId));`,
  },
  {
    label: 'checkbox missing id guard',
    before: `                <input type="checkbox" checked={selected} onChange={() => toggleSelected(row.questionId)} aria-label={` + '`' + `Select question ${row.questionNumber} for batch repair` + '`' + `} />`,
    after: `                <input type="checkbox" checked={selected} disabled={!clean(row.questionId)} onChange={() => toggleSelected(row.questionId)} aria-label={` + '`' + `Select question ${row.questionNumber} for batch repair` + '`' + `} />`,
  },
  {
    label: 'selection controls and count',
    before: `        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>\n          <button type="button" onClick={() => setSelectedQuestionIds(questionIds)} disabled={busy || !questionIds.length} style={button}>Select all questions</button>\n          <button type="button" onClick={() => setSelectedQuestionIds([])} disabled={busy} style={button}>Clear selection</button>\n          <button type="button" onClick={copySelectedRepairRequest} disabled={busy || !selectedQuestionIds.length} style={button}>Copy selected AI repair request</button>\n        </div>\n        <div style={{ color: '#5f6368', fontSize: 11.5, marginBottom: 10 }}>\n          {selectedQuestionIds.length} selected. The request includes only those questions, their diagnostics, and teacher constraints—not the full assignment.\n        </div>`,
    after: `        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>\n          <button type="button" onClick={() => setSelectedQuestionIds(needsRepairQuestionIds)} disabled={busy || !needsRepairQuestionIds.length} style={button}>Select questions needing repair</button>\n          <button type="button" onClick={() => setSelectedQuestionIds(teacherFlaggedQuestionIds)} disabled={busy || !teacherFlaggedQuestionIds.length} style={button}>Select teacher-flagged</button>\n          <button type="button" onClick={() => setSelectedQuestionIds(focusedSectionQuestionIds)} disabled={busy || !focusedSectionQuestionIds.length} style={button}>Select this section</button>\n          <button type="button" onClick={() => setSelectedQuestionIds(questionIds)} disabled={busy || !questionIds.length} style={button}>Select all questions</button>\n          <button type="button" onClick={() => setSelectedQuestionIds([])} disabled={busy} style={button}>Clear selection</button>\n          <button type="button" onClick={copySelectedRepairRequest} disabled={busy || !validSelectedQuestionIds.length} style={button}>Copy selected AI repair request</button>\n        </div>\n        <div style={{ color: '#5f6368', fontSize: 11.5, marginBottom: 10 }}>\n          {validSelectedQuestionIds.length} selected. The request includes only those questions, their diagnostics, and teacher constraints—not the full assignment.\n        </div>`,
  },
  {
    label: 'stage button exact count',
    before: `<button type="button" onClick={stageBatch} disabled={busy || !selectedQuestionIds.length || !clean(batchJson)} style={{ ...button, marginTop: 8 }}>Stage batch repair</button>`,
    after: `<button type="button" onClick={stageBatch} disabled={busy || !validSelectedQuestionIds.length || !clean(batchJson)} style={{ ...button, marginTop: 8 }}>Stage batch repair</button>`,
  },
]);

patchFile('src/AssignmentIntake.jsx', [
  {
    label: 'salvage comment matches preview behavior',
    before: `      // Salvage is a third outcome, and it needs to stay one. It is not a\n      // rejection: the draft is saved and its Repair Center is open below, so\n      // the hard-rejection panel would be a lie. But it is not \`ok\` either —\n      // the base intake treats \`ok\` as publishable and answers it with "Review\n      // the details and publish from Preflight", which names a screen that is\n      // not open and drops the blocking-error list the teacher repairs from.\n      // \`salvaged\` is what the base branches on; it renders the saved-for-repair\n      // panel, which keeps the error list and points at the Repair Center.`,
    after: `      // Salvage is a third outcome, and it needs to stay one. It is not a\n      // rejection: the draft is saved, Repair Center is open below, and the\n      // student-style Preflight may also be open for inspection. But it is not\n      // \`ok\` either — blockers still prevent Library publication. \`salvaged\`\n      // keeps the repair list visible without pretending the draft is publishable.`,
  },
  {
    label: 'incomplete preview toast',
    before: `      } else if (canSalvageV5IntakeResult(result)) {\n        toastInfo?.('This draft still needs repair', \`${result.errors?.length || 1} blocking issue${result.errors?.length === 1 ? '' : 's'} remain. The saved draft is still safe in Incomplete Assignments.\`);`,
    after: `      } else if (canSalvageV5IntakeResult(result) && result.previewOpened === true) {\n        toastInfo?.('Student Preview opened', \`${result.errors?.length || 1} blocking issue${result.errors?.length === 1 ? '' : 's'} still prevent Library publication, but you can inspect the assignment exactly as a student while you repair it.\`);\n      } else if (canSalvageV5IntakeResult(result)) {\n        toastInfo?.('This draft still needs repair', \`${result.errors?.length || 1} blocking issue${result.errors?.length === 1 ? '' : 's'} remain. The saved draft is still safe in Incomplete Assignments.\`);`,
  },
  {
    label: 'preview button name',
    before: `{busy ? 'Opening…' : 'Recheck / Open Review'}`,
    after: `{busy ? 'Opening…' : 'Open Student Preview / Review'}`,
  },
]);

patchFile('src/App.jsx', [
  {
    label: 'salvage import',
    before: `import { buildAssignmentV5PreflightModel } from './platform/preflight/assignmentV5PreflightModel.js';`,
    after: `import { buildAssignmentV5PreflightModel } from './platform/preflight/assignmentV5PreflightModel.js';\nimport { canSalvageV5IntakeResult } from './platform/preflight/assignmentAuthoringState.js';`,
  },
  {
    label: 'open parseable blockers in preflight',
    before: `    const result = readAssignmentJson(sourceText);\n    if (!result.ok) return result;\n    const bankWarnings = [];\n    if (ccmrAudit?.autoSourced > 0 || ccmrAudit?.replaced > 0) {\n      bankWarnings.push(\n        \`MathMaster sourced ${Number(ccmrAudit.autoSourced || 0) + Number(ccmrAudit.replaced || 0)} Practice item${Number(ccmrAudit.autoSourced || 0) + Number(ccmrAudit.replaced || 0) === 1 ? '' : 's'} from the audited CCMR Fidelity V2.1 bank.\`,\n      );\n    }\n    const warnings = [...(result.warnings || []), ...bankWarnings];\n    const opened = openAssignmentPreflight({ ...result.parsed, authoringWarnings: warnings }, sourceName, {}, { incompleteDraftId });\n    if (opened !== true) {\n      return { ok: false, errors: [opened?.error || 'Could not build Assignment Review from this assignment.'], warnings, sourceSchemaVersion: result.sourceSchemaVersion, compilerDefect: false };\n    }\n    return { ok: true, warnings, repairs: result.parsed.repairs || [], ccmrAudit };`,
    after: `    const result = readAssignmentJson(sourceText);\n    const bankWarnings = [];\n    if (ccmrAudit?.autoSourced > 0 || ccmrAudit?.replaced > 0) {\n      bankWarnings.push(\n        \`MathMaster sourced ${Number(ccmrAudit.autoSourced || 0) + Number(ccmrAudit.replaced || 0)} Practice item${Number(ccmrAudit.autoSourced || 0) + Number(ccmrAudit.replaced || 0) === 1 ? '' : 's'} from the audited CCMR Fidelity V2.1 bank.\`,\n      );\n    }\n    const warnings = [...(result.warnings || []), ...bankWarnings];\n\n    if (!result.ok) {\n      if (!canSalvageV5IntakeResult(result)) return { ...result, warnings };\n\n      // Publication validity and previewability are different boundaries. A\n      // parseable V5 with question-level blockers is exactly what the Repair\n      // Center exists to inspect, so build the canonical Preflight model and\n      // open the student-style review while keeping ok=false.\n      const preflightModel = buildAssignmentV5PreflightModel(result.parsed.assignmentV5);\n      const salvageResult = {\n        ...result,\n        ok: false,\n        errors: [...new Set([...(result.errors || []), ...(preflightModel.errors || [])])],\n        warnings: [...new Set([...warnings, ...(preflightModel.warnings || [])])],\n        parsed: {\n          ...result.parsed,\n          assignmentV5: preflightModel.assignmentV5,\n          questions: preflightModel.questions,\n        },\n      };\n      const opened = openAssignmentPreflight(\n        { ...salvageResult.parsed, authoringWarnings: salvageResult.warnings },\n        sourceName,\n        {},\n        { incompleteDraftId },\n      );\n      if (opened !== true) {\n        return {\n          ...salvageResult,\n          errors: [...salvageResult.errors, opened?.error || 'Could not build Assignment Review from this assignment.'],\n          previewOpened: false,\n        };\n      }\n      return { ...salvageResult, previewOpened: true, ccmrAudit };\n    }\n\n    const opened = openAssignmentPreflight({ ...result.parsed, authoringWarnings: warnings }, sourceName, {}, { incompleteDraftId });\n    if (opened !== true) {\n      return { ok: false, errors: [opened?.error || 'Could not build Assignment Review from this assignment.'], warnings, sourceSchemaVersion: result.sourceSchemaVersion, compilerDefect: false };\n    }\n    return { ok: true, warnings, repairs: result.parsed.repairs || [], ccmrAudit };`,
  },
]);

console.log('Applied incomplete Preflight / Repair Center production patch.');