/*
 * CLASS MEMORY: WHAT A CLASS DID LAST TIME, AND WHAT TO TRY NEXT.
 *
 * When a rush game finishes, the server keeps one small record per class and
 * game — `liveChallengeClassMemory/{classId}__{game}` — saying when it was
 * played, with which settings, and how the class did: its accuracy, how many
 * each student completed, and its weakest feature (or kind of inequality).
 * The next time the teacher sets that game up for that class, the setup card
 * reads
 *
 *   Period 5 last played this on Oct 28 at Standard, 3 × 60 s, 86% accuracy → try Challenge.
 *
 * with two buttons, "Use last settings" and "Use suggestion". The suggestion
 * is a rule, worked out when the card is shown (so a better rule reaches every
 * memory already saved):
 *
 *   85% or higher   step up: the next difficulty; at the top, a shorter clock
 *   65% to 85%      repeat the same settings
 *   below 65%       step down: the easier difficulty; at the bottom — or where
 *                   the easier difficulty cannot play these settings — drop
 *                   the weakest feature; failing that, a longer clock
 *
 * Every suggestion is a game the server would create: each candidate passes
 * the game's own settings rule before it is offered.
 *
 * Class totals only: no student is named, so a student's deletion has nothing
 * here to reach. Pure: the finalization effect that writes it (Cloud
 * Functions), the teacher's setup card, and tests.
 */

import { getGraphFeature } from './graphFeatureRegistry.mjs';
import { RUSH_ROUND_LIMITS, normalizeGraphFeatureRushConfig } from './graphFeatureRushConfig.mjs';
import { INEQUALITY_RUSH_MODE_ID, RUSH_MODE_ID } from './graphFeatureRushRules.mjs';
import { INEQUALITY_ROUND_LIMITS, normalizeInequalityRushConfig } from './inequalityRush.mjs';

export const CLASS_MEMORY_COLLECTION = 'liveChallengeClassMemory';
export const CLASS_MEMORY_VERSION = 1;

// The suggestion rule's two lines, in accuracy percent.
export const STEP_UP_AT = 85;
export const REPEAT_FROM = 65;

export const DIFFICULTY_LABEL = Object.freeze({ easy: 'Easy', standard: 'Standard', challenge: 'Challenge', mixed: 'Mixed' });
// Mixed ramps from Easy to Challenge: a step up from it is Challenge, a step down Easy.
const HARDER = Object.freeze({ easy: 'standard', standard: 'challenge', mixed: 'challenge', challenge: null });
const EASIER = Object.freeze({ challenge: 'standard', standard: 'easy', mixed: 'easy', easy: null });

// What a dropped kind of inequality is called in a suggestion.
const INEQUALITY_SHORT = Object.freeze({
  simple: 'simple inequalities',
  reversed: 'reversed inequalities',
  compoundAnd: '"and" compounds',
  compoundOr: '"or" compounds',
  oneStep: 'one-step solving',
  twoStep: 'two-step solving',
  absolute: 'absolute value',
});

const list = (value) => (Array.isArray(value) ? value.map(String) : []);

/*
 * THE GAMES WITH A MEMORY, and what each one's memory is made of: where a
 * room keeps its settings, which list "drop the weakest" takes from, which
 * report rows say what was weakest, and the game's own settings rule.
 */
const GAMES = Object.freeze({
  graphFeatureRush: Object.freeze({
    id: 'graphFeatureRush',
    modeId: RUSH_MODE_ID,
    label: 'Graph Feature Rush',
    configKey: 'graphFeatureRush',
    listKey: 'features',
    units: Object.freeze({ one: 'graph', many: 'graphs' }),
    limits: RUSH_ROUND_LIMITS,
    weakestRows: (report) => report?.byFeature,
    dropped: (id) => `the ${getGraphFeature(id)?.shortLabel || id}`,
    normalize: normalizeGraphFeatureRushConfig,
    settingsOf: (config) => ({
      presetId: String(config.presetId || 'custom'),
      families: list(config.families),
      features: list(config.features),
      difficulty: String(config.difficulty || 'standard'),
      offScreen: config.offScreen === true,
    }),
    // Off-screen features start at Standard: stepping down to Easy leaves them.
    atDifficulty: (settings, difficulty) => ({ ...settings, difficulty, ...(difficulty === 'easy' ? { offScreen: false } : {}) }),
  }),
  inequalityRush: Object.freeze({
    id: 'inequalityRush',
    modeId: INEQUALITY_RUSH_MODE_ID,
    label: 'Inequality Graphing Rush',
    configKey: 'inequalityRush',
    listKey: 'itemTypes',
    units: Object.freeze({ one: 'inequality', many: 'inequalities' }),
    limits: INEQUALITY_ROUND_LIMITS,
    weakestRows: (report) => report?.byFamily,
    dropped: (id) => INEQUALITY_SHORT[id] || id,
    normalize: normalizeInequalityRushConfig,
    settingsOf: (config) => ({
      presetId: String(config.presetId || 'custom'),
      itemTypes: list(config.itemTypes),
      difficulty: String(config.difficulty || 'standard'),
    }),
    atDifficulty: (settings, difficulty) => ({ ...settings, difficulty }),
  }),
});

