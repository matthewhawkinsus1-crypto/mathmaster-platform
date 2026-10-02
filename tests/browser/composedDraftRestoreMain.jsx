// A composed question with a graph step, in the real QuestionEngine, with the
// background draft sync App.jsx runs and the restore App.jsx runs when an
// assignment opens. Driven by tests/browser/composedDraftRestore.mjs.
//
// Nothing about the draft layer is mocked. The page writes through the real
// `writeQuestionDraft`, the real `createWorkspaceDraftSync` decides what may be
// backed up (the guard included), and its flush is merged into an in-page copy
// of `studentWorkspaceDrafts/{student}__{assignment}` by the same
// `mergeWorkspaceDraftDocument` App.jsx's Firestore transaction runs. A "new
// device" is a fresh browser context that starts with nothing but that server
// copy (window.__mmServerSeed, set by the driver before the page loads).
//
//   ?q=model|tableGraph|analysis|relation
//                                table -> graph -> domain -> range (graded by
//                                the graph's own verdict) | a plotted table,
//                                its family, an x-intercept and the domain (the
//                                plot closes once the intercept step is in
//                                reach) | a relation plotted and its domain
//                                (graded by the plotted pairs)
//   ?role=practice|dol           the activity policy (default practice)
//   ?run=<id>                    the student, so every run has its own drafts
//   ?restore=after|before        when the server copy is applied: `after` is
//                                a read slower than the question (it mounts,
//                                then the read resolves and the question
//                                remounts); `before` a read that beat it
//   ?delay=<ms>                  how long the server read takes (default 250)
//
// What a Submit would send lands in window.__mmGraded.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import QuestionEngine from '../../src/QuestionEngine.jsx';
import {
  buildQuestionDraftKey,
  questionDraftSavedAt,
  restoreQuestionDrafts,
  subscribeToQuestionDrafts,
} from '../../src/questionDraftStorage.js';
import { createWorkspaceDraftSync } from '../../src/platform/persistence/workspaceDraftSync.js';
import { listDraftSyncRejections } from '../../src/platform/persistence/draftSyncDiagnostics.js';
import {
  mergeWorkspaceDraftDocument,
  readWorkspaceDraftEntries,
  selectRestorableDraftEntries,
} from '../../functions/shared/workspaceDraftSchema.mjs';
import { activeStages, readComposedQuestion } from '../../src/platform/workflow/questionWorkflow.js';
import { gradeWorkflow } from '../../src/platform/workflow/workflowGrading.js';
import '../../src/index.css';
import '../../src/App.css';

const params = new URLSearchParams(window.location.search);
const role = params.get('role') || 'practice';
const which = params.get('q') || 'model';
const run = params.get('run') || 'a';
const restoreMode = params.get('restore') === 'before' ? 'before' : 'after';
const restoreDelay = Number.isFinite(Number(params.get('delay'))) ? Number(params.get('delay')) : 250;

const STUDENT = `pq043-student-${run}`;
const ASSIGNMENT = 'pq043-assignment';

const QUESTIONS = {
  // composedOutcomePolicyMain's model question: the graph is graded by the
  // plotting surface's own verdict (useStageVerdict, consistentWith: table).
  model: {
    id: 'pq043-model',
    type: 'relationshipModel',
    prompt: 'A pattern follows y = 2x + 1.',
    recipe: { name: 'functionModeling', ask: ['table', 'graph', 'domain', 'range'] },
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graphMode: 'continuous',
    tableXValues: [0, 1, 2],
    graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
    correctDomain: '(-\\infty, \\infty)',
    correctRange: '(-\\infty, \\infty)',
  },
  // The same table and graph, alone: two steps, so stacked, and the graph
  // step's workspace mounts with the page — its draft named after the table it
  // is built from (a table restored without its check must be whole again by
  // then).
  tableGraph: {
    id: 'pq043-table-graph',
    type: 'relationshipModel',
    prompt: 'A pattern follows y = 2x + 1.',
    recipe: { name: 'functionModeling', ask: ['table', 'graph'] },
    functionSpec: { type: 'linear', m: 2, b: 1 },
    graphMode: 'continuous',
    tableXValues: [0, 1, 2],
    graph: { xMin: -10, xMax: 10, yMin: -10, yMax: 10 },
  },
  // The staged function-characteristics question, shortened. Its plot is
  // graded by its own verdict and CLOSES (reveals) once the intercept step is
  // within reach, so the plotting workspace never mounts there again.
  analysis: {
    id: 'pq043-analysis',
    type: 'graphAnalysis',
    prompt: 'The table shows a function. Graph it, then describe what it does.',
    recipe: { name: 'functionCharacteristics', ask: ['plot', 'model', 'xIntercept', 'domain'] },
    pairs: [[-1, 0], [0, 5], [2, 9], [4, 5], [5, 0]],
    graph: { xMin: -6, xMax: 8, yMin: -4, yMax: 12 },
    functionFamily: 'Quadratic',
    correctEquation: '-(x - 2)^2 + 9',
    correctDomain: 'all real numbers',
  },
  // relationPlotGradingMain's relation: the plot is graded by its points.
  relation: {
    id: 'pq043-relation',
    type: 'relationMapping',
    prompt: 'Plot this relation.',
    pairs: [[-2, 3], [1, 2], [3, -1], [-4, -3]],
    recipe: { name: 'relationRepresentations', ask: ['plot', 'domain'] },
  },
};
const question = QUESTIONS[which] || QUESTIONS.model;
const draftKey = buildQuestionDraftKey({
  studentId: STUDENT, assignmentId: ASSIGNMENT, questionIndex: 0, variantIndex: 0, sessionMode: 'graded',
});

