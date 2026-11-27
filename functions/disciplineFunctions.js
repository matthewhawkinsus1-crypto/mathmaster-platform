"use strict";

/*
 * DISCIPLINE TRACKER (the teacher's roster of violations).
 *
 * A teacher taps a student's violation on a class roster. Each tap is recorded
 * here with the server's time, by the class's teacher of record (or the root
 * administrator), for a student on that class's roster. Everything else
 * follows without them: the district's Campus Violation Tracker form is
 * filled in by the backend after the class period ends
 * (lib/disciplineFormBatch.js), family messages are drafted and the principal
 * report built on the teacher's screen from the same records
 * (shared/disciplineTracker.mjs).
 *
 * Server-only collections (firestore.rules):
 *   disciplineIncidents/{classId_tapId}  one tap; never deleted, an undo marks it voided
 *   disciplineSettings/{teacherEmail}    the principal's address and names for messages
 *   disciplineStatus/form                the last check of the live district form
 */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const authLib = require("./lib/auth");
const { submitDisciplineForms } = require("./lib/disciplineFormBatch");
const {
  CLASS_COLLECTION,
  callerEmail,
  requireTeacher,
} = require("./functionsCommon");

let disciplineSharedModule = null;
const disciplineShared = async () => {
  if (!disciplineSharedModule) disciplineSharedModule = await import("./shared/disciplineTracker.mjs");
  return disciplineSharedModule;
};

const disciplineText = (value, max = 200) => String(value ?? "").trim().slice(0, max);

/** The class's teacher of record, or the root administrator, or a refusal. */
async function disciplineClassAuthority(db, request, classId) {
  const cleanClassId = disciplineText(classId, 200);
  if (!cleanClassId) throw new HttpsError("invalid-argument", "classId is required.");
  const snapshot = await db.collection(CLASS_COLLECTION).doc(cleanClassId).get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That class no longer exists.");
  const email = callerEmail(request);
  const isRootAdmin = request.auth?.token?.rootAdmin === true && authLib.isRootAdminEmail(email);
  const classData = snapshot.data() || {};
  const teacherOfRecord = String(classData.teacherOfRecord || "").trim().toLowerCase();
  if (!isRootAdmin && (!email || teacherOfRecord !== email)) {
    throw new HttpsError("permission-denied", "Only the teacher of record for this class can record its violations.");
  }
  return { classId: cleanClassId, email, isRootAdmin, classData, teacherOfRecord };
}

/** An incident as the screen needs it: no server objects, nothing else. */
function disciplineIncidentView(id, data = {}) {
  return {
    id,
    classId: data.classId,
    classPeriod: data.classPeriod || "",
    classLabel: data.classLabel || "",
    studentId: data.studentId,
    type: data.type,
    detail: data.detail || "",
    occurredAtMs: Number(data.occurredAtMs),
    dateKey: data.dateKey,
    form: {
      state: data.form?.state || "pending",
      reason: data.form?.reason || null,
      submittedAtMs: data.form?.submittedAtMs || null,
    },
    voidedAtMs: data.voidedAtMs || null,
  };
}

async function disciplineIncidentAuthority(db, request, incidentId) {
  const id = disciplineText(incidentId, 300);
  if (!id) throw new HttpsError("invalid-argument", "incidentId is required.");
  const ref = db.collection("disciplineIncidents").doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError("not-found", "That violation was not found.");
  const authority = await disciplineClassAuthority(db, request, snapshot.data()?.classId);
  return { ref, data: snapshot.data() || {}, authority };
}

function disciplineInput(shared, fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof shared.DisciplineInputError) throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
}

