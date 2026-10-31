"use strict";
const { createHash } = require("node:crypto");
const { runtimeIncludedQuestionIndices, runtimeIncludedQuestionIndicesForSection } = require("./assignmentRuntime");
const { ROOT_ADMIN_EMAIL } = require("./auth");
const EVENTS = "accommodationAdjustments";
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const id = (value) => typeof value === "string" && /^[A-Za-z0-9._-]{1,100}$/.test(value);

async function projectCorrectionTracker(tracker, overrides) {
  const { overrideAppliesToRecord } = await import("../shared/responseInspector.mjs");
  return Object.fromEntries(Object.entries(tracker || {}).map(([index, record]) => {
    const override = overrides?.[index];
    if (!record || !overrideAppliesToRecord(record, override)) return [index, record];
    const score = Math.max(0, Math.min(100, Number(override.score)));
    return [index, { ...record, trackerStatusBeforeOverride: record.status, status: score >= 100 ? 'correct' : 'attempted', partialCredit: score, bestPartialCredit: score }];
  }));
}

async function readPracticeWaiver({ db, transaction = null, studentId, gradeData, assignment }) {
  if (!gradeData.classId) return [];
  const rewards = await import("../shared/classPointRewards.mjs");
  const ref = db.collection("classPointRewardRedemptions").doc(rewards.practicePassRedemptionId({ studentId, classId: gradeData.classId, assignmentId: assignment.id, rewardCode: rewards.PRACTICE_PASS_REWARD_CODE }));
  const snapshot = transaction ? await transaction.get(ref) : await ref.get();
  return rewards.isActivePracticePassRedemption(snapshot.exists ? snapshot.data() : null)
    ? runtimeIncludedQuestionIndicesForSection(assignment, "practice") : [];
}

async function gradeInputFingerprint({ assignment, gradeData, practiceWaived }) {
  const { stableWorkloadValue } = await import("../shared/workloadCorrection.mjs");
  const { workloadCorrections: _corrections, ...profile } = gradeData.profile || {};
  return digest(stableWorkloadValue({ assignment, profile, tracker: gradeData.gradesByAssignment?.[assignment.id] || null,
    overrides: gradeData.teacherGradeOverridesByAssignment?.[assignment.id] || null,
    recovery: gradeData.sectionRecoveryByAssignment?.[assignment.id] || null,
    challenge: gradeData.warmupChallengeByAssignment?.[assignment.id] || null, practiceWaived }));
}

/** Every automatic Classroom path must respect an unsynced or stale correction. */
async function correctionSyncAllowed({ db, studentId, gradeData, assignment }) {
  const correction = gradeData?.profile?.workloadCorrections?.[assignment.id];
  // Firestore can deliver an old event after approval/reversal. In particular,
  // an event from before the first correction has no correction to guard.
  const liveSnapshot = await db.collection("grades").doc(studentId).get();
  if (!liveSnapshot.exists) return false;
  const liveData = liveSnapshot.data();
  const liveCorrection = liveData.profile?.workloadCorrections?.[assignment.id];
  if (!correction && !liveCorrection) return true;
  if (!correction || correction.eventId !== liveCorrection?.eventId) return false;
  const authorization = correction.syncAuthorization;
  if (authorization?.eventId !== correction.eventId
    || liveCorrection.syncAuthorization?.inputFingerprint !== authorization.inputFingerprint
    || liveCorrection.syncAuthorization?.eventId !== correction.eventId) return false;
  const liveAssignmentSnapshot = await db.collection("assignments").doc(assignment.id).get();
  if (!liveAssignmentSnapshot.exists) return false;
  const liveAssignment = { ...liveAssignmentSnapshot.data(), id: assignment.id };
  const practiceWaived = await readPracticeWaiver({ db, studentId, gradeData: liveData, assignment: liveAssignment });
  const [eventFingerprint, liveFingerprint] = await Promise.all([
    gradeInputFingerprint({ assignment, gradeData, practiceWaived }),
    gradeInputFingerprint({ assignment: liveAssignment, gradeData: liveData, practiceWaived }),
  ]);
  return authorization.inputFingerprint === eventFingerprint && eventFingerprint === liveFingerprint;
}

