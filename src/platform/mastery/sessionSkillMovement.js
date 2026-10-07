// "SKILLS THAT MOVED": WHAT ONE SESSION DID TO THE STUDENT'S MASTERY.
//
// A finished session said how many questions were right and nothing about
// what that did. The mastery the student cares about is updated by a
// background trigger (updateMyMathPathMasteryFromEvidence) a moment AFTER the
// last answer, so the end screen cannot simply read it: for a second or two
// the server profile still describes the student before the session.
//
// So the session's starting point is frozen when the session opens — the
// unified profiles every Path screen reads (unifiedMastery.js), with the live
// server profile merged in — and compared with the live server profile once
// the trigger has applied this session's evidence. Until then the screen says
// "Updating your skills…" rather than showing a stale "no change". Every
// status comes from the one Mastered rule (functions/shared/masteryRule.mjs),
// re-derived by mergeMasteryProfile, never from a stored label.
//
// The Teacher Path Simulator has no server profile and no trigger: its mastery
// moves synchronously with each simulated answer, so its before/after is the
// masteryData it renders the Path from.
//
// Pure: no Firestore, no React, no clock.

import { mergeMasteryProfile } from './unifiedMastery.js';
import { MASTERY_STATUS } from '../../../functions/shared/masteryRule.mjs';
import { teksCodeFromSkillId } from '../../../functions/shared/pathSkillGraph.mjs';
import { studentLabelForTeks } from '../../../functions/shared/pathSkillLabels.mjs';
import { toDisplayCode } from '../../utils/teksUtils.js';

export const SKILLS_MOVED_STATE = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  DELAYED: 'delayed',
  NONE: 'none',
});

// How long the screen waits for the trigger before it stops spinning and says
// the update will appear on My Math Path instead.
export const SKILLS_UPDATE_PATIENCE_MS = 20000;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const codeOf = (value) => toDisplayCode(String(value || '')) || '';
const serverProfileFor = (server, code) => (isObject(server) ? server[code] || server[`texas:${code}`] || null : null);

/**
 * The unified profiles as they stood when the session opened, with the live
 * server profile (when the subscription has delivered one) merged over the
 * loaded state so the starting point is as fresh as the screen can know.
 */
export const snapshotMasteryAtSessionStart = ({ masteryProfilesByTEKS = {}, serverProfiles = null } = {}) => {
  const base = isObject(masteryProfilesByTEKS) ? masteryProfilesByTEKS : {};
  const server = isObject(serverProfiles) ? serverProfiles : {};
  const codes = new Set([...Object.keys(base), ...Object.keys(server)].map(codeOf).filter(Boolean));
  const profiles = {};
  codes.forEach((code) => {
    const loaded = base[code] || null;
    const live = serverProfileFor(server, code);
    profiles[code] = live ? mergeMasteryProfile(loaded || {}, live) : loaded;
  });
  return { profiles };
};

/** Every skill a session touched: evidence it recorded, its route, its target. */
export const sessionSkillCodes = (session = {}) => {
  const codes = new Set();
  const add = (value) => { const code = codeOf(value); if (code) codes.add(code); };
  Object.keys(isObject(session?.evidenceBySkill) ? session.evidenceBySkill : {})
    .forEach((skillId) => add(teksCodeFromSkillId(skillId) || skillId));
  list(session?.route).forEach((entry) => add(entry?.skillCode || (entry?.skillId ? teksCodeFromSkillId(entry.skillId) : '')));
  add(session?.target?.alignmentKey);
  return [...codes];
};

// The skills that actually received evidence, which is what the trigger
// updates. Falls back to the target for a session record that carries none.
const evidenceSkillCodes = (session = {}) => {
  const recorded = Object.keys(isObject(session?.evidenceBySkill) ? session.evidenceBySkill : {})
    .map((skillId) => codeOf(teksCodeFromSkillId(skillId) || skillId))
    .filter(Boolean);
  return recorded.length ? [...new Set(recorded)] : [codeOf(session?.target?.alignmentKey)].filter(Boolean);
};

