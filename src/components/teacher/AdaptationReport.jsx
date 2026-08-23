import React, { useMemo } from 'react';

// What each student actually received, and why.
//
// "If two students receive different adaptive Practice, the teacher must be
// able to see why." That sentence is the whole specification, and it rules out
// the two easy versions of this screen: a per-class average (which hides the
// differences that are the point) and a raw event log (which nobody reads).
//
// It reads STORED evidence rather than recomputing a decision. A recomputed
// explanation is a guess about the past — it would use today's profile to
// explain a question the student answered in October, and quietly change its
// story as the student improved. The reason was written down at the time.

const panel = { border: '1px solid #dadce0', borderRadius: 12, background: '#fff', padding: 16, marginBottom: 16 };
const heading = { margin: '0 0 4px', fontSize: 15, fontWeight: 900, color: '#174ea6' };
const note = { color: '#5f6368', fontSize: 13, lineHeight: 1.55, margin: '0 0 14px' };
const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12.5, fontVariantNumeric: 'tabular-nums' };

const chip = (background, color) => ({
  display: 'inline-block', padding: '2px 8px', borderRadius: 999,
  fontSize: 10.5, fontWeight: 900, letterSpacing: '.04em', background, color, whiteSpace: 'nowrap',
});

const codeOf = (event) => {
  const key = (event?.alignmentKeys || [])[0] || '';
  return String(key).includes(':') ? String(key).split(':').pop() : String(key || '—');
};

/**
 * One row per delivered question, newest first.
 *
 * Unadapted deliveries are included rather than filtered out. A teacher
 * checking "did this student get an easier version?" needs to see the answer
 * "no" as clearly as the answer "yes" — a list containing only adaptations
 * makes the platform look far more interventionist than it is.
 */
export default function AdaptationReport({
  events = [],
  assignmentId = null,
  studentName = null,
  limit = 40,
}) {
  const rows = useMemo(() => {
    const source = Array.isArray(events) ? events : [];
    return source
      .filter((event) => event?.source?.kind === 'assignment')
      .filter((event) => !assignmentId || event?.source?.assignmentId === assignmentId)
      .slice()
      .sort((a, b) => Number(b?.occurredAt || 0) - Number(a?.occurredAt || 0))
      .slice(0, limit)
      .map((event) => {
        const snapshot = event.questionSnapshot || {};
        const assignedBand = Number(snapshot.assignedDifficultyBand ?? snapshot.difficultyBand);
        const assignedDok = Number(snapshot.assignedDok ?? snapshot.dok);
        return {
          key: event.eventKey,
          code: codeOf(event),
          assignedDok,
          assignedBand,
          deliveredDok: Number(snapshot.dok),
          deliveredBand: Number(snapshot.difficultyBand),
          adapted: Boolean(snapshot.adapted),
          reason: event.adaptation?.reason || null,
          role: event.source?.activityRole || 'practice',
          title: event.source?.assignmentTitle || '',
          correct: Boolean(event.performance?.isCorrect),
        };
      });
  }, [events, assignmentId, limit]);

  const adaptedCount = rows.filter((row) => row.adapted).length;

  if (!rows.length) {
    return (
      <section style={panel}>
        <h3 style={heading}>What this student received</h3>
        <p style={{ ...note, margin: 0 }}>
          No assignment evidence yet. Once questions are answered, every delivery shows here with the
          version the student got and the reason for it.
        </p>
      </section>
    );
  }

  return (
    <section style={panel}>
      <h3 style={heading}>What {studentName || 'this student'} received</h3>
      <p style={note}>
        {adaptedCount === 0
          ? `${rows.length} question${rows.length === 1 ? '' : 's'} delivered, none adapted — every one was exactly as assigned.`
          : `${adaptedCount} of ${rows.length} deliveries were pitched differently from the assigned version. The standard was the same in every case.`}
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <thead>
            <tr style={{ background: '#f8f9fa' }}>
              {['Standard', 'Assigned', 'Received', 'Why', 'Result'].map((head) => (
                <th
                  key={head}
                  style={{
                    textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 900,
                    letterSpacing: '.07em', textTransform: 'uppercase', color: '#5f6368',
                  }}
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} style={{ borderTop: '1px solid #eef0f2' }}>
                <td style={{ padding: '10px', fontWeight: 800 }}>
                  {row.code}
                  <span style={{ display: 'block', color: '#5f6368', fontSize: 11, fontWeight: 600 }}>
                    {row.title} · {row.role}
                  </span>
                </td>
                <td style={{ padding: '10px', ...mono, color: '#5f6368' }}>
                  DOK {row.assignedDok} · Band {row.assignedBand}
                </td>
                <td style={{ padding: '10px', ...mono, color: row.adapted ? '#174ea6' : '#5f6368', fontWeight: row.adapted ? 700 : 400 }}>
                  DOK {row.deliveredDok} · Band {row.deliveredBand}
                  {!row.adapted && <span style={{ display: 'block', fontSize: 10.5, fontFamily: 'inherit' }}>as assigned</span>}
                </td>
                <td style={{ padding: '10px', color: '#3c4043', maxWidth: 340 }}>
                  {row.adapted
                    ? (row.reason || 'Adapted — reason not recorded.')
                    : <span style={{ color: '#5f6368' }}>—</span>}
                </td>
                <td style={{ padding: '10px' }}>
                  {row.correct
                    ? <span style={chip('#e6f4ea', '#137333')}>Correct</span>
                    : <span style={chip('#fce8e6', '#a50e0e')}>Not yet</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ ...note, margin: '14px 0 0', fontSize: 12 }}>
        {/* The assurance a teacher actually wants, stated rather than implied. */}
        Adaptation changes how a standard is pitched. It never changes which standard was assigned, and
        it never applies to a DOL, quiz or test unless you deliberately designed a differentiated
        assessment.
      </p>
    </section>
  );
}
