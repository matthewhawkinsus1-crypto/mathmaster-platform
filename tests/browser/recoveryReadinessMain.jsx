// RECOVERY READINESS AS A TEACHER READS IT — THE REAL PANEL, THE REAL PLANNER.
//
// The Warm-Up and DOL Recovery panel Pre-Flight and the assignment details
// show, fed by the planner every other surface runs, over the real lessons as
// a teacher imports them: the live Algebra I transformations lesson (L2) in
// Pre-Flight (ready: creation stores its Recovery) and as a live copy (not
// ready until the teacher approves Prepare Recovery), and the next lesson (L3),
// which no certified family can pair yet (not ready, with the reasons and a
// "Fix for Recovery" button).
//
// HOW TO RUN: see tests/browser/recoveryReadiness.mjs.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { installTextScale } from '../../src/platform/layout/textScale.js';
import '../../src/App.css';
import { installMathMasterTheme } from '../../src/theme/mathMasterTheme.js';
import l2Text from '../../teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json?raw';
import l3Text from '../../teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json?raw';
import { parseAssignmentBlueprintText } from '../../src/assignmentBlueprint.js';
import { buildPreflightReviewedAssignmentV5 } from '../../src/components/teacher/preflightV5Review.js';
import { buildAssignmentV5PreflightModel } from '../../src/platform/preflight/assignmentV5PreflightModel.js';
import { liveRecoverySections, planAssignmentRecoveryContent } from '../../functions/shared/recoveryContentPlan.mjs';
import { lightRecoveryKeyCheck } from '../../functions/shared/recoveryLightKeyCheck.mjs';
import RecoveryReadinessPanel from '../../src/components/teacher/RecoveryReadinessPanel.jsx';

installTextScale(window);
installMathMasterTheme();

const preflightOf = (text) => buildAssignmentV5PreflightModel(buildPreflightReviewedAssignmentV5(parseAssignmentBlueprintText(text).assignmentV5, {}), {});
const l2 = preflightOf(l2Text);
const l3 = preflightOf(l3Text);
const liveL2 = { ...l2.assignmentV5, id: 'live-l2', title: l2.assignmentV5.assignment?.title, assignedClassIds: ['class-1'] };
const livePlan = planAssignmentRecoveryContent({ assignment: liveL2, gradeSample: lightRecoveryKeyCheck });
const liveSections = liveRecoverySections(livePlan);

const repairs = [];
window.__mmRecoveryRepairs = repairs;

function Harness() {
  const scene = new URLSearchParams(window.location.search).get('scene') || 'preflight-l2';
  const [target, setTarget] = useState(null);
  const panel = {
    'preflight-l2': (
      <RecoveryReadinessPanel
        sections={l2.questionGeneration.recovery}
        fullyReady={l2.questionGeneration.recoveryReadiness.fullyReady}
        intro="MathMaster pairs each Warm-Up and DOL question with a checked Question Family, so a student who needs Recovery gets fresh, equivalent, server-graded questions."
      />
    ),
    'live-l2': (
      <RecoveryReadinessPanel sections={liveSections} fullyReady={false} context="live" title="Recovery readiness" />
    ),
    'preflight-l3': (
      <RecoveryReadinessPanel
        sections={l3.questionGeneration.recovery}
        fullyReady={l3.questionGeneration.recoveryReadiness.fullyReady}
        onRepair={(row) => { repairs.push(row.storageIndex); setTarget(row.storageIndex); }}
        renderRepairControls={() => <div data-repair-controls="true">Repair controls for this question</div>}
        repairTargetIndex={target}
      />
    ),
  }[scene];
  window.__mmRecoveryReadinessScene = scene;
  return <main style={{ padding: 16, maxWidth: 920, margin: '0 auto' }}>{panel}</main>;
}

createRoot(document.getElementById('root')).render(<Harness />);
