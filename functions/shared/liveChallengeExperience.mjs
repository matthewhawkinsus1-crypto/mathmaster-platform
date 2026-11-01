// Pure rules for the teacher-configurable Live Challenge experience.
//
// This module deliberately has no Firebase/browser imports. Cloud Functions,
// React previews and tests can all use the same arithmetic and naming contract
// without creating a second scorer or a second interpretation of a roster name.

import { acceptStudentNamePart, resolveStudentIdentity, splitStudentDisplayName } from './studentIdentity.mjs';

export const DEFAULT_SPEED_INFLUENCE_PERCENT = 20;
export const MAX_SPEED_INFLUENCE_PERCENT = 50;
export const CORRECTNESS_BASE_POINTS = 1000;
export const LEGACY_SPEED_CAP_POINTS = 100;

export const PLAYER_DISPLAY_MODES = Object.freeze([
  'codeName',
  'firstLastInitial',
  'firstName',
  'fullName',
]);

const PLAYER_DISPLAY_MODE_SET = new Set(PLAYER_DISPLAY_MODES);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const cleanText = (value) => String(value ?? '').trim().replace(/\s+/g, ' ');

export const normalizeSpeedInfluencePercent = (value) => {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_SPEED_INFLUENCE_PERCENT;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return DEFAULT_SPEED_INFLUENCE_PERCENT;
  return clamp(Math.round(numeric), 0, MAX_SPEED_INFLUENCE_PERCENT);
};

export const speedBonusCapForPercent = (value) => Math.round(
  CORRECTNESS_BASE_POINTS * (normalizeSpeedInfluencePercent(value) / 100),
);

export const normalizePlayerDisplayMode = (value) => {
  const mode = cleanText(value);
  return PLAYER_DISPLAY_MODE_SET.has(mode) ? mode : 'codeName';
};

// The roster name as parts, from the shared resolver (studentIdentity.mjs):
// every candidate must read as a name for THIS student, so an id, an email or
// a placeholder stored in a name field is skipped instead of becoming a
// player's public alias.
const studentNameParts = (student = {}) => {
  const record = student && typeof student === 'object' && !Array.isArray(student) ? student : {};
  const firstName = acceptStudentNamePart(record.firstName, record);
  const lastName = acceptStudentNamePart(record.lastName, record);
  if (firstName || lastName) return { firstName, lastName };

  const identity = resolveStudentIdentity(record);
  return identity.hasName ? splitStudentDisplayName(identity.displayName) : { firstName: '', lastName: '' };
};

/**
 * Build only the alias the teacher elected to make public.
 *
 * Student ids/emails are intentionally not fallbacks. If a roster name is
 * missing, the generated code alias wins rather than leaking an identifier.
 */
export const displayAliasForStudent = ({ student = {}, mode = 'codeName', codeAlias = 'MathMaster Player' } = {}) => {
  const safeMode = normalizePlayerDisplayMode(mode);
  const safeCodeAlias = cleanText(codeAlias) || 'MathMaster Player';
  if (safeMode === 'codeName') return safeCodeAlias;

  const { firstName, lastName } = studentNameParts(student);
  if (safeMode === 'firstName') return firstName || lastName || safeCodeAlias;
  if (safeMode === 'firstLastInitial') {
    if (firstName && lastName) return `${firstName} ${lastName.slice(0, 1).toUpperCase()}.`;
    return firstName || lastName || safeCodeAlias;
  }
  if (safeMode === 'fullName') {
    return [firstName, lastName].filter(Boolean).join(' ') || safeCodeAlias;
  }
  return safeCodeAlias;
};

/**
 * The name setting a room's seats are under, or null for a room that has not
 * said: one created before rooms carried the setting, before its teacher's
 * configuration landed. A reader that gets null leaves an alias as it is.
 */
export const roomPlayerDisplayMode = (room = {}) => {
  const raw = room && typeof room === 'object' ? room.playerDisplayMode : undefined;
  return raw === undefined || raw === null ? null : normalizePlayerDisplayMode(raw);
};

/**
 * THE ALIAS A SEAT CARRIES UNDER ITS ROOM'S NAME SETTING.
 *
 * Every seat gets a code name from the room's seed (`codeAlias`, kept so a
 * room switched back to code names gets the same one). Under a name setting
 * the public alias is the student's name instead, from displayAliasForStudent.
 *
 * The room's setting decides, read where the seat is written: when the room is
 * created, when a student is invited late, when a student joins. The setting
 * used to be applied only after the create, by a second call from the
 * teacher's device (configureLiveChallengeExperience). A student who joined
 * while that call was running kept their code name on the class's board. On
 * Play Again the whole class is sitting on the podium and joins the new lobby
 * within a second, so a named game came back with code names.
 *
 * `player` is the seat as stored: `{ alias, codeAlias }`. The result is what to
 * write back: `{ alias, codeAlias }`.
 */
