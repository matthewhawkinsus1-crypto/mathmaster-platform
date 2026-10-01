// The teacher's console in the bridge harness (graphFeatureRushGame.mjs).
//
// The roster and classes the console is given in the app come from the
// driver (window.__mmTeacherProps, set before the page loads); everything the
// console does after that runs the real server code through the bridge.
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import LiveChallengeTeacher from '../../src/components/liveChallenge/LiveChallengeTeacher.jsx';

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div data-mm-crashed="1">CRASH: {String(this.state.error?.message || this.state.error)}</div>;
    return this.props.children;
  }
}

const props = window.__mmTeacherProps || {};

createRoot(document.getElementById('root')).render(
  <Boundary>
    <div data-mm-teacher="1" style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      <LiveChallengeTeacher
        allStudents={props.allStudents || []}
        classes={props.classes || []}
        courseProfiles={{}}
        signedInEmail={props.email || ''}
        assignments={[]}
        onLinkWarmupChallenge={null}
      />
    </div>
  </Boundary>,
);
