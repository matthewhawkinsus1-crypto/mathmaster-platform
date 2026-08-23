import React from 'react';
import StudentPerformanceBadge from '../common/StudentPerformanceBadge.jsx';
import { diagnoseGaps } from '../../platform/profile/studentLearningProfile.js';

// What a teacher sees when they click a student.
//
// The brief asks for a specific list: which sessions were selected, the purpose
// of each, the TEKS, the DOK, the difficulty, the course/CCMR context, why
// MathMaster chose it, and the evidence that resulted. This renders exactly
// that, and adds the thing a teacher asks for the moment they see a
// recommendation they disagree with — what was DELIBERATELY held back, and why.
//
// Nothing here computes. Every number and label is read off the profile and the
// plan, which is what makes this view and the student's own screen agree.

const CARD = {
  border: '1px solid #e3e6eb', borderRadius: 14, background: '#fff', padding: 16,
};
const LABEL = {
  fontSize: 10.5, fontWeight: 950, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f6368',
};
const VALUE = { fontSize: 15, fontWeight: 800, color: '#202124', marginTop: 3 };
const MUTED = { color: '#5f6368', fontSize: 12.5, lineHeight: 1.6 };

const pct = (value) => (value == null ? '—' : `${Math.round(Number(value) * 100)}%`);

function Stat({ label, value, hint }) {
  return (
    <div>
      <div style={LABEL}>{label}</div>
      <div style={VALUE}>{value}</div>
      {hint && <div style={{ ...MUTED, marginTop: 2 }}>{hint}</div>}
    </div>
  );
}

/**
 * The DOK table.
 *
 * Shown as three independent rows rather than one average, because the whole
 * reason DOK is tracked separately from difficulty is that a student can be
 * fluent at recall and stuck at strategy — and an average hides exactly that.
 */
