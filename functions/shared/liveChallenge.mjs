// Pure Live Challenge rules shared by Cloud Functions and tests.
//
// The game is deliberately accuracy-first. A correct answer is worth 1000
// points; speed can add at most 100 and a streak can add at most another 100.
// That means a fast guess can never outweigh actually knowing one more problem.

export const LIVE_CHALLENGE_STATUS = Object.freeze({
  LOBBY: 'lobby',
  RUNNING: 'running',
  FINISHED: 'finished',
  CANCELLED: 'cancelled',
});

export const DEFAULT_ROUND_COUNT = 10;
export const MIN_ROUND_COUNT = 3;
export const MAX_ROUND_COUNT = 20;
export const DEFAULT_ROUND_SECONDS = 45;
export const MIN_ROUND_SECONDS = 15;
export const MAX_ROUND_SECONDS = 120;

/*
 * PERSEVERANCE POINTS.
 *
 * Every bonus in the original scoring was gated on being fully correct: speed
 * only pays on a correct answer, and a streak only exists while you keep
 * getting them right. So the student having the hardest time could not reach a
 * single bonus in the game, and a student who missed four in a row scored
 * identically whether they fought each one or typed anything to make it stop.
 *
 * These two rules put points on the behaviour of not giving up.
 */

// Paid for a correct answer immediately after a miss. Deliberately larger than
// the streak bonus: recovering is the harder thing and the design should say
// so. It cannot be farmed — missing on purpose costs a 1000-point base to win
// 150 back, which is a bad trade in every direction.
export const COMEBACK_BONUS = 150;

// A replayed question is worth most of its points to the student who missed it
// the first time...
export const SECOND_CHANCE_RECOVERY_SHARE = 0.75;
// ...and a little to the student who already had it right, so the round is not
// dead time for them. The shares are chosen so first-time-correct still outranks
// missed-then-recovered on the same question (1000 + 250 against 0 + 750): the
// leaderboard keeps meaning what it means, and the recovery is still worth
// fighting for.
export const SECOND_CHANCE_CONFIRM_SHARE = 0.25;

// Enough to matter, few enough that the game still ends.
export const MAX_SECOND_CHANCE_ROUNDS = 3;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const normalizeRoundCount = (value) => clamp(
  Math.round(Number(value) || DEFAULT_ROUND_COUNT),
  MIN_ROUND_COUNT,
  MAX_ROUND_COUNT,
);

export const normalizeRoundSeconds = (value) => clamp(
  Math.round(Number(value) || DEFAULT_ROUND_SECONDS),
  MIN_ROUND_SECONDS,
  MAX_ROUND_SECONDS,
);

export const canonicalChallengeStandard = (value) => {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'mixed') return 'mixed';
  return raw.replace(/^texas:/i, '').toUpperCase().replace(/\s+/g, '');
};

const ADJECTIVES = Object.freeze([
  'Vector', 'Prime', 'Rapid', 'Clever', 'Delta', 'Bright', 'Nimble', 'Logic',
  'Sigma', 'Graph', 'Algebra', 'Cosmic', 'Golden', 'Silver', 'Turbo', 'Nova',
]);
const NOUNS = Object.freeze([
  'Falcon', 'Fox', 'Owl', 'Panther', 'Wolf', 'Eagle', 'Comet', 'Rocket',
  'Solver', 'Ranger', 'Pilot', 'Tiger', 'Hawk', 'Dragon', 'Orbit', 'Vertex',
]);

export const challengeAlias = (index = 0, seed = 0) => {
  const safeIndex = Math.max(0, Math.floor(Number(index) || 0));
  const safeSeed = Math.abs(Math.floor(Number(seed) || 0));
  const adjective = ADJECTIVES[(safeIndex + safeSeed) % ADJECTIVES.length];
  const noun = NOUNS[(safeIndex * 3 + safeSeed) % NOUNS.length];
  const number = ((safeIndex + safeSeed) % 89) + 11;
  return `${adjective} ${noun} ${number}`;
};

/**
 * Accuracy-first round scoring.
 *
 * gradeScore is the server grader's 0..1 score, so multipart tools can earn
 * partial credit without pretending the whole response was correct. Speed and
 * streak bonuses are reserved for fully correct work.
 *
 * A SECOND-CHANCE ROUND IS SCORED AS A DIFFERENT KIND OF ROUND. It pays no
 * speed bonus, because a replay exists to be learned from rather than raced,
 * and it leaves the streak untouched in both directions — a bonus round should
 * neither rescue a broken streak nor break an intact one. What it pays instead
 * is recovery: most of the question's value to whoever missed it first time.
 */