/* ------------------------------------------------------ the server copy */

let server = window.__mmServerSeed ? JSON.parse(JSON.stringify(window.__mmServerSeed)) : null;
const flushed = [];
const writeToServer = async ({ document }) => {
  flushed.push(document);
  server = mergeWorkspaceDraftDocument({ existing: server, patch: document });
};

// App.jsx's recovery step 3: a stored draft is written back only where it is
// newer than this device's copy and than the question's last attempt.
const restoreFromServer = () => {
  if (!server) return 0;
  const restorable = selectRestorableDraftEntries({
    entries: readWorkspaceDraftEntries(server),
    localSavedAt: (key) => questionDraftSavedAt(key),
    canonicalSavedAt: () => 0,
  });
  return restoreQuestionDrafts(restorable);
};

window.__mmRestore = { mode: restoreMode, restored: null };
if (restoreMode === 'before') window.__mmRestore.restored = restoreFromServer();

window.__mmGraded = null;

function Harness() {
  const [generation, setGeneration] = useState(0);

  // App.jsx's SERVER-BACKED WORKING DRAFTS effect: the sync is created and the
  // server read started in the parent's effect, which React runs after the
  // question below has mounted.
  useEffect(() => {
    const sync = createWorkspaceDraftSync({
      studentId: STUDENT,
      assignmentId: ASSIGNMENT,
      flush: writeToServer,
      debounceMs: 150,
    });
    window.__mmSync = sync;
    const unsubscribe = subscribeToQuestionDrafts((event) => sync.record(event));
    let cancelled = false;
    let timer = null;
    // Then, as App.jsx does once the read is back, the sync is told what the
    // server holds (PQ-044).
    const serverEntries = () => (server ? readWorkspaceDraftEntries(server) : []);
    if (restoreMode === 'after') {
      timer = window.setTimeout(() => {
        if (cancelled) return;
        const restored = restoreFromServer();
        window.__mmRestore.restored = restored;
        // App.jsx remounts the question when anything was restored.
        if (restored) setGeneration((value) => value + 1);
        sync.noteServerCopy(serverEntries());
      }, restoreDelay);
    } else {
      sync.noteServerCopy(serverEntries());
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
      void sync.flushNow();
      sync.stop();
    };
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }} data-generation={generation}>
      <QuestionEngine
        // App.jsx's key shape, including the restore generation.
        key={`${ASSIGNMENT}-0-0-open-draft${generation}`}
        question={question}
        questionRecord={{ status: 'unattempted', attemptCount: 0 }}
        maximumAttempts={3}
        activityRole={role}
        draftKey={draftKey}
        executionScope="student"
        // The live answer state QuestionEngine would submit, on every change.
        onSpotlightFrame={(frame) => { window.__mmAnswerState = frame?.answerState || null; }}
        onGrade={async (isCorrect, details, parts, supportUsage, responseKey, meta) => {
          window.__mmGraded = { isCorrect, parts, responseKey, partialCreditPercent: meta?.partialCreditPercent ?? null };
          return { isCorrect, status: isCorrect ? 'correct' : 'attempted', attemptCount: 1, remainingAttempts: 2 };
        }}
      />
    </div>
  );
}

const localDrafts = () => {
  const out = {};
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(draftKey)) {
      try { out[key.slice(draftKey.length)] = JSON.parse(window.localStorage.getItem(key)); } catch { /* ignore */ }
    }
  }
  return out;
};

window.__mm = {
  draftKey,
  question,
  server: () => (server ? JSON.parse(JSON.stringify(server)) : null),
  flushed: () => flushed.length,
  flush: async () => { await window.__mmSync?.flushNow(); return true; },
  stats: () => window.__mmSync?.stats() || null,
  rejections: () => listDraftSyncRejections(),
  local: localDrafts,
  // What WorkflowRunner reports for the stored responses, the way it computes
  // it: the steps this student is asked, graded by the composed grading rules.
  gradeLocal: () => {
    const stored = localDrafts()[':workflow-responses']?.value || {};
    const { workflow, grading } = readComposedQuestion(question);
    return gradeWorkflow({ stages: activeStages(workflow, stored), responses: stored, grading });
  },
};

createRoot(document.getElementById('root')).render(<Harness />);
