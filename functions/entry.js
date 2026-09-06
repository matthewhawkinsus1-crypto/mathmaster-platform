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

// --- Assignment V5 Honors-depth Gemini --------------------------------------
// This endpoint is intentionally separate from the mature OpenAI assignment
// callables in index.js. Only the audited Honors repair prompt may enter here,
// and the Gemini secret is bound only to this function.
const {
  HONORS_ASSIGNMENT_AI_SECRETS,
  readGeminiApiKey,
} = require('./lib/config');
const { AssignmentAiError } = require('./lib/assignmentAi');
const {
  DEFAULT_GEMINI_ASSIGNMENT_MODEL,
  callGeminiAssignmentAuthor,
} = require('./lib/geminiAssignmentAi');

exports.authorHonorsAssignmentWithGemini = onCall({
  secrets: HONORS_ASSIGNMENT_AI_SECRETS,
  timeoutSeconds: 300,
  memory: '1GiB',
}, async (request) => {
  const ASSIGNMENT_AI_USAGE_COLLECTION = 'assignmentAiUsage';
  const ASSIGNMENT_AI_MIN_INTERVAL_MS = 12 * 1000;
  const ASSIGNMENT_AI_DAILY_LIMIT = 50;
  const ASSIGNMENT_AI_REFUNDABLE_CODES = new Set([
    'failed-precondition',
    'unavailable',
    'deadline-exceeded',
    'resource-exhausted',
  ]);

  const teacherUid = String(request.auth?.uid || '').trim();
  if (!teacherUid) throw new HttpsError('unauthenticated', 'Sign in before using MathMaster AI.');
  if (request.auth?.token?.role !== 'teacher') {
    throw new HttpsError('permission-denied', 'Teacher access is required to build Honors depth.');
  }
  const teacherEmail = String(request.auth?.token?.email || '').trim().toLowerCase() || null;
  const prompt = String(request.data?.prompt || '').trim();
  if (!prompt) throw new HttpsError('invalid-argument', 'Finish the Honors-depth repair request before building with AI.');
  if (!prompt.startsWith('# MathMaster Honors-depth repair')) {
    throw new HttpsError('invalid-argument', 'This Gemini endpoint accepts only MathMaster Honors-depth repair requests.');
  }

  const db = getFirestore();
  const usageRef = db.collection(ASSIGNMENT_AI_USAGE_COLLECTION).doc(teacherUid);
  let reservation = null;

  try {
    reservation = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(usageRef);
      const data = snapshot.exists ? (snapshot.data() || {}) : {};
      const lastStartedAt = data.lastStartedAt;
      const previous = typeof lastStartedAt?.toMillis === 'function'
        ? lastStartedAt.toMillis()
        : (typeof lastStartedAt?.toDate === 'function' ? lastStartedAt.toDate().getTime() : Number(lastStartedAt) || 0);
      const now = Date.now();
      const dayKey = new Date(now).toISOString().slice(0, 10);
      if (previous && now - previous < ASSIGNMENT_AI_MIN_INTERVAL_MS) {
        throw new HttpsError('resource-exhausted', 'An assignment is already being built. Wait a few seconds before starting another one.');
      }
      const dayCount = data.dayKey === dayKey ? Math.max(0, Number(data.dayCount) || 0) : 0;
      if (dayCount >= ASSIGNMENT_AI_DAILY_LIMIT) {
        throw new HttpsError('resource-exhausted', "This teacher account reached MathMaster's daily AI assignment-build limit. Use the copy/paste AI workflow or try again tomorrow.");
      }
      transaction.set(usageRef, {
        dayKey,
        dayCount: dayCount + 1,
        lastStartedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return { dayKey, dayCount: dayCount + 1 };
    });

    const result = await callGeminiAssignmentAuthor({
      apiKey: readGeminiApiKey(),
      prompt,
      model: DEFAULT_GEMINI_ASSIGNMENT_MODEL,
    });

    await db.collection('assignmentAiAudit').add({
      teacherUid,
      teacherEmail,
      provider: 'gemini',
      outcome: 'success',
      surface: 'honorsDepthRepair',
      mode: 'assignment',
      model: result.model,
      responseId: result.responseId,
      usage: result.usage || null,
      diagnostics: result.diagnostics || null,
      promptCharacters: prompt.length,
      createdAt: FieldValue.serverTimestamp(),
    });
    return result;
  } catch (error) {
    let translated;
    if (error instanceof HttpsError) {
      translated = error;
    } else if (error instanceof AssignmentAiError) {
      translated = new HttpsError(
        error.code || 'internal',
        error.message || 'MathMaster Honors AI could not complete this repair.',
        error.details || undefined,
      );
    } else if (/GEMINI_API_KEY\s+is not configured/i.test(String(error?.message || error || ''))) {
      translated = new HttpsError(
        'failed-precondition',
        'MathMaster Honors AI is not configured on this Firebase deployment. Set GEMINI_API_KEY in Firebase Secret Manager and redeploy authorHonorsAssignmentWithGemini.',
      );
    } else {
      console.error('Gemini Honors Assignment AI failed:', error);
      translated = new HttpsError(
        'internal',
        'MathMaster Honors AI hit a server error. Nothing was changed; use the outside-AI import option while the server configuration is checked.',
      );
    }

    const code = String(translated?.code || '').replace(/^functions\//, '');
    const refundable = Boolean(reservation && ASSIGNMENT_AI_REFUNDABLE_CODES.has(code));
    if (refundable) {
      try {
        await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(usageRef);
          if (!snapshot.exists) return;
          const data = snapshot.data() || {};
          if (data.dayKey !== reservation.dayKey) return;
          const dayCount = Math.max(0, Number(data.dayCount) || 0);
          if (!dayCount) return;
          transaction.set(usageRef, {
            dayCount: dayCount - 1,
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        });
      } catch (refundError) {
        console.warn('Could not refund a Gemini Honors AI usage reservation:', refundError?.message || String(refundError));
      }
    }

    if (reservation) {
      try {
        await db.collection('assignmentAiAudit').add({
          teacherUid,
          teacherEmail,
          provider: 'gemini',
          outcome: 'failure',
          surface: 'honorsDepthRepair',
          mode: 'assignment',
          model: DEFAULT_GEMINI_ASSIGNMENT_MODEL,
          code,
          diagnostics: error instanceof AssignmentAiError ? (error.details || null) : null,
          message: String(translated?.message || '').slice(0, 500),
          promptCharacters: prompt.length,
          refunded: refundable,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (auditError) {
        console.warn('Could not write Gemini Honors AI failure audit:', auditError?.message || String(auditError));
      }
    }
    throw translated;
  }
});