export const CLASS_MEMORY_GAME_IDS = Object.freeze(Object.keys(GAMES));
export const getClassMemoryGame = (id) => GAMES[String(id || '')] || null;
export const classMemoryGameOfMode = (modeId) => Object.values(GAMES).find((game) => game.modeId === String(modeId || '')) || null;

/** A memory's document id: one per class and game. */
export const classMemoryId = (classId, game) => `${String(classId || '').trim()}__${String(game || '').trim()}`;

const percentOrNull = (value) => (Number.isFinite(Number(value)) && value !== null ? Math.round(Number(value)) : null);

/**
 * The memory a finished game leaves for its class, from its match result, its
 * room (the settings it was created with) and the rush report built from the
 * result (graphFeatureRush.buildRushReport). Null when there is nothing to
 * remember: not a game with a memory, not finished, no class, no settings, or
 * nobody played.
 */
export const buildClassMemory = ({ result = {}, room = {}, report = {} } = {}) => {
  const game = classMemoryGameOfMode(result.modeId);
  if (!game || result.status !== 'finished' || !result.classId) return null;
  const config = room?.[game.configKey]?.config;
  if (!config || typeof config !== 'object') return null;
  const players = (Array.isArray(report.players) ? report.players : []).filter((player) => player.joined === true).length;
  if (!players || !(Number(report.attempts) > 0)) return null;
  // The report's rows come hardest first: what the class completed least often.
  const weakestRow = (game.weakestRows(report) || []).find((row) => Number(row.questions) > 0) || null;
  return Object.freeze({
    version: CLASS_MEMORY_VERSION,
    classId: String(result.classId),
    teacherEmail: result.teacherEmail ? String(result.teacherEmail) : null,
    game: game.id,
    modeId: game.modeId,
    roomId: String(result.roomId || ''),
    classLabel: String(result.className || result.classPeriod || '') || null,
    playedAtMs: Number.isFinite(Number(result.finalizedAtMs)) ? Number(result.finalizedAtMs) : null,
    settings: Object.freeze({
      ...game.settingsOf(config),
      roundCount: Math.max(1, Math.round(Number(result.roomRoundCount || room.requestedRoundCount || room.roundCount) || 1)),
      roundSeconds: Math.max(1, Math.round(Number(result.roundSeconds || room.roundSeconds) || game.limits.defaultSeconds)),
      scoringStrategyId: String(result.scoringStrategyId || room.scoringStrategyId || 'grandPrix'),
    }),
    results: Object.freeze({
      accuracyPercent: percentOrNull(report.accuracyPercent),
      completedPerStudent: Math.round(((Number(report.graphsCompleted) || 0) / players) * 10) / 10,
      players,
      weakest: weakestRow ? Object.freeze({
        key: String(weakestRow.key),
        label: String(weakestRow.label || weakestRow.key),
        completionPercent: percentOrNull(weakestRow.completionPercent),
        accuracyPercent: percentOrNull(weakestRow.accuracyPercent),
      }) : null,
    }),
  });
};

/** Whether the stored memory is of a later game than `next` (a late or repeated run never replaces it). */
export const memoryIsNewer = (stored, next) => Boolean(stored && next)
  && String(stored.roomId || '') !== String(next.roomId || '')
  && Number(stored.playedAtMs) > Number(next.playedAtMs);

/* ------------------------------- suggestion ------------------------------- */

// The game's settings, normalized by its own rule, with the round settings
// beside them; null when the rule refuses them.
const playable = (game, settings) => {
  try {
    const config = game.normalize(settings);
    return Object.freeze({
      ...game.settingsOf(config),
      roundCount: settings.roundCount,
      roundSeconds: settings.roundSeconds,
      scoringStrategyId: settings.scoringStrategyId,
    });
  } catch (error) {
    if (error?.name?.endsWith('ConfigError')) return null;
    throw error;
  }
};

// The clock one notch shorter (−1) or longer (+1) among the setup's choices.
const clockNotch = (game, seconds, direction) => {
  const options = game.limits.secondsOptions;
  const current = Number(seconds);
  const candidates = direction < 0 ? options.filter((option) => option < current) : options.filter((option) => option > current);
  if (!candidates.length) return null;
  return direction < 0 ? candidates[candidates.length - 1] : candidates[0];
};

const suggestion = (kind, settings, phrase) => Object.freeze({ kind, settings, phrase });

/**
 * What to play next, from a memory: { kind, settings, phrase } —
 * kind `stepUp`, `faster`, `repeat`, `stepDown`, `drop` or `slower`;
 * settings the full setup (the game's settings, rounds, seconds, scoring);
 * phrase the card's "try Challenge". Null when the memory says nothing usable.
 */
