import { useMemo, useState } from 'react';
import { buildClassOverview, OVERVIEW_SECTION } from '../../platform/teacher/classOverview.js';
import StudentNameLink from '../common/StudentNameLink.jsx';

/*
 * PROGRESSIVE DISCLOSURE, MEANT LITERALLY.
 *
 * Three levels, and a teacher can stop at any of them:
 *
 *   1. One sentence. What is true about this class right now.
 *   2. The findings worth acting on, each one sentence long.
 *   3. The students behind a finding — one click, never in the way.
 *
 * There are no charts on this panel and that is a decision, not an omission.
 * Every distribution here is small enough that a sentence reads faster than a
 * graphic of the same fact, survives being read on a phone between classes, and
 * cannot be misread the way a colour bar can.
 */

const SECTION_LABEL = {
  [OVERVIEW_SECTION.BANDS]: 'Students',
  [OVERVIEW_SECTION.STANDARDS]: 'Standards',
  [OVERVIEW_SECTION.RIGOR]: 'Rigor delivered',
  [OVERVIEW_SECTION.WORK]: 'Work',
};

const SECTION_TONE = {
  [OVERVIEW_SECTION.BANDS]: '#1a73e8',
  [OVERVIEW_SECTION.STANDARDS]: '#b06000',
  [OVERVIEW_SECTION.RIGOR]: '#6f2da8',
  [OVERVIEW_SECTION.WORK]: '#5f6368',
};

export default function ClassOverviewPanel({
  className = 'This class',
  students = [],
  profilesByStudentId = {},
  masteryProfilesByStudentId = {},
  evidenceByStudentId = {},
  openAssignments = 0,
  needsAttentionCount = 0,
  onOpenStudent = null,
  // Delivered-rigor evidence is one Firestore read per student, so it is not
  // loaded to render a summary panel. Progressive disclosure applied to COST as
  // well as to attention: a teacher who wants the answer asks for it.
  onLoadDeliveredRigor = null,
  rigorLoading = false,
}) {
  const [openFinding, setOpenFinding] = useState(null);

  const overview = useMemo(() => buildClassOverview({
    className,
    students,
    profilesByStudentId,
    masteryProfilesByStudentId,
    evidenceByStudentId,
    openAssignments,
    needsAttentionCount,
  }), [className, students, profilesByStudentId, masteryProfilesByStudentId, evidenceByStudentId, openAssignments, needsAttentionCount]);

  return (
    <section style={{ border: '1px solid #d8dde6', borderRadius: 11, background: '#fff', marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '16px 18px' }}>
        <h3 style={{ margin: 0, fontSize: 12, fontWeight: 900, letterSpacing: '.09em', textTransform: 'uppercase', color: '#5f6368' }}>
          Class overview
        </h3>
        {/* Level one: the whole class in one sentence. */}
        <p style={{ margin: '7px 0 0', fontSize: 16.5, lineHeight: 1.45, color: '#202124', maxWidth: '62ch' }}>
          {overview.headline}
        </p>
      </div>

      {onLoadDeliveredRigor && !Object.keys(evidenceByStudentId).length && (
        <div style={{ display: 'flex', gap: 11, alignItems: 'center', flexWrap: 'wrap', padding: '11px 18px', borderTop: '1px solid #eef0f2', background: '#f8f9fa' }}>
          <span style={{ color: '#5f6368', fontSize: 12.5 }}>
            Delivered rigor is not loaded. It answers whether adaptive assignments are actually varying what this class receives.
          </span>
          <button
            type="button"
            onClick={onLoadDeliveredRigor}
            disabled={rigorLoading}
            style={{ marginLeft: 'auto', padding: '7px 12px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 12.5, cursor: rigorLoading ? 'wait' : 'pointer' }}
          >
            {rigorLoading ? 'Reading delivery history…' : 'Check delivered rigor'}
          </button>
        </div>
      )}

      {overview.findings.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {overview.findings.map((finding, index) => {
            const key = `${finding.section}:${index}`;
            const expanded = openFinding === key;
            const hasStudents = finding.students.length > 0;
            return (
              <li key={key} style={{ borderTop: '1px solid #eef0f2' }}>
                <div style={{ display: 'flex', gap: 12, padding: '13px 18px', alignItems: 'flex-start' }}>
                  <span
                    aria-hidden="true"
                    style={{ flex: '0 0 3px', alignSelf: 'stretch', borderRadius: 3, background: SECTION_TONE[finding.section] || '#5f6368' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase', color: '#5f6368', marginBottom: 3 }}>
                      {SECTION_LABEL[finding.section]}
                    </div>
                    {/* Level two: the finding, one sentence. */}
                    <div style={{ fontWeight: 800, fontSize: 14.5 }}>{finding.headline}</div>
                    <p style={{ margin: '4px 0 0', color: '#4d5b58', fontSize: 13, lineHeight: 1.5, maxWidth: '66ch' }}>
                      {finding.detail}
                    </p>

                    {/* Level three: who, on request. */}
                    {expanded && hasStudents && (
                      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
                        {finding.students.map((entry) => (
                          <span
                            key={entry.studentId}
                            style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, padding: '5px 9px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff' }}
                          >
                            <StudentNameLink
                              studentId={entry.studentId}
                              studentName={entry.studentName}
                              profile={profilesByStudentId[entry.studentId]}
                              onOpen={onOpenStudent}
                              style={{ fontSize: 12.5 }}
                            />
                            {entry.note && <span style={{ color: '#5f6368', fontSize: 11.5 }}>{entry.note}</span>}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {hasStudents && (
                    <button
                      type="button"
                      onClick={() => setOpenFinding(expanded ? null : key)}
                      aria-expanded={expanded}
                      style={{ alignSelf: 'center', padding: '7px 11px', border: '1px solid #dadce0', borderRadius: 8, background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 12.5, whiteSpace: 'nowrap', cursor: 'pointer' }}
                    >
                      {expanded ? 'Hide' : `Who (${finding.students.length})`}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
