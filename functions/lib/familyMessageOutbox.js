"use strict";

/**
 * THE FAMILY-MESSAGE QUEUE (Discipline Tracker → SchoolStatus).
 *
 * SchoolStatus has no public API. A message to a student's family goes out
 * from the teacher's own signed-in SchoolStatus page, driven by the MathMaster
 * extension in the teacher's Chrome. MathMaster keeps the queue; the
 * extension takes one message at a time:
 *
 *   claim   -> the next queued message, checked again (switch, teacher,
 *              roster, district ID, undone violations, age). A short lease:
 *              unused, it returns to the queue by itself.
 *   start   -> "about to press Send". Only the attempt holding the claim may.
 *              The extension presses Send only after this succeeds.
 *   report  -> sent (SchoolStatus confirmed it: Parent Contacts gets a record
 *              in the same transaction), failed (certainly not sent) or
 *              unknown (may have been sent; the teacher checks).
 *   release -> the claim is given back unused.
 *
 * A message that reached `start` is never handed out again by itself: a
 * second text to a family is the one mistake this must not make quietly.
 * The rules are pure, in shared/familyMessages.mjs; this file reads and
 * writes Firestore around them.
 *
 * Collections (server-only):
 *   familyMessages/{hash(class|day|student)}_{n}  one message
 *   disciplineStatus/familyMessaging              the switch: off, test, live
 *   parentContactLogs/familyMessage_{messageId}   the contact a sent message leaves
 */

const crypto = require("node:crypto");

let sharedModules = null;
const loadShared = async () => {
  if (!sharedModules) {
    const [messages, tracker] = await Promise.all([
      import("../shared/familyMessages.mjs"),
      import("../shared/disciplineTracker.mjs"),
    ]);
    sharedModules = { messages, tracker };
  }
  return sharedModules;
};

const MESSAGES = "familyMessages";
const SETTINGS_PATH = ["disciplineStatus", "familyMessaging"];
const STUDENT_FIELDS = ["classId", "sisStudentId", "firstName", "lastName", "displayName", "googleName", "name", "profile"];
const DAY_MS = 86400000;

const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();

const messageIdFor = (messageKey, sequence) => `${crypto.createHash("sha256").update(messageKey).digest("hex").slice(0, 32)}_${sequence}`;
const contactIdFor = (messageId) => `familyMessage_${messageId}`;
const shiftDateKey = (dateKey, days) => new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

const settingsRef = (db) => db.collection(SETTINGS_PATH[0]).doc(SETTINGS_PATH[1]);

async function readMessagingSettings(db) {
  const { messages } = await loadShared();
  const snapshot = await settingsRef(db).get();
  return messages.normalizeMessagingSettings(snapshot.exists ? snapshot.data() : {});
}

async function saveMessagingSettings({ db, input, byEmail, nowMs }) {
  const { messages } = await loadShared();
  const settings = messages.validateMessagingSettingsInput(input);
  await settingsRef(db).set({ ...settings, updatedByEmail: lower(byEmail), updatedAtMs: nowMs }, { merge: true });
  return settings;
}

async function studentRecords(db, studentIds) {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const snapshots = await db.getAll(...ids.map((id) => db.collection("grades").doc(id)), { fieldMask: STUDENT_FIELDS });
  return new Map(snapshots.filter((entry) => entry.exists).map((entry) => [entry.id, entry.data() || {}]));
}

/**
 * Send to families: queue each student's message for one class and day.
 * Built here from the stored violations (never from text the browser sent),
 * so what the extension pastes is exactly the factual draft, naming only that
 * student. Only the class's teacher of record queues: the message goes out
 * from their SchoolStatus, signed with their name.
 */