export const suggestNextSettings = (memory) => {
  const game = getClassMemoryGame(memory?.game);
  const accuracy = memory?.results?.accuracyPercent;
  if (!game || !memory?.settings || accuracy === null || accuracy === undefined || !Number.isFinite(Number(accuracy))) return null;
  const last = playable(game, memory.settings);
  if (!last) return null;
  const repeat = suggestion('repeat', last, 'run it again');
  if (Number(accuracy) >= STEP_UP_AT) {
    const harder = HARDER[last.difficulty];
    const up = harder ? playable(game, game.atDifficulty(last, harder)) : null;
    if (up) return suggestion('stepUp', up, `try ${DIFFICULTY_LABEL[harder]}`);
    const shorter = clockNotch(game, last.roundSeconds, -1);
    if (shorter) return suggestion('faster', { ...last, roundSeconds: shorter }, `try ${shorter} s rounds`);
    return repeat;
  }
  if (Number(accuracy) >= REPEAT_FROM) return repeat;
  const easier = EASIER[last.difficulty];
  const down = easier ? playable(game, game.atDifficulty(last, easier)) : null;
  if (down) return suggestion('stepDown', down, `try ${DIFFICULTY_LABEL[easier]}`);
  const weakest = memory.results?.weakest?.key;
  const items = list(last[game.listKey]);
  if (weakest && items.length > 1 && items.includes(weakest)) {
    const dropped = playable(game, { ...last, [game.listKey]: items.filter((id) => id !== weakest) });
    if (dropped) return suggestion('drop', dropped, `try it without ${game.dropped(weakest)}`);
  }
  const longer = clockNotch(game, last.roundSeconds, 1);
  if (longer) return suggestion('slower', { ...last, roundSeconds: longer }, `try ${longer} s rounds`);
  return repeat;
};

/**
 * A memory's settings as the game's setup holds them: the same fields, with
 * the rounds and seconds held to what the setup offers (a room's own values
 * always are; this keeps an odd one from showing a blank choice).
 */
export const setupFromMemory = (gameId, settings = {}) => {
  const game = getClassMemoryGame(gameId);
  if (!game) return null;
  const { minRounds, maxRounds, secondsOptions } = game.limits;
  const seconds = Number(settings.roundSeconds);
  const nearest = secondsOptions.reduce((best, option) => (Math.abs(option - seconds) < Math.abs(best - seconds) ? option : best), secondsOptions[0]);
  return {
    ...game.settingsOf(settings),
    roundCount: Math.max(minRounds, Math.min(maxRounds, Math.round(Number(settings.roundCount) || game.limits.defaultRounds))),
    roundSeconds: secondsOptions.includes(seconds) ? seconds : nearest,
    scoringStrategyId: String(settings.scoringStrategyId || 'grandPrix'),
  };
};

/** Whether two setups are the same game (the card hides "Use suggestion" when it is the last one). */
export const sameSettings = (left, right) => {
  const keys = [...new Set([...Object.keys(left || {}), ...Object.keys(right || {})])].filter((key) => key !== 'presetId');
  const normal = (value) => (Array.isArray(value) ? [...value].sort().join('|') : String(value ?? ''));
  return keys.every((key) => normal(left?.[key]) === normal(right?.[key]));
};

/* --------------------------------- words --------------------------------- */

const MONTHS = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/** "Oct 28", or "Oct 28, 2025" for another year — in the reader's own time zone. */
export const memoryDate = (playedAtMs, nowMs = Date.now()) => {
  const played = new Date(Number(playedAtMs));
  if (Number.isNaN(played.getTime())) return null;
  const sameYear = played.getFullYear() === new Date(Number(nowMs)).getFullYear();
  return `${MONTHS[played.getMonth()]} ${played.getDate()}${sameYear ? '' : `, ${played.getFullYear()}`}`;
};

/**
 * The card's sentence: "Period 5 last played this on Oct 28 at Standard,
 * 3 × 60 s, 86% accuracy → try Challenge."
 */
export const classMemorySentence = (memory, next = suggestNextSettings(memory), { nowMs = Date.now() } = {}) => {
  if (!memory?.settings) return '';
  const who = memory.classLabel || 'This class';
  const when = memoryDate(memory.playedAtMs, nowMs);
  const { settings, results } = memory;
  const parts = [
    `${who} last played this${when ? ` on ${when}` : ''} at ${DIFFICULTY_LABEL[settings.difficulty] || settings.difficulty}`,
    `${settings.roundCount} × ${settings.roundSeconds} s`,
    ...(results?.accuracyPercent !== null && results?.accuracyPercent !== undefined ? [`${results.accuracyPercent}% accuracy`] : []),
  ];
  return `${parts.join(', ')}${next ? ` → ${next.phrase}` : ''}.`;
};

/** The card's second line: "4.2 graphs per student · weakest: the vertex (41% completed)". */
export const classMemoryDetail = (memory) => {
  const game = getClassMemoryGame(memory?.game);
  const results = memory?.results;
  if (!game || !results) return '';
  const per = `${results.completedPerStudent} ${results.completedPerStudent === 1 ? game.units.one : game.units.many} per student`;
  const weakest = results.weakest;
  if (!weakest) return per;
  const name = game.id === 'graphFeatureRush' ? (getGraphFeature(weakest.key)?.shortLabel || weakest.label) : weakest.label;
  return `${per} · weakest: ${name}${weakest.completionPercent !== null ? ` (${weakest.completionPercent}% completed)` : ''}`;
};
