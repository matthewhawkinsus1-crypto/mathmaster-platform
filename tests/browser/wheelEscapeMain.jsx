// Harness for tests/browser/wheelEscape.mjs: the two progress wheels on their
// own, so the driver can hover and focus their slices and press Escape.
import { createRoot } from 'react-dom/client';
import { CCMRReadinessWheel } from '../../src/components/student/CCMRReadinessWheel.jsx';
import { MyMathPathWheel } from '../../src/components/student/MyMathPathWheel.jsx';
import { listAssessmentProfiles } from '../../src/platform/ccmr/assessmentProfiles.js';
import { READINESS } from '../../src/platform/ccmr/assessmentPathways.js';

// One practice exam with one domain the student has a skill in (so its slice
// is focusable); the others are shown greyed, as on the real hub.
const profile = listAssessmentProfiles()[0];
const recommendations = { profile, byDomain: [{ domainId: profile.domains[0].id, items: [{ status: READINESS.READY }] }] };

function Harness() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 32, padding: 24, fontFamily: 'system-ui' }}>
      <section data-wheel="ccmr" style={{ width: 360 }}>
        <CCMRReadinessWheel recommendations={recommendations} onSelectDomain={() => {}} />
      </section>
      <section data-wheel="path" style={{ width: 420 }}>
        <MyMathPathWheel onSelectTEKS={() => {}} showLegend={false} />
      </section>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Harness />);