export const scoreChallengeRound = ({
  gradeScore = 0,
  isCorrect = false,
  remainingMs = 0,
  totalMs = DEFAULT_ROUND_SECONDS * 1000,
  previousStreak = 0,
  previousRoundMissed = false,
  secondChance = false,
  missedOriginally = false,
} = {}) => {
  const ratio = clamp(Number(gradeScore) || 0, 0, 1);
  const safeTotal = Math.max(1, Number(totalMs) || 1);
  const remainingRatio = clamp((Number(remainingMs) || 0) / safeTotal, 0, 1);
  const carriedStreak = Math.max(0, Math.floor(Number(previousStreak) || 0));

  if (secondChance) {
    const share = missedOriginally ? SECOND_CHANCE_RECOVERY_SHARE : SECOND_CHANCE_CONFIRM_SHARE;
    const recoveryPoints = isCorrect ? Math.round(1000 * ratio * share) : 0;
    return {
      basePoints: 0,
      speedBonus: 0,
      streakBonus: 0,
      comebackBonus: 0,
      recoveryPoints,
      pointsAwarded: recoveryPoints,
      newStreak: carriedStreak,
      secondChance: true,
    };
  }

  const basePoints = Math.round(1000 * ratio);
  const speedBonus = isCorrect ? Math.round(100 * remainingRatio) : 0;
  const newStreak = isCorrect ? carriedStreak + 1 : 0;
  const streakBonus = isCorrect ? Math.min(100, Math.max(0, newStreak - 1) * 25) : 0;
  const comebackBonus = isCorrect && previousRoundMissed === true ? COMEBACK_BONUS : 0;
  return {
    basePoints,
    speedBonus,
    streakBonus,
    comebackBonus,
    recoveryPoints: 0,
    pointsAwarded: basePoints + speedBonus + streakBonus + comebackBonus,
    newStreak,
    secondChance: false,
  };
};

export const planSecondChanceRounds = ({
  roundMisses = {},
  scheduledRoundCount = 0,
  limit = MAX_SECOND_CHANCE_ROUNDS,
} = {}) => {
  const scheduled = Math.max(0, Math.floor(Number(scheduledRoundCount) || 0));
  const cap = clamp(Math.floor(Number(limit) || 0), 0, MAX_SECOND_CHANCE_ROUNDS);
  if (!scheduled || !cap) return [];

  return Object.entries(roundMisses || {})
    .map(([index, misses]) => ({ roundIndex: Number(index), misses: Math.floor(Number(misses) || 0) }))
    .filter((entry) => Number.isInteger(entry.roundIndex)
      && entry.roundIndex >= 0
      && entry.roundIndex < scheduled
      && entry.misses > 0)
    .sort((a, b) => b.misses - a.misses || a.roundIndex - b.roundIndex)
    .slice(0, cap)
    .map((entry) => entry.roundIndex);
};

export const CHALLENGE_QUESTION_STYLES = ['any', 'tools', 'noTools'];

export const canonicalQuestionStyle = (value) => {
  const style = String(value ?? '').trim();
  return CHALLENGE_QUESTION_STYLES.includes(style) ? style : 'any';
};

// Bank records spell the tool three different ways depending on their vintage.
export const pathToolIdOf = (question) => {
  const id = question?.pathToolId || question?.toolId || question?.tool?.id || '';
  const trimmed = String(id).trim();
  return trimmed || null;
};

const CHOICE_RESPONSE_PROFILES = new Set([
  'choice', 'multiplechoice', 'multiple-choice', 'singlechoice', 'single-choice', 'select',
]);
const MATH_RESPONSE_PROFILES = new Set([
  'basic', 'math', 'expression', 'equation', 'interval', 'inequality', 'set', 'function',
  'algebra-operation', 'basic+set', 'number', 'numeric', 'integer', 'decimal', 'fraction',
  'orderedpair', 'ordered-pair',
]);
const TEXT_RESPONSE_PROFILES = new Set(['', 'text', 'shortanswer', 'short-answer', 'string']);

