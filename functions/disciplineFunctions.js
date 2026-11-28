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
 * Family messages go out through SchoolStatus, which has no public API: the
 * teacher presses Send to families, the message is queued here, and the
 * MathMaster extension in the teacher's own Chrome sends it from their
 * signed-in SchoolStatus page, reporting back through familyMessageOutbox
 * (lib/familyMessageOutbox.js). A sent message is logged to Parent Contacts.
 *
 * Server-only collections (firestore.rules):
 *   disciplineIncidents/{classId_tapId}  one tap; never deleted, an undo marks it voided
 *   disciplineSettings/{teacherEmail}    the principal's address and names for messages
 *   disciplineStatus/form                the last check of the live district form
 *   disciplineStatus/familyMessaging     the SchoolStatus switch: off, test, live
 *   familyMessages/{id}                  one message to a family, queued to sent
 */

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const logger = require("firebase-functions/logger");
const authLib = require("./lib/auth");
const { submitDisciplineForms } = require("./lib/disciplineFormBatch");
const familyOutbox = require("./lib/familyMessageOutbox");
const {
  CLASS_COLLECTION,
  callerEmail,
  requireRootAdmin,
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
    source: data.source === "teams" ? "teams" : "teacher",
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
  // A tardy TEAMS shows, recorded by the teacher's MathMaster tab
  // (shared/teamsAttendance.mjs). Only ever a tardy; everything else is a tap.
  const source = request.data?.source === "teams" ? "teams" : "teacher";
  if (source === "teams" && violation.type !== "tardy") throw new HttpsError("invalid-argument", "Only a tardy is recorded from TEAMS.");

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
    source,
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
  const nowMs = Date.now();
  const [familyMessages, familyMessaging] = await Promise.all([
    familyOutbox.listFamilyMessages({ db, teacherEmail: teacher, fromDateKey, toDateKey, classId: authority ? authority.classId : "", nowMs }),
    familyOutbox.readMessagingSettings(db),
  ]);
  return {
    incidents,
    formStatus: formStatus ? { ok: formStatus.ok !== false, problems: formStatus.problems || [], checkedAtMs: formStatus.checkedAtMs || null } : null,
    familyMessages,
    familyMessaging,
  };
});

/*
 * The Student Case Review's conduct section: one student's recorded
 * violations and family contacts over the case's window. Read-only, and
 * authorized exactly as the case review's own evidence is
 * (gradingFunctions.js loadStudentCaseEvidence): the student's teacher, the
 * class's teacher of record, or the root administrator. A student's records
 * follow them to a new class, as their support history and family contacts
 * do. Family contacts are only those the caller may already read in Parent
 * Contacts (shared/conductEvidence.mjs).
 */
exports.loadStudentConductEvidence = onCall(async (request) => {
  await requireTeacher(request);
  const conduct = await import("./shared/conductEvidence.mjs");
  let input;
  try {
    input = conduct.validateConductEvidenceRequest(request.data || {});
  } catch (error) {
    if (error instanceof conduct.ConductEvidenceInputError) throw new HttpsError("invalid-argument", error.message);
    throw error;
  }
  const { studentId, fromDateKey, toDateKey } = input;
  const email = callerEmail(request);
  const isRootAdmin = request.auth?.token?.rootAdmin === true && authLib.isRootAdminEmail(email);

  const db = getFirestore();
  const [studentSnap] = await db.getAll(db.collection("grades").doc(studentId), { fieldMask: ["classId", "assignedTeacherEmail"] });
  const student = studentSnap.exists ? studentSnap.data() || {} : null;
  const classSnap = student?.classId ? await db.collection(CLASS_COLLECTION).doc(String(student.classId)).get() : null;
  const { authorizeCaseEvidenceCaller } = await import("./shared/caseReviewEvidence.mjs");
  const decision = authorizeCaseEvidenceCaller({
    callerEmail: email,
    callerRole: request.auth?.token?.role,
    isRootAdmin,
    student,
    classRecord: classSnap?.exists ? classSnap.data() || {} : null,
  });
  if (!decision.allowed) {
    throw new HttpsError(
      decision.reason === "student-not-found" ? "not-found" : "permission-denied",
      "Only this student's teacher may load their conduct records.",
    );
  }

  // By student only (single-field indexes); the window is applied in memory.
  const limits = conduct.CONDUCT_EVIDENCE_LIMITS;
  const [incidentSnapshot, contactSnapshot] = await Promise.all([
    db.collection("disciplineIncidents").where("studentId", "==", studentId).limit(limits.maxIncidents).get(),
    db.collection("parentContactLogs").where("studentId", "==", studentId).limit(limits.maxContacts).get(),
  ]);
  return conduct.buildConductEvidenceResponse({
    studentId,
    fromDateKey,
    toDateKey,
    incidents: incidentSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    contacts: contactSnapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })),
    callerEmail: email,
    isRootAdmin,
    truncated: { incidents: incidentSnapshot.size >= limits.maxIncidents, contacts: contactSnapshot.size >= limits.maxContacts },
  });
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

/* ------------------------------------------------------------------------
 * MESSAGES TO FAMILIES, THROUGH SCHOOLSTATUS
 *
 * The rules are in shared/familyMessages.mjs and the queue in
 * lib/familyMessageOutbox.js; these callables authorize and translate.
 */

/** The queue's own refusals become callable errors with their code. */
async function familyMessageCall(fn) {
  try {
    return await fn();
  } catch (error) {
    if (error?.name === "FamilyMessageError") throw new HttpsError(error.code || "failed-precondition", error.message);
    throw error;
  }
}

/**
 * Send to families: queue the day's messages for one class (every student
 * with a violation that day, or the ones named). Only the class's own
 * teacher of record: the message goes out from their SchoolStatus under
 * their name, so not even the root administrator queues for another class.
 */