async function queueFamilyMessages({ db, teacherEmail, classId, classData = {}, dateKey, studentIds = null, fallbackTeacherName = "", nowMs }) {
  const { messages, tracker } = await loadShared();
  const teacher = lower(teacherEmail);
  const today = tracker.disciplineDateKey(nowMs);
  if (dateKey > today || dateKey < shiftDateKey(today, -messages.FAMILY_MESSAGE_LIMITS.queueWindowDays)) {
    throw new messages.FamilyMessageError(`Messages can be sent for the last ${messages.FAMILY_MESSAGE_LIMITS.queueWindowDays} days only.`, "invalid-argument");
  }
  const settings = await readMessagingSettings(db);
  if (settings.mode === "off") throw new messages.FamilyMessageError("Sending to families through SchoolStatus is not turned on yet.");

  const incidentSnapshot = await db.collection("disciplineIncidents")
    .where("teacherOfRecord", "==", teacher)
    .where("dateKey", "==", dateKey)
    .get();
  const wanted = Array.isArray(studentIds) && studentIds.length ? new Set(studentIds.map(text)) : null;
  const byStudent = new Map();
  incidentSnapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((incident) => incident.classId === classId && (!wanted || wanted.has(incident.studentId)))
    .sort((left, right) => left.occurredAtMs - right.occurredAtMs)
    .forEach((incident) => {
      if (!byStudent.has(incident.studentId)) byStudent.set(incident.studentId, []);
      byStudent.get(incident.studentId).push(incident);
    });
  const students = await studentRecords(db, [...byStudent.keys()]);
  const signature = text((await db.collection("disciplineSettings").doc(teacher).get()).data()?.teacherName) || text(fallbackTeacherName);
  const classLabel = text(classData.name || classData.period || classId).slice(0, 120);

  const results = [];
  for (const [studentId, incidents] of byStudent) {
    const student = students.get(studentId) || null;
    if (!student || student.classId !== classId) {
      results.push({ studentId, status: "notOnRoster" });
      continue;
    }
    const sisStudentId = messages.districtIdOf(studentId, student);
    const gate = messages.messagingGate(settings, sisStudentId);
    if (!gate.allowed) {
      results.push({ studentId, status: settings.mode === "test" && sisStudentId ? "testModeSkipped" : "noDistrictId", reason: gate.reason });
      continue;
    }
    const messageKey = messages.familyMessageKey({ classId, dateKey, studentId });
    // eslint-disable-next-line no-await-in-loop
    const result = await db.runTransaction(async (transaction) => {
      const existing = (await transaction.get(db.collection(MESSAGES).where("messageKey", "==", messageKey))).docs
        .map((entry) => ({ id: entry.id, ...entry.data() }));
      const plan = messages.planFamilyMessageQueue({ incidents, messages: existing, nowMs });
      if (plan.action === "none") return { studentId, status: plan.why };
      const covered = incidents.filter((incident) => plan.incidentIds.includes(incident.id));
      const draft = messages.familyMessageDraft({ student: { id: studentId, ...student }, incidents: covered, dateKey, teacherName: signature, classLabel });
      const messageId = plan.action === "update" ? plan.messageId : messageIdFor(messageKey, plan.sequence);
      const previous = existing.find((entry) => entry.id === messageId) || {};
      const record = {
        schemaVersion: 1,
        messageKey,
        sequence: plan.sequence,
        teacherOfRecord: teacher,
        classId,
        classLabel,
        classPeriod: text(classData.period).slice(0, 40),
        studentId,
        studentName: messages.studentNameForMatch(studentId, student),
        sisStudentId,
        dateKey,
        incidentIds: plan.incidentIds,
        subject: draft.subject,
        body: draft.body,
        contactCategory: draft.contactCategory,
        mode: gate.mode,
        state: "queued",
        reason: null,
        attempt: null,
        unknownFromLease: false,
        queuedAtMs: nowMs,
        queuedByEmail: teacher,
        history: [...(previous.history || []), { state: "queued", atMs: nowMs, by: teacher }].slice(-messages.FAMILY_MESSAGE_LIMITS.historyMax),
      };
      const ref = db.collection(MESSAGES).doc(messageId);
      if (plan.action === "update") transaction.set(ref, record, { merge: true });
      else transaction.create(ref, record);
      return { studentId, status: plan.action === "update" && previous.state === "queued" ? "updated" : "queued", messageId, sequence: plan.sequence };
    });
    results.push(result);
  }
  return { mode: settings.mode, results };
}

