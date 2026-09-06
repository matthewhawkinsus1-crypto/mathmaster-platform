// Additive Cloud Functions entry point for Live Challenge Option B.
//
// `index.js` remains the mature MathMaster backend. Re-exporting it first keeps
// every existing callable/trigger name intact while this small file owns only
// the new Live Challenge experience seam. That is intentionally lower risk than
// splicing another feature block into the large production entry file.

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
  if (!request?.auth) {
    throw new HttpsError('unauthenticated', 'Sign in before changing a Live Challenge.');
  }
  if (request.auth.token?.role !== 'teacher') {
    throw new HttpsError('permission-denied', 'Only a teacher can change a Live Challenge.');
  }
  const token = request.auth.token || {};
  const email = String(token.email || '').trim().toLowerCase();
  if (!email || token.email_verified === false) {
    throw new HttpsError('permission-denied', 'A verified teacher email is required.');
  }
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

const defaultExperience = Object.freeze({
  speedInfluencePercent: 20,
  playerDisplayMode: 'codeName',
});

/**
 * Read a teacher-owned room's experience configuration.
 *
 * The configuration lives in a server-only collection because students need
 * only the resulting public alias/score, not a roster identity policy or a
 * second source of scoring truth.
 */
exports.getLiveChallengeExperience = onCall(async (request) => {
  const db = getFirestore();
  const roomId = String(request.data?.roomId || '').trim();
  await ownedRoom({ db, request, roomId });
  const snapshot = await db.collection(LIVE_CHALLENGE_EXPERIENCE).doc(roomId).get();
  const raw = snapshot.exists ? snapshot.data() || {} : {};
  const rules = await experienceRules();
  return {
    roomId,
    speedInfluencePercent: rules.normalizeSpeedInfluencePercent(raw.speedInfluencePercent),
    playerDisplayMode: rules.normalizePlayerDisplayMode(raw.playerDisplayMode),
  };
});

const chunksOf = (items, size) => {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
};

/**
 * Apply public-name and speed settings to one teacher-owned room.
 *
 * Generated code names are preserved as `codeAlias`, so a teacher can switch
 * back to anonymous play without creating a new room. A public player document
 * is updated only if it already exists: configuring a lobby must never make an
 * unjoined student appear publicly.
 */
