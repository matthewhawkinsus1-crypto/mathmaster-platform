/*
 * THE MASTERY RESCORING BACKFILL, AS A PURE PLAN (no Firestore).
 *
 * The server now scores each question once, by its final attempt
 * (functions/shared/masteryScoring.mjs). Stored profiles were built the old
 * way, one event per attempt. This plan rebuilds one student's profiles from
 * their whole evidence history the new way, and never lets the rebuild cost
 * them anything (product decision 8): for every skill it compares what the
 * student has TODAY —
 *
 *   the wheel, its card and the planner: the unified profile built from the
 *     stored server document (src/platform/mastery/unifiedMastery.js);
 *   the Path map, locks and Challenge: the more favourable of that and the
 *     assignment record (src/platform/path/masteryAdapter.js) —
 *
 * with what the rescored document would give, through the very same client
 * code. Both views read each skill by the favourable rule (the higher of the
 * server's number and the assignment record's, Mastered when either says so),
 * so a skill the server never saw keeps what the assignment record gives it.
 * Wherever the rescored document would still show a lower status, a lower
 * score or less evidence anywhere, or could newly lock a skill, the student
 * is REFUSED: nothing is written for them and the report says why.
 *
 * Before rescoring, My Math Path answers whose only "support" was their own
 * post-answer review are read as independent (pathReviewReclassification.mjs,
 * QA round 2 R2-M2). That can only raise a skill.
 *
 * Idempotent: a document already rescored (masteryScoring.version ≥ 2) is
 * skipped, so running twice changes nothing the second time.
 */