export const seatAliasUnder = ({ room = {}, student = {}, studentId = '', player = {} } = {}) => {
  const codeAlias = cleanText(player?.codeAlias) || cleanText(player?.alias) || 'MathMaster Player';
  const mode = roomPlayerDisplayMode(room);
  if (mode === null) return Object.freeze({ alias: cleanText(player?.alias) || codeAlias, codeAlias });
  const record = student && typeof student === 'object' && !Array.isArray(student) ? student : {};
  const id = cleanText(studentId) || cleanText(record.studentId);
  return Object.freeze({
    // With its id, so a name field holding the student's own id is never used
    // as the public alias (the same as the configuration callable).
    alias: displayAliasForStudent({ student: id ? { ...record, studentId: id } : record, mode, codeAlias }),
    codeAlias,
  });
};

/**
 * The existing mature scorer pays speed on a 10% (100-point) scale. Option B
 * keeps that scorer intact and asks the experience layer only for the delta
 * needed to reach the room's selected percentage.
 *
 * Examples when the original speed bonus was 100:
 *   0%  => -100 (remove speed)
 *   10% =>    0 (legacy amount already correct)
 *   20% => +100
 *   35% => +250
 *
 * A replay/second-chance round never receives speed points.
 */
export const experienceScoreAdjustment = ({
  originalSpeedBonus = 0,
  speedInfluencePercent = DEFAULT_SPEED_INFLUENCE_PERCENT,
  secondChance = false,
} = {}) => {
  if (secondChance) return 0;
  const original = clamp(Math.round(Number(originalSpeedBonus) || 0), 0, LEGACY_SPEED_CAP_POINTS);
  if (!original) return 0;
  const targetScale = normalizeSpeedInfluencePercent(speedInfluencePercent) / 10;
  return Math.round(original * (targetScale - 1));
};

// The mature scorer's native speed scale: 100 points, i.e. 10% of 1000.
export const LEGACY_SPEED_INFLUENCE_PERCENT = 10;

/**
 * Speed points on the mature 100-point scale, rescaled to a room's setting.
 *
 * This is the arithmetic the post-hoc submit wrapper used to apply
 * (original + experienceScoreAdjustment), now applied where the points are
 * computed, so every speed payment — a final answer or a Solver Race
 * milestone — honours the teacher's setting. A null/undefined setting means
 * "leave the mature scale alone", which is what pure callers and tests rely on.
 */
export const scaleLegacySpeedPoints = (legacyPoints, speedInfluencePercent = LEGACY_SPEED_INFLUENCE_PERCENT) => {
  const points = Math.max(0, Math.round(Number(legacyPoints) || 0));
  if (!points) return 0;
  if (speedInfluencePercent === null || speedInfluencePercent === undefined) return points;
  return Math.max(0, points + experienceScoreAdjustment({ originalSpeedBonus: points, speedInfluencePercent }));
};

export const buildChallengeScoringPreview = ({
  roundSeconds = 20,
  speedInfluencePercent = DEFAULT_SPEED_INFLUENCE_PERCENT,
} = {}) => {
  const totalSeconds = Math.max(1, Math.round(Number(roundSeconds) || 20));
  const maxSpeedBonus = speedBonusCapForPercent(speedInfluencePercent);
  const checkpoints = [...new Set([
    0,
    Math.round(totalSeconds * 0.25),
    Math.round(totalSeconds * 0.5),
    Math.round(totalSeconds * 0.75),
    totalSeconds,
  ])].sort((a, b) => a - b);

  const examples = checkpoints.map((secondsUsed) => {
    const remainingRatio = clamp((totalSeconds - secondsUsed) / totalSeconds, 0, 1);
    const speedPoints = Math.round(maxSpeedBonus * remainingRatio);
    return {
      secondsUsed,
      speedPoints,
      pointsBeforeStreakComeback: CORRECTNESS_BASE_POINTS + speedPoints,
    };
  });

  return Object.freeze({
    basePoints: CORRECTNESS_BASE_POINTS,
    speedInfluencePercent: normalizeSpeedInfluencePercent(speedInfluencePercent),
    maxSpeedBonus,
    examples,
    academicCreditNote: 'Challenge speed, streak, comeback and rank points are not part of the assignment grade. Warm-Up credit uses participation and mathematical accuracy.',
  });
};

// Pure, so a bundle that imports one helper does not keep every other one.
export default /* @__PURE__ */ Object.freeze({
  normalizeSpeedInfluencePercent,
  speedBonusCapForPercent,
  normalizePlayerDisplayMode,
  displayAliasForStudent,
  roomPlayerDisplayMode,
  seatAliasUnder,
  experienceScoreAdjustment,
  scaleLegacySpeedPoints,
  buildChallengeScoringPreview,
});
