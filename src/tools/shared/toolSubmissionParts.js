/*
 * WHAT A REGISTRY TOOL'S CHECK RECORDS, PART BY PART.
 *
 * A tool reports its parts in `metadata.parts`, either as a list
 * ({ id, label, isCorrect, ... }) or as a map of part id to right/wrong. The
 * map has no names, and two tools (Inverse & Composition, Data Modeling) put
 * every part they KNOW in it, asked or not. So an inverse-only question was
 * recorded with "fog" and "gof" as wrong parts it never asked: a teacher's
 * gradebook listed them in red, the student's "Focus on:" line named them, and
 * the case review counted them.
 *
 * A tool can say which parts this question asked (`metadata.requiredParts`)
 * and what to call them (`metadata.partLabels`). Only asked parts are
 * recorded, under those names. A tool that says neither is recorded exactly as
 * before. Records already stored are not rewritten.
 *
 * Since server-authoritative grading, a mode with a shared grader records the
 * grader's parts instead (QuestionEngine, attemptInputsFromGrading) — a list,
 * already only the asked parts under the names the server stores; both tools
 * above now report that list. This mapping serves a mode graded on the device.
 */
export const toolSubmissionParts = (metadata = null) => {
  const rawParts = metadata?.parts;
  if (Array.isArray(rawParts)) {
    return rawParts.map((part, index) => ({
      id: part?.id || `part-${index + 1}`,
      label: part?.label || `Part ${index + 1}`,
      isComplete: part?.isComplete !== false,
      isCorrect: Boolean(part?.isCorrect),
      response: part?.response ?? '',
      // A structured misconception code the tool put on this part goes on to
      // the attempt record; the attempt policy keeps catalog ids only
      // (functions/shared/misconceptionCodes.mjs).
      ...(part?.misconceptionCode ? { misconceptionCode: part.misconceptionCode } : {}),
    }));
  }
  if (!rawParts || typeof rawParts !== 'object') return [];
  const asked = Array.isArray(metadata.requiredParts) ? new Set(metadata.requiredParts.map(String)) : null;
  const labels = metadata.partLabels && typeof metadata.partLabels === 'object' ? metadata.partLabels : {};
  return Object.entries(rawParts)
    .filter(([id]) => !asked || asked.has(id))
    .map(([id, value]) => ({
      id,
      label: typeof labels[id] === 'string' && labels[id].trim() ? labels[id] : id,
      isComplete: true,
      isCorrect: Boolean(value),
      response: '',
    }));
};

export default toolSubmissionParts;
