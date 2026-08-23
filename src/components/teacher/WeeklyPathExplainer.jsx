import React, { useMemo, useState } from 'react';
import { buildStudentMasteryProfile, collectStudentEvidence } from '../../masteryEngine.js';
import { adaptLegacyMasteryToPhase5 } from '../../platform/profile/legacyMasteryAdapter.js';
import { evidenceRowsToEvents } from '../../platform/profile/legacyEvidenceAdapter.js';
import { buildStudentLearningProfile, diagnoseGaps } from '../../platform/profile/studentLearningProfile.js';
import { buildStudentPathOptions } from '../../platform/path/studentPathOptions.js';
import { buildWeeklyPathPlan } from '../../platform/path/weeklyPathPlan.js';
import { buildWeeklyGoal } from '../../platform/path/weeklyPathGoal.js';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';

// "Why did MathMaster pick THAT?" — answered with the production code.
//
// WHY IT MATTERS THAT THIS IS NOT A MOCK. A simulator that re-implements the
// engine to explain it is explaining the re-implementation. The moment the two
// drift, the screen a teacher uses to decide whether to trust the platform is
// the screen lying to them. So every number below comes from the same
// functions the student's own Path runs — buildStudentLearningProfile,
// buildWeeklyPathPlan, buildWeeklyGoal — over a synthetic learner document.
//
// It shows the whole chain, including the parts that lost. A teacher deciding
// whether to override the engine needs to see what it declined and why, not
// just what it chose.

const panel = { border: '1px solid #dadce0', borderRadius: 12, background: '#fff', padding: 16, marginBottom: 14 };
const heading = { margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#174ea6' };
const note = { color: '#5f6368', fontSize: 13, lineHeight: 1.55, margin: '0 0 12px' };
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12 };
const step = {
  padding: '3px 9px', borderRadius: 999, background: '#eef3fb', color: '#174ea6',
  fontSize: 10.5, fontWeight: 950, letterSpacing: '.06em', textTransform: 'uppercase',
};

const readable = (value) => String(value || '').replace(/_/g, ' ');

function StepHeader({ index, title, detail }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={step}>Step {index}</span>
        <strong style={{ fontSize: 14.5, color: '#202124' }}>{title}</strong>
      </div>
      {detail && <div style={{ ...note, margin: '5px 0 0' }}>{detail}</div>}
    </div>
  );
}

function ScoreTerms({ terms }) {
  const positive = Object.entries(terms?.positive || {});
  const negative = Object.entries(terms?.negative || {});
  if (!positive.length && !negative.length) return null;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {positive.map(([name, value]) => (
        <span key={name} style={{ ...mono, padding: '2px 7px', borderRadius: 6, background: '#eefaf1', color: '#12633a' }}>
          +{Number(value).toFixed(2)} {readable(name)}
        </span>
      ))}
      {negative.map(([name, value]) => (
        <span key={name} style={{ ...mono, padding: '2px 7px', borderRadius: 6, background: '#fdecec', color: '#9f1239' }}>
          {Number(value).toFixed(2)} {readable(name)}
        </span>
      ))}
    </div>
  );
}