/**
 * What changed for a queued message's student and class since it was queued.
 * Read outside the claim's transaction: a transaction would lock the
 * student's grades document, which their own work writes all day, and only
 * the fields named here are read.
 */
async function claimChecks(db, message) {
  const [[classSnap], [studentSnap]] = await Promise.all([
    db.getAll(db.collection("classes").doc(message.classId), { fieldMask: ["teacherOfRecord"] }),
    db.getAll(db.collection("grades").doc(message.studentId), { fieldMask: STUDENT_FIELDS }),
  ]);
  const incidentRefs = (message.incidentIds || []).map((id) => db.collection("disciplineIncidents").doc(id));
  const incidents = incidentRefs.length ? await db.getAll(...incidentRefs) : [];
  const { messages, tracker } = await loadShared();
  const student = studentSnap.exists ? studentSnap.data() || {} : {};
  return {
    teacherOfRecord: lower(classSnap.data()?.teacherOfRecord),
    onRoster: studentSnap.exists && student.classId === message.classId,
    sisStudentId: messages.districtIdOf(message.studentId, student),
    studentName: messages.studentNameForMatch(message.studentId, student),
    voidedIncidentIds: incidents.filter((entry) => !entry.exists || tracker.isVoidedIncident(entry.data())).map((entry) => entry.id),
  };
}

/** The extension asks for the next message to send. One at a time, oldest first. */
async function claimNextFamilyMessage({ db, teacherEmail, runnerId, nowMs, newAttemptId = () => crypto.randomUUID() }) {
  const { messages, tracker } = await loadShared();
  const teacher = lower(teacherEmail);
  const settings = await readMessagingSettings(db);
  if (settings.mode === "off") return { mode: "off", message: null, held: 0 };
  const today = tracker.disciplineDateKey(nowMs);
  const from = shiftDateKey(today, -(messages.FAMILY_MESSAGE_LIMITS.queueWindowDays + 4));
  const candidates = (await db.collection(MESSAGES)
    .where("teacherOfRecord", "==", teacher)
    .where("dateKey", ">=", from)
    .where("dateKey", "<=", today)
    .get()).docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((message) => messages.effectiveFamilyMessage(message, nowMs).state === "queued")
    .sort((left, right) => left.queuedAtMs - right.queuedAtMs);
  let held = 0;
  for (const candidate of candidates) {
    // eslint-disable-next-line no-await-in-loop
    const checks = await claimChecks(db, candidate);
    // eslint-disable-next-line no-await-in-loop
    const outcome = await db.runTransaction(async (transaction) => {
      const ref = db.collection(MESSAGES).doc(candidate.id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists) return null;
      const stored = { id: snapshot.id, ...snapshot.data() };
      // The message itself is re-read in the transaction: only one claim wins.
      // The checks stand for its student and class, as read just now.
      const current = { settings, callerEmail: teacher, ...(stored.incidentIds?.join() === candidate.incidentIds?.join() ? checks : await claimChecks(db, stored)) };
      const decision = messages.claimFamilyMessage(stored, { runnerId, attemptId: newAttemptId(), nowMs, current });
      if (decision.update) transaction.update(ref, decision.update);
      return decision;
    });
    if (outcome?.held) held += 1;
    if (outcome?.handout) return { mode: settings.mode, message: outcome.handout, held };
  }
  return { mode: settings.mode, message: null, held };
}

/** Load one message for the teacher who holds it, inside a transaction. */
async function ownMessage(db, transaction, teacher, messageId) {
  const { messages } = await loadShared();
  const id = text(messageId);
  if (!/^[0-9a-f]{32}_\d{1,3}$/.test(id)) throw new messages.FamilyMessageError("That message was not found.", "not-found");
  const ref = db.collection(MESSAGES).doc(id);
  const snapshot = await transaction.get(ref);
  if (!snapshot.exists) throw new messages.FamilyMessageError("That message was not found.", "not-found");
  const stored = { id, ...snapshot.data() };
  if (lower(stored.teacherOfRecord) !== teacher) throw new messages.FamilyMessageError("Only the teacher who queued a message can send or change it.", "permission-denied");
  return { ref, stored };
}

