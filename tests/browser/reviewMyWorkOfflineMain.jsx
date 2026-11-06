// The result page of closed work with its feedback released, as App draws it:
// the REAL result screen and the REAL Review My Work panel of
// src/app/lazyScreens.js, each with its own chunk and its own boundary.
// Nothing in this page imports either statically.
//
// As in production, the result screen's code is fetched ahead (Home's idle
// prefetch, studentScreenPrefetch.js; here as soon as the page loads) and
// Review My Work's is not: it arrives only when the panel asks for it. So the
// driver can go offline in between, and nothing is drawn until it asks
// (window.__mmResultScene). The page reads the shared fixture
// (tests/platform/fixtures/studentTodayScreens.mjs); `load` is a local fake:
// this page never calls a server.
//
// HOW TO RUN: see tests/browser/reviewMyWork.mjs.
import { createRoot } from 'react-dom/client';
import { ReviewMyWork, StudentAssignmentResult } from '../../src/app/lazyScreens.js';
import { NOW, buildScreens } from '../platform/fixtures/studentTodayScreens.mjs';
import '../../src/index.css';
import '../../src/App.css';

const screens = buildScreens();
const question = { questionId: 'q-lit', type: 'literal', prompt: 'Simplify $3(x+2)-3x$.', acceptedAnswers: ['6'] };
const assignment = {
  id: 'closed',
  schemaVersion: 5,
  title: 'Functions & Domain/Range',
  assignedClassIds: ['class-1'],
  sections: [{ id: 'cw', role: 'classwork', title: 'Classwork', questions: [question] }],
};
const result = {
  assignmentId: assignment.id,
  title: assignment.title,
  excused: false,
  assignmentChange: null,
  questions: [{
    index: 0, questionId: question.questionId, sectionTitle: 'Classwork', sectionRole: 'classwork', prompt: question.prompt,
    deliveredQuestion: question, solutionSource: 'assignment', submittedResponse: { kind: 'value', type: 'literal', value: '6', fields: [] },
    responseSource: 'submitted', outcome: 'correct', credit: 100, teacherChanged: false, teacherReason: null,
  }],
};
const load = () => new Promise((resolve) => setTimeout(() => resolve(result), 50));

const root = createRoot(document.getElementById('root'));
window.__mmResultScene = (name) => {
  root.render(name === 'closedReview' ? (
    <main data-mm-scene={name} style={{ minHeight: '100vh', background: 'var(--mm-page-bg, #f1f3f4)', boxSizing: 'border-box' }}>
      <StudentAssignmentResult
        entry={screens.gradeEntryOf('closed')}
        todayEntry={screens.todayEntryOf('closed')}
        upNext={screens.upNextAfter('closed')}
        nowValue={NOW}
        onBackToHome={() => {}}
        onViewAllGrades={() => {}}
        onViewAllAssignments={() => {}}
        onPractice={() => {}}
        reviewPanel={<ReviewMyWork assignment={assignment} load={load} studentProfile={null} />}
      />
    </main>
  ) : <main data-mm-scene="blank" />);
};
window.__mmResultScene('blank');
StudentAssignmentResult.prefetch().then(() => { window.__mmResultScreenHere = true; });
