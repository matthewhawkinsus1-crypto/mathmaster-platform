import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase.js';

// Teacher-only view of the secure My Math Path bank for the Path Simulator.
//
// Production students never read answer-bearing bank documents. Teachers
// already have read access to pathQuestionBank in Firestore rules because they
// author/review Path content. The simulator uses that authorized view so it can
// run the SAME published bank locally without depending on classroom
// assignments. This is deliberately a simulator service, not a student service.
//
// We load all active records instead of filtering by course in Firestore. A
// course session may legitimately descend into an Algebra I or middle-school
// prerequisite, so a course-only query would recreate the old "no question"
// dead end on remediation. At the current bank size this is comfortably small
// for a teacher-only QA screen, and the short cache prevents repeat downloads.

const CACHE_MS = 60_000;
let cache = { at: 0, records: null };

export const clearTeacherPathBankSnapshotCache = () => {
  cache = { at: 0, records: null };
};

export const fetchTeacherPathBankSnapshot = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && cache.records && now - cache.at < CACHE_MS) return cache.records;

  const snapshot = await getDocs(collection(db, 'pathQuestionBank'));
  const records = snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((entry) => entry.active !== false);

  cache = { at: now, records };
  return records;
};

export default fetchTeacherPathBankSnapshot;
