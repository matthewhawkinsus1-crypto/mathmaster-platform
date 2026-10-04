// The REAL Assignment Question Editor (wrapper + base, as App.jsx mounts it),
// opened on a live assignment whose question was retired and replaced.
//
// The assignment is built by the driver (questionEditorSupersession.mjs) in
// node from the real certified lesson, the real recipe registry and the real
// history-safe swap, and handed to this page before it loads — so nothing
// here can drift from what production would store. Saves are recorded on
// window.__SAVES__ instead of reaching Firestore; every firebase/* import is
// an in-memory fake (served through tests/browser/teacherWorkflow/vite.config.mjs).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { ToastProvider } from '../../src/ui/Toast.jsx';
import AssignmentQuestionEditor from '../../src/AssignmentQuestionEditor.jsx';

const fixtures = window.__QUESTION_EDITOR_FIXTURES__ || {};
const scenario = new URLSearchParams(window.location.search).get('scenario') || 'swap';
const assignment = fixtures[scenario];
window.__SAVES__ = [];

function Harness() {
  const [open, setOpen] = useState(true);
  if (!assignment) return <p data-harness-error>Unknown scenario {scenario}</p>;
  return open ? (
    <AssignmentQuestionEditor
      assignment={assignment}
      hasLiveProtection
      fullAuditAuthorized={false}
      studentActivityStatus="present"
      onSave={async (payload) => { window.__SAVES__.push(JSON.parse(JSON.stringify(payload))); }}
      onClose={() => setOpen(false)}
    />
  ) : <p data-harness-closed>closed</p>;
}

createRoot(document.getElementById('root')).render(<ToastProvider><Harness /></ToastProvider>);
