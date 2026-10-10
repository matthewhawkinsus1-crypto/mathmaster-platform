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
 * code. Wherever the rescored skill would show a lower status, a lower score
 * or less evidence on either, it gets a FLOOR that holds what they had
 * (masteryRule.mjs), and the plan re-checks the result through the same code
 * before it is accepted. A skill only main's assignment record knows (work the
 * server never saw) gets a floor-only entry, so the map and the wheel can read
 * one record for it too.
 *
 * Before rescoring, My Math Path answers whose only "support" was their own
 * post-answer review are read as independent (pathReviewReclassification.mjs,
 * QA round 2 R2-M2). That can only raise a skill; floors still hold the rest.
 *
 * Idempotent: a document already rescored and reclassified
 * (masteryScoring.version ≥ 2 and pathReviewReclassified) is skipped, so
 * running twice changes nothing the second time; one rescored before the
 * reclassification existed is planned once more from what it is now.
 */
import { buildStudentMasteryProfile } from '../../src/masteryEngine.js';
import { buildMasteryBySkill, favourableMasteryBySkill, CONFIDENT_EVIDENCE } from '../../src/platform/path/masteryAdapter.js';
import { buildUnifiedMasteryProfiles, masteryBySkillFromProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';
import { toDisplayCode } from '../../src/utils/teksUtils.js';
import { MASTERY_STATUS, masteryStatusRank } from '../../functions/shared/masteryRule.mjs';
import { MASTERY_SCORING_VERSION, rescoreProfilesFromEvidence } from '../../functions/shared/masteryScoring.mjs';
import { reclassifyPathReviewEvidence } from '../../functions/shared/pathReviewReclassification.mjs';

export const FLOOR_REASON = 'scoring-v2-deploy';

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const rank = (status) => masteryStatusRank(status);
const higherStatus = (a, b) => (rank(a) >= rank(b) ? a : b);

// Fields the old trigger owned; everything else on a stored entry is kept.
const SCORING_FIELDS = ['mastery', 'accumulator', 'dimensions', 'questions', 'floor', 'confidence', 'scoringVersion'];
const withoutScoring = (entry = {}) => Object.fromEntries(Object.entries(entry || {}).filter(([key]) => !SCORING_FIELDS.includes(key)));

/** What a student sees for every skill, from one server document, through the client's own code. */
export const studentView = ({ student, assignments, serverProfiles }) => {
  const unified = buildUnifiedMasteryProfiles({ student, assignments, serverProfiles });
  const legacy = buildMasteryBySkill(buildStudentMasteryProfile({ student, assignments }));
  const map = favourableMasteryBySkill({ legacy, unified: masteryBySkillFromProfiles(unified) });
  return { unified, map, legacy };
};

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
      if (mapBefore.mastered === true && mapAfter.mastered !== true) losses.push('map: Mastered lost');
      if (num(mapAfter.mastery) + 1e-9 < num(mapBefore.mastery)) losses.push(`map score ${mapBefore.mastery} → ${mapAfter.mastery}`);
      if (num(mapAfter.evidenceStrength) + 1e-9 < num(mapBefore.evidenceStrength)) losses.push('map: evidence strength lower');
      if (mapBefore.gate === false && mapAfter.gate !== false && mapAfter.mastered !== true) losses.push('map: Path-only skill could now lock');
    }
  }
  return losses;
};

/** True when the Path map shows a skill above what the wheel shows for it. */
export const mapCreditsMore = (code, view) => {
  const map = view.map[teksSkillId(code)];
  const wheel = view.unified[code];
  if (!map) return false;
  if (map.mastered === true && wheel?.mastery?.status !== MASTERY_STATUS.MASTERED) return true;
  return num(map.mastery) * 100 > num(wheel?.mastery?.estimate) + 1e-6;
};

