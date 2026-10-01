import { useEffect, useState } from 'react';
import { loadClassPracticePassKeys, practicePassKey } from './rewardsClient.js';

/*
 * Which students in a class have Practice excused by a Practice Pass, for the
 * teacher's grade views. One authorized read per class while a grade view is
 * open (the same server-side source Grade Transfer reads); no listener.
 *
 * Returns a predicate (student, assignment) => boolean, ready for
 * classGradeProgress's `hasPracticePass`. Until the read lands — or when it
 * fails — the predicate says no, which shows the plain grade, never a
 * fabricated excusal.
 */
export function useClassPracticePasses(classId, enabled = true) {
  const [keys, setKeys] = useState(() => new Set());
  useEffect(() => {
    setKeys(new Set());
    if (!enabled || !classId) return undefined;
    let cancelled = false;
    loadClassPracticePassKeys(classId)
      .then((loaded) => { if (!cancelled) setKeys(loaded); })
      .catch((error) => console.warn('Practice Pass waivers are unavailable for the gradebook:', error));
    return () => { cancelled = true; };
  }, [classId, enabled]);
  return (student, assignment) => Boolean(student?.id && assignment?.id && keys.has(practicePassKey(student.id, classId, assignment.id)));
}
