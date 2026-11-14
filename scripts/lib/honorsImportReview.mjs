/*
 * WHAT REVIEW WILL SAY ABOUT AN IMPORT FILE FOR AN HONORS CLASS, BEFORE A
 * TEACHER SELECTS ONE.
 *
 * check-teacher-import.mjs used to run only the standard Pre-Flight. An Honors
 * lesson could be reported "valid, 0 errors, 0 warnings" and still be blocked
 * the first time a teacher chose an Honors class in Review, the only place the
 * Honors contract ran. That is what happened to Algebra II Honors — Dividing
 * Polynomials.
 *
 * This prepares the same Honors version Review prepares: the audited CCMR
 * bank's plan (the server's own module, called with the options Pre-Flight
 * sends), then the selection and composition in canonicalCcmrHydration.js.
 * The blockers come from the same code Review uses (preflightSteps.js), so the
 * author reads the message the teacher would have read. Two differences, both
 * on the side of Review before a teacher acts: no class roster is known
 * (classSize null) and no Honors extension has been added.
 *
 * The bank is loaded on first use, so importing compileTeacherImport, which
 * many tests do, stays cheap.
 */
import { createRequire } from 'node:module';
import { HONORS_CHECK_LABELS, HONORS_DEPTH_AREAS, HONORS_DEPTH_REQUIRED, inspectHonorsRigor } from '../../src/platform/rigor/courseRigor.js';
import { buildHonorsCcmrCandidate, composeHonorsCcmrCandidate } from '../../src/platform/assignments/canonicalCcmrHydration.js';
import { collectReviewBlockers } from '../../src/components/teacher/preflightSteps.js';

const require = createRequire(import.meta.url);
let auditedBank = null;
const loadAuditedBank = () => {
  auditedBank ||= require('../../functions/lib/ccmrAssignmentBank.js');
  return auditedBank;
};
const clone = (value) => JSON.parse(JSON.stringify(value));

// Honors placement is never authored (authoringContract.js): it comes from the
// destination class. A file is checked as Honors when its title, folder or
// name says so, which is how the Honors lessons in teacher-import-jsons/ are kept.
const SAYS_HONORS = /honors/i;
export const isHonorsImport = ({ filePath = '', title = '' } = {}) => (
  SAYS_HONORS.test(String(filePath || '')) || SAYS_HONORS.test(String(title || ''))
);

// The depth areas, in the rule's order, by the names Review and Create use (courseRigor.js).
export const HONORS_AREA_LABELS = Object.freeze(Object.fromEntries(
  HONORS_DEPTH_AREAS.map((area) => [area, HONORS_CHECK_LABELS[area]]),
));

/*
 * How to supply each area, for the author: what inspectHonorsRigor
 * (courseRigor.js) recognizes. Kept short; that function is the definition.
 */
export const HONORS_AREA_HINTS = Object.freeze({
  coreTeks: 'Align at least one question to a TEKS code ("alignments" with framework "teks").',
  higherOrderReasoning: 'Give at least one question "dok": 3 or more, with work that really is DOK 3.',
  multipleRepresentations: 'Show two representations in one question: a "table" or "graph" with an equation or expression to write, or a representation-matching tool (representationMatch, representationBridge).',
  justification: 'Ask the student to explain, justify, defend or find the error, in the prompt or a response label.',
  modelingApplication: 'Mark a real-world question "taskType": "modeling" or "application", or say "model", "real-world", "scenario" or "application" in its prompt.',
});

/** Which questions supply each depth area: every one of the four is "any question does". */
export const honorsDepthEvidence = (questions = []) => {
  const included = (Array.isArray(questions) ? questions : []).filter((question) => question?.teacherExcluded !== true);
  const checks = included.map((question) => ({
    id: question?.questionId || '?',
    checks: inspectHonorsRigor([question], { ccmrTargetRequired: false }).checks,
  }));
  return Object.fromEntries(HONORS_DEPTH_AREAS.map((area) => [
    area,
    checks.filter((entry) => entry.checks[area]).map((entry) => entry.id),
  ]));
};

/**
 * The Honors verdict for a compiled import: compileTeacherImport(text).model.
 * Null when the model does not pass the standard Pre-Flight, since there is
 * no Honors version to judge until it does.
 */
export const reviewImportForHonors = (model, { bank = null } = {}) => {
  if (!model?.isValid || !model.assignmentV5) return null;
  const base = model.assignmentV5;
  const sourceReport = inspectHonorsRigor(model.questions, { allowNarrowCheckpoint: true });
  // Review asks the bank only for a full assignment: a short Warm-Up or DOL
  // (a narrow checkpoint) needs no audited Practice (LessonPreflightModal.jsx).
  const candidate = sourceReport.isNarrowCheckpoint
    ? composeHonorsCcmrCandidate({ baseAssignmentV5: base, selection: null })
    : buildHonorsCcmrCandidate({
      baseAssignmentV5: base,
      // Through JSON, as the callable's answer travels.
      hydration: clone((bank || loadAuditedBank()).replaceDirectCcmrQuestionsWithAuditedBank(clone(base), {
        ensurePracticeTarget: true,
        includeCandidates: true,
        excludeDocumentIds: [],
      })),
      honorsEnrichmentQuestion: null,
    });
  // The Classes step holds only the Honors blockers; the draft is complete so
  // that nothing else is reported.
  const blockers = collectReviewBlockers({
    draft: { title: base.assignment?.title || 'Honors check', assignedClassIds: ['honors-class'], dueAt: '2099-12-31T23:59' },
    honorsSelected: true,
    honorsReport: candidate.honorsReport,
    honorsCcmr: { status: candidate.status, errors: candidate.errors },
  }).filter((entry) => entry.stepId === 'classes').map((entry) => entry.message);
  const report = candidate.honorsReport;
  const missing = new Set(Array.isArray(report.missing) ? report.missing : []);
  // As the blocker does: a narrow checkpoint needs only its Core TEKS, and an
  // assignment that meets the depth rule is not asked for another area.
  const depthShort = report.isNarrowCheckpoint !== true
    && (missing.has('higherOrderReasoning') || Number(report.depthCount) < HONORS_DEPTH_REQUIRED);
  return {
    ready: blockers.length === 0,
    blockers,
    status: candidate.status,
    report,
    narrowCheckpoint: report.isNarrowCheckpoint === true,
    depthAreaCount: HONORS_DEPTH_AREAS.length,
    targetCount: candidate.targetCount,
    sourcedCount: candidate.sourcedCount,
    evidence: honorsDepthEvidence(candidate.questions),
    // What the author can add, in the order the rule needs it.
    hints: [
      ...(missing.has('coreTeks') ? [HONORS_AREA_HINTS.coreTeks] : []),
      ...(depthShort ? HONORS_DEPTH_AREAS.filter((key) => missing.has(key)).map((key) => HONORS_AREA_HINTS[key]) : []),
    ],
  };
};
