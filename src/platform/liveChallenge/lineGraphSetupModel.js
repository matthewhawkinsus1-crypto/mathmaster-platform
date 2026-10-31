/*
 * GRAPH THE LINE SETUP, AS DATA.
 *
 * What the teacher's setup holds, how a preset or a format fills it in, and
 * what createLiveChallenge receives. Light on purpose — settings, presets and
 * limits only (lineGraphConfig.mjs), never the generator — so the teacher
 * console carries it for every game type, while the setup panel itself loads
 * only when Graph the Line is chosen. Rewards are not here: the game uses the
 * same Rewards choice as every Live Challenge (ChallengeRewardSettings). Pure:
 * tested in node.
 *
 * The FORMAT is the mode (lineGraphRules.mjs): Classic, Sprint and Rush are
 * three registered modes, so the request names the format's mode id and the
 * server reads the format from the mode, never from these settings.
 */

import {
  DEFAULT_SPRINT_LENGTH,
  LINE_ROUND_LIMITS,
  defaultLineGraphPresetFor,
  getLineGraphPreset,
  lineGraphConfigProblem,
  normalizeLineGraphConfig,
  suggestedLineRoundSeconds,
} from '../../../functions/shared/lineGraphConfig.mjs';
import { LINE_GRAPH_FORMAT, LINE_GRAPH_FORMAT_IDS, lineFormatGivesExtraTime, lineGraphModeOfFormat } from '../../../functions/shared/lineGraphRules.mjs';

/*
 * What the teacher's game-type menu holds for Graph the Line: one game, its
 * format chosen in the setup panel. Never a mode id itself.
 */
export const LINE_GRAPH_GAME = 'lineGraph';

export const LINE_SCORING_OPTIONS = Object.freeze([
  Object.freeze({ id: 'grandPrix', label: 'Grand Prix', description: 'Each round ranks the class; placement earns championship points (1st 12, last 3), so every round is a fresh race and comebacks are real.' }),
  Object.freeze({ id: 'correctCount', label: 'Correct Count', description: 'One point for every line right. Simple and cumulative; accuracy breaks ties.' }),
]);

const formatOr = (format) => (LINE_GRAPH_FORMAT_IDS.includes(format) ? format : LINE_GRAPH_FORMAT.CLASSIC);

/*
 * EXTENDED TIME, said plainly where the teacher sets the clock
 * (liveChallengeAccommodations.mjs). The race is the same for everyone; who
 * has extra time is never shown to the class.
 */
export const lineExtraTimeRule = (format) => (lineFormatGivesExtraTime(format)
  ? 'Extra time on a student\'s plan comes after the buzzer: they keep working to finish their lines. The race is decided at the buzzer, so those lines count for their practice, not the race.'
  : 'Rush has no extra time: the race is as many lines as the clock allows.');

// The question settings a preset sets (never the format, rounds or time).
const presetFields = (preset) => ({
  presetId: preset.id,
  itemTypes: [...preset.itemTypes],
  forms: [...preset.forms],
  specialLines: preset.specialLines,
  difficulty: preset.difficulty,
});

/** The setup a class of this course starts from, in `format`. */
export const defaultLineSetup = (courseId, format = LINE_GRAPH_FORMAT.CLASSIC) => {
  const chosen = formatOr(format);
  const preset = defaultLineGraphPresetFor(courseId);
  // The server's own defaults for everything the preset leaves open.
  const normalized = normalizeLineGraphConfig({ presetId: preset.id }, { format: chosen });
  const limits = LINE_ROUND_LIMITS[chosen];
  return {
    format: chosen,
    ...presetFields(preset),
    nameStyle: normalized.nameStyle,
    triesPerItem: normalized.triesPerItem,
    sprintLength: normalized.sprintLength ?? DEFAULT_SPRINT_LENGTH,
    sameEquations: normalized.sameEquations,
    showMethod: normalized.showMethod,
    slopeHelper: normalized.slopeHelper,
    roundCount: limits.defaultRounds,
    roundSeconds: suggestedLineRoundSeconds(chosen, normalized),
    scoringStrategyId: 'grandPrix',
  };
};

