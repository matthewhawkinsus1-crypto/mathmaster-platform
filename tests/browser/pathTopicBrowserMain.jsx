// The Path map, "Browse all topics", the mastery wheel's legend and the
// Recommended cards — the real components, fed by the real engine
// (buildStudentPathOptions, the unified mastery profiles) from synthetic data on
// a fixed school day. HOW TO RUN: see tests/browser/pathTopicBrowser.mjs.
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
// The app's own stylesheets (theme tokens, base type), so the screens are
// measured as students see them rather than unstyled.
import '../../src/index.css';
import '../../src/App.css';
import StudentLearningPath from '../../src/components/student/StudentLearningPath.jsx';
import MyMathPathDashboard from '../../src/components/student/MyMathPathDashboard.jsx';
import RecommendedSkills from '../../src/components/student/RecommendedSkills.jsx';
import { buildStudentPathOptions } from '../../src/platform/path/studentPathOptions.js';
import { buildUnifiedMasteryProfiles } from '../../src/platform/mastery/unifiedMastery.js';
import { teksSkillId } from '../../src/platform/path/skillGraph.js';

// 7 October 2026: Algebra I is in Module 2, Topic 2.
const NOW = Date.parse('2026-10-07T15:00:00Z');

const profile = (estimate, events, independent, doks) => ({
  mastery: { estimate, confidence: events >= 6 ? 'Medium' : 'Low' },
  accumulator: { eligibleEvents: events, effectiveWeight: events, independentSuccesses: independent },
  dimensions: { eligibleGradeLevelEvents: events, dokRepresented: doks },
});

const algebraOneServer = {
  'A.12A': profile(91, 8, 5, [2, 3]), // Mastered
  'A.12B': profile(78, 5, 3, [1, 2]), // Secure
  'A.3A': profile(58, 6, 2, [1, 2]), // Developing: holds back what builds on it
  'A.5A': profile(18, 6, 0, [1]), // Needs Attention: a severe gap that locks
  'A.2E': profile(64, 4, 1, [2]),
};

const optionsFor = (courseId, serverMasteryProfiles) => buildStudentPathOptions({
  student: { id: 'harness-student' }, assignments: [], courseId, serverMasteryProfiles, nowValue: NOW,
});

const algebraOne = {
  options: optionsFor('algebra1', algebraOneServer),
  profiles: buildUnifiedMasteryProfiles({ student: { id: 'harness-student' }, assignments: [], serverProfiles: algebraOneServer }),
};
const gradeEightServer = { '8.4A': profile(88, 6, 3, [2, 3]), '8.5I': profile(55, 5, 1, [1, 2]) };
const gradeEight = {
  options: optionsFor('grade8', gradeEightServer),
  profiles: buildUnifiedMasteryProfiles({ serverProfiles: gradeEightServer }),
};

// Practice for one open skill is not published yet: its door must close here
// exactly as on the map.
const UNCOVERED = new Set([teksSkillId('A.2F')]);
const isCovered = (skillId) => !UNCOVERED.has(skillId);

window.__mmLaunches = [];
const recordLaunch = (card) => { window.__mmLaunches.push(card); };

const scenes = {
  pathMap: () => (
    <StudentLearningPath
      pathOptions={algebraOne.options}
      masteryProfilesByTEKS={algebraOne.profiles}
      skillProgressByTEKS={{ 'A.12A': { passesCompleted: 1 } }}
      isCovered={isCovered}
      onChooseSkill={recordLaunch}
    />
  ),
  gradeEightPath: () => (
    <StudentLearningPath
      pathOptions={gradeEight.options}
      masteryProfilesByTEKS={gradeEight.profiles}
      isCovered={() => true}
      onChooseSkill={recordLaunch}
    />
  ),
  wheel: () => (
    <MyMathPathDashboard
      studentName="Harness"
      masteryProfilesByTEKS={algebraOne.profiles}
      skillProgressByTEKS={{ 'A.12A': { passesCompleted: 1 } }}
      courseId="algebra1"
      pathOptions={algebraOne.options}
      onStartSession={() => {}}
    />
  ),
  wheelGradeEight: () => (
    <MyMathPathDashboard
      studentName="Harness"
      masteryProfilesByTEKS={gradeEight.profiles}
      courseId="grade8"
      pathOptions={gradeEight.options}
      onStartSession={() => {}}
    />
  ),
  recommended: () => (
    <RecommendedSkills pathOptions={algebraOne.options} courseId="algebra1" onChooseSkill={recordLaunch} />
  ),
};

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() { return this.state.error ? <div data-mm-crashed>{String(this.state.error?.message || this.state.error)}</div> : this.props.children; }
}

function Harness() {
  // A fresh mount per request, even for the same scene name: a scene that is
  // driven (open the browser, search) must start from the component's default.
  const [scene, setScene] = useState(null);
  useEffect(() => {
    let count = 0;
    window.__mmTopicScene = (next) => { window.__mmLaunches = []; count += 1; setScene({ name: next, key: count }); };
  }, []);
  if (!scene) return <div>ready</div>;
  const Scene = scenes[scene.name];
  return <div data-mm-scene={scene.name}><Boundary key={`${scene.name}-${scene.key}`}>{Scene ? <Scene /> : <div data-mm-crashed>unknown scene</div>}</Boundary></div>;
}

createRoot(document.getElementById('root')).render(<Harness />);
