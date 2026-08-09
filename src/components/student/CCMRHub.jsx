import { useMemo, useState } from 'react';
import {
  ASSESSMENT_FRAMEWORKS, FRAMEWORK_LABELS, READINESS,
  explainAssessmentRecommendation, getAssessmentRecommendations,
} from '../../platform/ccmr/assessmentPathways';
import { getAssessmentProfile } from '../../platform/ccmr/assessmentProfiles';

// 9F — College, Career & Military Readiness.
//
// A parallel destination, not a replacement for the course path. Two things
// keep it from becoming "four more subjects":
//
//   1. Every skill listed is a canonical MathMaster skill. The SAT's domain
//      headings are a grouping over those ids, never a second taxonomy.
//   2. The buckets are the same buckets the course path uses. A student who
//      understands their normal path already understands this screen.
//
// Unpractised is never rendered as weak, and never as 0%.

const STATUS_STYLE = {
  [READINESS.TRANSFER_GAP]: { label: 'Know the math, not the format', border: '#a50e0e', background: '#fce8e6', chip: '#a50e0e' },
  [READINESS.STRENGTHEN]: { label: 'Strengthen', border: '#f9ab00', background: '#fef7e0', chip: '#7a4f00' },
  [READINESS.NOT_PRACTICED]: { label: 'Not practised yet', border: '#1a73e8', background: '#e8f0fe', chip: '#174ea6' },
  [READINESS.READY]: { label: 'Ready', border: '#dadce0', background: '#fff', chip: '#3c4043' },
  [READINESS.STRONG]: { label: 'Strong', border: '#137333', background: '#e6f4ea', chip: '#137333' },
};

const BUCKET_TITLES = [
  ['recommended', 'Recommended'],
  ['strengthen', 'Strengthen'],
  ['available', 'Ready'],
  ['challenge', 'Going well'],
];

function SkillRow({ item, onPractise }) {
  const style = STATUS_STYLE[item.status] || STATUS_STYLE[READINESS.READY];
  return (
    <button
      type="button"
      onClick={() => onPractise?.(item)}
      style={{
        display: 'block', width: '100%', textAlign: 'left', minHeight: 60,
        padding: '12px 14px', borderRadius: 12, marginBottom: 8,
        border: `2px solid ${style.border}`, background: style.background, cursor: 'pointer',
      }}
    >
      <span style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: style.chip }}>
        {style.label}
      </span>
      <span style={{ display: 'block', fontWeight: 800, color: '#202124', fontSize: 15, margin: '3px 0' }}>{item.label}</span>
      <span style={{ display: 'block', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
        {explainAssessmentRecommendation(item)}
      </span>
      <span style={{ display: 'block', color: '#3c4043', fontSize: 11, marginTop: 5, fontWeight: 700 }}>
        Course: {item.coreMastery == null ? 'no evidence yet' : `${Math.round(item.coreMastery * 100)}%`}
        {' · '}
        {/* The distinction the brief insists on: not practised is not zero. */}
        {item.assessmentProficiency == null || item.evidenceBasis !== 'direct'
          ? 'this format: not practised yet'
          : `this format: ${Math.round(item.assessmentProficiency * 100)}%${item.provisional ? ' (early)' : ''}`}
      </span>
    </button>
  );
}

