// Student-facing presentation for completed course Path passes.
//
// A completed Path pass is NOT the same claim as mathematical mastery:
// - pass completion says the student finished a full server-owned practice run;
// - mastery says the evidence engine has enough independent, broad, higher-DOK
//   evidence to make the stronger "Mastered" claim.
//
// Keeping these separate prevents the exact confusing state where a student
// finishes a Path and returns to a card that still looks untouched.

export const COURSE_PATH_MAX_LEVEL = 3;

const whole = (value) => Math.max(0, Math.floor(Number(value) || 0));

export const normalizeCoursePathPassProgress = (raw = {}) => {
  const passesCompleted = whole(raw?.passesCompleted);
  const highestRecordedLevel = Math.max(
    whole(raw?.highestRecordedLevel),
    Math.min(COURSE_PATH_MAX_LEVEL, passesCompleted),
  );
  const nextLevel = Math.min(COURSE_PATH_MAX_LEVEL, passesCompleted + 1);
  return {
    ...raw,
    passesCompleted,
    highestRecordedLevel,
    nextLevel,
    lastCompletedAt: whole(raw?.lastCompletedAt),
    advancedLoop: passesCompleted >= COURSE_PATH_MAX_LEVEL,
  };
};

export const coursePathLevelName = (level = 1) => {
  const safe = Math.max(1, Math.min(COURSE_PATH_MAX_LEVEL, whole(level) || 1));
  if (safe === 1) return 'Foundation';
  if (safe === 2) return 'Deeper practice';
  return 'Mastery challenge';
};

export const describeCoursePathPass = (raw = {}, { mastered = false } = {}) => {
  const progress = normalizeCoursePathPassProgress(raw);
  const count = progress.passesCompleted;

  if (mastered) {
    return {
      ...progress,
      hasCompletedPass: count > 0,
      completedLabel: count > 0 ? `✓ Path Pass ${Math.min(count, COURSE_PATH_MAX_LEVEL)} complete` : null,
      levelLabel: 'Mastered · review',
      nextLabel: 'Mastered · review anytime',
      buttonLabel: 'Review skill',
      tone: '#137333',
      background: '#e6f4ea',
    };
  }

  if (count <= 0) {
    return {
      ...progress,
      hasCompletedPass: false,
      completedLabel: null,
      levelLabel: 'Level 1 · Foundation',
      nextLabel: 'First pass · build the foundation',
      buttonLabel: 'Start Level 1',
      tone: '#174ea6',
      background: '#e8f0fe',
    };
  }

  if (count === 1) {
    return {
      ...progress,
      hasCompletedPass: true,
      completedLabel: '✓ Path Pass 1 complete',
      levelLabel: 'Level 2 · Deeper practice',
      nextLabel: 'Next: Level 2 · Deeper practice',
      buttonLabel: 'Start Level 2',
      tone: '#137333',
      background: '#e6f4ea',
    };
  }

  if (count === 2) {
    return {
      ...progress,
      hasCompletedPass: true,
      completedLabel: '✓ Path Pass 2 complete',
      levelLabel: 'Level 3 · Mastery challenge',
      nextLabel: 'Next: Level 3 · Mastery challenge',
      buttonLabel: 'Start Level 3',
      tone: '#5b21b6',
      background: '#f3ecfd',
    };
  }

  return {
    ...progress,
    hasCompletedPass: true,
    completedLabel: `✓ ${count} Path passes complete`,
    levelLabel: 'Advanced practice',
    nextLabel: 'Advanced practice · mastery evidence still building',
    buttonLabel: 'Continue advanced practice',
    tone: '#5b21b6',
    background: '#f3ecfd',
  };
};

export const summarizeCoursePathPasses = (byTeksCode = {}) => {
  const entries = Object.values(byTeksCode || {}).map(normalizeCoursePathPassProgress);
  return {
    completedSkillCount: entries.filter((entry) => entry.passesCompleted > 0).length,
    totalCompletedPasses: entries.reduce((sum, entry) => sum + entry.passesCompleted, 0),
  };
};

export default {
  COURSE_PATH_MAX_LEVEL,
  coursePathLevelName,
  describeCoursePathPass,
  normalizeCoursePathPassProgress,
  summarizeCoursePathPasses,
};