import { buildStudentMasteryProfile } from '../../src/masteryEngine.js';
import { buildMasteryBySkill, favourableMasteryBySkill } from '../../src/platform/path/masteryAdapter.js';
import { buildUnifiedMasteryProfiles, masteryBySkillFromProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { getSkillGraph, teksCodeFromSkillId, teksSkillId } from '../../src/platform/path/skillGraph.js';
import { STATUS, getStudentPathOptions } from '../../src/platform/path/recommendationEngine.js';
import { sequenceProvider } from '../../src/platform/path/curriculumPacing.js';
import { getTexasStandard } from '../../functions/shared/texasStandards.mjs';
import { toDisplayCode } from '../../src/utils/teksUtils.js';
import { masteryStatusRank } from '../../functions/shared/masteryRule.mjs';
import { MASTERY_SCORING_VERSION, masteredEvidenceSnapshot, rescoreProfilesFromEvidence } from '../../functions/shared/masteryScoring.mjs';
import { reclassifyPathReviewEvidence } from '../../functions/shared/pathReviewReclassification.mjs';

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rank = (status) => masteryStatusRank(status);

// Fields the old trigger owned; everything else on a stored entry is kept.
const SCORING_FIELDS = ['mastery', 'accumulator', 'dimensions', 'questions', 'confidence'];
const withoutScoring = (entry = {}) => Object.fromEntries(Object.entries(entry || {}).filter(([key]) => !SCORING_FIELDS.includes(key)));

// What the Path engine does with each skill, in every course the student's
// skills belong to: which it closes (locked, or behind a repair) and which it
// offers as a Challenge (extension, which needs evidence strength). A Challenge
// card depends on where the class is in the year, so every pacing window and
// both acceleration radii are checked (review of #467: a class at window 1
// can offer only two Challenge cards; later windows lost others). Decisions
// are keyed "window:radius:skillId".
const PACING_WINDOWS = 8;
const RADII = [1, 2];
const pathDecisions = (map) => {
  const courses = new Set(Object.keys(map).map((skillId) => getTexasStandard(teksCodeFromSkillId(skillId))?.courseId).filter(Boolean));
  const closed = new Set();
  const extension = new Set();
  courses.forEach((courseId) => {
    const skills = getSkillGraph(courseId);
    if (!skills.length) return;
    const pacingProvider = sequenceProvider({ skills, windowCount: PACING_WINDOWS });
    for (let currentWindow = 1; currentWindow <= PACING_WINDOWS; currentWindow += 1) {
      RADII.forEach((accelerationRadius) => {
        const options = getStudentPathOptions({
          courseId, masteryBySkill: map,
          pacing: { currentWindow, windowCount: PACING_WINDOWS, accelerationRadius },
          pacingProvider,
        });
        const at = `${currentWindow}:${accelerationRadius}:`;
        [STATUS.LOCKED, STATUS.REMEDIATION].forEach((key) => (options[key] || []).forEach((row) => closed.add(at + row.skillId)));
        (options[STATUS.EXTENSION] || []).forEach((row) => extension.add(at + row.skillId));
      });
    }
  });
  return { closed, extension };
};

const skillOfDecision = (key) => key.split(':').slice(2).join(':');

const viewOf = ({ student, assignments, serverProfiles, favourable }) => {
  const unified = buildUnifiedMasteryProfiles({ student, assignments, serverProfiles, favourable });
  const legacy = buildMasteryBySkill(buildStudentMasteryProfile({ student, assignments }));
  const map = favourableMasteryBySkill({ legacy, unified: masteryBySkillFromProfiles(unified) });
  return { unified, map, legacy, ...pathDecisions(map) };
};

/**
 * What a student sees for every skill, through the client's own code: the
 * wheel (unified profiles) and the Path map (favourableMasteryBySkill), with
 * the engine's decisions. `main: true` is what main serves — the wheel on the
 * server rule alone — which is the baseline nothing may fall below; otherwise
 * this branch's screens, every one on the favourable rule.
 */
export const studentView = ({ student, assignments, serverProfiles, main = false }) => (
  viewOf({ student, assignments, serverProfiles, favourable: !main })
);

/**
 * Every way `after` could be worse than `before` for one skill. Empty means
 * nothing is lost. `before`/`after` are studentView results.
 */
export const lossesFor = (code, before, after) => {
  const skillId = teksSkillId(code);
  const losses = [];
  const wheelBefore = before.unified[code];
  const wheelAfter = after.unified[code];
  if (wheelBefore) {
    if (!wheelAfter) losses.push('wheel: skill gone');
    else {
      if (rank(wheelAfter.mastery?.status) < rank(wheelBefore.mastery?.status)) losses.push(`wheel status ${wheelBefore.mastery?.status} → ${wheelAfter.mastery?.status}`);
      if (wheelBefore.mastery?.estimate != null && num(wheelAfter.mastery?.estimate) < num(wheelBefore.mastery.estimate)) losses.push(`wheel score ${wheelBefore.mastery.estimate} → ${wheelAfter.mastery?.estimate}`);
    }
  }
  const mapBefore = before.map[skillId];
  const mapAfter = after.map[skillId];
  if (mapBefore) {
    if (!mapAfter) losses.push('map: skill gone');
    else {
      // The engine's own reading: a verdict when the record carries one,
      // otherwise main's 0.9 cut-off (recommendationEngine.js).
      const masteredOnMap = (record) => (typeof record.mastered === 'boolean' ? record.mastered : num(record.mastery) >= 0.9);
      if (masteredOnMap(mapBefore) && !masteredOnMap(mapAfter)) losses.push('map: Mastered lost');
      if (num(mapAfter.mastery) + 1e-9 < num(mapBefore.mastery)) losses.push(`map score ${mapBefore.mastery} → ${mapAfter.mastery}`);
      // Evidence strength is NOT a loss by itself: counting each question once
      // removes the per-attempt inflation it carried. What it can cost — a
      // skill the engine now closes — is checked below (newlyClosed).
      if (mapBefore.gate === false && mapAfter.gate !== false && mapAfter.mastered !== true) losses.push('map: Path-only skill could now lock');
    }
  }
  return losses;
};

/** Skills the Path engine closes after that it did not close before. */
export const newlyClosed = (before, after) => [...after.closed].filter((skillId) => !before.closed.has(skillId));

/** Challenge (extension) cards before that are gone after (review MAJOR 2). */
export const lostChallenges = (before, after) => [...before.extension].filter((skillId) => !after.extension.has(skillId));

/**
 * One student's plan.
 *   stored      the studentMasteryProfiles document (or null)
 *   events      [{ id, evidence }] — every grades/{id}/evidenceEvents document
 *   student     { id, gradesByAssignment, supportUsageByAssignment } as the app builds it
 *   assignments the student's assignments as the app holds them
 *   helpers     functions/lib/mathPath.js
 * Returns { action: 'skip'|'write'|'refuse', reason?, document?, changes, violations, pathReview }.
 */
export const planStudentMasteryBackfill = ({ studentId, stored = null, events = [], student = {}, assignments = [], helpers, now = Date.now() }) => {
  if (Number(stored?.masteryScoring?.version) >= MASTERY_SCORING_VERSION) {
    return { action: 'skip', reason: 'already-rescored', changes: [], violations: [], pathReview: null };
  }
  const storedProfiles = stored?.profiles && typeof stored.profiles === 'object' ? stored.profiles : {};
  // The baseline is what MAIN serves today, from the stored document — not
  // this branch's screens on the same document (review BLOCKER 1).
  const before = studentView({ student, assignments, serverProfiles: storedProfiles, main: true });
  const pathReview = reclassifyPathReviewEvidence(events, helpers);
  const rescored = rescoreProfilesFromEvidence(pathReview.events, helpers, { now });

  const profiles = {};
  const codes = new Set([
    ...Object.keys(storedProfiles).map(toDisplayCode),
    ...Object.keys(rescored),
    ...Object.keys(before.unified),
  ].filter(Boolean));
  codes.forEach((code) => {
    const storedEntry = storedProfiles[code] || storedProfiles[`texas:${code}`] || null;
    if (rescored[code]) {
      // A skill Mastered by the old counts keeps the evidence it reached
      // Mastered with (a growth reward earned but not yet paid still pays).
      const earlier = storedEntry ? masteredEvidenceSnapshot(storedEntry) : null;
      profiles[code] = { ...withoutScoring(storedEntry), ...rescored[code], ...(earlier ? { masteredEvidence: earlier } : {}) };
    }
    // A stored skill with no evidence left to rescore keeps its sums as they
    // are: they are the only record of it.
    else if (storedEntry) profiles[code] = storedEntry;
  });

  // Through the client's own code, every screen after against every screen
  // now. Anything lower and the student is refused: their document stays as
  // it is (the favourable rule still reads their assignment record), and the
  // report names the skill and what would drop.
  const after = studentView({ student, assignments, serverProfiles: profiles });
  const changes = [];
  const violations = [];
  newlyClosed(before, after).forEach((key) => violations.push({ code: teksCodeFromSkillId(skillOfDecision(key)), losses: [`map: skill now locked (window ${key.split(':')[0]})`] }));
  lostChallenges(before, after).forEach((key) => violations.push({ code: teksCodeFromSkillId(skillOfDecision(key)), losses: [`map: Challenge card lost (window ${key.split(':')[0]})`] }));
  codes.forEach((code) => {
    const losses = lossesFor(code, before, after);
    if (losses.length) violations.push({ code, losses });
    const was = before.unified[code];
    const is = after.unified[code];
    if (was?.mastery?.estimate !== is?.mastery?.estimate || was?.mastery?.status !== is?.mastery?.status) {
      changes.push({ code, from: { estimate: was?.mastery?.estimate ?? null, status: was?.mastery?.status || null }, to: { estimate: is?.mastery?.estimate ?? null, status: is?.mastery?.status || null } });
    }
  });

  return {
    action: violations.length ? 'refuse' : 'write',
    changes,
    violations,
    pathReview: pathReview.counts,
    document: {
      ...(stored || {}),
      studentId,
      profiles,
      masteryScoring: { version: MASTERY_SCORING_VERSION, rescoredAt: now, evidenceEvents: events.length, pathReviewReclassified: true, pathReviewEventsReclassified: pathReview.counts.reclassified },
      updatedAt: now,
    },
  };
};
