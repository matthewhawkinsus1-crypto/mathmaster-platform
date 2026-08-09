// Curriculum timing — "is this skill appropriate *now*", which is a different
// question from "can this student do it".
//
// A note on Bluebonnet, because this is the one place the brief asks for data
// MathMaster does not have. There is no Bluebonnet scope-and-sequence in this
// repository: assignments carry a `curriculum: { provider, module, topic }`
// block, but nothing has ever read it. Rather than invent a 165-day sequence
// for 272 standards and pass it off as Bluebonnet, pacing is a pluggable
// provider with two implementations:
//
//   staticMapProvider  — reads an authored window map. Empty until real
//                        Bluebonnet or district data is loaded.
//   sequenceProvider   — a PROVISIONAL fallback that spreads a course's skills
//                        evenly across its windows in registry order. It is
//                        flagged `isProvisional` everywhere it is used so no
//                        screen can imply the pacing is authoritative.
//
// The engine never imports a provider directly; it takes one. Adding a district
// sequence, an AP sequence or an SAT sequence later means adding a provider,
// not touching the recommendation logic.

export const TIMING = Object.freeze({
  REVIEW: 'review',
  CURRENT: 'current',
  AHEAD: 'ahead',
  FUTURE: 'future',
});

// A course year divided into windows. Bluebonnet modules map naturally onto
// this; so does "instructional week" or a district unit.
export const DEFAULT_WINDOW_COUNT = 8;

export const DEFAULT_CLASS_PACING = Object.freeze({
  pacingFramework: 'provisional',
  pacingVariant: null,
  currentWindow: 1,
  windowCount: DEFAULT_WINDOW_COUNT,
  // Acceleration horizon: how far past the current window a student may be
  // pushed. Honors raises this via course policy rather than a second engine.
  accelerationRadius: 1,
});

export const normalizeClassPacing = (pacing) => {
  const raw = pacing && typeof pacing === 'object' && !Array.isArray(pacing) ? pacing : {};
  const windowCount = Math.max(1, Number(raw.windowCount) || DEFAULT_WINDOW_COUNT);
  return {
    ...DEFAULT_CLASS_PACING,
    ...raw,
    windowCount,
    currentWindow: Math.max(1, Math.min(windowCount, Number(raw.currentWindow) || 1)),
    accelerationRadius: Math.max(0, Number(raw.accelerationRadius ?? DEFAULT_CLASS_PACING.accelerationRadius)),
  };
};

/**
 * An authored window map: { [skillId]: { window, earliestWindow } }.
 * This is the shape real Bluebonnet or district pacing data loads into.
 */
export const staticMapProvider = ({ frameworkId = 'bluebonnet', windowMap = {}, windowCount = DEFAULT_WINDOW_COUNT } = {}) => ({
  frameworkId,
  isProvisional: false,
  windowCount,
  getSkillWindow: (skillId) => {
    const entry = windowMap[skillId];
    if (!entry) return null;
    const window = Number(entry.window ?? entry);
    if (!Number.isFinite(window)) return null;
    return {
      window,
      earliestWindow: Number(entry.earliestWindow ?? window),
    };
  },
});

/**
 * Provisional fallback. Spreads a course's skills evenly across the year in
 * registry order so the engine is exercisable before pacing data exists.
 * Everything it produces is marked provisional.
 */
export const sequenceProvider = ({ skills = [], windowCount = DEFAULT_WINDOW_COUNT } = {}) => {
  const ordered = skills.map((skill) => skill.skillId);
  const perWindow = Math.max(1, Math.ceil(ordered.length / Math.max(1, windowCount)));
  const index = new Map(ordered.map((skillId, position) => [skillId, Math.min(windowCount, Math.floor(position / perWindow) + 1)]));
  return {
    frameworkId: 'provisional',
    isProvisional: true,
    windowCount,
    getSkillWindow: (skillId) => {
      const window = index.get(skillId);
      if (!window) return null;
      return { window, earliestWindow: Math.max(1, window - 1) };
    },
  };
};

/**
 * Classify one skill against the class's current position.
 *
 * A skill the provider knows nothing about is deliberately CURRENT, never
 * FUTURE. Missing pacing data must not silently lock content — an absent map
 * entry is ignorance, not a decision to withhold.
 */
export const classifySkillTiming = ({ skillId, provider, pacing }) => {
  const settings = normalizeClassPacing(pacing);
  const entry = provider?.getSkillWindow?.(skillId) || null;

  if (!entry) {
    return {
      timing: TIMING.CURRENT,
      window: null,
      distance: 0,
      isProvisional: Boolean(provider?.isProvisional),
      unmapped: true,
    };
  }

  // A calendar-backed provider has already decided the timing from real dates,
  // so there is no window arithmetic to do. Honour its answer rather than
  // trying to reverse it into a window number.
  if (entry.engineTiming) {
    return {
      timing: entry.engineTiming,
      calendarTiming: entry.calendarTiming || entry.engineTiming,
      recommendationMode: entry.recommendationMode || 'normal',
      window: entry.window || null,
      distance: 0,
      instructionalDaysUntilStart: entry.instructionalDaysUntilStart ?? 0,
      calendarDaysUntilStart: entry.calendarDaysUntilStart ?? 0,
      reinforcementStatus: entry.reinforcementStatus || null,
      calendarDaysUntilReinforcement: entry.calendarDaysUntilReinforcement ?? 0,
      unscheduled: Boolean(entry.unscheduled),
      embedded: Boolean(entry.embedded),
      isProvisional: false,
      unmapped: false,
    };
  }

  const distance = entry.window - settings.currentWindow;
  const timing = distance < 0
    ? TIMING.REVIEW
    : distance === 0
      ? TIMING.CURRENT
      // "Ahead" is bounded by the acceleration radius; beyond it the skill is
      // future content regardless of how capable the student is.
      : distance <= settings.accelerationRadius
        ? TIMING.AHEAD
        : TIMING.FUTURE;

  return {
    timing,
    window: entry.window,
    earliestWindow: entry.earliestWindow,
    distance,
    isProvisional: Boolean(provider?.isProvisional),
    unmapped: false,
  };
};

// Course policy differences — Honors is the same engine with a wider horizon,
// never a second engine.
export const COURSE_POLICIES = Object.freeze({
  default: { accelerationRadius: 1, extensionThreshold: 0.85 },
  honors: { accelerationRadius: 2, extensionThreshold: 0.88 },
});

export const resolveCoursePolicy = (courseProfile) => (
  courseProfile?.rigor === 'honors' || courseProfile?.isHonors === true
    ? COURSE_POLICIES.honors
    : COURSE_POLICIES.default
);
