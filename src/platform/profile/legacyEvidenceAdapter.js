// Legacy evidence rows → evidence events.
//
// WHY THIS IS WORTH A FILE. The Student Learning Profile reads evidence events,
// which live in `grades/{id}/evidenceEvents` and require an async Firestore
// read per student. The teacher roster derives every student's mastery
// synchronously from the `grades` documents it already holds, via
// `collectStudentEvidence`. Without a bridge, showing a profile on the roster
// would mean 150 extra document reads on a screen that currently makes none —
// so in practice it would not get shown, and the one honest profile would stay
// invisible on the screen teachers actually use.
//
// The rows carry everything the profile needs: the standard, whether the
// student eventually got it right, the DOK, the generator band, whether the
// work was modified, and when it happened.
//
// WHAT IS HONESTLY MISSING. Legacy rows record no assessment framework, so a
// profile built from them has an EMPTY CCMR transfer picture — not a poor one.
// `transferComplete` says so explicitly rather than letting a teacher read
// "no transfer gaps" off an absence of data. The server-side event stream
// remains the authoritative source; this is the roster's synchronous view.

const DEFAULT_BAND = 3;

const toMillis = (value) => {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * One legacy row as one evidence event.
 *
 * A row with no attempts is NOT converted. An unattempted question is missing
 * evidence, and turning it into a finalized wrong answer is the exact mistake
 * the profile's own rules exist to prevent — it would make a student who did
 * not do the work look like a student who could not do it.
 */
export const evidenceRowToEvent = (row) => {
  if (!row || typeof row !== 'object') return null;
  const attempts = Number(row.totalAttempts);
  if (Number.isFinite(attempts) && attempts <= 0) return null;
  if (!row.teks) return null;

  const dok = Number(row.dok);
  const band = Number(row.generatorBand);

  return {
    performance: {
      status: 'finalized',
      isCorrect: Boolean(row.eventuallyCorrect),
      attemptNumber: Number.isFinite(attempts) ? attempts : null,
    },
    questionSnapshot: {
      dok: Number.isInteger(dok) && dok >= 1 && dok <= 3 ? dok : 2,
      difficultyBand: Number.isInteger(band) && band >= 1 && band <= 5 ? band : DEFAULT_BAND,
      familyId: row.questionType || null,
    },
    alignmentKeys: [`texas:${row.teks}`],
    source: {
      activityRole: row.activityRole || 'practice',
      assignmentId: row.assignmentId || null,
      // Deliberately absent: legacy rows do not record which CCMR framework a
      // question was written for, and inventing one would produce a transfer
      // profile that looks measured and is not.
    },
    supportUsage: {
      modified: Boolean(row.modified),
      scaffoldUsed: Boolean(row.scaffoldUsed),
      hintUsed: Boolean(row.hintUsed),
      teacherAssisted: Boolean(row.teacherAssisted),
    },
    recordedAt: toMillis(row.lastAttemptAt),
    legacy: true,
  };
};

/**
 * A whole roster row set, converted.
 *
 * Also reports what the conversion could NOT see, so a screen can caveat itself
 * instead of presenting a partial picture as a complete one.
 */
export const evidenceRowsToEvents = (rows = []) => {
  const source = Array.isArray(rows) ? rows : [];
  const events = source.map(evidenceRowToEvent).filter(Boolean);
  return {
    events,
    coverage: {
      rows: source.length,
      converted: events.length,
      // No legacy row carries a framework, so this is always false today. It is
      // returned as a fact rather than assumed, so that if the row shape ever
      // gains one, the screens pick it up without a second change.
      transferComplete: source.some((row) => row?.assessmentFramework),
      datedEvents: events.filter((event) => event.recordedAt != null).length,
    },
  };
};

export default evidenceRowsToEvents;