const sameMembers = (left = [], right = []) => [...left].sort().join() === [...right].sort().join();

/** A preset's question settings over the rest of the setup. */
export const applyLinePreset = (setup, presetId) => {
  const preset = getLineGraphPreset(presetId);
  if (!preset) return setup;
  return { ...setup, ...presetFields(preset) };
};

/**
 * A change to the setup. The preset stays named only while the question
 * settings still match it — exactly the server's rule — so "All three forms"
 * is never shown over settings it no longer describes.
 */
export const changeLineSetup = (setup, patch) => {
  const next = { ...setup, ...patch };
  const preset = getLineGraphPreset(setup.presetId);
  const matches = preset
    && preset.difficulty === next.difficulty
    && preset.specialLines === next.specialLines
    && sameMembers(preset.itemTypes, next.itemTypes)
    && sameMembers(preset.forms, next.forms);
  // A Sprint's suggested time follows its length, until the teacher sets one.
  const lengthChanged = Object.hasOwn(patch, 'sprintLength') && patch.sprintLength !== setup.sprintLength;
  const timeWasSuggested = setup.roundSeconds === suggestedLineRoundSeconds(setup.format, { sprintLength: setup.sprintLength });
  return {
    ...next,
    presetId: matches ? preset.id : 'custom',
    ...(lengthChanged && timeWasSuggested ? { roundSeconds: suggestedLineRoundSeconds(next.format, { sprintLength: next.sprintLength }) } : {}),
  };
};

/**
 * Another format: its own rounds and time (a Classic round is one line, a
 * Sprint round holds its set), and its own default for whether everyone gets
 * the same equations (Classic's, so the class can talk about one line). The
 * question settings carry over.
 */
export const changeLineFormat = (setup, format) => {
  const chosen = formatOr(format);
  if (chosen === setup.format) return setup;
  return {
    ...setup,
    format: chosen,
    roundCount: LINE_ROUND_LIMITS[chosen].defaultRounds,
    roundSeconds: suggestedLineRoundSeconds(chosen, { sprintLength: setup.sprintLength }),
    sameEquations: chosen === LINE_GRAPH_FORMAT.CLASSIC,
  };
};

/** The question settings the server validates (normalizeLineGraphConfig). */
export const lineSetupConfig = (setup) => ({
  presetId: setup.presetId,
  itemTypes: [...setup.itemTypes],
  forms: [...setup.forms],
  specialLines: setup.specialLines === true,
  difficulty: setup.difficulty,
  nameStyle: setup.nameStyle,
  triesPerItem: setup.triesPerItem,
  ...(formatOr(setup.format) === LINE_GRAPH_FORMAT.SPRINT ? { sprintLength: setup.sprintLength } : {}),
  sameEquations: setup.sameEquations === true,
  showMethod: setup.showMethod === true,
  slopeHelper: setup.slopeHelper === true,
});

/** What stops this setup from being a game, in the server's own words; null when nothing does. */
export const lineSetupProblem = (setup) => lineGraphConfigProblem(lineSetupConfig(setup), { format: formatOr(setup.format) });

/**
 * What createLiveChallenge receives. `rewardPolicy` is the teacher's Rewards
 * choice as a policy (buildChallengeRewardPolicy); null means the default.
 */
export const lineCreateRequest = (setup, { rewardPolicy = null } = {}) => ({
  challengeMode: lineGraphModeOfFormat(formatOr(setup.format)),
  lineGraph: lineSetupConfig(setup),
  roundCount: setup.roundCount,
  roundSeconds: setup.roundSeconds,
  scoringStrategyId: setup.scoringStrategyId,
  ...(rewardPolicy ? { rewardPolicy } : {}),
});
