import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase.js';
import { prepareAssignmentForRuntime } from '../contract/storedAssignmentV5.js';
import { buildRuntimeRepairPersistencePatch } from './assignmentRuntimeRepairPersistence.js';

const clean = (value) => String(value ?? '').trim();
const inFlight = new Set();

const isTeacherSideRole = (role) => ['teacher', 'admin'].includes(clean(role).toLowerCase());

const persistenceKey = (assignmentId, patch) => [
  clean(assignmentId),
  Number(patch?.runtimeCompatibility?.repairVersion) || 0,
  ...(Array.isArray(patch?.runtimeCompatibility?.repairKeys) ? patch.runtimeCompatibility.repairKeys : []),
].join('::');

/**
 * Optional write-back for deterministic Assignment Runtime Self-Healing.
 *
 * Student runtime never calls this function. A teacher/admin caller supplies the
 * stored assignment, the pure runtime engine prepares the candidate, and the
 * independent persistence verifier decides whether the only permitted patch is
 * safe. Firestore receives exactly that patch — sections plus the compatibility
 * stamp — and never student attempts, grades, evidence, or Classroom identity.
 */
export const persistRuntimeRepairForTeacher = async ({
  assignmentId,
  storedAssignment,
  actorRole,
  nowIso = new Date().toISOString(),
} = {}) => {
  if (!isTeacherSideRole(actorRole)) {
    throw new Error('Only a teacher/admin surface may persist an Assignment Runtime Self-Healing repair. Student runtime is read-only.');
  }
  if (!auth.currentUser?.uid) {
    throw new Error('Sign in before persisting an Assignment Runtime Self-Healing repair.');
  }

  const id = clean(assignmentId || storedAssignment?.id);
  if (!id) throw new Error('A saved assignment id is required before a runtime repair can be persisted.');

  const repairResult = prepareAssignmentForRuntime(storedAssignment, {
    source: 'teacherRuntimeRepairPersistence',
  });
  const verified = buildRuntimeRepairPersistencePatch({
    storedAssignment,
    repairResult,
    nowIso,
  });

  if (!verified.patch) {
    return {
      persisted: false,
      repairResult,
      diagnostics: verified.diagnostics || [],
      runtimeCompatibility: storedAssignment?.runtimeCompatibility || null,
    };
  }

  const key = persistenceKey(id, verified.patch);
  if (inFlight.has(key)) {
    return {
      persisted: false,
      duplicateInFlight: true,
      repairResult,
      diagnostics: verified.diagnostics || [],
      runtimeCompatibility: verified.patch.runtimeCompatibility,
    };
  }

  inFlight.add(key);
  try {
    await updateDoc(doc(db, 'assignments', id), verified.patch);
    return {
      persisted: true,
      repairResult,
      diagnostics: verified.diagnostics || [],
      runtimeCompatibility: verified.patch.runtimeCompatibility,
    };
  } finally {
    inFlight.delete(key);
  }
};

export default persistRuntimeRepairForTeacher;
