// A whole Live Challenge, played in a real browser against a real Firestore.
//
// The student component is mounted exactly as the Warm-Up mounts it. Room state
// comes from the emulator through the real snapshot watchers, so every screen
// this renders is driven by the same data flow a student's browser uses.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import LiveChallengeStudent from '../../src/components/liveChallenge/LiveChallengeStudent.jsx';

const listeners = new Set();
let current = null;

window.__mmGameMount = (invite) => {
  current = invite;
  window.__mmGamePlayerKey = invite?.playerKey || null;
  listeners.forEach((notify) => notify(invite));
};

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return <div data-mm-crashed="1">CRASH: {String(this.state.error?.message || this.state.error)}</div>;
    }
    return this.props.children;
  }
}

function Harness() {
  const [invite, setInvite] = useState(current);
  useEffect(() => {
    listeners.add(setInvite);
    return () => listeners.delete(setInvite);
  }, []);

  if (!invite) return <div>waiting for an invite</div>;
  return (
    <Boundary>
      <div data-mm-game="1">
        <LiveChallengeStudent
          invite={invite}
          studentProfile={{ studentId: 'harness-student', name: 'Harness Student' }}
          onExit={() => {}}
          exitLabel="Back to Warm-Up"
        />
      </div>
    </Boundary>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
