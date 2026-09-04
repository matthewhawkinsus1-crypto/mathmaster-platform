/*
 * SAVING A ROUND SET THAT WORKED.
 *
 * A challenge could not be kept. The teacher's whole configuration was four
 * dropdowns, and when the room closed the question set went with it — so the
 * set that landed well in period 1 could not be run again in period 3, and a
 * game worth repeating next year existed only in somebody's memory.
 *
 * WHY THIS IS BUILT ON THE REPORT RATHER THAN THE LIVE ROOM. The question set
 * lives in private state, and private state is deleted when the room closes.
 * Exporting from a running game would work once and then be impossible for
 * every game already finished. The report is written before that deletion and
 * is kept, so anchoring the export to it means any finished game can be saved,
 * including retroactively.
 *
 * WHAT THIS IS AND IS NOT.
 *
 *   It IS a way to replay a set: question ids that point into the same
 *   validated bank the game drew from, so re-running it re-runs exactly the
 *   questions the class saw.
 *
 *   It is NOT a way to author new questions. The ids mean nothing outside this
 *   platform's bank. Handing this to an outside AI shows it what a good set
 *   looked like; producing a NEW set needs the authoring contract, which
 *   describes question shape rather than pointing at existing rows.
 *
 * NO STUDENT DATA. A round set is content. Scores, names and participation are
 * in the report and stay there; an exported file is something a teacher may
 * reasonably email to a colleague, and it must be safe to do that without
 * thinking about it.
 */

export const CHALLENGE_EXPORT_KIND = 'mathmasterLiveChallengeRoundSet';
export const CHALLENGE_EXPORT_VERSION = 1;

const text = (value) => String(value ?? '').trim();

const int = (value) => Math.max(0, Math.round(Number(value) || 0));

/**
 * The round set from a finished game, as a portable object.
 *
 * Returns null rather than an empty shell when there is nothing to save, so a
 * caller cannot hand a teacher a file with no questions in it.
 */
export const buildChallengeExport = (report = null) => {
  if (!report) return null;

  const rounds = (Array.isArray(report.rounds) ? report.rounds : [])
    .map((round) => ({
      roundNumber: int(round?.roundNumber) || null,
      questionId: text(round?.questionId) || null,
      standard: text(round?.standard) || null,
    }))
    .filter((round) => round.questionId);

  if (!rounds.length) return null;

  return {
    kind: CHALLENGE_EXPORT_KIND,
    version: CHALLENGE_EXPORT_VERSION,
    title: text(report.title) || 'Live Challenge',
    courseId: text(report.courseId) || null,
    standardCode: text(report.standardCode) || null,
    roundSeconds: int(report.roundSeconds) || null,
    roundCount: rounds.length,
    // Recorded so a teacher choosing between two saved sets can see how the
    // class actually did on each, which is the only thing that distinguishes
    // them at a glance.
    classAccuracyPercent: report.classAccuracyPercent ?? null,
    exportedFrom: text(report.roomId) || null,
    rounds,
  };
};

/** A filename a teacher can find again in a downloads folder six weeks later. */
export const challengeExportFileName = (payload = null) => {
  const base = text(payload?.title) || 'live-challenge';
  const slug = base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'live-challenge'}-round-set.json`;
};

/**
 * Read a file back, refusing anything that is not one of ours.
 *
 * Returns `{ payload, errors }` rather than throwing, because this runs against
 * a file a human chose from a disk and the useful answer to a wrong file is a
 * sentence, not a stack trace.
 *
 * NOTE FOR WHOEVER WIRES IMPORT: passing this check means the FILE is
 * well-formed. It does not mean the questions still exist, are still active, or
 * are still issuable — every question a game uses today passes
 * safeBuildTemplateIssuePlan, and an import must run that same gate server-side
 * before a single round reaches a class.
 */
export const parseChallengeExport = (value) => {
  const errors = [];
  let raw = value;

  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value);
    } catch {
      return { payload: null, errors: ['That file is not valid JSON.'] };
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { payload: null, errors: ['That file does not contain a round set.'] };
  }
  if (text(raw.kind) !== CHALLENGE_EXPORT_KIND) {
    return { payload: null, errors: ['That file is not a MathMaster Live Challenge round set.'] };
  }
  if (int(raw.version) > CHALLENGE_EXPORT_VERSION) {
    return { payload: null, errors: ['That round set was saved by a newer version of MathMaster.'] };
  }

  const rounds = (Array.isArray(raw.rounds) ? raw.rounds : [])
    .map((round) => ({
      roundNumber: int(round?.roundNumber) || null,
      questionId: text(round?.questionId) || null,
      standard: text(round?.standard) || null,
    }))
    .filter((round) => round.questionId);

  if (!rounds.length) errors.push('That round set has no questions in it.');

  return {
    payload: errors.length ? null : {
      kind: CHALLENGE_EXPORT_KIND,
      version: int(raw.version) || CHALLENGE_EXPORT_VERSION,
      title: text(raw.title) || 'Live Challenge',
      courseId: text(raw.courseId) || null,
      standardCode: text(raw.standardCode) || null,
      roundSeconds: int(raw.roundSeconds) || null,
      roundCount: rounds.length,
      rounds,
    },
    errors,
  };
};

export default buildChallengeExport;
