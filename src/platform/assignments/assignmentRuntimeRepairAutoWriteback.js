import {
  ASSIGNMENT_RUNTIME_REPAIR_VERSION,
  repairAssignmentForCurrentRuntime,
} from './assignmentRuntimeRepair.js';

const clean = (value) => String(value ?? '').trim();
const list = (value) => (Array.isArray(value) ? value : []);

/**
 * Pure selection for teacher-side automatic persistence.
 *
 * This function does not write anything. It only identifies saved Assignment V5
 * records whose current deterministic runtime repair actually changes content
 * and has already been certified safe-to-persist by the repair engine. A current
 * compatibility stamp skips repeat evaluation until the runtime repair version
 * changes in a future release.
 */
export const findAssignmentsNeedingRuntimeRepairPersistence = (assignments = []) => (
  list(assignments).flatMap((assignment) => {
    const assignmentId = clean(assignment?.id);
    if (!assignmentId || Number(assignment?.schemaVersion) !== 5) return [];

    const stampedVersion = Number(assignment?.runtimeCompatibility?.repairVersion) || 0;
    if (stampedVersion >= ASSIGNMENT_RUNTIME_REPAIR_VERSION) return [];

    const repairResult = repairAssignmentForCurrentRuntime(assignment, {
      source: 'teacherLibraryAutoWritebackScan',
    });
    if (repairResult.changed !== true || repairResult.safeToPersist !== true) return [];

    const repairKeys = [...new Set(list(repairResult.repairManifest)
      .filter((entry) => entry?.changed === true && entry?.safeToPersist === true)
      .map((entry) => clean(entry?.repairKey))
      .filter(Boolean))];
    if (!repairKeys.length) return [];

    return [{ assignment, assignmentId, repairKeys }];
  })
);

export default findAssignmentsNeedingRuntimeRepairPersistence;
