// Pure rules for the teacher-configurable Live Challenge experience.
//
// This module deliberately has no Firebase/browser imports. Cloud Functions,
// React previews and tests can all use the same arithmetic and naming contract
// without creating a second scorer or a second interpretation of a roster name.

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

const splitDisplayName = (displayName) => {
  const parts = cleanText(displayName).split(' ').filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
};

const studentNameParts = (student = {}) => {
  const record = student && typeof student === 'object' && !Array.isArray(student) ? student : {};
  const firstName = cleanText(record.firstName);
  const lastName = cleanText(record.lastName);
  if (firstName || lastName) return { firstName, lastName };

  return splitDisplayName(
    record.displayName
      || record.name
      || record.googleName
      || record.profile?.displayName
      || record.profile?.name
      || record.profile?.googleName
      || '',
  );
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

export default Object.freeze({
  normalizeSpeedInfluencePercent,
  speedBonusCapForPercent,
  normalizePlayerDisplayMode,
  displayAliasForStudent,
  experienceScoreAdjustment,
  buildChallengeScoringPreview,
});
