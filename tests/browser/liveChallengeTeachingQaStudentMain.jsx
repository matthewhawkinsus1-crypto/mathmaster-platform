// A student's screen in liveChallengeTeachingQa.mjs, mounted the way App.jsx
// mounts it: the invite through the real watcher, one mount per room, and the
// student's own profile (?accommodations=text-to-speech,… sets their support
// plan, as App passes user.profile).
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import LiveChallengeStudent from '../../src/components/liveChallenge/LiveChallengeStudent.jsx';
import { watchLiveChallengeInvite } from '../../src/platform/liveChallenge/liveChallengeService.js';

const params = new URLSearchParams(window.location.search);
const studentId = params.get('studentId');
const accommodations = (params.get('accommodations') || '').split(',').map((entry) => entry.trim()).filter(Boolean);
const studentProfile = { studentId, name: studentId, ...(accommodations.length ? { accommodations } : {}) };

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
  useEffect(() => watchLiveChallengeInvite(studentId, setInvite), []);
  if (!invite) return <div data-mm-waiting="1">waiting for an invite</div>;
  return (
    <Boundary>
      <div data-mm-game="1">
        <LiveChallengeStudent
          key={invite.roomId || 'none'}
          invite={invite}
          studentProfile={studentProfile}
          onExit={() => {}}
          exitLabel="Back to Dashboard"
          renderMatchRewards={(roomId, match = {}) => (
            <section data-mm-rewards-slot="1" style={{ padding: 12, borderRadius: 12, background: 'rgba(255,255,255,.06)', color: '#eef1f6' }}>
              Rewards slot for {roomId}: {(match.offered || []).join(' · ') || 'nothing offered'}
            </section>
          )}
        />
      </div>
    </Boundary>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
