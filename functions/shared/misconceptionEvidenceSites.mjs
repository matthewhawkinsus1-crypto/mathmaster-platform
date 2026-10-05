/*
 * MISCONCEPTION EVIDENCE AT EVERY SERVER GRADING SITE — ONE RULE.
 *
 * Phase 1 classified on one path: submission ingestion's server re-grade
 * (submissionIngestion.mjs). Phase 2 adds the other places the SERVER grades a
 * student's own structured work as an answer:
 *
 *   the deadline finalizer  (responseCheckpointFinalizer.mjs) — a checkpointed
 *                           response graded as the student's submission;
 *   Section Recovery        (sectionRecoveryActions.mjs) — an item rebuilt
 *                           from its own pin and graded correct/incorrect;
 *   Recovery Practice       (sectionRecoveryActions.mjs) — a practice item
 *                           graded from its pin (a forfeit is not an answer).
 *
 * Every site calls this, AFTER it has a legitimate grading result in hand and
 * only on that branch. A platform failure never reaches it: an item MathMaster
 * could not rebuild, a grader that cannot mark the question, an unreadable or
 * missing answer, a hold, a teacher repair, a timeout with no graded work —
 * none of those is a graded student response, so none is ever classified.
 *
 * Side effect only. The result is the provenance block for the evidence
 * record, or null; nothing a grading site returns, scores or stores for the
 * grade reads it, and a classifier that throws is "no evidence" — never a
 * failed submission (classifyMisconceptions already catches, and this catches
 * again so an injected classifier cannot break the rule).
 */
import { classifyMisconceptions } from './misconceptionClassifiers.mjs';
import { generateStableId } from './idUtils.mjs';
import { trustedMisconceptionFindings } from './misconceptionCodes.mjs';

/**
 * The evidence block for one legitimately server-graded response, or null.
 * `classify` is injectable so tests can prove a site's grade is identical with
 * classification disabled or throwing.
 */
export const gradedResponseMisconceptionEvidence = ({
  question = null,
  response = null,
  grading = null,
  familyValues = null,
  classify = classifyMisconceptions,
} = {}) => {
  try {
    if (!grading || grading.graded !== true || grading.isCorrect === true) return null;
    return classify({ question, response, grading, familyValues })?.evidence || null;
  } catch {
    return null;
  }
};

/*
 * RECOVERY AND PRACTICE EVIDENCE IS STORED APART FROM ATTEMPT EVENTS.
 *
 *   grades/{sid}/misconceptionEvidence/{key}
 *
 * `evidenceEvents` is read by My Math Path mastery (a create trigger), weekly
 * completions, the support audit and the evidence timeline; a Recovery item
 * written there would move mastery and Path, and its key would collide with
 * the original assignment attempt it replaces. Misconception evidence must
 * never do either, so these records live in their own server-only collection
 * (firestore.rules: read, write: if false — the case review callable reads
 * them with the Admin SDK) and carry no score, no alignment keys and no
 * response: the code, the parts, the provenance, and where the work was.
 */
export const MISCONCEPTION_EVIDENCE_COLLECTION = 'misconceptionEvidence';
export const MISCONCEPTION_EVIDENCE_RECORD_SCHEMA = 1;
export const MISCONCEPTION_EVIDENCE_KINDS = Object.freeze({
  SECTION_RECOVERY: 'sectionRecovery',
  RECOVERY_PRACTICE: 'recoveryPractice',
});

const clean = (value) => String(value ?? '').trim();

/**
 * One record per graded item: the key is a function of where the work was
 * (student, assignment, section, Recovery opportunity, item, instance), so a
 * transaction retry, a resubmitted carried item or a replayed callable writes
 * the same document — never a second event for one answer.
 */
export const recoveryMisconceptionEvidenceKey = ({ kind, studentId, assignmentId, section, opportunity, itemId, fingerprint }) => generateStableId(
  'mev',
  clean(kind),
  clean(studentId),
  clean(assignmentId),
  clean(section),
  String(Number(opportunity) || 1),
  clean(itemId),
  clean(fingerprint),
);

/** The stored record, or null when the block is not trusted evidence. */
export const buildRecoveryMisconceptionEvidenceRecord = ({
  kind,
  studentId,
  assignmentId,
  section,
  opportunity = 1,
  itemId,
  storageIndex = null,
  question = null,
  fingerprint = null,
  occurredAt = Date.now(),
  misconceptionEvidence = null,
} = {}) => {
  if (!Object.values(MISCONCEPTION_EVIDENCE_KINDS).includes(kind)) return null;
  // Re-checked through the trust gate: this builder cannot store a forgery.
  const findings = trustedMisconceptionFindings({ misconceptionEvidence });
  if (!findings.length || !clean(studentId) || !clean(assignmentId)) return null;
  const key = recoveryMisconceptionEvidenceKey({ kind, studentId, assignmentId, section, opportunity, itemId, fingerprint });
  return {
    schemaVersion: MISCONCEPTION_EVIDENCE_RECORD_SCHEMA,
    eventKey: key,
    studentId: clean(studentId),
    occurredAt: Number(occurredAt) || Date.now(),
    source: {
      kind,
      assignmentId: clean(assignmentId),
      section: clean(section),
      opportunity: Number(opportunity) || 1,
      itemId: clean(itemId),
      storageIndex: Number.isInteger(Number(storageIndex)) ? Number(storageIndex) : null,
    },
    questionSnapshot: {
      questionId: clean(question?.questionId || question?.id) || null,
      familyId: clean(question?.familyInstance?.familyId || question?.familyId) || null,
      familyVersion: Number(question?.familyInstance?.familyVersion || question?.familyVersion) || null,
      instanceFingerprint: clean(fingerprint || question?.familyInstance?.fingerprint).slice(0, 400) || null,
    },
    performance: {
      misconceptionCodes: findings.map((finding) => finding.code),
      misconceptionEvidence: {
        registryVersion: misconceptionEvidence.registryVersion,
        source: misconceptionEvidence.source,
        classifier: findings[0].classifier,
        classifierVersion: findings[0].classifierVersion,
        findings: findings.map(({ code, codeVersion, parts }) => ({ code, codeVersion, parts })),
      },
    },
  };
};

/**
 * The records an `advanceSectionRecovery` outcome asks to store: one per
 * descriptor in `outcome.misconceptionEvidence`, each re-checked through the
 * trust gate. A descriptor the gate refuses is dropped, never written.
 */
export const recoveryMisconceptionEvidenceRecords = ({ entries = [], studentId, assignmentId, section, occurredAt = Date.now() } = {}) => {
  const seen = new Set();
  return (Array.isArray(entries) ? entries : []).flatMap((entry) => {
    const record = buildRecoveryMisconceptionEvidenceRecord({
      kind: entry?.kind,
      studentId,
      assignmentId,
      section,
      opportunity: entry?.opportunity,
      itemId: entry?.itemId,
      storageIndex: entry?.storageIndex,
      question: entry?.question,
      fingerprint: entry?.fingerprint,
      occurredAt,
      misconceptionEvidence: entry?.misconceptionEvidence,
    });
    if (!record || seen.has(record.eventKey)) return [];
    seen.add(record.eventKey);
    return [record];
  });
};
