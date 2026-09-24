/*
 * INTERACTIVE CAPABILITY CERTIFICATION — THE STUDENT ENTRY POINT.
 *
 * Each fixture starts where a real question starts: Assignment V5 authoring
 * JSON. It is compiled by the production compiler, prepared by the same
 * runtime repair the student assignment player applies, and mounted in the
 * real QuestionEngine with a real draftKey. The driver
 * (capabilityCertification.mjs) then performs the student's actions.
 *
 * `host: 'raw'` fixtures skip the player preparation on purpose: they mount a
 * stored record the way Teacher Question Review, library previews, Path and
 * Live Challenge hand it to QuestionEngine.
 *
 * The fixture list is read from the capability manifest, so a capability
 * cannot be certified against a question the manifest does not name.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import { buildQuestionDraftKey } from '../../src/questionDraftStorage.js';
import { INTERACTIVE_CAPABILITY_FIXTURES } from '../../src/platform/certification/interactiveCapabilityManifest.js';
import { CAPABILITY_ASSIGNMENT_ID, compileCapabilityFixture } from '../../src/platform/certification/capabilityFixtureRuntime.js';
import '../../src/index.css';
import '../../src/App.css';

const ASSIGNMENT = CAPABILITY_ASSIGNMENT_ID;

const QUESTIONS = INTERACTIVE_CAPABILITY_FIXTURES.map((fixture) => Object.freeze(compileCapabilityFixture(fixture)));

const params = new URLSearchParams(window.location.search);
const listeners = new Set();
let current = { questionIndex: Math.max(0, INTERACTIVE_CAPABILITY_FIXTURES.findIndex((fixture) => fixture.id === params.get('fixture'))) };
const notify = () => listeners.forEach((listen) => listen({ ...current }));

const draftKeyFor = (questionIndex) => buildQuestionDraftKey({
  studentId: 'certification-student', assignmentId: ASSIGNMENT, questionIndex, variantIndex: 0, sessionMode: 'graded',
});

const grades = [];
const stepGrades = [];

function Harness() {
  const [position, setPosition] = useState(current);
  useEffect(() => { listeners.add(setPosition); return () => listeners.delete(setPosition); }, []);
  const fixture = INTERACTIVE_CAPABILITY_FIXTURES[position.questionIndex];
  // A raw-host fixture mounts the way Teacher Question Review does: no draft.
  const draftKey = useMemo(() => (fixture.host === 'raw' ? null : draftKeyFor(position.questionIndex)), [fixture.host, position.questionIndex]);
  return (
    <div data-capability-fixture={fixture.id} data-question-index={position.questionIndex} style={{ maxWidth: 1200, margin: '0 auto' }}>
      <QuestionEngine
        key={`${ASSIGNMENT}-${position.questionIndex}`}
        question={QUESTIONS[position.questionIndex]}
        questionRecord={null}
        generationKey={`${ASSIGNMENT}|certification-student|${position.questionIndex}|variant:0`}
        onGrade={(payload) => { grades.push(payload); return null; }}
        onStepGrade={(payload) => { stepGrades.push(payload); return null; }}
        studentProfile={{}}
        activityRole="classwork"
        maximumAttempts={3}
        draftKey={draftKey}
        assignmentId={ASSIGNMENT}
        executionScope={fixture.host === 'raw' ? 'teacherRepairPreview' : 'student'}
      />
    </div>
  );
}

const plain = (value) => JSON.parse(JSON.stringify(value, (key, entry) => (typeof entry === 'function' ? undefined : entry)));

window.__mmCert = {
  fixtures: () => INTERACTIVE_CAPABILITY_FIXTURES.map((fixture) => fixture.id),
  go: (id) => {
    const index = INTERACTIVE_CAPABILITY_FIXTURES.findIndex((fixture) => fixture.id === id);
    if (index < 0) throw new Error(`unknown fixture ${id}`);
    current = { questionIndex: index };
    notify();
    return index;
  },
  question: () => plain(QUESTIONS[current.questionIndex]),
  grades: () => plain(grades),
  stepGrades: () => plain(stepGrades),
  clearStorage: () => { window.localStorage.clear(); return true; },
};

createRoot(document.getElementById('root')).render(<Harness />);
