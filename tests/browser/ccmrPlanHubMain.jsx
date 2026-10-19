// The CCMR hub with a saved plan, in a real browser, at desktop and phone width.
//
// The real CCMRHub, fed by the real path engine (buildStudentPathOptions for a
// fresh Algebra I student in October) and a synthetic CCMR plan held in React
// state. Saving the test date or toggling a goal updates that state the way
// the live container's callable round trip does — nothing here can reach
// Firestore: the hub does not import the store, and the driver aborts every
// non-localhost request.
//
// HOW TO RUN: see tests/browser/ccmrPlanHub.mjs.
import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/theme/tokens.css';
import CCMRHub from '../../src/components/student/CCMRHub.jsx';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { ccmrPlanWithGoals, ccmrPlanWithTest } from '../../src/platform/ccmr/ccmrPlan.js';

// Noon in Chicago, 7 October 2026: a test on the 30th is 23 days away.
const NOW = Date.parse('2026-10-07T17:00:00Z');

const plan = (goals, testDate = null, testFramework = null) => ({
  goals: goals.map((framework) => ({ framework, since: NOW })),
  testDate,
  testFramework,
});

const READY = Object.freeze({ loaded: true, error: null, editable: true, state: 'idle', message: null });

const SCENES = {
  student: { plan: plan(['digitalSAT', 'tsia2'], '2026-10-30', 'digitalSAT'), status: READY },
  studentNoPlan: { plan: null, status: READY },
  studentLoading: { plan: null, status: { ...READY, loaded: false, editable: false } },
  teacher: { plan: plan(['act', 'asvab'], '2026-11-14', 'act'), status: { ...READY, editable: false }, readOnly: true },
  teacherNoPlan: { plan: null, status: { ...READY, editable: false }, readOnly: true },
};

const listeners = new Set();
let current = 'student';
window.__mmCcmrScene = (name) => { current = name; listeners.forEach((notify) => notify(name)); };
window.__mmCcmrScenes = Object.keys(SCENES);

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div data-mm-crashed="1">CRASH: {String(this.state.error?.message || this.state.error)}</div>;
    return this.props.children;
  }
}

function Scene({ name }) {
  const config = SCENES[name];
  const pathOptions = useMemo(() => buildStudentPathOptions({
    student: {}, assignments: [], courseId: 'algebra1', nowValue: NOW,
  }), []);
  const [savedPlan, setSavedPlan] = useState(config.plan);
  const [status, setStatus] = useState(config.status);
  const goals = (savedPlan?.goals || []).map((goal) => goal.framework);
  const save = (next) => {
    // The live container's round trip, minus the network: the plan the
    // server would store comes back and the status says it was saved.
    setSavedPlan(next);
    setStatus({ ...READY, state: 'saved' });
    window.__mmCcmrSaves = [...(window.__mmCcmrSaves || []), next];
  };
  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 16px 40px', background: 'var(--mm-surface-sunken)' }}>
      <CCMRHub
        pathOptions={pathOptions}
        assessmentEvidence={{}}
        directIndex={null}
        goals={goals}
        plan={savedPlan}
        planStatus={status}
        teacherPriorities={[]}
        onChangeGoals={(next) => save(ccmrPlanWithGoals(savedPlan, next))}
        onChangeTest={(test) => save(ccmrPlanWithTest(savedPlan, test))}
        onPractise={() => {}}
        onReturnToCourse={() => {}}
        readOnly={Boolean(config.readOnly)}
        now={NOW}
      />
    </div>
  );
}

function Harness() {
  const [scene, setScene] = useState(current);
  useEffect(() => {
    listeners.add(setScene);
    return () => listeners.delete(setScene);
  }, []);
  return (
    <div data-mm-scene={scene}>
      <Boundary key={scene}>{SCENES[scene] ? <Scene name={scene} /> : null}</Boundary>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