exports.configureLiveChallengeExperience = onCall(async (request) => {
  const db = getFirestore();
  const roomId = String(request.data?.roomId || '').trim();
  const { teacherEmail } = await ownedRoom({ db, request, roomId });
  const rules = await experienceRules();
  const speedInfluencePercent = rules.normalizeSpeedInfluencePercent(request.data?.speedInfluencePercent);
  const playerDisplayMode = rules.normalizePlayerDisplayMode(request.data?.playerDisplayMode);

  const configRef = db.collection(LIVE_CHALLENGE_EXPERIENCE).doc(roomId);
  await configRef.set({
    roomId,
    teacherEmail,
    speedInfluencePercent,
    playerDisplayMode,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const privatePlayersRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).collection('players');
  const privatePlayersSnapshot = await privatePlayersRef.get();
  const records = await Promise.all(privatePlayersSnapshot.docs.map(async (playerDoc) => {
    const player = playerDoc.data() || {};
    const studentId = String(player.studentId || playerDoc.id || '').trim();
    const codeAlias = String(player.codeAlias || player.alias || 'MathMaster Player').trim() || 'MathMaster Player';
    const [studentSnapshot, inviteSnapshot, publicSnapshot] = await Promise.all([
      studentId ? db.collection(GRADES).doc(studentId).get() : Promise.resolve(null),
      studentId ? db.collection(LIVE_CHALLENGE_INVITES).doc(studentId).get() : Promise.resolve(null),
      player.playerKey
        ? db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId).collection('players').doc(String(player.playerKey)).get()
        : Promise.resolve(null),
    ]);
    const student = studentSnapshot?.exists ? studentSnapshot.data() || {} : {};
    const alias = rules.displayAliasForStudent({ student, mode: playerDisplayMode, codeAlias });
    return {
      privateRef: playerDoc.ref,
      studentId,
      playerKey: player.playerKey ? String(player.playerKey) : '',
      codeAlias,
      alias,
      inviteRef: inviteSnapshot?.exists && String(inviteSnapshot.data()?.roomId || '') === roomId
        ? inviteSnapshot.ref
        : null,
      publicRef: publicSnapshot?.exists ? publicSnapshot.ref : null,
    };
  }));

  // At most three writes per student. Keep each batch comfortably below
  // Firestore's 500-write cap even for an unusually large merged class.
  for (const chunk of chunksOf(records, 140)) {
    const batch = db.batch();
    chunk.forEach((record) => {
      batch.set(record.privateRef, {
        alias: record.alias,
        codeAlias: record.codeAlias,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (record.inviteRef) {
        batch.set(record.inviteRef, { alias: record.alias, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      if (record.publicRef) {
        batch.set(record.publicRef, { alias: record.alias, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    });
    await batch.commit();
  }

  return {
    roomId,
    speedInfluencePercent,
    playerDisplayMode,
    playersConfigured: records.length,
  };
});

/**
 * Scale only the legacy scorer's speed component after a finalized answer.
 *
 * The existing submit callable is intentionally unchanged. It remains the sole
 * grader and continues to award the mature 1,000 correctness + 100 speed +
 * streak/comeback/recovery score. This trigger observes that authoritative
 * result and changes only the speed slice to the teacher-selected percentage.
 *
 * `experienceSpeedAdjustedRound` makes the write idempotent: Firestore may
 * retry a trigger and this trigger also causes one follow-up player write of its
 * own, but neither can pay the adjustment twice.
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
    // Speed is paid only by the existing scorer for fully correct ordinary
    // rounds. Partial/wrong answers have no speed component to scale.
    if (after.lastAnswerCorrect !== true) return null;

    const roomId = String(event.params?.roomId || '').trim();
    const studentId = String(event.params?.studentId || '').trim();
    if (!roomId || !studentId) return null;

    const db = getFirestore();
    const [configSnapshot, privateRoomSnapshot] = await Promise.all([
      db.collection(LIVE_CHALLENGE_EXPERIENCE).doc(roomId).get(),
      db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).get(),
    ]);
    const config = configSnapshot.exists ? configSnapshot.data() || {} : defaultExperience;
    const privateRoom = privateRoomSnapshot.exists ? privateRoomSnapshot.data() || {} : {};
    const secondChanceOf = privateRoom.secondChanceOf || {};
    const isSecondChance = Object.prototype.hasOwnProperty.call(secondChanceOf, String(answeredRound));
    if (isSecondChance) return null;

    const scoreDelta = Math.max(0, Math.round(Number(after.score) || 0) - Math.round(Number(before.score) || 0));
    const streakAfter = Math.max(0, Math.round(Number(after.streak) || 0));
    const streakBonus = Math.min(100, Math.max(0, streakAfter - 1) * 25);
    const comebackBonus = before.lastAnswerCorrect === false ? 150 : 0;
    const originalSpeedBonus = Math.max(0, Math.min(100, scoreDelta - 1000 - streakBonus - comebackBonus));
    const rules = await experienceRules();
    const adjustment = rules.experienceScoreAdjustment({
      originalSpeedBonus,
      speedInfluencePercent: config.speedInfluencePercent,
      secondChance: false,
    });

    const privatePlayerRef = db.collection(LIVE_CHALLENGE_PRIVATE).doc(roomId).collection('players').doc(studentId);
    await db.runTransaction(async (transaction) => {
      const currentSnapshot = await transaction.get(privatePlayerRef);
      if (!currentSnapshot.exists) return;
      const current = currentSnapshot.data() || {};
      if (Number(current.answeredRound) !== answeredRound) return;
      if (Number(current.experienceSpeedAdjustedRound) === answeredRound) return;

      const nextScore = Math.max(0, Math.round(Number(current.score) || 0) + adjustment);
      transaction.set(privatePlayerRef, {
        score: nextScore,
        experienceSpeedAdjustedRound: answeredRound,
        experienceSpeedAdjustment: adjustment,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const playerKey = String(current.playerKey || '').trim();
      if (playerKey) {
        const publicRef = db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId).collection('players').doc(playerKey);
        const publicSnapshot = await transaction.get(publicRef);
        if (publicSnapshot.exists) {
          transaction.set(publicRef, {
            score: nextScore,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
      }
    });

    return { roomId, studentId, answeredRound, adjustment };
  },
);
