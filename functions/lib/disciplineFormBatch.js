"use strict";

/**
 * THE DISTRICT FORM, FILLED IN BY THE BACKEND.
 *
 * A teacher taps violations on a class roster; each tap is a
 * disciplineIncidents document in state `pending`. This module sends them to
 * DeSoto ISD's Campus Violation Tracker Google Form: one response per student
 * per class per day, with every category that student had there.
 *
 * The form needs no sign-in, so the backend posts it itself. Every run:
 *
 *   1. reads the live form and checks it still has the questions and boxes
 *      the tracker fills (checkDistrictForm). A changed form stops the run and
 *      says why; nothing is guessed;
 *   2. groups pending incidents (pendingFormSubmissions). A student without a
 *      district ID waits, and goes through on its own once one is on file;
 *   3. sends only groups that are due (a few minutes after the class period
 *      ends, or at the end of the day), unless the teacher pressed Send now;
 *   4. claims each group in a transaction (pending -> sending) before posting,
 *      so the scheduled run and Send now can never both post the same group;
 *   5. records what the form answered. A response that got no answer is
 *      `unknown` and is not posted again by itself: a duplicate would be a
 *      second violation on the district's record. The teacher decides.
 *
 * Collections: disciplineIncidents (the taps), disciplineStatus/form (the
 * last check of the live form). Both server-only.
 */

const DEFAULT_DELAY_MS = 400;
const SENDING_STALE_MS = 10 * 60 * 1000;
const MAX_RETRIES = 5;

let sharedModule = null;
const loadShared = async () => {
  if (!sharedModule) sharedModule = await import("../shared/disciplineTracker.mjs");
  return sharedModule;
};

const STUDENT_FIELDS = ["classId", "sisStudentId", "firstName", "lastName", "displayName", "googleName", "name", "profile"];

async function studentsFor(db, studentIds) {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const refs = ids.map((id) => db.collection("grades").doc(id));
  const snapshots = await db.getAll(...refs, { fieldMask: STUDENT_FIELDS });
  return new Map(snapshots.filter((entry) => entry.exists).map((entry) => [entry.id, entry.data() || {}]));
}