async function startFamilyMessage({ db, teacherEmail, messageId, attemptId, nowMs }) {
  const { messages } = await loadShared();
  const teacher = lower(teacherEmail);
  return db.runTransaction(async (transaction) => {
    const { ref, stored } = await ownMessage(db, transaction, teacher, messageId);
    const settingsSnap = await transaction.get(settingsRef(db));
    // The switch is read again: it may have been turned off since the claim.
    const gate = messages.messagingGate(settingsSnap.exists ? settingsSnap.data() : {}, stored.sisStudentId);
    if (!gate.allowed) throw new messages.FamilyMessageError(`Do not send: ${gate.reason}`);
    const update = messages.startFamilyMessageSend(stored, { attemptId, nowMs });
    transaction.update(ref, update);
    return { messageId: stored.id, state: "sending", leaseUntilMs: update.attempt.leaseUntilMs, mode: gate.mode };
  });
}

/** Write the Parent Contacts record and the message's state together. */
function writeSent(db, transaction, { ref, stored, update, logContact, nowMs, serverTimestamp, messages }) {
  const contactId = contactIdFor(stored.id);
  const contact = messages.parentContactForFamilyMessage({ ...stored, ...update }, { ...logContact, nowMs });
  transaction.set(db.collection("parentContactLogs").doc(contactId), { ...contact, createdAtServer: serverTimestamp() });
  transaction.update(ref, { ...update, parentContactId: contactId });
  return contactId;
}

async function reportFamilyMessage({ db, teacherEmail, messageId, attemptId, outcome, reason = "", confirmation = {}, nowMs, serverTimestamp }) {
  const { messages } = await loadShared();
  const teacher = lower(teacherEmail);
  return db.runTransaction(async (transaction) => {
    const { ref, stored } = await ownMessage(db, transaction, teacher, messageId);
    const { update, logContact } = messages.reportFamilyMessage(stored, { attemptId, outcome, reason, confirmation, nowMs });
    if (logContact) {
      const parentContactId = writeSent(db, transaction, { ref, stored, update, logContact, nowMs, serverTimestamp, messages });
      return { messageId: stored.id, state: update.state, parentContactId };
    }
    transaction.update(ref, update);
    return { messageId: stored.id, state: update.state };
  });
}

async function releaseFamilyMessage({ db, teacherEmail, messageId, attemptId, reason = "", nowMs }) {
  const { messages } = await loadShared();
  const teacher = lower(teacherEmail);
  return db.runTransaction(async (transaction) => {
    const { ref, stored } = await ownMessage(db, transaction, teacher, messageId);
    const update = messages.releaseFamilyMessage(stored, { attemptId, reason, nowMs });
    if (update) transaction.update(ref, update);
    return { messageId: stored.id, released: Boolean(update) };
  });
}

/** The teacher's own decisions on the Discipline Tracker: cancel, requeue, markSent. */
async function resolveFamilyMessage({ db, teacherEmail, messageId, action, nowMs, serverTimestamp }) {
  const { messages, tracker } = await loadShared();
  const teacher = lower(teacherEmail);
  const settings = action === "requeue" ? await readMessagingSettings(db) : null;
  return db.runTransaction(async (transaction) => {
    const { ref, stored } = await ownMessage(db, transaction, teacher, messageId);
    if (action === "requeue") {
      const gate = messages.messagingGate(settings, stored.sisStudentId);
      if (!gate.allowed) throw new messages.FamilyMessageError(gate.reason);
      const today = tracker.disciplineDateKey(nowMs);
      if (stored.dateKey < shiftDateKey(today, -messages.FAMILY_MESSAGE_LIMITS.queueWindowDays)) {
        throw new messages.FamilyMessageError(`Messages can be sent for the last ${messages.FAMILY_MESSAGE_LIMITS.queueWindowDays} days only.`);
      }
    }
    const { update, logContact } = messages.teacherFamilyMessageAction(stored, { action, nowMs, by: teacher });
    if (logContact) {
      const parentContactId = writeSent(db, transaction, { ref, stored, update, logContact, nowMs, serverTimestamp, messages });
      return { ...messages.familyMessageView({ ...stored, ...update }, nowMs), parentContactId };
    }
    transaction.update(ref, update);
    return messages.familyMessageView({ ...stored, ...update }, nowMs);
  });
}

