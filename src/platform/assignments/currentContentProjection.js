const clean = (value) => String(value ?? '').trim();
const roleOf = (row) => clean(row.question?.activityRole || row.sectionRole).toLowerCase() || 'practice';

const flattenStorage = (assignment = {}) => {
  const rows = [];
  for (const section of Array.isArray(assignment?.sections) ? assignment.sections : []) {
    for (const question of Array.isArray(section?.questions) ? section.questions : []) {
      rows.push({
        storageIndex: rows.length,
        section,
        sectionId: clean(section?.id) || null,
        sectionRole: clean(section?.role).toLowerCase() || 'practice',
        sectionTitle: clean(section?.title) || null,
        question,
        questionId: clean(question?.questionId),
      });
    }
  }
  return rows;
};

export const projectCurrentAssignmentContent = (assignment = {}) => {
  const rows = flattenStorage(assignment);
  const diagnostics = [];
  const rowsByQuestionId = new Map();
  for (const row of rows) {
    if (!row.questionId) continue;
    const matches = rowsByQuestionId.get(row.questionId) || [];
    matches.push(row);
    rowsByQuestionId.set(row.questionId, matches);
  }
  for (const [questionId, matches] of rowsByQuestionId) {
    if (matches.length > 1) diagnostics.push({ code: 'duplicate-question-id', questionId });
  }

  const activeClaims = new Map();
  for (const row of rows) {
    const supersedes = clean(row.question?.supersedesQuestionId);
    if (!supersedes || row.question?.teacherExcluded === true) continue;
    const claims = activeClaims.get(supersedes) || [];
    claims.push(row);
    activeClaims.set(supersedes, claims);
  }

  const validReplacementByHistoricalIndex = new Map();
  const replacementStorageIndexByHistoricalStorageIndex = new Map();
  for (const row of rows) {
    const supersedesQuestionId = clean(row.question?.supersedesQuestionId);
    if (!supersedesQuestionId || row.question?.teacherExcluded === true) continue;
    const targets = rowsByQuestionId.get(supersedesQuestionId) || [];
    const codes = [];
    if (targets.length !== 1) codes.push(targets.length ? 'duplicate-question-id' : 'missing-superseded-question');
    if (targets.length === 1) {
      if (row.questionId && row.questionId === supersedesQuestionId) codes.push('duplicate-question-id');
      if (targets[0].question?.teacherExcluded !== true) codes.push('superseded-question-not-excluded');
      if (roleOf(row) !== roleOf(targets[0])) codes.push('replacement-role-conflict');
    }
    if ((activeClaims.get(supersedesQuestionId) || []).length !== 1) codes.push('duplicate-active-replacement');
    if (codes.length) {
      for (const code of new Set(codes)) {
        diagnostics.push({ code, questionId: row.questionId || null, supersedesQuestionId, storageIndex: row.storageIndex });
      }
      continue;
    }
    const historical = targets[0];
    validReplacementByHistoricalIndex.set(historical.storageIndex, row);
    replacementStorageIndexByHistoricalStorageIndex.set(historical.storageIndex, row.storageIndex);
  }

  const emittedReplacements = new Set();
  const entries = [];
  const emit = (row, historical = null) => {
    const replacement = Boolean(historical);
    entries.push({
      question: row.question,
      questionId: row.questionId,
      storageIndex: row.storageIndex,
      logicalRole: historical ? roleOf(historical) : roleOf(row),
      logicalSectionId: historical?.sectionId || row.sectionId,
      logicalPosition: 0,
      source: replacement ? 'replacement' : 'stored',
      supersedesQuestionId: clean(row.question?.supersedesQuestionId) || null,
      historicalStorageIndex: historical?.storageIndex ?? null,
    });
  };
  for (const row of rows) {
    if (row.question?.teacherExcluded === true) {
      const replacement = validReplacementByHistoricalIndex.get(row.storageIndex);
      if (replacement) {
        emit(replacement, row);
        emittedReplacements.add(replacement.storageIndex);
      }
      continue;
    }
    if (emittedReplacements.has(row.storageIndex)) continue;
    emit(row);
  }

  const logicalSectionByRole = new Map();
  for (const entry of entries) {
    let section = logicalSectionByRole.get(entry.logicalRole);
    if (!section) {
      const sourceRow = rows.find((row) => row.sectionId === entry.logicalSectionId);
      section = {
        id: entry.logicalSectionId || entry.logicalRole,
        role: entry.logicalRole,
        title: sourceRow?.sectionTitle || null,
        sourceSection: sourceRow?.section || null,
        entries: [],
      };
      logicalSectionByRole.set(entry.logicalRole, section);
    }
    entry.logicalPosition = section.entries.length;
    section.entries.push(entry);
  }
  const logicalSections = [...logicalSectionByRole.values()];
  return {
    storageQuestions: rows.map((row) => row.question),
    entries,
    logicalSections,
    byStorageIndex: new Map(entries.map((entry) => [entry.storageIndex, entry])),
    byQuestionId: new Map(entries.filter((entry) => entry.questionId).map((entry) => [entry.questionId, entry])),
    diagnostics,
    replacementStorageIndexByHistoricalStorageIndex,
  };
};

export const resolveCurrentContentStorageIndex = (assignment = {}, requestedStorageIndex = 0) => {
  const projection = projectCurrentAssignmentContent(assignment);
  const requested = Number(requestedStorageIndex);
  if (projection.byStorageIndex.has(requested)) return requested;
  if (projection.replacementStorageIndexByHistoricalStorageIndex.has(requested)) {
    return projection.replacementStorageIndexByHistoricalStorageIndex.get(requested);
  }
  if (!projection.entries.length) return null;
  const later = projection.entries
    .map((entry) => entry.storageIndex)
    .filter((index) => index > requested)
    .sort((a, b) => a - b);
  if (later.length) return later[0];
  return projection.entries
    .map((entry) => entry.storageIndex)
    .sort((a, b) => b - a)[0];
};