async function classesFor(db, classIds) {
  const ids = [...new Set(classIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const snapshots = await db.getAll(...ids.map((id) => db.collection("classes").doc(id)));
  return new Map(snapshots.filter((entry) => entry.exists).map((entry) => [entry.id, entry.data() || {}]));
}

/** Read and check the live form. Returns { ok, entries } or { ok: false, problems }. */
async function readLiveForm({ fetchImpl, shared }) {
  try {
    const response = await fetchImpl(shared.districtFormViewUrl(), { redirect: "follow", signal: AbortSignal.timeout(15000) });
    const html = await response.text();
    return shared.checkDistrictForm(response.ok ? shared.parseGoogleFormDefinition(html) : null);
  } catch (error) {
    return { ok: false, problems: [`The district form could not be read: ${String(error?.message || error).slice(0, 160)}`] };
  }
}

/** Move a group's incidents from `from` to the next state, inside a transaction. */
async function transition(db, incidentIds, { from, update }) {
  const shared = await loadShared();
  return db.runTransaction(async (transaction) => {
    const refs = incidentIds.map((id) => db.collection("disciplineIncidents").doc(id));
    const snapshots = await transaction.getAll(...refs);
    const eligible = snapshots.filter((entry) => entry.exists && !shared.isVoidedIncident(entry.data()) && from.includes(entry.data()?.form?.state));
    eligible.forEach((entry) => transaction.update(entry.ref, { form: { ...entry.data()?.form, ...update(entry.data()?.form || {}) } }));
    return eligible.map((entry) => entry.id);
  });
}

/**
 * One batch. `scope` narrows it ({ teacherEmail, classIds, dateKey }); `force`
 * sends every pending group in scope now (Send now) instead of only due ones.
 */
async function submitDisciplineForms({
  db, now = Date.now(), scope = {}, force = false, fetchImpl = globalThis.fetch, delayMs = DEFAULT_DELAY_MS, logger = console,
}) {
  const shared = await loadShared();
  const summary = { submitted: [], waiting: [], blocked: [], retry: [], failed: [], unknown: [], formProblems: [] };

  // A group stuck in `sending` (the function stopped mid-post) cannot be known
  // to have been recorded or not: it becomes `unknown`, for the teacher.
  const stuck = await db.collection("disciplineIncidents").where("form.state", "==", "sending").get();
  const stale = stuck.docs.filter((entry) => now - Number(entry.data()?.form?.attemptAtMs || 0) > SENDING_STALE_MS).map((entry) => entry.id);
  if (stale.length) {
    await transition(db, stale, { from: ["sending"], update: () => ({ state: "unknown", reason: "The send was interrupted. It may or may not have been recorded." }) });
  }

  const pending = (await db.collection("disciplineIncidents").where("form.state", "==", "pending").get()).docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((incident) => !shared.isVoidedIncident(incident))
    .filter((incident) => !scope.teacherEmail || incident.teacherOfRecord === scope.teacherEmail)
    .filter((incident) => !scope.classIds || scope.classIds.includes(incident.classId))
    .filter((incident) => !scope.dateKey || incident.dateKey === scope.dateKey);
  if (!pending.length) return summary;

  const [studentsById, classesById, scheduleSnapshot] = await Promise.all([
    studentsFor(db, pending.map((incident) => incident.studentId)),
    classesFor(db, pending.map((incident) => incident.classId)),
    db.collection("settings").doc("classSchedule").get(),
  ]);
  const schedule = scheduleSnapshot.exists ? scheduleSnapshot.data() : null;
  const { submissions, blocked } = shared.pendingFormSubmissions({ incidents: pending, studentsById });
  summary.blocked = blocked.map((entry) => ({ key: entry.key, reason: entry.reason }));

  const due = submissions.filter((submission) => {
    if (force) return true;
    const classPeriod = String(classesById.get(submission.classId)?.period || "");
    const dueAt = shared.submissionDueAtMs({ submission, classPeriod, schedule });
    if (dueAt > now) summary.waiting.push({ key: submission.key, dueAtMs: dueAt });
    return dueAt <= now;
  });
  if (!due.length) return summary;

  const form = await readLiveForm({ fetchImpl, shared });
  await db.collection("disciplineStatus").doc("form").set({
    ok: form.ok, problems: form.ok ? [] : form.problems, checkedAtMs: now,
  }, { merge: true });
  if (!form.ok) {
    summary.formProblems = form.problems;
    logger.warn("Discipline: the district form changed or could not be read; nothing was sent.", { problems: form.problems });
    return summary;
  }

  for (const submission of due) {
    const claimed = await transition(db, submission.incidentIds, {
      from: ["pending"],
      update: (previous) => ({ state: "sending", batchKey: submission.key, attemptAtMs: now, attempts: Number(previous.attempts || 0) + 1 }),
    });
    if (!claimed.length) continue; // undone, or taken by another run
    // Only the incidents still claimed go into the response.
    const incidents = pending.filter((incident) => claimed.includes(incident.id));
    const categories = new Set(incidents.map((incident) => shared.violationType(incident.type)?.formOption).filter(Boolean));
    const options = shared.DISTRICT_VIOLATION_FORM.options.filter((option) => categories.has(option));
    let reply;
    try {
      const response = await fetchImpl(shared.districtFormResponseUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: shared.formResponseBody({ entries: form.entries, sisStudentId: submission.sisStudentId, name: submission.name, options }),
        // Followed: a recorded response is never mistaken for a refusal
        // because Google answered it with a redirect.
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      reply = /accounts\.google\.com/.test(String(response.url || ""))
        ? shared.classifyFormReply({ status: 401 })
        : shared.classifyFormReply({ status: response.status });
    } catch (error) {
      reply = shared.classifyFormReply({ networkError: String(error?.cause?.code || error?.code || error?.message || error) });
    }
    const attempts = Number(pending.find((incident) => incident.id === claimed[0])?.form?.attempts || 0) + 1;
    const next = reply.state === "retry" && attempts >= MAX_RETRIES ? { state: "failed", reason: `${reply.reason} Tried ${attempts} times.` } : reply;
    await transition(db, claimed, {
      from: ["sending"],
      update: () => (next.state === "submitted"
        ? { state: "submitted", submittedAtMs: Date.now(), options, reason: null }
        : { state: next.state === "retry" ? "pending" : next.state, reason: next.reason || null }),
    });
    summary[next.state === "retry" ? "retry" : next.state].push({ key: submission.key, reason: next.reason || null });
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return summary;
}

module.exports = { submitDisciplineForms, SENDING_STALE_MS, MAX_RETRIES };