/** The teacher's messages for a date range, as the screen shows them. */
async function listFamilyMessages({ db, teacherEmail, fromDateKey, toDateKey, classId = "", nowMs }) {
  const { messages } = await loadShared();
  const snapshot = await db.collection(MESSAGES)
    .where("teacherOfRecord", "==", lower(teacherEmail))
    .where("dateKey", ">=", fromDateKey)
    .where("dateKey", "<=", toDateKey)
    .limit(2000)
    .get();
  return snapshot.docs
    .map((entry) => messages.familyMessageView({ id: entry.id, ...entry.data() }, nowMs))
    .filter((message) => !classId || message.classId === classId);
}

/*
 * THE TEST DISTRICT IDS A CALLER IS SHOWN.
 *
 * In test mode a teacher is shown only the test district IDs of students on
 * their own rosters: the students whose grade record names them as the
 * assigned teacher, and the students of the classes they are teacher of
 * record for. The root administrator, who sets the list, sees all of it.
 */
async function visibleTestDistrictIds({ db, teacherEmail, isRootAdmin = false, testDistrictIds = [] }) {
  const ids = Array.isArray(testDistrictIds) ? testDistrictIds : [];
  if (isRootAdmin || !ids.length) return ids;
  const teacher = lower(teacherEmail);
  if (!teacher) return [];
  const { messages } = await loadShared();
  const [assigned, owned] = await Promise.all([
    db.collection("grades").where("assignedTeacherEmail", "==", teacher).select("sisStudentId").get(),
    db.collection("classes").where("teacherOfRecord", "==", teacher).select().get(),
  ]);
  const classIds = owned.docs.map((entry) => entry.id);
  const classMembers = [];
  for (let index = 0; index < classIds.length; index += 30) {
    // eslint-disable-next-line no-await-in-loop
    const snapshot = await db.collection("grades").where("classId", "in", classIds.slice(index, index + 30)).select("sisStudentId").get();
    classMembers.push(...snapshot.docs);
  }
  const onRoster = new Set([...assigned.docs, ...classMembers]
    .map((entry) => messages.districtIdOf(entry.id, entry.data() || {}))
    .filter(Boolean));
  return ids.filter((id) => onRoster.has(id));
}

/** The messaging settings as one caller is shown them. */
async function messagingSettingsForCaller({ db, teacherEmail, isRootAdmin = false }) {
  const settings = await readMessagingSettings(db);
  if (settings.mode !== "test") return { ...settings, testDistrictIds: [] };
  return { ...settings, testDistrictIds: await visibleTestDistrictIds({ db, teacherEmail, isRootAdmin, testDistrictIds: settings.testDistrictIds }) };
}

/** For the extension's panel: the switch and how much is waiting. */
async function familyMessageStatus({ db, teacherEmail, nowMs, isRootAdmin = false }) {
  const { tracker } = await loadShared();
  const settings = await messagingSettingsForCaller({ db, teacherEmail, isRootAdmin });
  const today = tracker.disciplineDateKey(nowMs);
  const list = await listFamilyMessages({ db, teacherEmail, fromDateKey: shiftDateKey(today, -18), toDateKey: today, nowMs });
  const count = (state) => list.filter((message) => message.state === state).length;
  return {
    mode: settings.mode,
    testDistrictIds: settings.testDistrictIds,
    queued: count("queued"),
    inFlight: count("claimed") + count("sending"),
    needsTeacher: count("unknown"),
  };
}

module.exports = {
  claimNextFamilyMessage,
  familyMessageStatus,
  listFamilyMessages,
  messagingSettingsForCaller,
  queueFamilyMessages,
  readMessagingSettings,
  releaseFamilyMessage,
  reportFamilyMessage,
  resolveFamilyMessage,
  saveMessagingSettings,
  startFamilyMessage,
  messageIdFor,
  contactIdFor,
};