function createRetroactiveAccommodationService({ db, FieldPath, FieldValue, HttpsError, gradeFor, now = Date.now }) {
  const fail = (code, message) => { throw new HttpsError(code, message); };
  return async function review(request) {
    if (!request.auth) fail("unauthenticated", "Sign in as the student's teacher.");
    const email = String(request.auth.token?.email || "").trim().toLowerCase();
    if (request.auth.token?.role !== "teacher" || !email || request.auth.token?.email_verified === false) fail("permission-denied", "Only the student's verified teacher may review corrections.");
    const data = request.data || {};
    const studentId = data.studentId;
    if (!id(studentId)) fail("invalid-argument", "Choose a valid student.");
    const action = String(data.action || "preview");
    const previewing = action === "preview" || action === "previewReversal";
    if (!["preview", "previewReversal", "approve", "reverse", "requestSync", "history"].includes(action)) fail("invalid-argument", "Unknown review action.");
    const assignmentIds = previewing && Array.isArray(data.assignmentIds) ? [...new Set(data.assignmentIds)] : [data.assignmentId];
    if (!assignmentIds.length || assignmentIds.length > 50 || assignmentIds.some((key) => !id(key))) fail("invalid-argument", "Choose up to 50 assignments per preview.");
    const rows = [];
    for (const assignmentId of assignmentIds) {
      // One row is approved per transaction: there is deliberately no bulk apply.
      // eslint-disable-next-line no-await-in-loop
      const result = await db.runTransaction(async (tx) => {
        const gradeRef = db.collection("grades").doc(studentId);
        const [gradeSnap, assignmentSnap] = await Promise.all([tx.get(gradeRef), tx.get(db.collection("assignments").doc(assignmentId))]);
        if (!gradeSnap.exists || !assignmentSnap.exists) fail("not-found", "Student or assignment not found.");
        const gradeData = gradeSnap.data();
        const assignment = { ...assignmentSnap.data(), id: assignmentId };
        const classSnap = gradeData.classId ? await tx.get(db.collection("classes").doc(gradeData.classId)) : null;
        if (email !== ROOT_ADMIN_EMAIL && (!classSnap?.exists || String(classSnap.data().teacherOfRecord || "").trim().toLowerCase() !== email)) fail("permission-denied", "Only the student's teacher of record may review corrections.");
        const audience = assignment.assignedClassIds || assignment.classIds || [assignment.classId];
        if (assignment.classId || assignment.classIds?.length || assignment.assignedClassIds?.length) {
          if (!audience.includes(gradeData.classId)) fail("permission-denied", "Assignment is outside this student's class.");
        } else if (!assignment.classPeriod || assignment.classPeriod !== gradeData.classPeriod) fail("permission-denied", "Assignment audience cannot be verified.");
        const eventCollection = gradeRef.collection(EVENTS);
        if (action === "history") {
          const snap = await tx.get(eventCollection.where("assignmentId", "==", assignmentId).limit(100));
          const syncs = await tx.get(db.collection("classroomGradeSyncs").where("studentId", "==", studentId).limit(200));
          const currentId = gradeData.profile?.workloadCorrections?.[assignmentId]?.eventId;
          const statuses = syncs.docs.map((s) => s.data()).filter((s) => s.assignmentId === assignmentId && s.correctionEventId === currentId);
          return { assignmentId, events: snap.docs.map((s) => ({ id: s.id, ...s.data() })).sort((a, b) => String(a.at).localeCompare(String(b.at))),
            incomplete: snap.size >= 100 || syncs.size >= 200,
            deliveryStatus: statuses.length ? [...new Set(statuses.map((s) => `${s.sectionKey || 'whole'}: ${s.status}`))].join('; ') : null };
        }
        const current = gradeData.profile?.workloadCorrections?.[assignmentId] || null;
        const practiceWaived = await readPracticeWaiver({ db, transaction: tx, studentId, gradeData, assignment });
        const inputFingerprint = await gradeInputFingerprint({ assignment, gradeData, practiceWaived });
        const { previewRetroactiveSelection } = await import("../shared/retroactiveAccommodation.mjs");
        const { workloadContentKey } = await import("../shared/workloadCorrection.mjs");
        const reversing = action === "previewReversal" || action === "reverse";
        const parentSnap = current?.eventId ? await tx.get(eventCollection.doc(current.eventId)) : null;
        const parent = parentSnap?.exists ? parentSnap.data() : null;
        if (action === "requestSync") {
          if (!current || data.eventId !== current.eventId || !parent || current.contentKey !== workloadContentKey(assignment) || parent.inputFingerprint !== inputFingerprint) fail("failed-precondition", "Correction or grade inputs changed. Preview again before requesting sync.");
          if (current.syncAuthorization?.eventId === current.eventId && current.syncAuthorization.inputFingerprint === inputFingerprint) return { status: "requested", duplicate: true, eventId: current.eventId };
          if (!id(data.requestId)) fail("invalid-argument", "A request id is required.");
          const syncId = digest([studentId, assignmentId, current.eventId, "sync", inputFingerprint]);
          const syncRef = eventCollection.doc(syncId);
          const existing = await tx.get(syncRef);
          if (existing.exists) return { status: "requested", duplicate: true, eventId: current.eventId };
          const at = new Date(now()).toISOString();
          tx.set(syncRef, { kind: "retroactive-grade-correction", action: "sync-requested", studentId, assignmentId, correctionEventId: current.eventId, actorUid: request.auth.uid, actorEmail: email, at, inputFingerprint, exportLink: `classroomReleaseSignals/${assignmentId}` });
          tx.update(gradeRef, new FieldPath("classroomReleaseSignals", assignmentId), { requestedAt: at, reason: "manual-retry", source: "retroactive-accommodation", correctionEventId: current.eventId, correctionInputFingerprint: inputFingerprint });
          tx.update(gradeRef, new FieldPath("profile", "workloadCorrections", assignmentId, "syncAuthorization"), { eventId: current.eventId, inputFingerprint, at });
          return { status: "requested", eventId: current.eventId, syncEventId: syncId };
        }
        if (!previewing && !id(data.requestId)) fail("invalid-argument", "A request id is required.");
        const eventId = previewing ? null : digest([studentId, assignmentId, request.auth.uid, data.requestId, action]);
        const eventRef = eventId ? eventCollection.doc(eventId) : null;
        if (eventRef) { const prior = await tx.get(eventRef); if (prior.exists) return { eventId, duplicate: true, status: "applied" }; }
        if (reversing && (!parent || current?.active !== true)) fail("failed-precondition", "There is no active correction to reverse.");
        let selection;
        try { selection = previewRetroactiveSelection({ assignment, gradeData, request: reversing ? parent.policy : data.input, nowValue: now(), includedIndices: runtimeIncludedQuestionIndices(assignment), practiceWaived }); }
        catch (error) { fail("invalid-argument", error.message); }
        const beforeProfile = gradeData.profile || {};
        const proposed = reversing ? (parent.previousProjection ? { ...parent.previousProjection } : { active: false }) : {
          active: true, contentKey: selection.contentKey, percent: selection.policy.percent,
          requiredIndices: selection.proposedRequiredIndices, omittedIndices: selection.omittedIndices,
          originalCount: selection.originalCount, actualPercentTenths: selection.actualPercentTenths, variance: selection.variance,
        };
        const candidate = { ...gradeData, profile: { ...beforeProfile, workloadCorrections: { ...beforeProfile.workloadCorrections, [assignmentId]: proposed } } };
        if (Object.values(gradeData.sectionRecoveryByAssignment?.[assignmentId] || {}).some((entry) => entry?.status === "held")) { selection.status = "manual-review"; selection.reasons.push("A held Recovery requires manual resolution first."); }
        // Unresolved historical content cannot support an automatic grade
        // estimate either. Keep manual-review rows explicitly ungraded.
        const previousGrade = selection.status === "eligible" ? await gradeFor({ assignment, gradeData, practiceWaived }) : null;
        const proposedGrade = selection.status === "eligible" ? await gradeFor({ assignment, gradeData: candidate, practiceWaived }) : null;
        if (reversing) {
          const { resolveStudentWorkload } = await import("../shared/reducedWorkload.mjs");
          const restored = resolveStudentWorkload({ assignment, profile: candidate.profile, tracker: gradeData.gradesByAssignment?.[assignmentId], baseIndices: runtimeIncludedQuestionIndices(assignment).filter((i) => !practiceWaived.includes(i)), nowValue: now() });
          selection.proposedRequiredIndices = restored.indices;
          selection.proposedRequiredCount = restored.indices.length;
          selection.omittedIndices = restored.omitted;
          selection.actualPercentTenths = restored.summary?.actualPercentTenths || 0;
        }
        const requiresSecondConfirmation = selection.policyDiscrepancy || (previousGrade !== null && proposedGrade !== null && proposedGrade < previousGrade);
        const previewToken = digest([request.auth.uid, email, studentId, assignmentId, inputFingerprint, current?.eventId || null, selection.policy, proposed, reversing]);
        const row = { ...selection, previousGrade, proposedGrade, requiresSecondConfirmation, previewToken, correctionEventId: current?.eventId || null, syncStatus: current?.syncAuthorization?.eventId === current?.eventId && current ? "requested" : "not-requested" };
        if (previewing) return row;
        if (selection.status !== "eligible") fail("failed-precondition", "Manual review needed or assignment outside the historical range.");
        if (data.previewToken !== previewToken) fail("failed-precondition", "Grade inputs changed. Preview this row again.");
        if (data.confirmAuthority !== true || data.confirmSelected !== true) fail("failed-precondition", "Confirm your authority and this selected assignment.");
        if (requiresSecondConfirmation && data.confirmDecrease !== true) fail("failed-precondition", "A second confirmation is required for a decrease or policy discrepancy.");
        const at = new Date(now()).toISOString();
        const projection = { ...proposed, contentKey: workloadContentKey(assignment), eventId, approvedAt: at, previousGrade, appliedGrade: proposedGrade };
        tx.set(eventRef, { schemaVersion: 1, kind: "retroactive-grade-correction", action, studentId, assignmentId,
          actorUid: request.auth.uid, actorEmail: email, at, createdAt: FieldValue.serverTimestamp(),
          sourceDescriptor: selection.policy.sourceDescriptor, policy: selection.policy, dueDate: selection.dueDate,
          previousGrade, proposedGrade, appliedGrade: proposedGrade, originalCount: selection.originalCount,
          previousRequiredCount: selection.previousRequiredCount, proposedRequiredCount: selection.proposedRequiredCount,
          appliedRequiredCount: selection.proposedRequiredCount, omittedCount: selection.omittedIndices.length,
          previousRequiredIndices: selection.previousRequiredIndices, proposedRequiredIndices: selection.proposedRequiredIndices,
          actualPercentTenths: selection.actualPercentTenths, affectedRoles: selection.affectedRoles,
          previousProjection: current, appliedProjection: projection, previousEventId: current?.eventId || null,
          inputFingerprint, contentKey: selection.contentKey, previewToken,
          confirmations: { authority: true, selected: true, second: data.confirmDecrease === true }, exportLink: `classroomReleaseSignals/${assignmentId}` });
        tx.update(gradeRef, new FieldPath("profile", "workloadCorrections", assignmentId), projection);
        return { status: "applied", eventId, grade: proposedGrade };
      });
      rows.push(result);
    }
    return previewing || action === "history" ? { rows } : rows[0];
  };
}
module.exports = { createRetroactiveAccommodationService, correctionSyncAllowed, gradeInputFingerprint, readPracticeWaiver, projectCorrectionTracker };