function DokTable({ dokProfile }) {
  const rows = ['1', '2', '3'].map((level) => ({ level, ...(dokProfile?.[level] || {}) }));
  const any = rows.some((row) => row.attempts);
  if (!any) return <div style={MUTED}>No cognitive-demand evidence yet.</div>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
      <thead>
        <tr>
          {['Depth of Knowledge', 'Accuracy', 'Attempts', ''].map((head) => (
            <th key={head} style={{ ...LABEL, textAlign: head === 'Depth of Knowledge' ? 'left' : 'right', padding: '6px 8px', borderBottom: '1px solid #eceff3' }}>{head}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.level}>
            <td style={{ padding: '7px 8px', fontWeight: 800, color: '#202124' }}>
              DOK {row.level}
              <span style={{ ...MUTED, fontWeight: 600, marginLeft: 6 }}>
                {row.level === '1' ? 'recall' : row.level === '2' ? 'procedure' : 'strategic reasoning'}
              </span>
            </td>
            <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: 800 }}>{row.attempts ? pct(row.accuracy) : '—'}</td>
            <td style={{ padding: '7px 8px', textAlign: 'right', ...MUTED }}>{row.attempts || 0}</td>
            <td style={{ padding: '7px 8px', textAlign: 'right', ...MUTED }}>
              {/* Confidence is stated, never implied by the number alone. Two
                  attempts and eleven attempts are not the same 50%. */}
              {row.attempts ? (row.confident ? 'enough to act on' : 'not yet conclusive') : ''}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SessionRow({ session }) {
  return (
    <li style={{ padding: '11px 0', borderTop: '1px solid #f1f3f6', listStyle: 'none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ fontWeight: 900, color: '#202124', fontSize: 14 }}>
          {session.teksCode}
          <span style={{ ...MUTED, fontWeight: 700, marginLeft: 8 }}>{session.purposeLabel}</span>
        </div>
        <div style={{ ...MUTED, fontWeight: 700 }}>
          DOK {session.dok} · Difficulty {session.difficultyBand} · {session.context === 'course' ? 'Course' : session.context}
        </div>
      </div>
      {/* Why MathMaster chose it — the sentence the teacher will be asked about. */}
      <div style={{ ...MUTED, marginTop: 4 }}>{session.studentExplanation}</div>
      {session.targetReason && (
        <div style={{ ...MUTED, marginTop: 2, fontStyle: 'italic' }}>
          Difficulty and depth: {String(session.targetReason).replace(/_/g, ' ')}
        </div>
      )}
    </li>
  );
}

export default function StudentLearningProfileView({
  studentName = 'This student',
  profile = null,
  plan = null,
  progress = null,
  onClose = null,
}) {
  if (!profile) {
    return (
      <section style={CARD}>
        <h3 style={{ margin: 0, fontSize: 17 }}>{studentName}</h3>
        <p style={{ ...MUTED, marginTop: 8 }}>
          No learning profile has been built yet. MathMaster does not classify a student before it has
          enough evidence to be right about them.
        </p>
      </section>
    );
  }

  const gaps = diagnoseGaps(profile);
  const established = Boolean(profile.baseline?.established);
  const sessions = plan?.sessions || [];
  const suppressed = plan?.suppressed || [];

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <header style={{ ...CARD, display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 19, color: '#202124' }}>{studentName}</h3>
          <div style={{ marginTop: 8 }}>
            <StudentPerformanceBadge profile={profile} />
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close learning profile" style={{ appearance: 'none', border: 0, background: 'transparent', fontSize: 20, cursor: 'pointer', color: '#5f6368', fontFamily: 'inherit' }}>✕</button>
        )}
      </header>

      {!established && (
        <div style={{ ...CARD, background: '#f8fafc' }}>
          <div style={LABEL}>Still establishing a baseline</div>
          <p style={{ ...MUTED, marginTop: 6 }}>
            {profile.baseline.events} of {profile.baseline.requirement.events} usable pieces of evidence,
            across {profile.baseline.distinctSkills} of {profile.baseline.requirement.distinctSkills} standards
            and {profile.baseline.distinctSources} of {profile.baseline.requirement.distinctSources} kinds of work.
            Until that is met, MathMaster will keep recommending and keep gathering, but it will not tell you
            what level this student is on — a label formed from four questions is worse than no label,
            because it is the one you will remember.
          </p>
        </div>
      )}

      <div style={{ ...CARD, display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Stat
          label="Course mastery"
          // courseMastery is a 0-1 fraction, like every other ratio on the
          // profile. Rendering it with Math.round directly showed a student at
          // 62% as "1%".
          value={pct(profile.courseMastery)}
          hint={profile.skillsWithEvidence ? `across ${profile.skillsWithEvidence} standards` : 'no evidence yet'}
        />
        <Stat
          label="Working difficulty"
          value={profile.difficultyProfile?.stableBand ? `Band ${profile.difficultyProfile.stableBand}` : '—'}
          hint="structural complexity, independent of depth"
        />
        <Stat
          label="Retention"
          value={pct(profile.retentionStrength)}
          hint="of what was mastered and is still holding"
        />
        <Stat
          label="Foundation gaps"
          value={profile.foundationGapDepth || 0}
          hint={profile.foundationGapDepth ? 'prerequisite levels below the course' : 'none blocking current work'}
        />
      </div>

      <div style={CARD}>
        <div style={{ ...LABEL, marginBottom: 10 }}>Depth of knowledge</div>
        <DokTable dokProfile={profile.dokProfile} />
      </div>

      {gaps.length > 0 && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 8 }}>What the evidence suggests</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 7 }}>
            {gaps.map((gap) => (
              <li key={`${gap.type}-${gap.framework || ''}`} style={{ color: '#202124', fontSize: 13.5, lineHeight: 1.6 }}>
                <strong>{gap.label}</strong>
                <span style={{ ...MUTED, display: 'block' }}>{gap.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sessions.length > 0 && (
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 4 }}>
            This week{progress ? ` — ${progress.completed} of ${progress.required} complete` : ''}
          </div>
          <ul style={{ margin: 0, padding: 0 }}>
            {sessions.map((session) => <SessionRow key={`${session.skillId}-${session.slot || session.purpose}`} session={session} />)}
          </ul>
        </div>
      )}

      {suppressed.length > 0 && (
        <div style={CARD}>
          {/* The question every teacher asks second: not "why this?" but
              "why not that?" An engine that only answers the first looks
              arbitrary, and an arbitrary engine gets overridden into
              uselessness. */}
          <div style={{ ...LABEL, marginBottom: 8 }}>Deliberately held back this week</div>
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 5 }}>
            {suppressed.slice(0, 8).map((entry) => (
              <li key={entry.skillId} style={{ ...MUTED, fontSize: 13 }}>
                <strong style={{ color: '#202124' }}>{entry.teksCode}</strong>
                {' — '}
                {entry.eligibility.reason === 'cooling_down'
                  ? `worked recently; back in ${entry.eligibility.daysRemaining} day${entry.eligibility.daysRemaining === 1 ? '' : 's'}`
                  : String(entry.eligibility.reason).replace(/_/g, ' ')}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
