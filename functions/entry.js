// Additive Cloud Functions entry point for Live Challenge Option B.
//
// `index.js` remains the mature MathMaster backend. Re-exporting it first keeps
// every existing callable/trigger name intact while this small file owns only
// the new Live Challenge experience seam.

const base = require('./index.js');
Object.assign(exports, base);

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentWritten } = require('firebase-functions/v2/firestore');

const LIVE_CHALLENGE_EXPERIENCE = 'liveChallengeExperience';
const LIVE_CHALLENGE_ROOMS = 'liveChallengeRooms';
const LIVE_CHALLENGE_PRIVATE = 'liveChallengePrivate';
const LIVE_CHALLENGE_INVITES = 'liveChallengeInvites';
const GRADES = 'grades';

let experienceRulesPromise = null;
const experienceRules = () => {
  if (!experienceRulesPromise) experienceRulesPromise = import('./shared/liveChallengeExperience.mjs');
  return experienceRulesPromise;
};

const verifiedTeacherEmail = (request) => {
  if (!request?.auth) throw new HttpsError('unauthenticated', 'Sign in before changing a Live Challenge.');
  if (request.auth.token?.role !== 'teacher') throw new HttpsError('permission-denied', 'Only a teacher can change a Live Challenge.');
  const token = request.auth.token || {};
  const email = String(token.email || '').trim().toLowerCase();
  if (!email || token.email_verified === false) throw new HttpsError('permission-denied', 'A verified teacher email is required.');
  return email;
};

const ownedRoom = async ({ db, request, roomId }) => {
  const teacherEmail = verifiedTeacherEmail(request);
  const id = String(roomId || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'A Live Challenge room is required.');
  const roomRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(id);
  const roomSnapshot = await roomRef.get();
  if (!roomSnapshot.exists) throw new HttpsError('not-found', 'That Live Challenge room no longer exists.');
  const room = roomSnapshot.data() || {};
  if (String(room.teacherEmail || '').trim().toLowerCase() !== teacherEmail) {
    throw new HttpsError('permission-denied', 'Only the teacher who created this room may change its experience settings.');
  }
  return { teacherEmail, roomRef, room };
};

const defaultExperience = Object.freeze({ speedInfluencePercent: 20, playerDisplayMode: 'codeName' });
const chunksOf = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

const readExperience = async (db, roomId) => {
  const snapshot = await db.collection(LIVE_CHALLENGE_EXPERIENCE).doc(roomId).get();
  if (!snapshot.exists) return { ...defaultExperience };
  const raw = snapshot.data() || {};
  const rules = await experienceRules();
  return {
    speedInfluencePercent: rules.normalizeSpeedInfluencePercent(raw.speedInfluencePercent),
    playerDisplayMode: rules.normalizePlayerDisplayMode(raw.playerDisplayMode),
  };
};

exports.getLiveChallengeExperience = onCall(async (request) => {
  const db = getFirestore();
  const roomId = String(request.data?.roomId || '').trim();
  await ownedRoom({ db, request, roomId });
  return { roomId, ...(await readExperience(db, roomId)) };
});

/**
 * Apply public-name and speed settings to one teacher-owned room.
 * Generated code names are preserved as `codeAlias`, and no public player row
 * is created before a student actually joins.
 */
