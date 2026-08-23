import React, { useMemo, useState } from 'react';
import { buildPathMap } from '../../platform/path/pathMap.js';
import PracticeAsMenu from './PracticeAsMenu.jsx';

// The student's actual learning path.
//
// It draws the decision the engine already made. There is no ranking, no
// prerequisite check and no date arithmetic in this file — all of that arrives
// in `pathOptions`, the same object Recommended for You is built from, which is
// what makes it impossible for the two screens to disagree about a skill.
//
// The shape on screen is the point. A student should see that their work
// branches, that being blocked on one thing leaves the others open, and that
// something is coming on a date the class actually reaches.

const section = {
  border: '1px solid #dadce0', borderRadius: 14, background: '#fff',
  padding: '16px 16px 18px', marginBottom: 14, textAlign: 'left',
};

const sectionHeading = {
  margin: '0 0 4px', fontSize: 11, fontWeight: 900, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: '#5f6368',
};

const nodeRow = { display: 'flex', flexWrap: 'wrap', gap: 12 };

// A card that is not a door still has to say WHY it is not a door, and the two
// reasons must not look alike. "Your class gets here in three weeks" is a
// calendar fact about the course; "you need an earlier skill first" is a
// statement about the student. Rendering both in the same grey was how a
// pacing restriction came to read as mathematical failure.
const cardStyle = (tone, selectable, blockedBy = null) => ({
  flex: '1 1 220px', minWidth: 0, padding: '13px 14px', borderRadius: 12,
  border: selectable ? `2px solid ${tone}`
    : blockedBy === 'pacing' ? '2px dashed #a8c7fa'
      : '2px solid #e0e3e8',
  background: selectable ? '#fff' : blockedBy === 'pacing' ? '#f6f9fe' : '#f8f9fa',
  textAlign: 'left', cursor: selectable ? 'pointer' : 'default',
  color: '#202124', font: 'inherit',
});

// What the "why" disclosure is called depends on what is actually true. A
// REMEDIATION card has a Start button on it; labelling its disclosure
// "Why is this locked?" told the student the opposite of what the button said.
const whyLabel = (blockedBy) => (
  blockedBy === 'pacing' ? 'Why is this later?'
    : blockedBy === 'teacher' ? 'Why is this closed?'
      : blockedBy === 'prerequisite' ? 'Why is this locked?'
        : 'Why this comes first'
);

