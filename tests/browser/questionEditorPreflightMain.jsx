// The REAL Assignment Question Editor (wrapper + base, as the Teacher Workspace
// mounts it), opened on a stored assignment Pre-Flight has things to say about.
//
// The assignment is built by the driver (questionEditorPreflight.mjs) in node
// (tests/platform/helpers/editorPreflightFixtures.mjs) and handed to this page
// before it loads. Saves are recorded on window.__SAVES__; every firebase/*
// import is an in-memory fake (tests/browser/teacherWorkflow/vite.config.mjs).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { ToastProvider } from '../../src/ui/Toast.jsx';
import AssignmentQuestionEditor from '../../src/AssignmentQuestionEditor.jsx';
import { editorPreflightFindings } from '../../src/platform/preflight/questionPreflightFindings.js';
import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';

const fixtures = window.__QUESTION_EDITOR_FIXTURES__ || {};
const scenario = new URLSearchParams(window.location.search).get('scenario') || 'flagged';
const assignment = fixtures[scenario];
const ROSTERS = Object.freeze({ 'period-3': 28 });
window.__SAVES__ = [];
// One run of the findings the editor computes, timed here in the page (ms each).
window.__timeEditorPreflight = (runs = 3) => {
  const questions = getStoredAssignmentQuestions(assignment);
  return Array.from({ length: runs }, () => {
    const started = performance.now();
    editorPreflightFindings({ source: assignment, questions, classSize: 28 });
    return performance.now() - started;
  });
};

function Harness() {
  const [open, setOpen] = useState(true);
  if (!assignment) return <p data-harness-error>Unknown scenario {scenario}</p>;
  return open ? (
    <AssignmentQuestionEditor
      assignment={assignment}
      hasLiveProtection={false}
      fullAuditAuthorized={false}
      studentActivityStatus="unavailable"
      rosterSizesByClassId={ROSTERS}
      onSave={async (payload) => { window.__SAVES__.push(JSON.parse(JSON.stringify(payload))); }}
      onClose={() => setOpen(false)}
    />
  ) : <p data-harness-closed>closed</p>;
}

createRoot(document.getElementById('root')).render(<ToastProvider><Harness /></ToastProvider>);
