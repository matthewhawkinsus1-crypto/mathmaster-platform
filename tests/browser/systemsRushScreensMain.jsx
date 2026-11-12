// SYSTEMS OF EQUATIONS RUSH'S ROUND SCREEN, mounted for the QA driver
// (systemsRushScreens.mjs): the real GraphFeatureRushRound, its room a systems
// game, its answers graded on this page by the server's own grading function
// (GraphFeatureRushPractice's practice services) — nothing sent anywhere.
//
//   ?preset=everySystem              the round a preset deals, item by item
//   &kind=sameLine&variant=slanted&question=solution&tier=standard&seed=a
//                                    one slot's items instead
//   ?setup=1                         the teacher's setup panel instead
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import GraphFeatureRushRound from '../../src/components/liveChallenge/GraphFeatureRushRound.jsx';
import SystemsRushSetup from '../../src/components/liveChallenge/SystemsRushSetup.jsx';
import { defaultSystemsSetup } from '../../src/platform/liveChallenge/systemsSetupModel.js';
import { practiceServices } from '../../src/components/liveChallenge/GraphFeatureRushPractice.jsx';
import { SYSTEMS_RUSH_MODE_ID } from '../../functions/shared/graphFeatureRushRules.mjs';
import { normalizeSystemsRushConfig } from '../../functions/shared/systemsRush.mjs';
import { generateSystemItem, generateSystemsQuestion, publicSystemsQuestion } from '../../functions/shared/systemsGenerator.mjs';

const params = new URLSearchParams(window.location.search);
const preset = params.get('preset') || 'everySystem';
const slot = params.get('kind')
  ? { kind: params.get('kind'), variant: params.get('variant'), question: params.get('question') || 'solution', tier: params.get('tier') || 'standard' }
  : null;
const seed = params.get('seed') || 'qa';
// The game's settings: the preset's, or every question and kind for one slot's items (all its buttons).
const config = normalizeSystemsRushConfig(slot ? { presetId: 'everySystem', difficulty: slot.tier } : { presetId: preset });
const questions = Array.from({ length: 12 }, (_, questionIndex) => publicSystemsQuestion(slot
  ? { ...generateSystemItem({ slot, seedText: `${seed}-${questionIndex}` }), questionIndex }
  : generateSystemsQuestion({ seed, studentKey: 'qa', roundIndex: 0, questionIndex, config })));

const now = Date.now();
// Already running, unless the driver asks to see the countdown.
const startsAtMs = params.get('countdown') ? now + 2_500 : now - 1_000;
const roundSeconds = 120;
const room = {
  roomId: 'qa-systems',
  currentRound: 0,
  roundVersion: 0,
  roundToken: 'qa',
  roundCount: 3,
  roundState: 'open',
  startsAt: startsAtMs,
  roundEndsAt: startsAtMs + roundSeconds * 1000,
  serverNowAtRender: now,
  challengeMode: SYSTEMS_RUSH_MODE_ID,
  systemsRush: { config },
};
window.__systemsQuestions = questions;

function SetupPanel() {
  const [setup, setSetup] = useState(() => defaultSystemsSetup('algebra1'));
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: 16, display: 'grid', gap: 14 }}>
      <h1 style={{ margin: 0, fontSize: 'calc(22 * var(--mm-px))' }}>Create a challenge — Systems of Equations Rush</h1>
      <SystemsRushSetup setup={setup} onChange={setSetup} classSize={26} onPractice={() => {}} />
    </main>
  );
}

createRoot(document.getElementById('root')).render(params.get('setup')
  ? <SetupPanel />
  : (
    <GraphFeatureRushRound
      room={room}
      alias="QA"
      services={practiceServices({ questions, startsAtMs, roundSeconds })}
      persist={false}
      practice
      onExit={() => {}}
    />
  ));
