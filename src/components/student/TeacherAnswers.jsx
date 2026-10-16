import { useEffect, useState } from 'react';
import { db } from '../../firebase.js';
import { myTeacherQuestionsQuery, watchQuestions } from '../../platform/supports/askTeacherStore.js';
import { TeacherAnswersList } from './TeacherAnswersList.jsx';

/*
 * Review My Work's "Your questions for your teacher" (student pass 3, HELP-5,
 * D6): the signed-in student's own questions on one assignment and their
 * teacher's answers (askTeacherStore.js; firestore.rules lets only the student
 * and their teacher read them), drawn by TeacherAnswersList.
 */
export default function TeacherAnswers({ studentId, assignmentId }) {
  const [questions, setQuestions] = useState([]);
  useEffect(() => {
    setQuestions([]);
    if (!studentId || !assignmentId) return undefined;
    // A read that fails shows nothing: the rest of Review My Work stands.
    return watchQuestions(myTeacherQuestionsQuery(db, { studentId, assignmentId }), setQuestions, () => setQuestions([]));
  }, [studentId, assignmentId]);
  return <TeacherAnswersList questions={questions} />;
}
