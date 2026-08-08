import { COURSE_OPTIONS, summarizeRigorSequence } from '../../platform/rigor/courseRigor.js';

export default function ClassCourseSettings({ classPeriods = [], courseProfiles = {}, assignments = [], onChange, onSave, saving = false }) {
  return (
    <section style={{ marginBottom: 24, padding: 18, border: '1px solid #d8dde6', borderRadius: 11, background: '#fbfcfe', textAlign: 'left' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0 }}>Course & rigor by class</h3>
          <p style={{ margin: '5px 0 0', color: '#5f6368', fontSize: 13, maxWidth: 760, lineHeight: 1.5 }}>
            Honors is a class-level promise of rigor. Advanced readiness remains evidence-driven for each student and does not change course placement.
          </p>
        </div>
        <button type="button" onClick={onSave} disabled={saving} style={{ padding: '9px 14px', border: 0, borderRadius: 8, background: '#1a73e8', color: '#fff', fontWeight: 900, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save Course Settings'}</button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f1f3f4' }}><th style={{ textAlign: 'left', padding: 10 }}>Class period</th><th style={{ textAlign: 'left' }}>Course</th><th style={{ textAlign: 'left' }}>Course level</th><th style={{ textAlign: 'left' }}>Meaning</th></tr></thead>
          <tbody>
            {classPeriods.map((period) => {
              const profile = courseProfiles[period] || { course: 'algebra1', courseLevel: 'standard' };
              const sequence = profile.courseLevel === 'honors' ? summarizeRigorSequence(assignments, period) : null;
              return (
                <tr key={period} style={{ borderBottom: '1px solid #e8eaed' }}>
                  <td style={{ padding: 10, fontWeight: 900 }}>{period}</td>
                  <td><select value={profile.course || 'algebra1'} onChange={(event) => onChange(period, { course: event.target.value })} style={{ minWidth: 145, padding: 8, border: '1px solid #c7cdd6', borderRadius: 7 }}>{COURSE_OPTIONS.map((course) => <option key={course.id} value={course.id}>{course.label}</option>)}</select></td>
                  <td><select value={profile.courseLevel || 'standard'} onChange={(event) => onChange(period, { courseLevel: event.target.value })} style={{ minWidth: 130, padding: 8, border: '1px solid #c7cdd6', borderRadius: 7 }}><option value="standard">Standard</option><option value="honors">Honors</option></select></td>
                  <td style={{ color: '#5f6368', fontSize: 12, lineHeight: 1.45 }}>{profile.courseLevel === 'honors' ? <>{sequence?.totalQuestions ? <>Recent sequence: <strong>{sequence.percentages.core}% core · {sequence.percentages.prerequisite}% prerequisite · {sequence.percentages.ccmr}% CCMR</strong><br /></> : null}<span>Rolling planning target: ~75% core · 10% prerequisite · 15% CCMR. Short Warm-Ups/DOLs can stay narrow.</span></> : 'Students can still receive individual enrichment when evidence shows advanced readiness.'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