/**
 * Has the background trigger applied this session's evidence?
 *
 * The last answer's evidence lands on its skill with an `updatedAt` at or
 * after the session's completion, and every other skill the session worked on
 * has moved past where it stood at the start.
 */
export const sessionEvidenceLanded = ({ session = null, start = null, liveServerProfiles = null } = {}) => {
  if (!isObject(liveServerProfiles) || !isObject(session)) return false;
  const finishedAt = Number(session.completedAt || session.updatedAt || 0);
  if (!(finishedAt > 0)) return false;
  const codes = evidenceSkillCodes(session);
  if (!codes.length) return false;
  const updatedAt = (code) => Number(serverProfileFor(liveServerProfiles, code)?.updatedAt || 0);
  const startedAt = (code) => Number(start?.profiles?.[code]?.updatedAt || 0);
  return codes.some((code) => updatedAt(code) >= finishedAt)
    && codes.every((code) => updatedAt(code) > startedAt(code));
};

const estimateOf = (profile) => {
  const value = profile?.mastery?.estimate;
  return value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.round(Number(value));
};
const statusOf = (profile) => profile?.mastery?.status || MASTERY_STATUS.NOT_ENOUGH_EVIDENCE;

/** Only the skills whose estimate or status changed. */
export const describeSkillMoves = ({ before = {}, after = {}, codes = [] } = {}) => list(codes)
  .map((code) => {
    const move = {
      code,
      label: studentLabelForTeks(code) || code,
      estimateBefore: estimateOf(before?.[code]),
      estimateAfter: estimateOf(after?.[code]),
      statusBefore: statusOf(before?.[code]),
      statusAfter: statusOf(after?.[code]),
    };
    return { ...move, moved: move.estimateBefore !== move.estimateAfter || move.statusBefore !== move.statusAfter };
  })
  .filter((move) => move.moved);

/**
 * The "Skills that moved" section for a finished session.
 *
 *   NONE     no section (the session is not completed)
 *   PENDING  the trigger has not landed yet — "Updating your skills…"
 *   DELAYED  it has not landed within SKILLS_UPDATE_PATIENCE_MS
 *   READY    `moves` holds the skills whose estimate or status changed
 */
export const describeSessionSkillsMoved = ({
  session = null,
  start = null,
  liveServerProfiles = null,
  currentProfiles = null,
  simulated = false,
  patienceExpired = false,
} = {}) => {
  if (session?.status !== 'completed' || !isObject(start?.profiles)) return { state: SKILLS_MOVED_STATE.NONE, moves: [] };
  const codes = sessionSkillCodes(session);
  if (simulated) {
    return { state: SKILLS_MOVED_STATE.READY, moves: describeSkillMoves({ before: start.profiles, after: currentProfiles || {}, codes }) };
  }
  if (!sessionEvidenceLanded({ session, start, liveServerProfiles })) {
    return { state: patienceExpired ? SKILLS_MOVED_STATE.DELAYED : SKILLS_MOVED_STATE.PENDING, moves: [] };
  }
  const after = {};
  codes.forEach((code) => {
    const live = serverProfileFor(liveServerProfiles, code);
    after[code] = live ? mergeMasteryProfile(start.profiles[code] || {}, live) : start.profiles[code];
  });
  return { state: SKILLS_MOVED_STATE.READY, moves: describeSkillMoves({ before: start.profiles, after, codes }) };
};

/** "Solving linear equations 62% → 71% · Developing → Secure" */
export const formatSkillMove = (move = {}) => {
  const estimate = move.estimateBefore === move.estimateAfter
    ? (move.estimateAfter == null ? '' : `${move.estimateAfter}%`)
    : `${move.estimateBefore == null ? 'new' : `${move.estimateBefore}%`} → ${move.estimateAfter == null ? '—' : `${move.estimateAfter}%`}`;
  const status = move.statusBefore === move.statusAfter ? '' : `${move.statusBefore} → ${move.statusAfter}`;
  return [move.label, [estimate, status].filter(Boolean).join(' · ')].filter(Boolean).join(' ');
};
