import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';

import { functions } from '../../firebase.js';

/*
 * THE SWITCH THAT TURNS ON AUTOMATIC WEEKLY GRADE PUBLISHING.
 *
 * Publishing runs on a schedule with no per-week review step, which is what the
 * teacher asked for. This control is the one deliberate human decision in that
 * flow, and it DEFAULTS OFF for every class: deploying the feature must never
 * retroactively push grades for a class nobody has looked at.
 *
 * "Preview this week" exists for the same reason. It runs the identical code
 * path the schedule runs, writes nothing, and reports exactly which students
 * would be graded and which would be skipped and why — so a teacher can see the
 * numbers once before agreeing to let them go out unattended every week.
 */

const getSetting = httpsCallable(functions, 'getWeeklyPathClassroomSync');
const setSetting = httpsCallable(functions, 'setWeeklyPathClassroomSync');
const runNow = httpsCallable(functions, 'runWeeklyPathClassroomSyncNow');

const CARD = {
  border: '1px solid #dadce0', borderRadius: 12, padding: '16px 18px',
  marginTop: 14, background: '#fff',
};
const MUTED = { color: '#5f6368', fontSize: 13, lineHeight: 1.55 };

// The server returns machine reasons so they can be logged and counted; a
// teacher needs the sentence version.
const REASON_TEXT = Object.freeze({
  automatic_publishing_not_enabled_for_this_class: 'automatic publishing is off for this class',
  student_is_not_linked_to_a_classroom_account: 'not linked to a Google Classroom account',
  the_week_is_not_over_yet: 'the week is not over yet',
  no_weekly_score_was_computed: 'no weekly score yet',
  a_teacher_already_changed_this_grade_in_classroom: 'you changed this grade in Classroom, so it was left alone',
  this_score_is_already_published: 'already published',
  no_weekly_goal_for_this_student: 'no weekly Path was assigned',
  no_classroom_submission_for_this_student: 'no Classroom submission to grade',
  classroom_rejected_the_grade_write: 'Google Classroom rejected the write',
  dry_run: 'would be published',
  class_is_not_linked_to_a_google_classroom_course: 'this class is not linked to a Google Classroom course',
  weekly_completion_data_was_truncated: 'this week’s data came back incomplete, so nothing was published',
  incomplete_class_week_identity: 'this class or week is not fully set up',
});

const describe = (reason) => REASON_TEXT[reason] || reason || 'skipped';

export default function WeeklyPathAutoPublish({ classId = null, weekKey = null }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!classId) return;
    try {
      setState((await getSetting({ classId }))?.data || null);
    } catch (loadError) {
      setError(String(loadError?.message || loadError).replace(/^Firebase:\s*/i, ''));
    }
  }, [classId]);

  useEffect(() => { load(); }, [load]);

  if (!classId) return null;

  const enabled = state?.enabled === true;

  const toggle = async () => {
    setBusy(true);
    setError('');
    try {
      const next = (await setSetting({ classId, enabled: !enabled, maxPoints: state?.maxPoints || 100 }))?.data;
      setState((current) => ({ ...current, ...next }));
    } catch (toggleError) {
      setError(String(toggleError?.message || toggleError).replace(/^Firebase:\s*/i, ''));
    } finally {
      setBusy(false);
    }
  };

  const runPreview = async () => {
    if (!weekKey) return;
    setBusy(true);
    setError('');
    setPreview(null);
    try {
      setPreview((await runNow({ classId, weekKey, dryRun: true }))?.data || null);
    } catch (previewError) {
      setError(String(previewError?.message || previewError).replace(/^Firebase:\s*/i, ''));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={CARD}>
      <h3 style={{ margin: 0, fontSize: 16 }}>Publish weekly Path grades to Google Classroom</h3>
      <p style={{ ...MUTED, margin: '6px 0 12px' }}>
        When this is on, MathMaster posts one Math Path assignment per week to this class&apos;s
        Google Classroom course and grades it automatically on Monday morning, after the week
        closes at midnight Sunday night. It never overwrites a grade you changed yourself, and it
        never publishes a grade for a student it could not actually score.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          style={{
            minHeight: 44, padding: '10px 16px', borderRadius: 9, border: 0,
            background: enabled ? '#137333' : '#1a73e8', color: '#fff', fontWeight: 900,
            fontSize: 14, cursor: busy ? 'progress' : 'pointer',
          }}
        >
          {enabled ? 'Automatic publishing is ON — turn off' : 'Turn on automatic publishing'}
        </button>
        <button
          type="button"
          onClick={runPreview}
          disabled={busy || !weekKey}
          style={{
            minHeight: 44, padding: '10px 16px', borderRadius: 9,
            border: '1px solid #9bb8e8', background: '#fff', color: '#174ea6',
            fontWeight: 900, fontSize: 14, cursor: busy || !weekKey ? 'default' : 'pointer',
          }}
        >
          Preview this week (writes nothing)
        </button>
      </div>

      {state?.updatedByEmail && (
        <p style={{ ...MUTED, margin: '9px 0 0', fontSize: 12.5 }}>
          Last changed by {state.updatedByEmail}. Worth {state.maxPoints || 100} points.
        </p>
      )}

      {error && (
        <div role="alert" style={{ marginTop: 11, padding: '10px 12px', borderRadius: 8, background: '#fce8e6', color: '#a50e0e', fontSize: 13 }}>
          {error}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: 13, border: '1px solid #e8eaed', borderRadius: 9, padding: '11px 13px' }}>
          <strong style={{ fontSize: 13.5 }}>
            {preview.ok === false
              ? `Nothing would publish: ${describe(preview.reason)}.`
              : `${preview.results?.filter((row) => row.reason === 'dry_run').length || 0} of ${preview.results?.length || 0} students would get a grade.`}
          </strong>
          {Array.isArray(preview.results) && preview.results.length > 0 && (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, ...MUTED, fontSize: 12.5 }}>
              {preview.results.slice(0, 40).map((row) => (
                <li key={row.studentId}>
                  {row.studentId}: {row.reason === 'dry_run'
                    ? `${row.points} points`
                    : describe(row.reason)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
