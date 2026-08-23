import { Fragment, useMemo, useState } from 'react';
import { buildAdaptivePreview } from '../../platform/assignments/adaptivePreview.js';

/*
 * WHAT THREE DIFFERENT STUDENTS WOULD ACTUALLY RECEIVE.
 *
 * Every number on this screen comes from one call to the real adaptation
 * engine, per question per student — the same call the runtime makes when a
 * child opens the assignment. See the note at the top of adaptivePreview.js for
 * why that matters more than it sounds like it should.
 *
 * The design decision worth naming: a row where nothing varies is shown, and
 * shown as not varying. The tempting alternative is to hide those rows so the
 * preview looks like it is doing something, which is precisely how a teacher
 * ends up publishing an assignment they believe adapts and which does not.
 */

const VARY_TONE = {
  true: { bg: '#f3e8fd', fg: '#6f2da8', border: '#e0c8f5' },
  false: { bg: '#f1f3f4', fg: '#5f6368', border: '#e0e3e7' },
};

export default function AdaptivePreview({
  assignment = null,
  questions = [],
  courseId = 'algebra1',
  honors = false,
}) {
  const [openRow, setOpenRow] = useState(null);

  const preview = useMemo(
    () => buildAdaptivePreview({ assignment, questions, courseId, honors }),
    [assignment, questions, courseId, honors],
  );

  if (!preview.rows.length) {
    return (
      <section style={{ padding: '15px 17px', border: '1px solid #d8dde6', borderRadius: 10, background: '#fff' }}>
        <h4 style={{ margin: 0, fontSize: 15 }}>Adaptive preview</h4>
        <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: 13 }}>{preview.summary.headline}</p>
      </section>
    );
  }

  return (
    <section style={{ border: '1px solid #d8dde6', borderRadius: 10, background: '#fff', overflow: 'hidden' }}>
      <header style={{ padding: '15px 17px 12px', borderBottom: '1px solid #eef0f2' }}>
        <h4 style={{ margin: 0, fontSize: 15 }}>Adaptive preview</h4>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: '#202124', lineHeight: 1.5, maxWidth: '68ch' }}>
          {preview.summary.headline}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#5f6368', lineHeight: 1.5, maxWidth: '68ch' }}>
          Run through the real adaptation engine against three simulated students, not a demonstration.
          If this preview shows nothing changing, nothing will change for your class either.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 11 }}>
          {preview.students.map((student) => (
            <div key={student.id} style={{ fontSize: 12 }}>
              <div style={{ fontWeight: 900, color: '#202124' }}>{student.label}</div>
              <div style={{ color: '#5f6368', maxWidth: 210, lineHeight: 1.4 }}>{student.note}</div>
            </div>
          ))}
        </div>
      </header>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 620 }}>
          <thead>
            <tr style={{ background: '#f8f9fa', textAlign: 'left' }}>
              <th style={{ padding: '9px 11px' }}>Question</th>
              <th style={{ padding: '9px 11px' }}>Authored</th>
              {preview.students.map((student) => (
                <th key={student.id} style={{ padding: '9px 11px' }}>{student.label}</th>
              ))}
              <th style={{ padding: '9px 11px' }} />
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => {
              const tone = VARY_TONE[String(row.varies)];
              const expanded = openRow === row.questionId;
              return (
                // A real Fragment, because a bare <> cannot carry the key React
                // needs for a two-row group.
                <Fragment key={row.questionId}>
                  <tr style={{ borderTop: '1px solid #eef0f2', background: row.varies ? '#fff' : '#fcfcfd' }}>
                    <td style={{ padding: '9px 11px', maxWidth: 240 }}>
                      <div style={{ fontWeight: 800 }}>
                        Q{row.index + 1} · {row.activityRole}
                      </div>
                      <div style={{ color: '#5f6368', fontSize: 11.5, lineHeight: 1.4 }}>{row.prompt || '—'}</div>
                      <span style={{ display: 'inline-block', marginTop: 4, padding: '2px 7px', borderRadius: 999, background: tone.bg, color: tone.fg, border: `1px solid ${tone.border}`, fontSize: 10, fontWeight: 900 }}>
                        {row.varies ? 'VARIES' : 'SAME FOR ALL'}
                      </span>
                    </td>
                    <td style={{ padding: '9px 11px', color: '#5f6368', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      DOK {row.assignedDok} · Band {row.assignedBand}
                      <div style={{ fontSize: 10.5, marginTop: 2 }}>{row.variationMode}</div>
                    </td>
                    {row.deliveries.map((delivery) => (
                      <td
                        key={delivery.studentId}
                        style={{
                          padding: '9px 11px',
                          fontVariantNumeric: 'tabular-nums',
                          whiteSpace: 'nowrap',
                          fontWeight: delivery.adapted ? 900 : 400,
                          color: delivery.adapted ? '#6f2da8' : '#3c4043',
                        }}
                      >
                        DOK {delivery.dok} · Band {delivery.difficultyBand}
                      </td>
                    ))}
                    <td style={{ padding: '9px 11px' }}>
                      <button
                        type="button"
                        onClick={() => setOpenRow(expanded ? null : row.questionId)}
                        aria-expanded={expanded}
                        style={{ padding: '5px 9px', border: '1px solid #dadce0', borderRadius: 7, background: '#fff', color: '#174ea6', fontWeight: 800, fontSize: 11.5, cursor: 'pointer' }}
                      >
                        {expanded ? 'Hide' : 'Why'}
                      </button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr style={{ background: '#fbfbfd' }}>
                      <td colSpan={3 + preview.students.length} style={{ padding: '11px 13px' }}>
                        <div style={{ display: 'grid', gap: 7 }}>
                          {row.deliveries.map((delivery) => (
                            <div key={delivery.studentId} style={{ fontSize: 12, lineHeight: 1.5 }}>
                              <strong>{delivery.label}:</strong>{' '}
                              {/* The engine's own words, not a rewrite of them. */}
                              <span style={{ color: '#4d5b58' }}>{delivery.reason || 'Delivered exactly as authored.'}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