exports.recordDisciplineIncident = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const shared = await disciplineShared();
  const authority = await disciplineClassAuthority(db, request, request.data?.classId);
  const studentId = disciplineText(request.data?.studentId, 320);
  if (!studentId) throw new HttpsError("invalid-argument", "studentId is required.");
  // The browser names each tap, so a retried call records it once.
  const tapId = disciplineText(request.data?.tapId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(tapId)) throw new HttpsError("invalid-argument", "A tap id is required.");
  const violation = disciplineInput(shared, () => shared.normalizeViolationInput({ type: request.data?.type, detail: request.data?.detail }));

  const [student] = await db.getAll(db.collection("grades").doc(studentId), { fieldMask: ["classId"] });
  if (!student.exists || student.data()?.classId !== authority.classId) {
    throw new HttpsError("permission-denied", "That student is not on this class's roster.");
  }

  const nowMs = Date.now();
  const ref = db.collection("disciplineIncidents").doc(`${authority.classId}_${tapId}`);
  const record = {
    classId: authority.classId,
    classPeriod: disciplineText(authority.classData.period, 40),
    classLabel: disciplineText(authority.classData.name || authority.classData.period, 120),
    studentId,
    type: violation.type,
    detail: violation.detail,
    occurredAtMs: nowMs,
    occurredAt: FieldValue.serverTimestamp(),
    dateKey: shared.disciplineDateKey(nowMs),
    teacherOfRecord: authority.teacherOfRecord,
    recordedByEmail: authority.email,
    recordedByUid: request.auth.uid,
    form: { state: "pending", attempts: 0 },
  };
  const saved = await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    if (existing.exists) return existing.data();
    transaction.create(ref, record);
    return record;
  });
  return disciplineIncidentView(ref.id, saved);
});

exports.voidDisciplineIncident = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const { ref, authority } = await disciplineIncidentAuthority(db, request, request.data?.incidentId);
  const reason = disciplineText(request.data?.reason, 200) || "Undone by the teacher";
  const result = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const data = snapshot.data() || {};
    if (data.voidedAtMs || data.voidedAt) return data;
    if (data.form?.state === "sending") {
      throw new HttpsError("failed-precondition", "This violation is being sent to the district form right now. Try again in a minute.");
    }
    const update = { voidedAtMs: Date.now(), voidedAt: FieldValue.serverTimestamp(), voidedByEmail: authority.email, voidReason: reason };
    transaction.update(ref, update);
    return { ...data, ...update };
  });
  // An `unknown` send may have reached the form (Google recorded it but the
  // reply was lost), so the teacher is told it might need correcting there.
  return {
    ...disciplineIncidentView(ref.id, result),
    alreadySubmitted: result.form?.state === "submitted",
    maybeSubmitted: result.form?.state === "unknown",
  };
});

exports.setDisciplineIncidentDetail = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const shared = await disciplineShared();
  const { ref, data } = await disciplineIncidentAuthority(db, request, request.data?.incidentId);
  const violation = disciplineInput(shared, () => shared.normalizeViolationInput({ type: data.type, detail: request.data?.detail }));
  // The detail is MathMaster's own record; the district form has no place for
  // it, so it can be refined after the form was filled in.
  await ref.update({ detail: violation.detail });
  return disciplineIncidentView(ref.id, { ...data, detail: violation.detail });
});

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
exports.listDisciplineIncidents = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const fromDateKey = disciplineText(request.data?.fromDateKey, 10);
  const toDateKey = disciplineText(request.data?.toDateKey, 10);
  if (!DATE_KEY.test(fromDateKey) || !DATE_KEY.test(toDateKey) || fromDateKey > toDateKey) {
    throw new HttpsError("invalid-argument", "Choose a date range.");
  }
  if (Date.parse(`${toDateKey}T00:00:00Z`) - Date.parse(`${fromDateKey}T00:00:00Z`) > 120 * 86400000) {
    throw new HttpsError("invalid-argument", "Choose a range of 120 days or fewer.");
  }
  // One class (its teacher of record, or the root administrator), or every
  // class the caller teaches.
  const classId = disciplineText(request.data?.classId, 200);
  const authority = classId ? await disciplineClassAuthority(db, request, classId) : null;
  const teacher = authority ? authority.teacherOfRecord : callerEmail(request);
  if (!teacher) throw new HttpsError("permission-denied", "A teacher account is required.");
  const snapshot = await db.collection("disciplineIncidents")
    .where("teacherOfRecord", "==", teacher)
    .where("dateKey", ">=", fromDateKey)
    .where("dateKey", "<=", toDateKey)
    .limit(5000)
    .get();
  const incidents = snapshot.docs
    .map((entry) => disciplineIncidentView(entry.id, entry.data()))
    .filter((incident) => !authority || incident.classId === authority.classId);
  const formStatus = (await db.collection("disciplineStatus").doc("form").get()).data() || null;
  return {
    incidents,
    formStatus: formStatus ? { ok: formStatus.ok !== false, problems: formStatus.problems || [], checkedAtMs: formStatus.checkedAtMs || null } : null,
  };
});