exports.configureLiveChallengeExperience = onCall(async (request) => {
  const db = getFirestore();
  const roomId = String(request.data?.roomId || '').trim();
  const { teacherEmail } = await ownedRoom({ db, request, roomId });
  const rules = await experienceRules();
  const speedInfluencePercent = rules.normalizeSpeedInfluencePercent(request.data?.speedInfluencePercent);
  const playerDisplayMode = rules.normalizePlayerDisplayMode(request.data?.playerDisplayMode);

  await db.collection(LIVE_CHALLENGE_EXPERIENCE).doc(roomId).set({
    roomId, teacherEmail, speedInfluencePercent, playerDisplayMode, updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const privatePlayersSnapshot = await db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).collection('players').get();
  const records = await Promise.all(privatePlayersSnapshot.docs.map(async (playerDoc) => {
    const player = playerDoc.data() || {};
    const studentId = String(player.studentId || playerDoc.id || '').trim();
    const codeAlias = String(player.codeAlias || player.alias || 'MathMaster Player').trim() || 'MathMaster Player';
    const [studentSnapshot, inviteSnapshot, publicSnapshot] = await Promise.all([
      studentId ? db.collection(GRADES).doc(studentId).get() : Promise.resolve(null),
      studentId ? db.collection(LIVE_CHALLENGE_INVITES).doc(studentId).get() : Promise.resolve(null),
      player.playerKey ? db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId).collection('players').doc(String(player.playerKey)).get() : Promise.resolve(null),
    ]);
    const student = studentSnapshot?.exists ? studentSnapshot.data() || {} : {};
    return {
      privateRef: playerDoc.ref,
      codeAlias,
      alias: rules.displayAliasForStudent({ student, mode: playerDisplayMode, codeAlias }),
      inviteRef: inviteSnapshot?.exists && String(inviteSnapshot.data()?.roomId || '') === roomId ? inviteSnapshot.ref : null,
      publicRef: publicSnapshot?.exists ? publicSnapshot.ref : null,
    };
  }));

  for (const chunk of chunksOf(records, 140)) {
    const batch = db.batch();
    chunk.forEach((record) => {
      batch.set(record.privateRef, { alias: record.alias, codeAlias: record.codeAlias, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (record.inviteRef) batch.set(record.inviteRef, { alias: record.alias, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (record.publicRef) batch.set(record.publicRef, { alias: record.alias, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    await batch.commit();
  }

  return { roomId, speedInfluencePercent, playerDisplayMode, playersConfigured: records.length };
});

/**
 * One score-adjustment primitive is shared by the synchronous submit wrapper
 * and the Firestore retry/fallback trigger. The round marker means either path
 * may win the race without ever double-paying speed.
 */
const applyExperienceSpeedAdjustment = async ({ db, roomId, studentId, answeredRound, originalSpeedBonus }) => {
  const [config, privateRoomSnapshot] = await Promise.all([
    readExperience(db, roomId),
    db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).get(),
  ]);
  const privateRoom = privateRoomSnapshot.exists ? privateRoomSnapshot.data() || {} : {};
  if (Object.prototype.hasOwnProperty.call(privateRoom.secondChanceOf || {}, String(answeredRound))) {
    return { adjustment: 0, secondChance: true, totalScore: null };
  }

  const rules = await experienceRules();
  const requestedAdjustment = rules.experienceScoreAdjustment({
    originalSpeedBonus,
    speedInfluencePercent: config.speedInfluencePercent,
    secondChance: false,
  });
  const privatePlayerRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).collection('players').doc(studentId);

  return db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(privatePlayerRef);
    if (!currentSnapshot.exists) return { adjustment: 0, totalScore: null, missing: true };
    const current = currentSnapshot.data() || {};
    if (Number(current.answeredRound) !== Number(answeredRound)) return { adjustment: 0, totalScore: Number(current.score) || 0, stale: true };
    if (Number(current.experienceSpeedAdjustedRound) === Number(answeredRound)) {
      return {
        adjustment: Math.round(Number(current.experienceSpeedAdjustment) || 0),
        totalScore: Math.max(0, Math.round(Number(current.score) || 0)),
        alreadyAdjusted: true,
      };
    }

    const playerKey = String(current.playerKey || '').trim();
    const publicRef = playerKey ? db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId).collection('players').doc(playerKey) : null;
    const publicSnapshot = publicRef ? await transaction.get(publicRef) : null;
    const nextScore = Math.max(0, Math.round(Number(current.score) || 0) + requestedAdjustment);

    // All reads are complete before these writes; Firestore transactions reject
    // a read performed after the first write.
    transaction.set(privatePlayerRef, {
      score: nextScore,
      experienceSpeedAdjustedRound: Number(answeredRound),
      experienceSpeedAdjustment: requestedAdjustment,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (publicRef && publicSnapshot?.exists) {
      transaction.set(publicRef, { score: nextScore, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { adjustment: requestedAdjustment, totalScore: nextScore };
  });
};

/**
 * Override only the exported transport, not the mature grader. The legacy
 * callable still grades and writes the answer first; this wrapper immediately
 * scales its known `speedBonus` before returning to the Chromebook, so the
 * student sees the same configured score the leaderboard stores.
 */
const legacySubmitLiveChallengeResponse = base.submitLiveChallengeResponse;
exports.submitLiveChallengeResponse = onCall(async (request) => {
  const result = await legacySubmitLiveChallengeResponse.run(request);
  if (!result?.isCorrect || result?.secondChance === true || !Number(result?.speedBonus)) return result;

  const roomId = String(request.data?.roomId || '').trim();
  const studentId = String(request.auth?.token?.studentId || '').trim();
  const answeredRound = Number(request.data?.roundIndex);
  if (!roomId || !studentId || !Number.isInteger(answeredRound)) return result;

  try {
    const applied = await applyExperienceSpeedAdjustment({
      db: getFirestore(), roomId, studentId, answeredRound, originalSpeedBonus: Number(result.speedBonus) || 0,
    });
    const adjustment = Math.round(Number(applied.adjustment) || 0);
    return {
      ...result,
      speedBonus: Math.max(0, Math.round(Number(result.speedBonus) || 0) + adjustment),
      pointsAwarded: Math.max(0, Math.round(Number(result.pointsAwarded) || 0) + adjustment),
      totalScore: applied.totalScore == null
        ? Math.max(0, Math.round(Number(result.totalScore) || 0) + adjustment)
        : Math.max(0, Math.round(Number(applied.totalScore) || 0)),
    };
  } catch (error) {
    // The mathematical answer is already safely recorded by the mature submit
    // callable. Never turn a recorded correct answer into a client-visible
    // submit failure merely because the game bonus adjustment had a transient
    // problem; the fallback trigger below will retry the score correction.
    console.error('Live Challenge speed adjustment will fall back to trigger:', error);
    return result;
  }
});

/**
 * Retry/fallback for a base player write. Normally the synchronous wrapper above
 * has already marked the round before this trigger executes. If Functions is
 * retried or the wrapper's adjustment write had a transient failure, this path
 * reaches the same idempotent primitive and repairs the stored leaderboard.
 */
exports.adjustLiveChallengeExperienceScore = onDocumentWritten(
  `${LIVE_CHALLENGE_PRIVATE}/{roomId}/players/{studentId}`,
  async (event) => {
    const beforeSnapshot = event.data?.before;
    const afterSnapshot = event.data?.after;
    if (!beforeSnapshot?.exists || !afterSnapshot?.exists) return null;
    const before = beforeSnapshot.data() || {};
    const after = afterSnapshot.data() || {};
    const answeredRound = Number(after.answeredRound);
    if (!Number.isInteger(answeredRound) || answeredRound < 0) return null;
    if (Number(before.answeredRound) === answeredRound) return null;
    if (Number(after.experienceSpeedAdjustedRound) === answeredRound) return null;
    if (after.lastAnswerCorrect !== true) return null;

    const scoreDelta = Math.max(0, Math.round(Number(after.score) || 0) - Math.round(Number(before.score) || 0));
    const streakAfter = Math.max(0, Math.round(Number(after.streak) || 0));
    const streakBonus = Math.min(100, Math.max(0, streakAfter - 1) * 25);
    const comebackBonus = before.lastAnswerCorrect === false ? 150 : 0;
    const originalSpeedBonus = Math.max(0, Math.min(100, scoreDelta - 1000 - streakBonus - comebackBonus));
    if (!originalSpeedBonus) return null;

    const roomId = String(event.params?.roomId || '').trim();
    const studentId = String(event.params?.studentId || '').trim();
    if (!roomId || !studentId) return null;
    return applyExperienceSpeedAdjustment({ db: getFirestore(), roomId, studentId, answeredRound, originalSpeedBonus });
  },
);