const responseProfile = (field = {}) => String(
  field?.inputProfile ?? field?.inputMode ?? field?.type ?? '',
).trim().toLowerCase();

const visibleChoices = (question, field) => {
  const source = Array.isArray(field?.choices) && field.choices.length
    ? field.choices
    : (Array.isArray(question?.choices) ? question.choices : []);
  return source.filter((choice) => {
    if (choice == null) return false;
    if (typeof choice === 'object') return String(choice.label ?? choice.text ?? choice.value ?? '').trim() !== '';
    return String(choice).trim() !== '';
  });
};

const explicitlyRequestsChoice = (question, field) => {
  const text = [field?.label, field?.responseHint, question?.prompt]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /\b(choose|select)\b/.test(text);
};

const mathLabelForProfile = (profile) => {
  if (profile === 'interval') return 'Interval input';
  if (['number', 'numeric', 'integer', 'decimal', 'fraction'].includes(profile)) return 'Number input';
  if (['orderedpair', 'ordered-pair'].includes(profile)) return 'Ordered-pair input';
  if (profile === 'inequality') return 'Inequality input';
  if (profile === 'set') return 'Set input';
  if (profile === 'equation') return 'Equation input';
  return 'Math input';
};

/**
 * Whether Live Challenge can actually present the public response contract.
 *
 * This is deliberately presentation-only. It never reads expected answers or
 * grading data. Path's issuability gate still decides whether the server can
 * grade the question; this gate prevents a securely gradeable question from
 * reaching a timed round through a UI that cannot let the student answer it.
 */
export const liveChallengeResponseReadiness = (question = {}) => {
  if (pathToolIdOf(question)) {
    return { eligible: true, mode: 'tool', label: 'Interactive tool', reason: null, choiceCount: 0 };
  }

  const fields = Array.isArray(question?.responseFields) ? question.responseFields : [];
  if (!fields.length) {
    return { eligible: false, mode: 'invalid', label: 'Invalid for Live Challenge', reason: 'no_response_fields', choiceCount: 0 };
  }

  const modes = [];
  const labels = [];
  let choiceCount = 0;

  for (const field of fields) {
    const profile = responseProfile(field);
    const choices = visibleChoices(question, field);
    const choiceProfile = CHOICE_RESPONSE_PROFILES.has(profile);

    if (choiceProfile) {
      if (choices.length < 2) {
        return { eligible: false, mode: 'invalid', label: 'Invalid for Live Challenge', reason: 'choice_field_has_no_choices', choiceCount: choices.length };
      }
      modes.push('choice');
      choiceCount += choices.length;
      labels.push(`Multiple choice · ${choices.length} choices`);
      continue;
    }

    // Do not "helpfully" turn a text field into choice UI just because options
    // are present. Private grading only remaps choice ids for a choice field, so
    // that would create a beautiful UI whose correct button can never grade.
    if (explicitlyRequestsChoice(question, field)) {
      return {
        eligible: false,
        mode: 'invalid',
        label: 'Invalid for Live Challenge',
        reason: choices.length >= 2 ? 'choice_profile_mismatch' : 'choice_instruction_has_no_choices',
        choiceCount: choices.length,
      };
    }

    const declaresMathNotation = Boolean(
      field?.answerFormat
      || field?.inputContract?.format
      || (Array.isArray(field?.requiredSymbols) && field.requiredSymbols.length)
      || (Array.isArray(field?.inputContract?.requiredSymbols) && field.inputContract.requiredSymbols.length),
    );
    if (MATH_RESPONSE_PROFILES.has(profile) || declaresMathNotation) {
      modes.push('math');
      labels.push(mathLabelForProfile(profile));
      continue;
    }

    if (TEXT_RESPONSE_PROFILES.has(profile)) {
      modes.push('text');
      labels.push('Text input');
      continue;
    }

    return { eligible: false, mode: 'invalid', label: 'Invalid for Live Challenge', reason: 'unsupported_response_profile', choiceCount: choices.length };
  }

  const uniqueModes = [...new Set(modes)];
  const mode = uniqueModes.length === 1 ? uniqueModes[0] : 'mixed';
  const label = fields.length === 1 ? labels[0] : `${fields.length} response parts`;
  return { eligible: true, mode, label, reason: null, choiceCount };
};

