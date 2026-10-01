/*
 * WHAT NEEDS ATTENTION? — A TEACHER'S SHORT LIST, BY FIXED RULES.
 *
 * Answers, from the assembled case review, the eight questions the brief asks:
 * which assignments are incomplete, which skills repeatedly break down, which
 * DOLs are lowest, which questions exhausted their attempts, what work can
 * still be corrected or recovered, what support evidence exists, what evidence
 * is missing, and what to address first instructionally.
 *
 * Every list is ordered by a stated rule, and the "address first" suggestion
 * is a ranking of standards by recorded results — never a diagnosis of the
 * student. The teacher decides.
 */
import { QUESTION_OUTCOME } from './attemptAnalysis.js';

const list = (value) => (Array.isArray(value) ? value : []);
const OPEN_RECOVERY = new Set(['practicing', 'unlocked', 'inProgress']);

export const ATTENTION_RULES = Object.freeze({
  incomplete: 'Missing first, then closed incomplete, then still open; within each, earliest final cutoff first.',
  skills: 'Grade-level standards with persistent errors first (most questions not correct at the end), then those below 70% final accuracy.',
  lowestDols: 'DOL section grades (MathMaster grade contributions), lowest first; at most five.',
  exhausted: 'Questions not correct after all available attempts, most recent assignment first.',
  recoverable: 'Work whose final cutoff for this student has not passed, questions with attempts remaining, and Recovery in progress.',
  addressFirst: 'Standards ranked by: DOL at least 15 points below instruction on the same standard; then most questions not correct at the end; then lowest final accuracy. A ranking of recorded results, not a diagnosis.',
});

export const buildAttentionSummary = (model, { nowValue = Date.now() } = {}) => {
  const now = Number(nowValue);
  const assignments = list(model?.assignments);
  const statusRank = { missing: 0, 'closed-incomplete': 1, 'in-progress': 2, 'not-started': 3, scheduled: 4 };

  const incomplete = assignments
    .filter((entry) => statusRank[entry.status] !== undefined)
    .sort((a, b) => statusRank[a.status] - statusRank[b.status] || (a.finalAtMs ?? Infinity) - (b.finalAtMs ?? Infinity))
    .map((entry) => ({
      assignmentId: entry.assignmentId,
      title: entry.title,
      status: entry.status,
      statusLabel: entry.statusLabel,
      answered: entry.progress?.attempted ?? 0,
      total: entry.progress?.total ?? 0,
      finalAtMs: entry.finalAtMs ?? null,
      stillOpen: Number.isFinite(entry.finalAtMs) ? now <= entry.finalAtMs : false,
    }));

  const findings = model?.skills?.findings || {};
  const seen = new Set();
  const skillsBreakingDown = [...list(findings.persistentError), ...list(findings.needsInstruction)]
    .filter((finding) => (seen.has(finding.code) ? false : seen.add(finding.code)))
    .map((finding) => ({ code: finding.code, description: finding.description, reason: finding.reason }));

  const lowestDols = assignments
    .map((entry) => ({ entry, dol: list(entry.sections).find((section) => section.key === 'dol') }))
    .filter(({ dol }) => dol && Number.isFinite(dol.score) && !dol.excused)
    .sort((a, b) => a.dol.score - b.dol.score)
    .slice(0, 5)
    .map(({ entry, dol }) => ({ assignmentId: entry.assignmentId, title: entry.title, score: dol.score, answered: dol.attempted, total: dol.total }));

  const exhaustedQuestions = assignments
    .slice()
    .sort((a, b) => (b.classDueAtMs ?? 0) - (a.classDueAtMs ?? 0))
    .flatMap((entry) => list(entry.questions)
      .filter((question) => question.outcome === QUESTION_OUTCOME.EXHAUSTED)
      .map((question) => ({
        assignmentId: entry.assignmentId,
        title: entry.title,
        storageIndex: question.storageIndex,
        section: question.sectionLabel,
        number: question.sectionNumber,
        standards: question.standards?.primary || [],
        attempts: question.totalAttempts,
      })));

  const recoverable = [];
  assignments.forEach((entry) => {
    const open = Number.isFinite(entry.finalAtMs) && now <= entry.finalAtMs;
    if (open && ['not-started', 'in-progress'].includes(entry.status)) {
      recoverable.push({ assignmentId: entry.assignmentId, title: entry.title, reason: 'open-until', untilMs: entry.finalAtMs });
    }
    const remaining = list(entry.questions).filter((question) => question.outcome === QUESTION_OUTCOME.OPEN_INCORRECT).length;
    if (open && remaining) {
      recoverable.push({ assignmentId: entry.assignmentId, title: entry.title, reason: 'attempts-remain', questions: remaining, untilMs: entry.finalAtMs });
    }
    list(entry.recoveries).filter((recovery) => OPEN_RECOVERY.has(recovery.status)).forEach((recovery) => {
      recoverable.push({ assignmentId: entry.assignmentId, title: entry.title, reason: 'recovery-in-progress', section: recovery.section, untilMs: entry.finalAtMs });
    });
  });

  const supportSummary = model?.supportEvidence?.summary || {};
  const supportEvidencePresent = list(supportSummary.supports)
    .filter((support) => support.assignmentsAvailable || support.assignmentsProvided || support.uses || support.staffRecords)
    .map((support) => ({ supportId: support.supportId, label: support.label, available: support.assignmentsAvailable, provided: support.assignmentsProvided, uses: support.uses, staffRecords: support.staffRecords }));

  // Address first: concern standards by the stated ranking.
  const dolGap = new Map(list(model?.sectionComparison?.standardsWithDolGap).map((entry) => [entry.code, entry]));
  const skillByCode = new Map(list(model?.skills?.skills).map((skill) => [skill.code, skill]));
  const addressFirst = skillsBreakingDown
    .map((finding) => {
      const skill = skillByCode.get(finding.code);
      const standard = skill?.byCondition?.standard || {};
      return {
        code: finding.code,
        description: finding.description,
        dolGap: dolGap.get(finding.code) || null,
        notCorrectAtEnd: standard.notCorrectAtEnd ?? 0,
        finalCreditAverage: standard.finalCreditAverage ?? null,
        attempted: standard.attempted ?? 0,
      };
    })
    .sort((a, b) => Number(Boolean(b.dolGap)) - Number(Boolean(a.dolGap))
      || b.notCorrectAtEnd - a.notCorrectAtEnd
      || (a.finalCreditAverage ?? 101) - (b.finalCreditAverage ?? 101))
    .slice(0, 3)
    .map((entry) => ({
      ...entry,
      basis: [
        entry.dolGap ? `DOL ${entry.dolGap.dol}% vs Classwork + Practice ${entry.dolGap.instructional}%` : '',
        `${entry.notCorrectAtEnd} of ${entry.attempted} grade-level questions not correct at the end`,
        entry.finalCreditAverage !== null ? `${entry.finalCreditAverage}% final accuracy` : '',
      ].filter(Boolean).join(' · '),
    }));

  return {
    incomplete,
    skillsBreakingDown,
    lowestDols,
    exhaustedQuestions: exhaustedQuestions.slice(0, 30),
    exhaustedTotal: exhaustedQuestions.length,
    recoverable,
    supportEvidencePresent,
    evidenceMissing: list(model?.evidenceGaps),
    addressFirst,
    rules: ATTENTION_RULES,
    note: 'Ordered by the fixed rules shown. MathMaster suggests where the records point; it does not diagnose the student.',
  };
};

export default buildAttentionSummary;
