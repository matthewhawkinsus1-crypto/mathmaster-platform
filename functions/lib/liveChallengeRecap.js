"use strict";

/*
 * THE END-OF-GAME RECAP, FOR ONE STUDENT.
 *
 * When a match finishes, a student's screen used to say where they placed and
 * nothing about the mathematics. The recap is what they get instead: every
 * shared round they played, what they answered, and — now that nothing can be
 * answered any more — the worked solution; their own personal bests; the
 * recognitions they earned; whether the game counted as their Warm-Up.
 *
 * PRIVACY. Built on the server from the durable match result (which names
 * students and is server-only) and the room's published solutions. The
 * response carries the asking student's OWN facts and nothing about anyone
 * else: no classmate's id, name, alias, answers or rank. Personal bests are
 * computed here and returned only to the student they belong to; they are not
 * written anywhere a classmate or a projector could read.
 *
 * The same earlier-results read decides who set a personal best for the
 * rewards effect (`personalBestStudentIds`), so the recap and the reward can
 * never disagree.
 */

const MATCH_RESULTS = "liveChallengeMatchResults";
const ROOMS = "liveChallengeRooms";
const PRIVATE = "liveChallengePrivate";
const INVITES = "liveChallengeInvites";
// A match has at most a few dozen rounds; this bounds the solution reads.
const MAX_RECAP_ROUNDS = 60;
// Personal-best history reads run a few students at a time.
const HISTORY_CONCURRENCY = 8;

let modulesPromise = null;
function recapModules() {
  if (!modulesPromise) {
    modulesPromise = Promise.all([
      import("../shared/liveChallengePersonalBests.mjs"),
      import("../shared/liveChallengeRecognitions.mjs"),
      import("../shared/liveChallengeRewardRules.mjs"),
      import("../shared/liveChallengeResults.mjs"),
      import("../shared/liveChallengeSolutionReveal.mjs"),
    ]).then(([personalBests, recognitions, rewardRules, results, solutionReveal]) => ({
      personalBests, recognitions, rewardRules, results, solutionReveal,
    }));
  }
  return modulesPromise;
}

/**
 * The student's earlier match results, newest first: finalized strictly
 * BEFORE `beforeMs`, so a rewards effect retried tomorrow — after the student
 * has played again — reads the same history it read today. Served by the
 * (studentIds CONTAINS, finalizedAtMs DESC) index in firestore.indexes.json.
 */
async function previousMatchResults(db, { studentId, beforeMs, limit = 25 }) {
  if (!studentId || !Number.isFinite(Number(beforeMs))) return [];
  const snapshot = await db.collection(MATCH_RESULTS)
    .where("studentIds", "array-contains", String(studentId))
    .where("finalizedAtMs", "<", Number(beforeMs))
    .orderBy("finalizedAtMs", "desc")
    .limit(limit)
    .get();
  return snapshot.docs.map((doc) => ({ roomId: doc.id, ...doc.data() }));
}

async function personalBestsOf(db, result, studentId) {
  const { personalBests } = await recapModules();
  const previousResults = await previousMatchResults(db, {
    studentId, beforeMs: result.finalizedAtMs, limit: personalBests.PERSONAL_BEST_HISTORY_LIMIT,
  });
  return personalBests.personalBestsFor({ matchResult: result, studentId, previousResults });
}

/**
 * Which joined students set at least one personal best in a finished match.
 * Only for a result that carries `recognitions` (finished by code that knows
 * about personal bests): an older result is never re-rewarded by a sweep.
 */
async function personalBestStudentIds(db, result = {}) {
  if (result.status !== "finished" || !Array.isArray(result.recognitions)) return [];
  const students = (Array.isArray(result.standings) ? result.standings : [])
    .filter((standing) => standing?.joined === true && standing.studentId)
    .map((standing) => standing.studentId);
  const setBest = [];
  for (let start = 0; start < students.length; start += HISTORY_CONCURRENCY) {
    // eslint-disable-next-line no-await-in-loop
    const outcomes = await Promise.all(students.slice(start, start + HISTORY_CONCURRENCY)
      .map(async (studentId) => ({ studentId, bests: await personalBestsOf(db, result, studentId) })));
    outcomes.forEach(({ studentId, bests }) => { if (bests.personalBests.length) setBest.push(studentId); });
  }
  return setBest.sort();
}

const integerOrNull = (value) => (Number.isInteger(Number(value)) && value !== null && value !== "" ? Number(value) : null);

/**
 * The recap response (the getLiveChallengeMatchRecap contract). `fail(code,
 * message)` builds the error the callable throws.
 */
