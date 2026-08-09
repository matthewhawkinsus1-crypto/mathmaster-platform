import { useMemo } from 'react';
import { getAssessmentPathOptions } from '../../platform/ccmr/assessmentPathways';
import { READINESS } from '../../platform/ccmr/assessmentPathways';

// 9E — "Practice This Skill As…"
//
// The one rule that matters here: only frameworks with a real alignment are
// rendered. A greyed-out ASVAB button saying "not available" would still be
// telling the student the ASVAB tests exponential regression. It does not, so
// the button does not exist.
//
// The second rule: this appears on mastered skills too. Mastery is what makes
// transfer practice worth doing, so a mastered skill gains options here rather
// than losing them.

const STATUS_NOTE = {
  [READINESS.TRANSFER_GAP]: { text: 'Worth a look', color: '#a50e0e', background: '#fce8e6' },
  [READINESS.STRENGTHEN]: { text: 'Keep working', color: '#7a4f00', background: '#fef7e0' },
  [READINESS.STRONG]: { text: 'Going well', color: '#137333', background: '#e6f4ea' },
  [READINESS.NOT_PRACTICED]: { text: 'New', color: '#174ea6', background: '#e8f0fe' },
  [READINESS.READY]: { text: 'Ready', color: '#3c4043', background: '#f1f3f4' },
};

export default function PracticeAsMenu({
  skillId,
  pathOptions = null,
  assessmentEvidence = {},
  directIndex = null,
  goals = [],
  teacherPriorities = [],
  activeFramework = 'course',
  onChoose,
}) {
  const options = useMemo(() => getAssessmentPathOptions({
    skillId, pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities,
  }), [skillId, pathOptions, assessmentEvidence, directIndex, goals, teacherPriorities]);

  const available = options.availablePathways;

  // Nothing legitimate to offer. Say nothing rather than showing four disabled
  // buttons — an empty menu is not a failure state, it is an honest one.
  if (!available.length) return null;

  const choose = (framework) => onChoose?.({ skillId, framework });

  return (
    <div style={{ marginTop: 12 }}>
      <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.4, color: '#5f6368' }}>
        {options.masteredAndBranchable ? 'Apply your mastery' : 'Practice this skill as…'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 8 }}>
        <button
          type="button"
          onClick={() => choose('course')}
          style={{
            textAlign: 'left', padding: '11px 13px', borderRadius: 10, minHeight: 44,
            border: `2px solid ${activeFramework === 'course' ? '#1a73e8' : '#dadce0'}`,
            background: activeFramework === 'course' ? '#e8f0fe' : '#fff', cursor: 'pointer',
          }}
        >
          <span style={{ display: 'block', fontWeight: 800, color: '#202124', fontSize: 14 }}>Course Practice</span>
          <span style={{ display: 'block', color: '#5f6368', fontSize: 12, marginTop: 2 }}>The usual way this skill appears in class.</span>
        </button>

        {available.map((pathway) => {
          const note = STATUS_NOTE[pathway.status] || STATUS_NOTE[READINESS.READY];
          return (
            <button
              key={pathway.framework}
              type="button"
              onClick={() => choose(pathway.framework)}
              style={{
                textAlign: 'left', padding: '11px 13px', borderRadius: 10, minHeight: 44,
                border: `2px solid ${activeFramework === pathway.framework ? '#1a73e8' : '#dadce0'}`,
                background: activeFramework === pathway.framework ? '#e8f0fe' : '#fff', cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 800, color: '#202124', fontSize: 14 }}>{pathway.label}</span>
                <span style={{ fontSize: 10, fontWeight: 900, padding: '1px 7px', borderRadius: 999, color: note.color, background: note.background }}>
                  {note.text}
                </span>
              </span>
              <span style={{ display: 'block', color: '#5f6368', fontSize: 12, marginTop: 2 }}>{pathway.blurb}</span>
              {/* A percentage only where one was actually earned. Unpractised
                  frameworks say so in words rather than showing 0%. */}
              <span style={{ display: 'block', color: '#3c4043', fontSize: 11, marginTop: 4, fontWeight: 700 }}>
                {pathway.practised && pathway.proficiency != null
                  ? `${Math.round(pathway.proficiency * 100)}% in this format`
                  : 'Not practised in this format yet'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