function PathNode({ node, onChoose, practiceAs }) {
  const [showWhy, setShowWhy] = useState(false);
  const clickable = node.selectable && typeof onChoose === 'function';

  return (
    <div style={cardStyle(node.tone, node.selectable, node.blockedBy)}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span aria-hidden="true" style={{ fontSize: 15 }}>{node.symbol}</span>
        <strong style={{ fontSize: 16 }}>{node.title}</strong>
        <span style={{ fontSize: 11, fontWeight: 800, color: node.tone, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {node.statusLabel}
        </span>
      </div>
      {node.description && (
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#3c4043', lineHeight: 1.5 }}>{node.description}</p>
      )}
      <p style={{ margin: '0 0 10px', fontSize: 12, color: '#5f6368', lineHeight: 1.5 }}>{node.reason}</p>

      {/* A calendar restriction is a date, so show the date. "Not in your
          learning window yet" with no number is indistinguishable from a
          verdict. */}
      {node.blockedBy === 'pacing' && node.calendarDaysUntilStart > 0 && (
        <p style={{ margin: '-4px 0 10px', fontSize: 12, color: '#1967d2', fontWeight: 700 }}>
          Your class reaches this in about {node.calendarDaysUntilStart} {node.calendarDaysUntilStart === 1 ? 'day' : 'days'}.
          {' '}Nothing is wrong — this one is simply later in the course.
        </p>
      )}
      {node.blockedBy === 'pacing' && !node.calendarDaysUntilStart && (
        <p style={{ margin: '-4px 0 10px', fontSize: 12, color: '#1967d2', fontWeight: 700 }}>
          Your class reaches this later in the course. Nothing is wrong — this one is simply not open yet.
        </p>
      )}

      {node.lockedExplanation && (
        <div style={{ marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setShowWhy((current) => !current)}
            style={{ padding: 0, border: 0, background: 'transparent', color: '#174ea6', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}
          >
            {showWhy ? 'Hide' : whyLabel(node.blockedBy)}
          </button>
          {showWhy && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: '#3c4043', lineHeight: 1.55 }}>{node.lockedExplanation}</p>
          )}
        </div>
      )}

      {node.strengthen && (
        // The repair, not the blocked skill: the student cannot work on the
        // blocked one, so offering it would be an invitation to fail.
        <button
          type="button"
          onClick={() => onChoose?.(node.strengthen)}
          style={{ ...cardStyle(node.strengthen.tone, true), display: 'block', width: '100%', marginBottom: 8, padding: '10px 12px' }}
        >
          <span aria-hidden="true">{node.strengthen.symbol}</span>{' '}
          <strong>{node.strengthen.title}</strong>{' '}
          <span style={{ fontSize: 11, fontWeight: 800, color: node.strengthen.tone, textTransform: 'uppercase' }}>
            {node.strengthen.statusLabel}
          </span>
        </button>
      )}

      {clickable && (
        <button
          type="button"
          onClick={() => onChoose(node)}
          style={{ padding: '9px 14px', minHeight: 40, border: 0, borderRadius: 8, background: node.tone, color: '#fff', fontWeight: 900, cursor: 'pointer' }}
        >
          Start practice
        </button>
      )}

      {/* Only rendered where a legitimate assessment alignment exists — the
          menu returns nothing rather than showing four disabled buttons. */}
      {clickable && practiceAs && (
        <PracticeAsMenu
          skillId={node.skillId}
          pathOptions={practiceAs.pathOptions}
          assessmentEvidence={practiceAs.assessmentEvidence}
          directIndex={practiceAs.directIndex}
          goals={practiceAs.goals}
          teacherPriorities={practiceAs.teacherPriorities}
          onChoose={practiceAs.onChoose}
        />
      )}
    </div>
  );
}

function PathSection({ title, note, nodes, onChoose, practiceAs }) {
  if (!nodes.length) return null;
  return (
    <section style={section}>
      <h3 style={sectionHeading}>{title}</h3>
      {note && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#5f6368' }}>{note}</p>}
      <div style={nodeRow}>
        {nodes.map((node) => (
          <PathNode key={node.skillId} node={node} onChoose={onChoose} practiceAs={practiceAs} />
        ))}
      </div>
    </section>
  );
}

export const StudentLearningPath = ({
  pathOptions = null,
  onChooseSkill = null,
  // Everything the "Practice this skill as…" menu needs. Absent means the
  // menu is not offered at all, which is the honest state before CCMR
  // evidence has been loaded.
  assessmentContext = null,
  onPracticeAs = null,
  limits = undefined,
  // Whether the secure bank can actually issue work for a skill. Without it
  // the map happily draws a Start button in front of a standard with no
  // content, and the student learns about it only after clicking.
  isCovered = null,
}) => {
  const map = useMemo(
    () => buildPathMap(pathOptions, { ...(limits ? { limits } : {}), ...(isCovered ? { isCovered } : {}) }),
    [pathOptions, limits, isCovered],
  );
  const practiceAs = useMemo(() => (assessmentContext && onPracticeAs ? {
    pathOptions,
    assessmentEvidence: assessmentContext.assessmentEvidence || {},
    directIndex: assessmentContext.directIndex || null,
    goals: assessmentContext.goals || [],
    teacherPriorities: assessmentContext.teacherPriorities || [],
    onChoose: onPracticeAs,
  } : null), [assessmentContext, onPracticeAs, pathOptions]);

  if (!pathOptions) {
    return (
      <section style={{ ...section, maxWidth: 940, margin: '24px auto' }}>
        <h3 style={sectionHeading}>Your path</h3>
        <p style={{ margin: 0, color: '#5f6368', fontSize: 14, lineHeight: 1.6 }}>
          MathMaster is still resolving your course and learning path. If this remains here, your class assignment needs
          to be checked by your teacher or administrator.
        </p>
      </section>
    );
  }

  if (!map || map.isEmpty) {
    return (
      <section style={{ ...section, maxWidth: 940, margin: '24px auto' }}>
        <h3 style={sectionHeading}>Your path</h3>
        <p style={{ margin: 0, color: '#5f6368', fontSize: 14, lineHeight: 1.6 }}>
          Nothing is open on your path just yet. Try a practice session from your mastery overview to build some
          evidence.
        </p>
      </section>
    );
  }

  const choose = onChooseSkill ? (node) => onChooseSkill({
    skillId: node.skillId,
    title: node.title,
    status: node.status,
    remediationTarget: node.strengthen?.skillId || null,
  }) : null;

  return (
    <div style={{ maxWidth: 940, margin: '0 auto', padding: '20px 16px 40px' }}>
      <header style={{ textAlign: 'left', marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 24, color: '#202124' }}>Your path</h2>
        <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 13 }}>
          {map.masteredCount} of {map.totalSkills} skills mastered so far.
          {map.pacingIsProvisional ? ' Your class position is provisional, so timing may shift.' : ''}
        </p>
      </header>

      <PathSection
        title="Current learning"
        nodes={map.focus}
        onChoose={choose}
        practiceAs={practiceAs}
      />
      <PathSection
        title="Also open to you"
        note="Pick any of these. They stay open even when something else needs work first."
        nodes={map.branches}
        onChoose={choose}
        practiceAs={practiceAs}
      />
      <PathSection
        title="Needs support"
        note="These build on something else. Strengthening that first is the way in."
        nodes={map.needsSupport}
        onChoose={choose}
        practiceAs={practiceAs}
      />
      <PathSection
        title="Coming up next"
        nodes={map.comingUp}
        onChoose={choose}
        practiceAs={practiceAs}
      />
      <PathSection
        title="Challenge"
        note="Ahead of your class, and earned."
        nodes={map.challenge}
        onChoose={choose}
        practiceAs={practiceAs}
      />
      {/* Retention sits between "mastered" and "current": it is work on a skill
          the student has already shown, offered briefly and with a reason, so it
          does not read as the platform having forgotten. */}
      <PathSection
        title="Quick retention check"
        note="You have already shown these. A couple of questions is enough to keep them counted."
        nodes={map.retentionDue}
        onChoose={choose}
        practiceAs={practiceAs}
      />
      <PathSection
        title="Mastered"
        note="Yours already. You can practise any of them again whenever you want to."
        nodes={map.mastered}
        onChoose={choose}
        practiceAs={practiceAs}
      />
    </div>
  );
};

export default StudentLearningPath;
