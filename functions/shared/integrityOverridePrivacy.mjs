/*
 * WHAT AN ACADEMIC-INTEGRITY CONSEQUENCE MAY PUT ON THE STUDENT'S OWN GRADE DOC.
 *
 * `grades/{studentId}` is readable by the student (firestore.rules), and the
 * active teacher override lives on it — in
 * `teacherGradeOverridesByAssignment` — because the Grade Center, Review My
 * Work, "What changed", the gradebook and Classroom must all apply the same
 * score. An integrity zero used to write, beside that score, the teacher's
 * free-text note, the teacher's identity (uid, email, name) and the
 * participant role ("received" / "supplied" assistance). A note can name
 * another student, and "supplied" says this student helped someone cheat.
 * None of that is the student's to read off their own document.
 *
 * The rule this file encodes:
 *
 *   - The grade doc keeps the consequence itself: active, score 0, the fixed
 *     reasonCode and its fixed `reason` label (the one neutral line a student
 *     screen shows — studentGradeCenterModel.js / reviewMyWork.js), the
 *     section, the time, and `incidentId`, an opaque link.
 *   - The note, the actor and the participant role live only on the
 *     teacher-confirmed incident, studentSupportEvents/{incidentId}: readable
 *     by its authorized teachers and the root admin, never by a student
 *     (firestore.rules). The immutable gradeOverrideAudits entry keeps its
 *     copy too (no client may read it at all).
 *
 * Pure and shared: the callable (overrideStudentAssignmentGrade), the
 * migration (scripts/migrate-integrity-override-notes.mjs) and the tests all
 * read this one definition.
 */

/** Teacher-only fields an integrity override must never carry on the grade doc. */
export const INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS = Object.freeze(['note', 'actor', 'participantRole']);

export const ASSIGNMENT_ZERO_SOURCE = 'teacher-assignment-zero';
export const SECTION_ZERO_SOURCE = 'teacher-section-zero';
export const ASSIGNMENT_OVERRIDE_KEY = '__assignment';
export const SECTION_INTEGRITY_KEY_PREFIX = '__sectionIntegrity_';
export const INTEGRITY_INCIDENT_COLLECTION = 'studentSupportEvents';
export const INTEGRITY_NOTE_MIGRATION_VERSION = 1;

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => isObject(value) && Object.prototype.hasOwnProperty.call(value, key);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

const cleanActor = (actor) => {
  if (!isObject(actor)) return null;
  const cleaned = {
    uid: text(actor.uid) || null,
    email: text(actor.email).toLowerCase() || null,
    name: text(actor.name) || null,
  };
  return cleaned.uid || cleaned.email || cleaned.name ? cleaned : null;
};

/**
 * One confirmed consequence, split by audience. `studentOverride` is what the
 * grade doc stores (per question for a section, under `__assignment` for the
 * whole assignment); `incidentDetails` is what only the incident stores.
 */
export const splitIntegrityConsequence = ({
  scope = 'assignment',
  reasonCode,
  reasonLabel,
  sectionRole = null,
  participantRole = null,
  note = '',
  actor = null,
  incidentId,
  at,
} = {}) => {
  const studentOverride = scope === 'section'
    ? {
      active: true, score: 0, persistent: true, source: SECTION_ZERO_SOURCE, incidentId,
      sectionRole, reasonCode, reason: reasonLabel, at,
    }
    : {
      active: true, score: 0, reasonCode, reason: reasonLabel,
      source: ASSIGNMENT_ZERO_SOURCE, incidentId, at,
    };
  return {
    studentOverride,
    incidentDetails: {
      note: text(note),
      actor: cleanActor(actor),
      participantRole: text(participantRole) || null,
    },
  };
};

/** A copy of one override entry without any teacher-only field. */
export const studentReadableOverrideEntry = (entry) => {
  if (!isObject(entry)) return entry;
  const next = { ...entry };
  INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS.forEach((field) => { delete next[field]; });
  return next;
};

const teacherOnlyDetailsOf = (entry) => ({
  note: text(entry?.note),
  actor: cleanActor(entry?.actor),
  participantRole: text(entry?.participantRole) || null,
});

const holdsTeacherOnlyField = (entry) => INTEGRITY_OVERRIDE_TEACHER_ONLY_FIELDS.some((field) => own(entry, field));
const hasDetails = (details) => Boolean(details.note || details.actor || details.participantRole);
const sameActor = (left, right) => {
  const a = cleanActor(left);
  const b = cleanActor(right);
  if (!a || !b) return !a && !b;
  return a.uid === b.uid && a.email === b.email && a.name === b.name;
};

/*
 * Stable id for an incident the migration has to create because the override
 * never linked one (or links one that no longer exists). Deterministic, so a
 * second run finds the incident the first one wrote instead of minting another.
 */
export const migratedIncidentId = ({ studentId, assignmentId, groupKey }) => (
  `integrityOverrideMigration_${String(studentId)}_${String(assignmentId)}_${String(groupKey)}`
    .replace(/[^A-Za-z0-9_.-]/g, '-')
    .slice(0, 400)
);