export default function WeeklyPathExplainer({
  learner = null,
  assignments = [],
  courseId = 'algebra1',
  retentionSchedulesByTEKS = {},
  honors = false,
  sessions = 4,
  now = Date.now(),
}) {
  const [showAllConsidered, setShowAllConsidered] = useState(false);

  const built = useMemo(() => {
    if (!learner) return null;
    const rows = collectStudentEvidence({ student: learner, assignments });
    const { events, coverage } = evidenceRowsToEvents(rows);
    const masteryProfilesByTeks = adaptLegacyMasteryToPhase5({
      legacyProfile: buildStudentMasteryProfile({ student: learner, assignments }),
      evidenceRows: rows,
      retentionSchedulesByTEKS,
    });
    const profile = buildStudentLearningProfile({
      courseId, evidenceEvents: events, masteryProfilesByTeks,
      retentionSchedules: retentionSchedulesByTEKS,
    });
    const options = buildStudentPathOptions({
      student: learner, assignments, courseId, nowValue: now,
    });
    const plan = buildWeeklyPathPlan({
      options, courseId, profile, masteryProfilesByTeks,
      retentionSchedules: retentionSchedulesByTEKS,
      evidenceEvents: events, sessions, honors, now,
    });
    const goal = buildWeeklyGoal({ plan, honors, courseId, now });
    return { profile, plan, goal, coverage, evidenceCount: events.length };
  }, [learner, assignments, courseId, retentionSchedulesByTEKS, honors, sessions, now]);

  if (!built) {
    return (
      <section style={panel}>
        <h3 style={heading}>Weekly Path</h3>
        <p style={note}>Start a simulated student to see how a week is put together for them.</p>
      </section>
    );
  }

  const { profile, plan, goal, evidenceCount } = built;
  const gaps = diagnoseGaps(profile);
  const considered = showAllConsidered ? plan.considered : plan.considered.slice(0, 10);

  return (
    <div style={{ textAlign: 'left' }}>
      <section style={panel}>
        <h3 style={heading}>How this week was built</h3>
        <p style={note}>
          Every value below is produced by the same functions the student&apos;s own Path runs.
          Nothing here is a demonstration of the engine — it <em>is</em> the engine, over a
          synthetic learner. If this screen and a real student disagree, one of them is a bug.
        </p>
      </section>

      <section style={panel}>
        <StepHeader
          index={1}
          title="What the evidence says about this student"
          detail={`${evidenceCount} classifying pieces of evidence. Unfinished, modified and teacher-forced work is excluded before anything is derived.`}
        />
        <div style={{ marginBottom: 10 }}><StudentPerformanceBadge profile={profile} /></div>
        {!profile.baseline.established ? (
          <div style={note}>
            Baseline not established: {profile.baseline.events}/{profile.baseline.requirement.events} events,
            {' '}{profile.baseline.distinctSkills}/{profile.baseline.requirement.distinctSkills} standards,
            {' '}{profile.baseline.distinctSources}/{profile.baseline.requirement.distinctSources} kinds of work.
            The engine keeps recommending; it just will not classify the student yet.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', ...note, margin: 0 }}>
            <div><strong>Stable band</strong><div>{profile.difficultyProfile?.stableBand ?? '—'}</div></div>
            <div><strong>DOK 1 / 2 / 3</strong><div>{['1', '2', '3'].map((level) => {
              const entry = profile.dokProfile?.[level];
              return entry?.attempts ? `${Math.round(entry.accuracy * 100)}%` : '—';
            }).join(' / ')}</div></div>
            <div><strong>Course mastery</strong><div>{profile.courseMastery == null ? '—' : `${Math.round(profile.courseMastery * 100)}%`}</div></div>
            <div><strong>Foundation gaps</strong><div>{profile.foundationGapDepth || 0}</div></div>
          </div>
        )}
        {gaps.length > 0 && (
          <ul style={{ margin: '10px 0 0', paddingLeft: 18 }}>
            {gaps.map((gap) => (
              <li key={`${gap.type}-${gap.framework || ''}`} style={{ ...note, margin: '0 0 4px' }}>
                <strong style={{ color: '#202124' }}>{gap.label}</strong> — {gap.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={panel}>
        <StepHeader
          index={2}
          title="What the week is supposed to contain"
          detail="The mix comes from the instructional band, not from what happens to score highest. A below-level student still gets course-level work; an above-level student still gets retention."
        />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {plan.requestedMix.map((purpose, index) => (
            <span key={`${purpose}-${index}`} style={{ ...step, background: '#f5f3ff', color: '#5b21b6' }}>
              {readable(purpose)}
            </span>
          ))}
        </div>
        <div style={{ ...note, margin: '10px 0 0' }}>
          Foundation Bridge cap: {plan.bridgeCap} of {sessions} sessions
          {plan.bridgeCount > 0 ? ` · used ${plan.bridgeCount}` : ''}.
          {' '}Below-course work is capped at half a normal week so remediation cannot become a track.
        </div>
      </section>

      <section style={panel}>
        <StepHeader
          index={3}
          title="What it chose, and what each session is for"
          detail="A recommendation is a standard AND a purpose AND a depth AND a complexity. Naming only the standard is what made the old engine impossible to argue with."
        />
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {goal.sessions.map((session) => (
            <li key={session.slot} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 900, color: '#202124', fontSize: 14 }}>
                {session.teksCode}
                <span style={{ ...note, display: 'inline', margin: '0 0 0 8px', fontWeight: 700 }}>
                  {session.studentLabel}
                </span>
              </div>
              <div style={{ ...mono, color: '#5f6368', marginTop: 3 }}>
                purpose={session.purpose} · dok={session.dok} · band={session.difficultyBand}
                {' '}· lifecycle={session.lifecycle} · score={session.score}
                {session.adjustedScore != null && session.adjustedScore !== session.score
                  ? ` · after variety penalty=${session.adjustedScore}` : ''}
              </div>
              <div style={{ ...note, margin: '3px 0 0' }}>
                Student sees: “{session.studentExplanation}”
              </div>
              <div style={{ ...note, margin: '2px 0 0', fontStyle: 'italic' }}>
                Depth and complexity chosen because: {readable(session.targetReason)}
              </div>
              <ScoreTerms terms={session.scoreTerms} />
            </li>
          ))}
        </ol>
        <div style={{ ...note, margin: '4px 0 0' }}>
          Variety in this week: {plan.diversity.strands} strand{plan.diversity.strands === 1 ? '' : 's'},
          {' '}{plan.diversity.purposes} purpose{plan.diversity.purposes === 1 ? '' : 's'},
          {' '}{plan.diversity.skills} distinct standards.
        </div>
      </section>

      {plan.suppressed.length > 0 && (
        <section style={panel}>
          <StepHeader
            index={4}
            title="What it deliberately held back"
            detail="The second question a teacher asks is never “why this?” — it is “why not that?”. An engine that only answers the first looks arbitrary, and an arbitrary engine gets overridden into uselessness."
          />
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {plan.suppressed.slice(0, 12).map((entry) => (
              <li key={entry.skillId} style={{ ...note, margin: '0 0 5px' }}>
                <strong style={{ color: '#202124' }}>{entry.teksCode}</strong>
                {' — '}
                {entry.eligibility.reason === 'cooling_down'
                  ? `worked recently (${entry.lifecycle}); eligible again in ${entry.eligibility.daysRemaining} day${entry.eligibility.daysRemaining === 1 ? '' : 's'}`
                  : readable(entry.eligibility.reason)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={panel}>
        <StepHeader
          index={plan.suppressed.length > 0 ? 5 : 4}
          title="Everything that was considered"
          detail={`${plan.considered.length} candidates came out of the curriculum engine. These are the rows the week was chosen from.`}
        />
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr style={{ background: '#f8f9fa' }}>
                {['TEKS', 'Engine status', 'Lifecycle', 'Purpose', 'DOK', 'Band', 'Score', 'Eligible'].map((head) => (
                  <th key={head} style={{ textAlign: 'left', padding: 7, fontSize: 10.5, letterSpacing: '.06em', textTransform: 'uppercase', color: '#5f6368' }}>{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {considered.map((entry) => (
                <tr key={entry.skillId} style={{ borderTop: '1px solid #eef0f2' }}>
                  <td style={{ padding: 7, fontWeight: 800 }}>{entry.teksCode}</td>
                  <td style={{ padding: 7, color: '#5f6368' }}>{entry.engineStatus}</td>
                  <td style={{ padding: 7, color: '#5f6368' }}>{readable(entry.lifecycle)}</td>
                  <td style={{ padding: 7 }}>{entry.purposeLabel}</td>
                  <td style={{ padding: 7 }}>{entry.dok}</td>
                  <td style={{ padding: 7 }}>{entry.difficultyBand}</td>
                  <td style={{ padding: 7, ...mono }}>{entry.score}</td>
                  <td style={{ padding: 7, color: entry.eligibility.eligible ? '#12633a' : '#9a3412' }}>
                    {entry.eligibility.eligible ? 'yes' : readable(entry.eligibility.reason)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {plan.considered.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAllConsidered((current) => !current)}
            style={{
              appearance: 'none', fontFamily: 'inherit', marginTop: 10, minHeight: 40,
              padding: '8px 14px', borderRadius: 8, border: '1px solid #c5d5ef',
              background: '#fff', color: '#174ea6', fontWeight: 800, cursor: 'pointer', fontSize: 13,
            }}
          >
            {showAllConsidered ? 'Show the top 10 only' : `Show all ${plan.considered.length}`}
          </button>
        )}
      </section>
    </div>
  );
}
