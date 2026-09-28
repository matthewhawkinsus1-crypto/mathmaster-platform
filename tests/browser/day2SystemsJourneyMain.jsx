import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import LESSON from '../../docs/assignments/Algebra_II_Honors_3x3_Systems_Day2_V5.json';
import '../../src/index.css';
import '../../src/App.css';

const ASSIGNMENT = 'issue-371-day2-systems';
const STUDENT = 'issue-371-student';
const sections = LESSON.sections;

const params = new URLSearchParams(window.location.search);
const startSection = Math.max(0, sections.findIndex((section) => section.id === params.get('s')));
let current = { section: startSection, index: Math.max(0, Number(params.get('q') || 0)) };
const listeners = new Set();
const notify = () => listeners.forEach((listen) => listen({ ...current }));

const flatIndex = (sectionIndex, index) => sections.slice(0, sectionIndex).reduce((sum, section) => sum + section.questions.length, 0) + index;
const draftKeyFor = (sectionIndex, index) => buildQuestionDraftKey({
  studentId: STUDENT,
  assignmentId: ASSIGNMENT,
  questionIndex: flatIndex(sectionIndex, index),
  variantIndex: 0,
  sessionMode: 'graded',
});

const grades = [];

function Harness() {
  const [position, setPosition] = useState(current);
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);
  const section = sections[position.section];
  const question = section.questions[position.index];
  const draftKey = useMemo(() => draftKeyFor(position.section, position.index), [position.section, position.index]);
  const dol = section.role === 'dol';
  return (
    <div style={{ maxWidth: 1180, margin: '0 auto', padding: '12px 16px' }} data-section={section.id} data-question-id={question.questionId}>
      <nav aria-label="Day 2 journey" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 10 }}>
        {sections.map((entry, sectionIndex) => entry.questions.map((item, index) => (
          <button
            key={item.questionId}
            type="button"
            onClick={() => { current = { section: sectionIndex, index }; notify(); }}
            aria-current={sectionIndex === position.section && index === position.index ? 'step' : undefined}
            style={{ padding: '6px 10px', borderRadius: 999, border: '1px solid #b8cdf0', background: sectionIndex === position.section && index === position.index ? '#174ea6' : '#fff', color: sectionIndex === position.section && index === position.index ? '#fff' : '#174ea6', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            {entry.role === 'warmup' ? 'WU' : entry.role === 'classwork' ? 'CW' : entry.role === 'practice' ? 'PR' : 'DOL'} {index + 1}
          </button>
        )))}
      </nav>
      <div style={{ padding: '10px 14px', border: '1px solid #c6d6f2', borderLeft: '4px solid #1a73e8', borderRadius: 10, background: '#f8fbff', marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 900, color: '#174ea6', letterSpacing: '.06em' }}>{section.title.toUpperCase()}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#1f2a3c', marginTop: 4 }}>{question.prompt}</div>
      </div>
      <QuestionEngine
        key={`${ASSIGNMENT}-${question.questionId}-draft0`}
        question={question}
        questionRecord={null}
        generationKey={`${ASSIGNMENT}|${STUDENT}|${question.questionId}|variant:0`}
        onGrade={(isCorrect, details) => { grades.push({ questionId: question.questionId, isCorrect, details }); return null; }}
        onStepGrade={() => {}}
        studentProfile={{}}
        activityRole={section.role}
        dolMode={dol}
        maximumAttempts={section.attemptsAllowed || 3}
        draftKey={draftKey}
        assignmentId={ASSIGNMENT}
        executionScope="student"
      />
    </div>
  );
}

const readDrafts = (prefix) => {
  const drafts = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(prefix)) drafts[key.slice(prefix.length)] = JSON.parse(window.localStorage.getItem(key)).value;
  }
  return drafts;
};

window.__mm371 = {
  go: (sectionId, index) => {
    const sectionIndex = sections.findIndex((entry) => entry.id === sectionId);
    if (sectionIndex === -1) return;
    current = { section: sectionIndex, index };
    notify();
  },
  drafts: () => readDrafts(`mm:draft:${STUDENT}:${ASSIGNMENT}:`),
  grades: () => [...grades],
  position: () => ({ ...current }),
};

createRoot(document.getElementById('root')).render(<Harness />);