exports.getDisciplineSettings = onCall(async (request) => {
  await requireTeacher(request);
  const email = callerEmail(request);
  const data = (await getFirestore().collection("disciplineSettings").doc(email).get()).data() || {};
  return { principalEmail: data.principalEmail || "", principalName: data.principalName || "", teacherName: data.teacherName || "" };
});

exports.saveDisciplineSettings = onCall(async (request) => {
  await requireTeacher(request);
  const email = callerEmail(request);
  const principalEmail = disciplineText(request.data?.principalEmail, 254).toLowerCase();
  if (principalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(principalEmail)) {
    throw new HttpsError("invalid-argument", "Enter the principal's email address.");
  }
  const settings = {
    principalEmail,
    principalName: disciplineText(request.data?.principalName, 120),
    teacherName: disciplineText(request.data?.teacherName, 120),
  };
  await getFirestore().collection("disciplineSettings").doc(email).set({ ...settings, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return settings;
});

/** Send now: every pending violation in the caller's classes (or one class, one day). */
exports.submitDisciplineFormsNow = onCall({ timeoutSeconds: 300 }, async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const classId = disciplineText(request.data?.classId, 200);
  const authority = classId ? await disciplineClassAuthority(db, request, classId) : null;
  const dateKey = disciplineText(request.data?.dateKey, 10);
  if (dateKey && !DATE_KEY.test(dateKey)) throw new HttpsError("invalid-argument", "Choose a date.");
  const teacherEmail = authority ? authority.teacherOfRecord : callerEmail(request);
  const summary = await submitDisciplineForms({
    db, logger, force: true,
    scope: { teacherEmail, ...(authority ? { classIds: [authority.classId] } : {}), ...(dateKey ? { dateKey } : {}) },
  });
  logger.info("Discipline forms sent now", { by: callerEmail(request), submitted: summary.submitted.length, unknown: summary.unknown.length, failed: summary.failed.length });
  return summary;
});

/**
 * A violation the form may or may not have received (no reply), or one it
 * refused: the teacher decides. `resubmit` sends it again on the next run;
 * `markSubmitted` records that it is on the district's record.
 */
exports.resolveDisciplineFormState = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const action = disciplineText(request.data?.action, 20);
  if (!["resubmit", "markSubmitted"].includes(action)) throw new HttpsError("invalid-argument", "Choose resubmit or mark as submitted.");
  const ids = (Array.isArray(request.data?.incidentIds) ? request.data.incidentIds : []).map((id) => disciplineText(id, 300)).filter(Boolean).slice(0, 50);
  if (!ids.length) throw new HttpsError("invalid-argument", "Choose the violations.");
  const changed = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const { ref } = await disciplineIncidentAuthority(db, request, id);
    // eslint-disable-next-line no-await-in-loop
    await db.runTransaction(async (transaction) => {
      const data = (await transaction.get(ref)).data() || {};
      if (data.voidedAtMs || data.voidedAt || !["unknown", "failed"].includes(data.form?.state)) return;
      transaction.update(ref, {
        form: action === "resubmit"
          ? { ...data.form, state: "pending", reason: null, attempts: 0 }
          : { ...data.form, state: "submitted", reason: "Marked as submitted by the teacher", submittedAtMs: Date.now(), markedByEmail: callerEmail(request) },
      });
      changed.push(id);
    });
  }
  return { changed };
});

/*
 * Every 10 minutes of the school day: each class's violations go to the
 * district form a few minutes after its period ends (or at 4:30 pm when the
 * bell schedule has no window for it). Nobody presses anything.
 */
exports.submitDisciplineFormsOnSchedule = onSchedule({
  schedule: "every 10 minutes from 07:00 to 18:00",
  timeZone: "America/Chicago",
  timeoutSeconds: 300,
}, async () => {
  const summary = await submitDisciplineForms({ db: getFirestore(), logger });
  logger.info("Discipline forms on schedule", {
    submitted: summary.submitted.length, waiting: summary.waiting.length, blocked: summary.blocked.length,
    retry: summary.retry.length, failed: summary.failed.length, unknown: summary.unknown.length, formProblems: summary.formProblems,
  });
});
