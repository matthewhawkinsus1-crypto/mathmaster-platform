/*
 * THE CLASSROOM TOPIC STYLE FOLLOWS THE TEACHER (TT07; audit finding E3-46).
 *
 * classroomTopicNaming.js said how Classroom topics are named, and kept the
 * teacher's choice in the browser. A teacher who published from two devices got
 * "Module 2 • Topic 2" on one and "Week of Oct 12" on the other. The choice now
 * also lives in one small document only that teacher can read and write,
 * teacherPreferences/{uid} (firestore.rules), and a device reads it:
 *
 *   - when the Classroom screen opens, which shows it from then on;
 *   - just before an automatic publish names its topic (App.jsx).
 *
 * The browser's copy stays. It is what the screen shows first, and what a
 * publish uses when the saved choice cannot be read, so a failed read changes
 * nothing for the teacher. A choice already made in a browser before this
 * existed is saved for the teacher the first time that browser syncs and
 * nothing is saved yet; after that the saved choice wins everywhere.
 *
 * Every function takes the Firestore instance, so the emulator rule tests
 * (tests/rules/teacherPreferencesRules.test.mjs) run these exact reads and
 * writes against firestore.rules.
 */
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import {
  CLASSROOM_TOPIC_STYLES,
  DEFAULT_CLASSROOM_TOPIC_STYLE,
  saveClassroomTopicStyle,
  storedClassroomTopicStyle,
} from './classroomTopicNaming.js';

export const TEACHER_PREFERENCES_COLLECTION = 'teacherPreferences';

export const teacherPreferencesRef = (db, uid) => doc(db, TEACHER_PREFERENCES_COLLECTION, String(uid));

const isStyle = (value) => CLASSROOM_TOPIC_STYLES.includes(value);

/** The style the teacher saved, or null when none is saved. Throws when it cannot be read. */
export const readTeacherTopicStyle = async (db, uid) => {
  const snapshot = await getDoc(teacherPreferencesRef(db, uid));
  const saved = snapshot.exists() ? snapshot.data()?.classroomTopicStyle : null;
  return isStyle(saved) ? saved : null;
};

/** Save the teacher's choice (the only field, with the server's time). */
export const saveTeacherTopicStyle = (db, uid, style) => {
  if (!isStyle(style)) throw new Error('unknown-topic-style');
  return setDoc(teacherPreferencesRef(db, uid), { classroomTopicStyle: style, updatedAt: serverTimestamp() });
};

/**
 * Which style a device uses, and whether its own choice should be saved for the
 * teacher. `saved` is the teacher's document (null when none), `browser` this
 * browser's own explicit choice (null when none was ever made here).
 */
export const reconcileTopicStyle = ({ saved = null, browser = null } = {}) => {
  if (isStyle(saved)) return { style: saved, saveForTeacher: false };
  if (isStyle(browser)) return { style: browser, saveForTeacher: true };
  return { style: DEFAULT_CLASSROOM_TOPIC_STYLE, saveForTeacher: false };
};

/**
 * Read the teacher's saved choice and bring this browser in line with it.
 * Returns the style to use; never throws. With nothing signed in, or when the
 * saved choice cannot be read, the browser's own choice stands.
 */
export const syncTeacherTopicStyle = async ({
  db,
  uid,
  read = readTeacherTopicStyle,
  save = saveTeacherTopicStyle,
} = {}) => {
  const browser = storedClassroomTopicStyle();
  if (!db || !String(uid || '').trim()) return browser || DEFAULT_CLASSROOM_TOPIC_STYLE;
  let saved;
  try {
    saved = await read(db, uid);
  } catch {
    return browser || DEFAULT_CLASSROOM_TOPIC_STYLE;
  }
  const { style, saveForTeacher } = reconcileTopicStyle({ saved, browser });
  // Only the teacher's own choice is written into the browser: a browser that
  // never chose anything must not start to look as if it had.
  if (isStyle(saved) && saved !== browser) saveClassroomTopicStyle(saved);
  if (saveForTeacher) {
    try {
      await save(db, uid, style);
    } catch {
      // Not saved this time; the next sync tries again.
    }
  }
  return style;
};

/** The teacher's choice from now on: this browser at once, and the teacher's document behind it. */
export const chooseTeacherTopicStyle = async ({ db, uid, style, save = saveTeacherTopicStyle } = {}) => {
  saveClassroomTopicStyle(style);
  if (!db || !String(uid || '').trim() || !isStyle(style)) return false;
  try {
    await save(db, uid, style);
    return true;
  } catch {
    return false;
  }
};

export default syncTeacherTopicStyle;