async function buildLiveChallengeMatchRecap(db, { roomId, studentId, fail }) {
  const { recognitions, rewardRules, results } = await recapModules();
  const resultSnapshot = await db.collection(MATCH_RESULTS).doc(roomId).get();
  if (!resultSnapshot.exists) {
    // Not finished (or never existed). Say which only to a student in it.
    const [roomSnapshot, playerSnapshot] = await Promise.all([
      db.collection(ROOMS).doc(roomId).get(),
      db.collection(PRIVATE).doc(roomId).collection("players").doc(studentId).get(),
    ]);
    if (!roomSnapshot.exists) throw fail("not-found", "That Live Challenge no longer exists.");
    if (!playerSnapshot.exists) throw fail("permission-denied", "This Live Challenge was not assigned to you.");
    throw fail("failed-precondition", "The recap is ready when the game is finished.");
  }
  const result = { roomId, ...resultSnapshot.data() };
  const standing = results.matchResultStanding(result, studentId);
  if (!standing) throw fail("permission-denied", "This Live Challenge was not assigned to you.");
  if (result.status !== "finished") throw fail("failed-precondition", "This game was cancelled, so it has no recap.");

  // A LIVE GAME ELSEWHERE. Play Again (or the next Warm-Up) can draw the same
  // bank questions, and a question with no randomised numbers has the same
  // answer. While the student's invite points to a game that can still be
  // answered, this recap shows how they did but withholds the worked
  // solutions; they come back once that game ends.
  const inviteSnapshot = await db.collection(INVITES).doc(studentId).get();
  const liveRoomId = String(inviteSnapshot.exists ? (inviteSnapshot.data()?.roomId || "") : "").trim();
  let solutionsWithheld = false;
  if (liveRoomId && liveRoomId !== roomId) {
    const liveRoom = await db.collection(ROOMS).doc(liveRoomId).get();
    solutionsWithheld = liveRoom.exists && ["lobby", "running"].includes(liveRoom.data()?.status);
  }

  const secondChanceOf = result.secondChanceOf && typeof result.secondChanceOf === "object" ? result.secondChanceOf : {};
  const played = Math.min(MAX_RECAP_ROUNDS, Math.max(0, Number(result.playedRoundCount) || 0));
  const roundIndexes = Array.from({ length: played }, (_, index) => index);
  const roomRef = db.collection(ROOMS).doc(roomId);
  const solutionSnapshots = roundIndexes.length
    ? await db.getAll(...roundIndexes.map((round) => roomRef.collection("solutions").doc(String(round))))
    : [];
  const outcomeByRound = new Map();
  (Array.isArray(standing.roundOutcomes) ? standing.roundOutcomes : []).forEach((outcome) => {
    const round = integerOrNull(outcome?.roundIndex);
    if (round !== null && !outcomeByRound.has(round)) outcomeByRound.set(round, outcome);
  });

  const rounds = roundIndexes.map((round, position) => {
    const doc = solutionSnapshots[position];
    const solution = doc?.exists ? (doc.data() || {}) : null;
    const outcome = outcomeByRound.get(round) || null;
    const original = Object.prototype.hasOwnProperty.call(secondChanceOf, String(round))
      ? integerOrNull(secondChanceOf[String(round)])
      : null;
    const available = !solutionsWithheld && Boolean(solution?.available && solution.solutionReview);
    return {
      roundIndex: round,
      originalRoundIndex: original,
      secondChance: original !== null,
      answered: Boolean(outcome),
      isCorrect: outcome ? outcome.isCorrect === true : null,
      scorePercent: outcome && Number.isFinite(Number(outcome.scorePercent)) ? Number(outcome.scorePercent) : null,
      prompt: solution?.prompt || null,
      teksCode: solution?.teksCode || null,
      solutionAvailable: available,
      solutionReview: available ? solution.solutionReview : null,
    };
  });

  const joined = standing.joined === true;
  const bests = joined ? await personalBestsOf(db, result, studentId) : { firstGame: false, personalBests: [] };
  const facts = rewardRules.participationFacts(standing, rewardRules.rewardContextFor(result));
  return {
    roomId,
    title: String(result.title || "Live Challenge"),
    status: "finished",
    finalizedAtMs: Number.isFinite(Number(result.finalizedAtMs)) ? Number(result.finalizedAtMs) : null,
    self: {
      joined,
      rank: joined && Number.isInteger(standing.rank) ? standing.rank : null,
      tied: joined && standing.tied === true,
      playerCount: Math.max(0, Number(result.playedCount) || 0),
      score: Math.max(0, Number(standing.score) || 0),
      correctCount: Math.max(0, Number(standing.correctCount) || 0),
      roundsAnswered: Math.max(0, Number(standing.roundsAnswered) || 0),
      roundsAvailable: joined ? facts.available : 0,
    },
    rounds,
    // True while another game the student is in can still be answered.
    solutionsWithheld,
    personalBests: bests.personalBests.map((best) => ({ ...best })),
    firstGame: bests.firstGame === true,
    recognitions: joined ? recognitions.recognitionsForPlayer(result.recognitions, standing.playerKey).map((entry) => ({ ...entry })) : [],
    warmup: {
      assignmentId: result.assignmentId || null,
      // Honest wording: a student who joined after the last round had no
      // round to be measured on, so no Warm-Up grade is recorded for them
      // (warmupChallengeScore returns null) and the recap must not say one is.
      countsAsWarmUp: Boolean(result.assignmentId) && joined && facts.available > 0,
    },
  };
}

module.exports = {
  MAX_RECAP_ROUNDS,
  previousMatchResults,
  personalBestStudentIds,
  buildLiveChallengeMatchRecap,
};
