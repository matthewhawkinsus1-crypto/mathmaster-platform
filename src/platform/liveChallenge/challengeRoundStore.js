/*
 * A ROUND'S ANSWER KEPT ON THIS DEVICE, READ BACK AS A CLAIM.
 *
 * While a room is live, a Live Challenge round keeps two things in this
 * browser's storage (LiveChallengeStudent.jsx ChallengeRound), each under a key
 * of its room, round and round version:
 *
 *   result   the server's answer to this device's locked response, so a
 *            refresh shows the round's result instead of reopening it;
 *   pending  the locked response while it is on its way: the exact envelope
 *            and submission id, so a refresh or a dropped connection sends
 *            it again rather than making a new attempt.
 *
 * Both were read back as stored, and whatever was stored there locked the
 * round. An empty record, a word, a number or a list kept as a "result"
 * showed "0% credit · +0 points" and "Round complete for you" on a round the
 * student never answered; kept as "pending" it said "Your answer is locked
 * in" and sent what it held, which the server refused, so the round could not
 * be answered at all. A value that cannot be read as a number or a word threw
 * as the round opened.
 *
 * Each is read here as a draft is (toolDraftShape.js): a value of the right
 * shape comes back exactly as saved, a part of the wrong shape is dropped, and
 * nothing here throws.
 *
 *   - A result is kept when it says whether the answer was right
 *     (`isCorrect`, which every answer the server returns carries); its
 *     points, words and flags only when they are numbers, words and flags.
 *   - A locked answer is kept when it is this round's (its room and round),
 *     its submission id is one the server takes, and it holds a response as
 *     the device sends one (a field question's `responses`, an engine
 *     question's `raw` work); its other fields only when they are of their
 *     kind, since the server reads one that is missing as its default.
 *
 * Anything else is not kept, and the round opens as the server's record of
 * it says: answered on any device (the student's own row), or open.
 */
import { draftNormalizer, draftShape } from '../../tools/shared/toolDraftShape.js';

const { boolean, nullable, number, record, refine, required, text, where } = draftShape;

const points = () => number();

const RESULT = draftNormalizer(record({
  isCorrect: required(boolean()),
  scorePercent: number({ min: 0, max: 100 }),
  pointsAwarded: points(),
  basePoints: points(),
  speedBonus: points(),
  streakBonus: points(),
  comebackBonus: points(),
  recoveryPoints: points(),
  totalScore: points(),
  rawScore: points(),
  streak: points(),
  rank: nullable(points()),
  speedTier: text({ max: 40 }),
  secondChance: boolean(),
  scoringStrategyId: nullable(text({ max: 80 })),
  submissionId: text({ max: 100 }),
  serverConfirmed: boolean(),
  duplicate: boolean(),
}));

// The ids the server takes for an answer (functions/index.js
// LIVE_CHALLENGE_SUBMISSION_ID): a device's UUID, never a receipt key.
export const CHALLENGE_SUBMISSION_ID = /^[A-Za-z0-9_-]{1,100}$/;

// What the device sends as an answer (ChallengeRound submit): a field
// question's `{ responses }`, an engine question's `{ raw }`.
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const RESPONSE_PAYLOAD = refine(record({}), (payload) => isRecord(payload.responses) || payload.raw !== undefined, { code: 'not-a-response' });

const pendingShape = ({ roomId, roundIndex, roundVersion }) => draftNormalizer(record({
  roomId: required(where((value) => typeof value === 'string' && value === roomId, { code: 'another-room' })),
  roundIndex: required(where((value) => value === roundIndex, { code: 'another-round' })),
  submissionId: required(where((value) => typeof value === 'string' && CHALLENGE_SUBMISSION_ID.test(value), { code: 'not-a-submission-id' })),
  responsePayload: required(RESPONSE_PAYLOAD),
  roundVersion: where((value) => value === roundVersion, { code: 'another-round-version' }),
  roundToken: text({ max: 200 }),
  humanElapsedMs: number({ min: 0 }),
  connectionQuality: text({ max: 24 }),
  timingDegraded: boolean(),
  autoFinalizedAtRoundEnd: boolean(),
}));

const kept = ({ value, issues }) => ({ value: value === undefined ? null : value, issues });

/**
 * The server's answer to this round as this device kept it, or null.
 * `{ value, issues }`, as a draft field is read.
 */
export const readStoredChallengeResult = (value) => (
  value === null || value === undefined ? { value: null, issues: [] } : kept(RESULT(value))
);

/**
 * The locked answer this device kept for this round (`round`: its room,
 * round and round version, as its key names them), or null.
 */
export const readStoredPendingAnswer = (value, round = {}) => (
  value === null || value === undefined
    ? { value: null, issues: [] }
    : kept(pendingShape({
      roomId: String(round.roomId ?? ''),
      roundIndex: Number(round.roundIndex),
      roundVersion: Number(round.roundVersion) || 0,
    })(value))
);
