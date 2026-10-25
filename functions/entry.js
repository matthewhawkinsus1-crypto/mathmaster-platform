// Additive Cloud Functions entry point for Live Challenge Option B.
//
// `index.js` remains the mature MathMaster backend. Re-exporting it first keeps
// every existing callable/trigger name intact while this small file owns only
// the new Live Challenge experience seam.

const base = require('./index.js');
Object.assign(exports, base);

const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');

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
  const { teacherEmail, room } = await ownedRoom({ db, request, roomId });
  // A finished or cancelled game's settings are history, and its private
  // player state is deleted by its finalization: rewriting those rows here
  // would recreate them after the cleanup.
  if (room.status === 'finished' || room.status === 'cancelled') {
    throw new HttpsError('failed-precondition', 'That Live Challenge has ended; its settings can no longer change.');
  }
  const rules = await experienceRules();
  const speedInfluencePercent = rules.normalizeSpeedInfluencePercent(request.data?.speedInfluencePercent);
  const playerDisplayMode = rules.normalizePlayerDisplayMode(request.data?.playerDisplayMode);

  await db.collection(LIVE_CHALLENGE_EXPERIENCE).doc(roomId).set({
    roomId, teacherEmail, speedInfluencePercent, playerDisplayMode, updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  // The scoring strategy reads the speed setting from the room itself
  // (liveChallengeScoring.mjs applies it natively at submit time), so the
  // room and the experience record move together.
  await db.collection(LIVE_CHALLENGE_ROOMS).doc(roomId).set({
    speedInfluencePercent, playerDisplayMode, updatedAt: FieldValue.serverTimestamp(),
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
      alias: rules.displayAliasForStudent({
        // With its id, so a name field holding the student's own id is never
        // used as the public alias.
        student: { ...student, studentId },
        mode: playerDisplayMode,
        codeAlias,
      }),
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

/*
 * submitLiveChallengeResponse is exported from index.js unwrapped: it scores
 * with the room's strategy and speed setting and returns the stored numbers
 * directly, so the student's result panel and the leaderboard can never
 * disagree.
 *
 * RETIRED (LC23): `adjustLiveChallengeExperienceScore`, a Firestore trigger on
 * liveChallengePrivate/{roomId}/players/{studentId} that rescaled the speed
 * bonus of a player write from the submit code that scored it on the mature
 * 100-point scale. Since the strategies apply speed natively, every submission
 * has marked its round (`experienceSpeedAdjustedRound`, functions/index.js
 * submitLiveChallengeResponse, the only writer of a player's answeredRound) and
 * the trigger returned before touching it, on every write. Nothing called it.
 *
 * Taking it out of this file does not by itself delete the deployed function.
 * An exact-name release (scripts/release-firebase.mjs deploys the names in the
 * source) never names it, so it stays deployed, harmless; a whole-fleet
 * `firebase deploy --only functions` offers to delete it, and does with
 * --force. To delete it on purpose, once the release that carries this change
 * is live:
 *
 *   firebase functions:delete adjustLiveChallengeExperienceScore --region us-central1 --project mathmaster-aleks
 *
 * KEEP THE MARKER WRITE in submitLiveChallengeResponse until it is gone from
 * production: the deployed trigger reads it, and without it would rescale every
 * correct answer. docs/architecture/live-challenge-engine.md says the same.
 */

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

// --- Answer keys in shadow (D10 Phase 1, P1-4; SI02) -------------------------
// Whenever an assignment is written, its answer keys, accepted answers and
// worked solutions are split out into assignmentKeys/{assignmentId}
// (functions/lib/assignmentKeyShadow.js, functions/shared/assignmentKeySplit.mjs).
// In shadow the assignment keeps every key and nothing reads the copy, so no
// student or teacher sees any change. It writes only when the sections change
// (or its key document is missing or stale), and re-reads the assignment in a
// transaction before writing, so events out of order cannot store old keys.
//
// DEPLOY ORDER: the firestore:rules release that adds the assignmentKeys rule
// first, then this one function by name, outside class hours:
//   node scripts/release-firebase.mjs --execute --only rules
//   node scripts/release-firebase.mjs --execute --only functions --functions shadowAssignmentKeys
// (Were the function to ship first, the catch-all `match /{document=**}` rule
// would still refuse every browser the new collection.)
// ROLLBACK: delete the trigger; nothing reads what it wrote, and every
// assignment still carries its own keys.
//   firebase functions:delete shadowAssignmentKeys --region us-central1 --project mathmaster-aleks
// then remove this export, or the next whole-fleet release recreates it.
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const logger = require('firebase-functions/logger');
const assignmentKeyShadow = require('./lib/assignmentKeyShadow');

exports.shadowAssignmentKeys = onDocumentWritten('assignments/{assignmentId}', async (event) => {
  const assignmentId = String(event.params?.assignmentId || '');
  if (!assignmentId) return;
  try {
    const result = await assignmentKeyShadow.shadowAssignmentKeysOnWrite({
      db: getFirestore(),
      assignmentId,
      after: event.data?.after || null,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    });
    if (result.outcome !== assignmentKeyShadow.SHADOW_OUTCOME.CURRENT) {
      logger.info('Assignment answer-key shadow copy changed', { assignmentId, ...result });
    }
  } catch (error) {
    // Shadow only: a failure changes nothing anyone reads. It is logged, and
    // the next write of this assignment (or the backfill) tries again.
    logger.error('Assignment answer keys could not be stored in shadow', {
      assignmentId,
      message: String(error?.message || error).slice(0, 300),
    });
  }
});
