import React from 'react';
import { MathfieldElement } from 'mathlive';
MathfieldElement.fontsDirectory = '/node_modules/mathlive/fonts';
MathfieldElement.soundsDirectory = null;
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import day2 from '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5_FINAL.json';
import '../../src/index.css';
import '../../src/App.css';
const questions = day2.sections.flatMap((section) => section.questions);
const params = new URLSearchParams(location.search);
const id = params.get('q') || '3x3-d2-cw-1';
const assignmentId = `local-390-day2-${params.get('run') || 'manual'}`;
const questionIndex = questions.findIndex((q) => q.questionId === id);
const question = questions[questionIndex];
const draftKey = buildQuestionDraftKey({ studentId:'local-390-student', assignmentId, questionIndex, variantIndex:0, sessionMode:'graded' });
createRoot(document.getElementById('root')).render(<main style={{maxWidth:1360,margin:'auto',padding:12}}>
  <nav aria-label="Day 2 questions">{questions.filter((q)=>q.type === 'systemsWorkspace').map(q=><a key={q.questionId} href={`?q=${q.questionId}`} style={{marginRight:12}}>{q.questionId}</a>)}</nav>
  <QuestionEngine key={id} question={question} questionRecord={null} generationKey={`local390|${id}`}
    onGrade={(isCorrect,details,parts,support,responseKey)=>{(window.__day2Grades ||= []).push({isCorrect,responseKey});return null;}} onStepGrade={()=>{}} studentProfile={{}} activityRole="classwork" maximumAttempts={10}
    draftKey={draftKey} assignmentId={assignmentId} executionScope="student" />
</main>);
