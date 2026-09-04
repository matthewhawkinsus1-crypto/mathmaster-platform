// What the Warm-Up challenge actually PUTS ON SCREEN, read back out of the DOM.
//
// The headless suite proves the routing rules. It cannot see whether the thing
// those rules select renders, renders blank, or throws — and a component that
// throws inside a student's assignment is a white screen mid-lesson.
//
// The scenes are NOT hand-written decisions. Each one is a realistic set of
// inputs handed to the REAL resolveWarmupChallenge, and whatever it returns is
// what gets mounted. A harness that fed the gate a decision a test author
// imagined would prove nothing about what students get.
//
// HOW TO RUN: see tests/browser/warmupChallengeRender.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WarmupChallengeGate from '../../src/components/liveChallenge/WarmupChallengeGate.jsx';
import LiveChallengeStudent from '../../src/components/liveChallenge/LiveChallengeStudent.jsx';
import {
  resolveWarmupChallenge,
  shouldShowChallengeHandoffBanner,
  shouldShowWarmupWaitingPanel,
} from '../../src/platform/liveChallenge/warmupChallengeLink.js';

const listeners = new Set();
let current = null;

window.__mmWarmupRender = (scene) => {
  current = scene;
  listeners.forEach((notify) => notify(scene));
};

// Reported back to the driver so the browser check and the headless tests are
// known to be looking at the same decision, not two different ones.
window.__mmWarmupDecision = (scene) => {
  const decision = resolveWarmupChallenge(scene.input);
  return {
    route: decision.route,
    roomId: decision.roomId,
    reason: decision.reason,
    bannerVisible: shouldShowChallengeHandoffBanner({
      invite: scene.input?.invite || null,
      warmupDecision: decision,
    }),
    waitingPanelVisible: shouldShowWarmupWaitingPanel({
      decision,
      invite: scene.input?.invite || null,
    }),
  };
};

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      // Marked so the driver can tell "rendered an error" from "rendered
      // nothing", which are very different failures.
      return <div data-mm-crashed="1">CRASH: {String(this.state.error?.message || this.state.error)}</div>;
    }
    return this.props.children;
  }
}

function Harness() {
  const [scene, setScene] = useState(current);

  useEffect(() => {
    listeners.add(setScene);
    return () => listeners.delete(setScene);
  }, []);

  if (!scene) return <div>waiting for a scene</div>;

  // The exit affordance is only reachable in the browser when the challenge has
  // no room to show, because everything else in that component needs live room
  // data. That path is exactly where the label matters, so it is rendered
  // directly rather than left unchecked — the previous version of this harness
  // asserted "Back to Dashboard" is absent while NO button existed at all,
  // which proved nothing.
  if (scene.direct === 'exitLabel') {
    return (
      <Boundary key={scene.name}>
        <div data-mm-scene={scene.name}>
          <LiveChallengeStudent
            invite={{ roomId: null }}
            studentProfile={{ studentId: 'render-check' }}
            onExit={() => {}}
            exitLabel="Back to Warm-Up"
          />
        </div>
      </Boundary>
    );
  }

  const decision = resolveWarmupChallenge(scene.input);

  // Mirrors what App.jsx renders: the waiting panel is suppressed while a
  // competing live challenge is offering itself through the banner.
  const showWaiting = shouldShowWarmupWaitingPanel({ decision, invite: scene.input?.invite || null });
  if (decision.route !== 'play' && !showWaiting) {
    return <Boundary key={scene.name}><div data-mm-scene={scene.name} /></Boundary>;
  }

  return (
    <Boundary key={scene.name}>
      <div data-mm-scene={scene.name}>
        <WarmupChallengeGate
          decision={decision}
          invite={scene.input?.invite || null}
          studentProfile={{ studentId: 'render-check', name: 'Render Check' }}
          onExitToAssignment={() => {}}
        />
      </div>
    </Boundary>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