exports.queueFamilyMessages = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const authority = await disciplineClassAuthority(db, request, request.data?.classId);
  if (authority.teacherOfRecord !== authority.email) {
    throw new HttpsError("permission-denied", "Only the class's teacher of record can send its family messages: they go out from that teacher's SchoolStatus.");
  }
  const dateKey = disciplineText(request.data?.dateKey, 10);
  if (!DATE_KEY.test(dateKey)) throw new HttpsError("invalid-argument", "Choose a date.");
  const studentIds = Array.isArray(request.data?.studentIds)
    ? request.data.studentIds.map((id) => disciplineText(id, 320)).filter(Boolean).slice(0, 200)
    : null;
  const result = await familyMessageCall(() => familyOutbox.queueFamilyMessages({
    db,
    teacherEmail: authority.email,
    classId: authority.classId,
    classData: authority.classData,
    dateKey,
    studentIds,
    fallbackTeacherName: disciplineText(request.auth?.token?.name, 120),
    nowMs: Date.now(),
  }));
  logger.info("Family messages queued", {
    by: authority.email, classId: authority.classId, dateKey, mode: result.mode,
    queued: result.results.filter((entry) => ["queued", "updated"].includes(entry.status)).length,
  });
  return result;
});

/** The teacher's decision on one message: cancel, queue again, or record that it was sent. */
exports.resolveFamilyMessage = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const action = disciplineText(request.data?.action, 20);
  if (!["cancel", "requeue", "markSent"].includes(action)) throw new HttpsError("invalid-argument", "Choose cancel, requeue or markSent.");
  const email = callerEmail(request);
  if (!email) throw new HttpsError("permission-denied", "A teacher account is required.");
  return familyMessageCall(() => familyOutbox.resolveFamilyMessage({
    db, teacherEmail: email, messageId: disciplineText(request.data?.messageId, 80), action, nowMs: Date.now(),
    serverTimestamp: () => FieldValue.serverTimestamp(),
  }));
});

const RUNNER_ID = /^[A-Za-z0-9_-]{6,80}$/;
const ATTEMPT_ID = /^[A-Za-z0-9-]{8,64}$/;

/**
 * The MathMaster extension's one door, called through the teacher's open
 * Discipline Tracker tab (window.mathmasterFamilyMessages), so it is always
 * the teacher's own session. Messages are only ever the caller's own:
 *
 *   status   the switch and how many are waiting
 *   claim    the next message (or none), with a short lease
 *   start    about to press Send; refused means do NOT press Send
 *   report   sent | failed | unknown, with SchoolStatus's confirmation
 *   release  give back a claim that was not used
 */
exports.familyMessageOutbox = onCall(async (request) => {
  await requireTeacher(request);
  const db = getFirestore();
  const email = callerEmail(request);
  if (!email) throw new HttpsError("permission-denied", "A teacher account is required.");
  const action = disciplineText(request.data?.action, 20);
  const nowMs = Date.now();
  if (action === "status") return familyOutbox.familyMessageStatus({ db, teacherEmail: email, nowMs });
  const runnerId = disciplineText(request.data?.runnerId, 80);
  if (!RUNNER_ID.test(runnerId)) throw new HttpsError("invalid-argument", "The extension must name itself (runnerId).");
  if (action === "claim") return familyMessageCall(() => familyOutbox.claimNextFamilyMessage({ db, teacherEmail: email, runnerId, nowMs }));
  const messageId = disciplineText(request.data?.messageId, 80);
  const attemptId = disciplineText(request.data?.attemptId, 64);
  if (!ATTEMPT_ID.test(attemptId)) throw new HttpsError("invalid-argument", "attemptId is required.");
  if (action === "start") return familyMessageCall(() => familyOutbox.startFamilyMessage({ db, teacherEmail: email, messageId, attemptId, nowMs }));
  if (action === "release") {
    return familyMessageCall(() => familyOutbox.releaseFamilyMessage({ db, teacherEmail: email, messageId, attemptId, reason: disciplineText(request.data?.reason, 200), nowMs }));
  }
  if (action === "report") {
    const confirmation = request.data?.confirmation && typeof request.data.confirmation === "object" ? request.data.confirmation : {};
    const result = await familyMessageCall(() => familyOutbox.reportFamilyMessage({
      db, teacherEmail: email, messageId, attemptId,
      outcome: disciplineText(request.data?.outcome, 20),
      reason: disciplineText(request.data?.reason, 300),
      confirmation: {
        recipientCount: Number(confirmation.recipientCount) || 0,
        channel: disciplineText(confirmation.channel, 10),
        note: disciplineText(confirmation.note, 200),
      },
      nowMs,
      serverTimestamp: () => FieldValue.serverTimestamp(),
    }));
    logger.info("Family message reported", { by: email, messageId, state: result.state });
    return result;
  }
  throw new HttpsError("invalid-argument", "Choose status, claim, start, report or release.");
});

/**
 * The switch, for the root administrator only: off (nothing goes out), test
 * (only the listed test students' families: while the extension is being
 * built every send reaches a real phone), or live.
 */
exports.setFamilyMessagingMode = onCall(async (request) => {
  await requireTeacher(request);
  await requireRootAdmin(request);
  const db = getFirestore();
  const settings = await familyMessageCall(() => familyOutbox.saveMessagingSettings({
    db,
    input: { mode: disciplineText(request.data?.mode, 10), testDistrictIds: request.data?.testDistrictIds },
    byEmail: callerEmail(request),
    nowMs: Date.now(),
  }));
  logger.info("Family messaging switch changed", { by: callerEmail(request), mode: settings.mode, testStudents: settings.testDistrictIds.length });
  return settings;
});