/** The floor that holds what a skill had, from the two views before rescoring. */
const floorFrom = (code, before, now) => {
  const wheel = before.unified[code];
  const map = before.map[teksSkillId(code)];
  const status = higherStatus(
    wheel?.mastery?.status || MASTERY_STATUS.NOT_ENOUGH_EVIDENCE,
    map?.mastered ? MASTERY_STATUS.MASTERED : (map?.status || MASTERY_STATUS.NOT_ENOUGH_EVIDENCE),
  );
  // Rounded UP to a thousandth, so the floor never sits a hair below.
  const estimate = Math.max(
    wheel?.mastery?.estimate == null ? 0 : num(wheel.mastery.estimate),
    map ? Math.ceil(num(map.mastery) * 100 * 1000 - 1e-6) / 1000 : 0,
  );
  const effectiveWeight = Math.max(
    num(wheel?.accumulator?.effectiveWeight ?? wheel?.dimensions?.effectiveWeight),
    map ? num(map.evidenceStrength) * CONFIDENT_EVIDENCE : 0,
  );
  return { status, estimate, effectiveWeight: Math.round(effectiveWeight * 1000) / 1000, reason: FLOOR_REASON, setAt: now, questionsSince: 0 };
};

/**
 * One student's plan.
 *   stored      the studentMasteryProfiles document (or null)
 *   events      [{ id, evidence }] — every grades/{id}/evidenceEvents document
 *   student     { id, gradesByAssignment, supportUsageByAssignment } as the app builds it
 *   assignments the student's assignments as the app holds them
 *   helpers     functions/lib/mathPath.js
 * Returns { action: 'skip'|'write', reason?, document?, changes, violations }.
 */
export const planStudentMasteryBackfill = ({ studentId, stored = null, events = [], student = {}, assignments = [], helpers, now = Date.now() }) => {
  // Rescored AND with My Math Path's post-answer reviews read as they should
  // have been written (pathReviewReclassification.mjs). A document rescored by
  // the first release of this script lacks the second mark and is planned
  // again from what it is now, so the second pass also never lowers anything.
  if (Number(stored?.masteryScoring?.version) >= MASTERY_SCORING_VERSION && stored?.masteryScoring?.pathReviewReclassified === true) {
    return { action: 'skip', reason: 'already-rescored', changes: [], violations: [], pathReview: null };
  }
  const storedProfiles = stored?.profiles && typeof stored.profiles === 'object' ? stored.profiles : {};
  const before = studentView({ student, assignments, serverProfiles: storedProfiles });
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
    if (rescored[code]) profiles[code] = { ...withoutScoring(storedEntry), ...rescored[code], scoringVersion: MASTERY_SCORING_VERSION };
    else if (storedEntry) {
      // A stored skill with no evidence left to rescore keeps its sums as they
      // are (they are the only record of it) and is marked rescored.
      profiles[code] = { ...storedEntry, scoringVersion: MASTERY_SCORING_VERSION };
    }
  });

  // Floor every skill that would otherwise lose something, and every skill
  // only the assignment record knows where the map credits more than the
  // wheel (so that both read one record from now on); then re-check.
  let after = studentView({ student, assignments, serverProfiles: profiles });
  const changes = [];
  codes.forEach((code) => {
    const losses = lossesFor(code, before, after);
    if (!losses.length && !profiles[code] && mapCreditsMore(code, after)) losses.push('map credits more than the wheel');
    if (!losses.length) return;
    const floor = floorFrom(code, before, now);
    profiles[code] = profiles[code]
      ? { ...profiles[code], floor, mastery: { ...profiles[code].mastery, status: higherStatus(profiles[code].mastery?.status, floor.status), estimate: Math.max(num(profiles[code].mastery?.estimate), floor.estimate) } }
      // Work only main's assignment record holds: a floor-only entry, with no
      // sums of its own, so the record's own counts still show beneath it.
      : { teksCode: code, mastery: { estimate: floor.estimate, status: floor.status }, floor, scoringVersion: MASTERY_SCORING_VERSION, updatedAt: now };
    changes.push({ code, floored: true, losses });
  });
  after = studentView({ student, assignments, serverProfiles: profiles });
  const violations = [];
  codes.forEach((code) => {
    const losses = lossesFor(code, before, after);
    if (losses.length) violations.push({ code, losses });
    const was = before.unified[code];
    const is = after.unified[code];
    if (!changes.some((change) => change.code === code) && (was?.mastery?.estimate !== is?.mastery?.estimate || was?.mastery?.status !== is?.mastery?.status)) {
      changes.push({ code, floored: false, from: { estimate: was?.mastery?.estimate ?? null, status: was?.mastery?.status || null }, to: { estimate: is?.mastery?.estimate ?? null, status: is?.mastery?.status || null } });
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