export const matchesQuestionStyle = (question, style) => {
  // This predicate is the candidate-filter seam used by create and swap. Keep
  // Live Challenge fail-closed here so an unrenderable field never enters the
  // round plan even though the Path server could technically grade it.
  if (!liveChallengeResponseReadiness(question).eligible) return false;
  const normalized = canonicalQuestionStyle(style);
  if (normalized === 'any') return true;
  const hasTool = pathToolIdOf(question) !== null;
  return normalized === 'tools' ? hasTool : !hasTool;
};

export const LIVE_PROVISIONAL_MAX_POINTS = 1000;

export const provisionalPointsFor = (player, activeRound = null) => {
  if (activeRound == null) return 0;
  if (Number(player?.provisionalRound) !== Number(activeRound)) return 0;
  if (Number(player?.answeredRound) === Number(activeRound)) return 0;
  const points = Math.round(Number(player?.provisionalPoints) || 0);
  return Math.max(0, Math.min(LIVE_PROVISIONAL_MAX_POINTS, points));
};

export const publicLeaderboard = (players = {}, { activeRound = null } = {}) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false)
  .map((player) => {
    const score = Math.max(0, Math.round(Number(player.score) || 0));
    const provisionalPoints = provisionalPointsFor(player, activeRound);
    return {
      playerKey: player?.playerKey ? String(player.playerKey).slice(0, 80) : null,
      alias: String(player.alias || 'Player').slice(0, 60),
      score,
      provisionalPoints,
      liveScore: score + provisionalPoints,
      correctCount: Math.max(0, Math.round(Number(player.correctCount) || 0)),
      roundsAnswered: Math.max(0, Math.round(Number(player.roundsAnswered) || 0)),
      streak: Math.max(0, Math.round(Number(player.streak) || 0)),
      answeredRound: Number.isInteger(Number(player.answeredRound)) ? Number(player.answeredRound) : -1,
    };
  })
  .sort((a, b) => b.liveScore - a.liveScore || b.correctCount - a.correctCount || a.alias.localeCompare(b.alias))
  .map((player, index) => ({ ...player, rank: index + 1 }));

export const joinedPlayerCount = (players = {}) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false).length;

export const currentAnsweredCount = (players = {}, roundIndex = null) => (Array.isArray(players) ? players : Object.values(players || {}))
  .filter((player) => player?.joined !== false && (roundIndex == null ? player?.answeredCurrent === true : Number(player?.answeredRound) === Number(roundIndex))).length;

export const challengeCanAdvance = ({ joinedCount = 0, answeredCount = 0, roundEndsAtMs = 0, nowMs = Date.now() } = {}) => (
  Number(joinedCount) > 0
  && (Number(answeredCount) >= Number(joinedCount) || Number(nowMs) >= Number(roundEndsAtMs || 0))
);

export const deriveRoundTallies = ({
  players = [],
  secondChanceOf = {},
  storedRoundAnswers = null,
  storedRoundMisses = null,
} = {}) => {
  const replays = new Set(
    Object.keys(secondChanceOf || {})
      .map((key) => Math.round(Number(key)))
      .filter((value) => Number.isFinite(value)),
  );

  const roundAnswers = {};
  const roundMisses = {};
  const bump = (target, round) => {
    const key = String(round);
    target[key] = (target[key] || 0) + 1;
  };

  (Array.isArray(players) ? players : []).forEach((player) => {
    const answered = Array.isArray(player?.answeredRounds) ? player.answeredRounds : [];
    const missed = new Set(
      (Array.isArray(player?.missedRounds) ? player.missedRounds : [])
        .map((value) => Math.round(Number(value)))
        .filter((value) => Number.isFinite(value)),
    );
    const seen = new Set();
    answered
      .map((value) => Math.round(Number(value)))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .forEach((round) => {
        if (replays.has(round) || seen.has(round)) return;
        seen.add(round);
        bump(roundAnswers, round);
        if (missed.has(round)) bump(roundMisses, round);
      });
  });

  const withFallback = (derived, stored) => {
    if (!stored || typeof stored !== 'object') return derived;
    const merged = { ...derived };
    Object.entries(stored).forEach(([key, value]) => {
      const legacy = Math.round(Number(value)) || 0;
      if (legacy > (merged[key] || 0)) merged[key] = legacy;
    });
    return merged;
  };

  return {
    roundAnswers: withFallback(roundAnswers, storedRoundAnswers),
    roundMisses: withFallback(roundMisses, storedRoundMisses),
  };
};