/**
 * THE MIGRATION PLAN FOR ONE STUDENT. Pure: the caller read the grade doc and
 * every incident the overrides link to (`incidentsById`: id → data, absent
 * when the document does not exist).
 *
 * Returns, per assignment, the override map with every teacher-only field
 * removed (`nextOverrides` — scores, active flags, sources and the section
 * restore state are untouched; an `incidentId` is ADDED only where the
 * migration had to create the incident), and the incident writes that make
 * sure the teacher-only copy exists before the grade copy goes:
 *
 *   fill    the linked incident lacks a field the grade doc holds: the field
 *           is added; a field it already holds is never overwritten, and a
 *           grade copy that DIFFERS from it is kept under
 *           integrityOverrideMigration.gradeCopies so nothing is lost.
 *   create  no incident exists to hold the details: a teacher-confirmed
 *           incident is written, authorized for the teacher who acted (or
 *           the student's assigned teacher).
 *
 * An entry whose details have nowhere to go (no incident and no teacher email
 * to authorize one) is left exactly as it is and reported `unresolved`.
 * Running the plan on its own output plans nothing.
 */
export const planIntegrityOverrideNoteMigration = ({
  studentId,
  gradeData = {},
  incidentsById = {},
  nowIso = new Date().toISOString(),
} = {}) => {
  const byAssignment = isObject(gradeData?.teacherGradeOverridesByAssignment)
    ? gradeData.teacherGradeOverridesByAssignment
    : {};
  const assignments = [];
  const incidentWrites = new Map();
  const unresolved = [];
  let strippedEntries = 0;

  // A second entry sharing an incident being created (a section zero writes
  // one entry per question): a copy that differs from the first is kept, not
  // dropped.
  const keepDiffering = (write, assignmentId, key, details) => {
    const held = write.data;
    const same = text(held.note) === details.note
      && sameActor(held.actor, details.actor)
      && (held.evidence?.participantRole || null) === details.participantRole;
    if (!same) write.gradeCopies[`${assignmentId}:${key}`] = details;
    return write.incidentId;
  };

  // Where one entry's details go. Returns the incident id that now holds them,
  // or null when there is nowhere safe to put them.
  const placeDetails = ({ assignmentId, key, entry, details }) => {
    const linkedId = text(entry?.incidentId);
    const linked = linkedId && isObject(incidentsById[linkedId]) ? incidentsById[linkedId] : null;
    const pending = linkedId ? incidentWrites.get(linkedId) : null;
    if (linked || pending?.op === 'fill') {
      const write = pending || { op: 'fill', incidentId: linkedId, data: {}, gradeCopies: {} };
      const current = linked;
      const fill = write.data;
      if (details.note) {
        if (!text(current?.note) && !fill.note) fill.note = details.note;
        else if (text(current?.note || fill.note) !== details.note) write.gradeCopies[`${assignmentId}:${key}`] = details;
      }
      if (details.actor) {
        if (!cleanActor(current?.actor) && !fill.actor) fill.actor = details.actor;
        else if (!sameActor(current?.actor || fill.actor, details.actor)) write.gradeCopies[`${assignmentId}:${key}`] = details;
      }
      if (details.participantRole) {
        const held = text(current?.evidence?.participantRole) || fill.evidence?.participantRole || '';
        if (!held) fill.evidence = { ...fill.evidence, participantRole: details.participantRole };
        else if (held !== details.participantRole) write.gradeCopies[`${assignmentId}:${key}`] = details;
      }
      incidentWrites.set(linkedId, write);
      return linkedId;
    }
    if (pending?.op === 'create') return keepDiffering(pending, assignmentId, key, details);

    const email = details.actor?.email || text(gradeData?.assignedTeacherEmail).toLowerCase();
    if (!email) return null;
    const scope = entry?.source === SECTION_ZERO_SOURCE ? 'section' : 'assignment';
    const sectionRole = scope === 'section' ? text(entry?.sectionRole) || null : null;
    const incidentId = linkedId || migratedIncidentId({
      studentId, assignmentId, groupKey: scope === 'section' ? `section-${sectionRole || key}` : 'assignment',
    });
    if (incidentWrites.has(incidentId)) return keepDiffering(incidentWrites.get(incidentId), assignmentId, key, details);
    if (isObject(incidentsById[incidentId])) {
      // A previous run created it but did not get to strip (or the plan is
      // being re-run): treat it as the linked incident.
      return placeDetails({ assignmentId, key, entry: { ...entry, incidentId }, details });
    }
    incidentWrites.set(incidentId, {
      op: 'create',
      incidentId,
      gradeCopies: {},
      data: {
        schemaVersion: 1,
        kind: 'academicIntegrityIncident',
        stage: 'teacherConfirmed',
        signalKey: `academicIntegrityIncident:${incidentId}`,
        studentId: String(studentId),
        studentName: null,
        classId: gradeData?.classId || null,
        originClassId: gradeData?.classId || null,
        assignmentId,
        assignmentTitle: null,
        originTeacherEmail: email,
        createdByEmail: email,
        authorizedTeacherEmails: [email],
        createdAt: text(entry?.at) || nowIso,
        source: 'teacher',
        confidence: 'confirmed',
        relatedEventId: incidentId,
        summary: text(entry?.reason) || null,
        note: details.note || '',
        actor: details.actor,
        evidence: {
          scope,
          sectionRole,
          incidentReason: text(entry?.reasonCode) || null,
          participantRole: details.participantRole,
        },
        integrityOverrideMigration: { version: INTEGRITY_NOTE_MIGRATION_VERSION, migratedAt: nowIso, created: true },
      },
    });
    return incidentId;
  };

  // Strip one entry; returns the next entry, or the SAME object when it must
  // stay as it is.
  // `fallbackIncidentId`: a prior override kept in a section's restore state
  // belongs with that section's incident; it is not itself linked to it.
  const migrateEntry = ({ assignmentId, key, entry, fallbackIncidentId = null }) => {
    if (!holdsTeacherOnlyField(entry)) return entry;
    const details = teacherOnlyDetailsOf(entry);
    let incidentId = text(entry.incidentId) || null;
    if (hasDetails(details)) {
      const placed = !incidentId && fallbackIncidentId ? { ...entry, incidentId: fallbackIncidentId } : entry;
      incidentId = placeDetails({ assignmentId, key, entry: placed, details });
      if (!incidentId) {
        unresolved.push({ assignmentId, key, reason: 'no-incident-and-no-teacher-email' });
        return entry;
      }
    }
    strippedEntries += 1;
    const next = studentReadableOverrideEntry(entry);
    if (incidentId && !text(entry.incidentId) && !fallbackIncidentId) next.incidentId = incidentId;
    return next;
  };

  Object.keys(byAssignment).sort().forEach((assignmentId) => {
    const overrides = byAssignment[assignmentId];
    if (!isObject(overrides)) return;
    let changed = false;
    const nextOverrides = {};
    Object.keys(overrides).forEach((key) => {
      const entry = overrides[key];
      let next = migrateEntry({ assignmentId, key, entry });
      // The section restore state carries the prior per-question overrides it
      // puts back; those are cleaned the same way, so a restore can never
      // bring a note back onto the grade doc.
      if (key.startsWith(SECTION_INTEGRITY_KEY_PREFIX) && isObject(next?.previousOverridesByQuestion)) {
        const priors = next.previousOverridesByQuestion;
        const nextPriors = {};
        let priorsChanged = false;
        Object.keys(priors).forEach((index) => {
          const migrated = migrateEntry({
            assignmentId, key: `${key}.${index}`, entry: priors[index], fallbackIncidentId: text(next.incidentId) || null,
          });
          if (migrated !== priors[index]) priorsChanged = true;
          nextPriors[index] = migrated;
        });
        if (priorsChanged) next = { ...next, previousOverridesByQuestion: nextPriors };
      }
      if (next !== entry) changed = true;
      nextOverrides[key] = next;
    });
    if (changed) assignments.push({ assignmentId, nextOverrides });
  });

  const writes = [...incidentWrites.values()]
    .map(({ gradeCopies = {}, ...write }) => {
      const data = { ...write.data };
      if (write.op === 'create') {
        if (Object.keys(gradeCopies).length) {
          data.integrityOverrideMigration = { ...data.integrityOverrideMigration, gradeCopies };
        }
        return { ...write, data };
      }
      if (Object.keys(gradeCopies).length) {
        data.integrityOverrideMigration = {
          version: INTEGRITY_NOTE_MIGRATION_VERSION, migratedAt: nowIso, gradeCopies,
        };
      } else if (Object.keys(data).length) {
        data.integrityOverrideMigration = { version: INTEGRITY_NOTE_MIGRATION_VERSION, migratedAt: nowIso };
      }
      return { ...write, data };
    })
    // A linked incident that already holds every field needs no write.
    .filter((write) => write.op === 'create' || Object.keys(write.data).length > 0);

  return {
    studentId: String(studentId),
    assignments,
    incidentWrites: writes,
    unresolved,
    counts: {
      assignmentsChanged: assignments.length,
      strippedEntries,
      incidentsFilled: writes.filter((write) => write.op === 'fill').length,
      incidentsCreated: writes.filter((write) => write.op === 'create').length,
      unresolved: unresolved.length,
    },
  };
};

/** Every incident id the plan may need to read for this grade doc. */
export const linkedIncidentIds = (gradeData = {}) => {
  const ids = new Set();
  const visit = (entry) => {
    if (holdsTeacherOnlyField(entry) && text(entry.incidentId)) ids.add(text(entry.incidentId));
  };
  Object.values(isObject(gradeData?.teacherGradeOverridesByAssignment) ? gradeData.teacherGradeOverridesByAssignment : {})
    .forEach((overrides) => {
      if (!isObject(overrides)) return;
      Object.entries(overrides).forEach(([key, entry]) => {
        visit(entry);
        if (key.startsWith(SECTION_INTEGRITY_KEY_PREFIX) && isObject(entry?.previousOverridesByQuestion)) {
          Object.values(entry.previousOverridesByQuestion).forEach(visit);
        }
      });
    });
  return [...ids].sort();
};
