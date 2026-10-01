// A student's screen in the bridge harness (graphFeatureRushGame.mjs).
//
// Mounted the way App.jsx mounts it: the student's invite is watched through
// the real watcher, and each new room is a new mount. The student id comes
// from the URL; every callable runs the real server code through the bridge.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import LiveChallengeStudent from '../../src/components/liveChallenge/LiveChallengeStudent.jsx';
import { watchLiveChallengeInvite } from '../../src/platform/liveChallenge/liveChallengeService.js';

const studentId = new URLSearchParams(window.location.search).get('studentId');

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div data-mm-crashed="1">CRASH: {String(this.state.error?.message || this.state.error)}</div>;
    return this.props.children;
  }
}

function Harness() {
  const [invite, setInvite] = useState(null);
  const [exited, setExited] = useState(false);
  useEffect(() => watchLiveChallengeInvite(studentId, setInvite), []);
  if (exited) return <div data-mm-exited="1"><button type="button" onClick={() => setExited(false)}>Back to the game</button></div>;
  if (!invite) return <div data-mm-waiting="1">waiting for an invite</div>;
  return (
    <Boundary>
      <div data-mm-game="1">
        <LiveChallengeStudent
          key={invite.roomId || 'none'}
          invite={invite}
          studentProfile={{ studentId, name: studentId }}
          onExit={() => setExited(true)}
          exitLabel="Back to Dashboard"
        />
      </div>
    </Boundary>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