function PathwayCard({ framework, summary, active, onSelect }) {
  const profile = getAssessmentProfile(framework);
  return (
    <button
      type="button"
      onClick={() => onSelect(framework)}
      style={{
        textAlign: 'left', padding: '14px 16px', borderRadius: 12, minHeight: 96,
        border: `2px solid ${active ? '#1a73e8' : '#dadce0'}`,
        background: active ? '#e8f0fe' : '#fff', cursor: 'pointer',
      }}
    >
      <span style={{ display: 'block', fontWeight: 900, fontSize: 16, color: '#202124' }}>{profile?.displayName || FRAMEWORK_LABELS[framework]}</span>
      <span style={{ display: 'block', color: '#5f6368', fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>
        {summary.readySkills} skill{summary.readySkills === 1 ? '' : 's'} ready
        {' · '}
        {summary.practisedSkills} practised
      </span>
      {summary.transferGaps > 0 && (
        <span style={{ display: 'inline-block', marginTop: 6, fontSize: 10, fontWeight: 900, padding: '2px 8px', borderRadius: 999, color: '#a50e0e', background: '#fce8e6' }}>
          {summary.transferGaps} to transfer
        </span>
      )}
    </button>
  );
}

export default function CCMRHub({
  pathOptions = null,
  assessmentEvidence = {},
  directIndex = null,
  goals = [],
  teacherPriorities = [],
  onChangeGoals,
  onPractise,
  onReturnToCourse,
}) {
  const [framework, setFramework] = useState(null);

  const byFramework = useMemo(() => {
    const result = {};
    ASSESSMENT_FRAMEWORKS.forEach((id) => {
      result[id] = getAssessmentRecommendations({
        framework: id, pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities,
      });
    });
    return result;
  }, [pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities]);

  // A framework with nothing eligible is not shown at all. That is the honest
  // consequence of the coverage audit: if no skill this student can reach is
  // aligned to the ASVAB, there is no ASVAB pathway for them today.
  const offered = ASSESSMENT_FRAMEWORKS.filter((id) => byFramework[id].summary.readySkills > 0);
  const active = framework && offered.includes(framework) ? byFramework[framework] : null;

  const toggleGoal = (id) => {
    const next = goals.includes(id) ? goals.filter((entry) => entry !== id) : [...goals, id];
    onChangeGoals?.(next);
  };

  if (!pathOptions) {
    return (
      <section style={{ padding: 16, border: '1px solid #dadce0', borderRadius: 12, background: '#fff', textAlign: 'left' }}>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, color: '#174ea6' }}>College, Career &amp; Military Readiness</h2>
        <p style={{ margin: 0, color: '#5f6368', lineHeight: 1.6 }}>
          Your teacher hasn&apos;t set your class&apos;s pacing yet, so there is nothing to recommend here.
        </p>
      </section>
    );
  }

  return (
    <section style={{ textAlign: 'left' }}>
      <h2 style={{ margin: '0 0 4px', fontSize: 20, color: '#174ea6' }}>College, Career &amp; Military Readiness</h2>
      <p style={{ margin: '0 0 16px', color: '#5f6368', fontSize: 13, lineHeight: 1.6 }}>
        The same mathematics you are already learning, in the formats these assessments use.
        Your course path is still your main path — this is here when you want it.
      </p>

      <div style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: '#f8f9fa', border: '1px solid #dadce0' }}>
        <p style={{ margin: '0 0 8px', fontWeight: 800, fontSize: 13, color: '#3c4043' }}>I&apos;m preparing for:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ASSESSMENT_FRAMEWORKS.map((id) => (
            <label key={id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 11px', borderRadius: 999, border: '1px solid #c9ced6', background: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 40 }}>
              <input
                type="checkbox"
                checked={goals.includes(id)}
                onChange={() => toggleGoal(id)}
                style={{ width: 18, height: 18 }}
              />
              {FRAMEWORK_LABELS[id]}
            </label>
          ))}
        </div>
        <p style={{ margin: '8px 0 0', color: '#5f6368', fontSize: 12 }}>
          Choosing one moves it up your list. It never locks the others away.
        </p>
      </div>

      {!offered.length ? (
        <p style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #dadce0', color: '#5f6368', lineHeight: 1.6, margin: 0 }}>
          None of the skills you are ready for are matched to these assessments yet. This will fill in
          as your class moves through the year.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10, marginBottom: 18 }}>
          {offered.map((id) => (
            <PathwayCard
              key={id}
              framework={id}
              summary={byFramework[id].summary}
              active={framework === id}
              onSelect={setFramework}
            />
          ))}
        </div>
      )}

      {active && (
        <div style={{ border: '1px solid #dadce0', borderRadius: 12, background: '#fff', padding: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 17, color: '#174ea6' }}>{active.profile?.displayName} Math</h3>
            {/* §17 — never trapped in one pathway. */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {offered.filter((id) => id !== framework).map((id) => (
                <button key={id} type="button" onClick={() => setFramework(id)} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid #c5d5ef', background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: 36 }}>
                  Switch to {FRAMEWORK_LABELS[id]}
                </button>
              ))}
              <button type="button" onClick={() => onReturnToCourse?.()} style={{ padding: '6px 11px', borderRadius: 8, border: '1px solid #c9ced6', background: '#fff', color: '#3c4043', fontWeight: 800, fontSize: 12, cursor: 'pointer', minHeight: 36 }}>
                Back to course path
              </button>
            </div>
          </div>

          {active.profile && (
            <p style={{ margin: '0 0 14px', color: '#5f6368', fontSize: 12, lineHeight: 1.55 }}>
              {active.profile.totalQuestions} questions
              {active.profile.secondsPerQuestion ? ` · about ${active.profile.secondsPerQuestion}s each` : ' · untimed'}
              {' · '}
              {active.profile.calculatorPolicy === 'none' ? 'no calculator' : 'calculator allowed'}
            </p>
          )}

          {BUCKET_TITLES.map(([bucket, title]) => (
            active[bucket].length ? (
              <div key={bucket} style={{ marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#5f6368' }}>{title}</p>
                {active[bucket].map((item) => (
                  <SkillRow key={item.skillId} item={item} onPractise={onPractise} />
                ))}
              </div>
            ) : null
          ))}
        </div>
      )}
    </section>
  );
}
