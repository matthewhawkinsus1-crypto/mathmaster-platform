const unique = (values) => [...new Set((Array.isArray(values) ? values : []).map(String))];

export const normalizeStudentProfile = (profile = {}) => {
  const safeProfile = profile && typeof profile === 'object' && !Array.isArray(profile)
    ? profile
    : {};

  return {
    inclusionStatus: Boolean(safeProfile.inclusionStatus),
    accommodations: unique(safeProfile.accommodations),
    modifications: unique(safeProfile.modifications),
  };
};

export const studentHasSupport = (profile, value) => {
  const normalized = normalizeStudentProfile(profile);
  return normalized.accommodations.includes(value) || normalized.modifications.includes(value);
};

export const getStudentSupportPresentation = (profile) => {
  const normalized = normalizeStudentProfile(profile);
  const inclusion = normalized.inclusionStatus;
  return {
    inclusion,
    disableIdleTimer: inclusion || normalized.accommodations.includes('disable-idle-timer') || normalized.accommodations.includes('extra-time'),
    hideCountdowns: inclusion || normalized.accommodations.includes('no-countdown'),
    visualChunking: inclusion || normalized.accommodations.includes('visual-chunking'),
    highContrast: inclusion || normalized.accommodations.includes('high-contrast'),
    largeText: inclusion || normalized.accommodations.includes('large-text'),
    declutter: inclusion || normalized.accommodations.includes('declutter-ui'),
    textToSpeech: normalized.accommodations.includes('text-to-speech'),
  };
};

export const applyStudentSupportToQuestion = (question, profile) => {
  const normalized = normalizeStudentProfile(profile);
  if (!normalized.inclusionStatus && !normalized.accommodations.length && !normalized.modifications.length) {
    return { question, usage: { modified: false, accommodations: [], modifications: [] } };
  }
  const next = {
    ...question,
    generator: question?.generator ? { ...question.generator } : question?.generator,
    supportPresentation: getStudentSupportPresentation(normalized),
  };
  const usedAccommodations = [...normalized.accommodations];
  const usedModifications = [];

  if (normalized.modifications.includes('reduce-complexity')) {
    usedModifications.push('reduce-complexity');
    if (next.generator?.kind === 'fraction') {
      next.generator.denominators = [2, 4, 5, 10];
    }
    if (next.generator?.kind === 'stepLinearEquation') {
      next.generator.modifiedOneStep = true;
      next.generator.coefficientRange = [1, 6];
      next.generator.constantRange = [-8, 8];
    }
    if (next.generator?.kind === 'literalLinear') {
      next.generator.coefficientRange = [1, 6];
      next.generator.constantRange = [-8, 8];
      next.generator.modifiedLiteral = true;
    }
    if (Array.isArray(next.choices) && next.choices.length > 2) next.choices = next.choices.slice(0, 2);
  }

  if (normalized.modifications.includes('prefill-first-step')) {
    next.prefillFirstStep = true;
    usedModifications.push('prefill-first-step');
  }

  if (getStudentSupportPresentation(normalized).visualChunking) next.visualChunking = true;
  if (!next.formulaAnchor && next.formulaLatex) next.formulaAnchor = next.formulaLatex;

  return {
    question: next,
    usage: {
      modified: usedModifications.length > 0,
      accommodations: usedAccommodations,
      modifications: usedModifications,
    },
  };
};

export const buildSupportUsage = (profile, question) => {
  const result = applyStudentSupportToQuestion(question, profile);
  return result.usage;
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export const buildIEPReportHtml = ({ student, assignments = [] }) => {
  const profile = normalizeStudentProfile(student?.profile || student);
  const assignmentRows = assignments.map(({ assignment, score, supportUsage, activity, dol, classwork }) => {
    const modified = Boolean(supportUsage?.modified || supportUsage?.modifications?.length);
    const dolEntries = Object.entries(dol || {}).sort(([a], [b]) => a.localeCompare(b));
    const latestDol = dolEntries.length ? dolEntries[dolEntries.length - 1][1] : null;
    return `<tr>
      <td>${escapeHtml(assignment?.title)}</td>
      <td>${escapeHtml(score ?? '—')}%</td>
      <td>${modified ? '<strong style="color:#6f2da8">MOD</strong>' : 'Standard'}</td>
      <td>${escapeHtml((supportUsage?.accommodations || []).join(', ') || 'None recorded')}</td>
      <td>${escapeHtml((supportUsage?.modifications || []).join(', ') || 'None recorded')}</td>
      <td>${escapeHtml(Math.round((Number(activity?.totalTimeSeconds) || 0) / 60))} min total<br>${escapeHtml(Math.round((Number(activity?.lateSeconds) || 0) / 60))} min late</td>
      <td>${escapeHtml(latestDol?.score ?? '—')}%</td>
      <td>${escapeHtml(classwork?.score ?? '—')}%</td>
    </tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>IEP Support Report</title><style>
    body{font-family:Arial,sans-serif;margin:32px;color:#202124}h1{color:#174ea6}h2{margin-top:26px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #cfd7e3;padding:9px;text-align:left;vertical-align:top}th{background:#f3f6fa}.badge{display:inline-block;background:#efe4ff;color:#6f2da8;padding:3px 7px;border-radius:999px;font-weight:bold}@media print{button{display:none}}
  </style></head><body><button onclick="window.print()" style="float:right;padding:10px 16px">Print / Save PDF</button><h1>MathMaster IEP Support Report</h1><p><strong>Student:</strong> ${escapeHtml(student?.id)}</p><p><strong>Class:</strong> ${escapeHtml(student?.classPeriod || 'Unassigned')}</p><h2>Student profile</h2><p><strong>Inclusion status:</strong> ${profile.inclusionStatus ? '<span class="badge">INCLUSION</span>' : 'No'}</p><p><strong>Configured accommodations:</strong> ${escapeHtml(profile.accommodations.join(', ') || 'None')}</p><p><strong>Configured modifications:</strong> ${escapeHtml(profile.modifications.join(', ') || 'None')}</p><h2>Assignment evidence</h2><table><thead><tr><th>Assignment</th><th>Score</th><th>Version</th><th>Accommodations used</th><th>Modifications used</th><th>Engaged time</th><th>Latest DOL</th><th>Classwork prerequisite</th></tr></thead><tbody>${assignmentRows || '<tr><td colspan="8">No assignment evidence is available.</td></tr>'}</tbody></table><p style="margin-top:24px;color:#5f6368;font-size:12px">This report distinguishes accommodations from modifications so grade-level and modified performance are not represented as the same instructional condition.</p></body></html>`;
};
