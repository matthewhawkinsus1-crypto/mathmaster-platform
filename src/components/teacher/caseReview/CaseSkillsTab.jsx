import { EmptyNote, pct } from './CaseReviewParts.jsx';

/*
 * SKILL & STANDARD ANALYSIS — from each question's own standards metadata,
 * with fixed minimum-evidence rules, grade-level findings only, Modified work
 * beside them, and prerequisites only from MathMaster's authored map.
 */

const PREREQ_STATUS = {
  'evidence-at-or-above-threshold': 'evidence at or above 70% in this selection',
  'evidence-below-threshold': 'evidence below 70% in this selection',
  'limited-evidence': 'one scored question in this selection',
  'no-evidence-in-selection': 'no MathMaster evidence in this selection',
};

function FindingList({ title, entries, empty }) {
  return (
    <div className="cr-card">
      <h3>{title}</h3>
      {entries.length
        ? <ul className="cr-lines">{entries.map((entry) => <li key={entry.code}><strong>{entry.code}</strong>{entry.description ? ` — ${entry.description}` : ''}<div className="cr-note">{entry.reason}</div></li>)}</ul>
        : <EmptyNote>{empty}</EmptyNote>}
    </div>
  );
}

export default function CaseSkillsTab({ model }) {
  const { skills, findings, prerequisites, rules, untagged, platformInferred } = model.skills;
  return (
    <>
      <section className="cr-section" aria-labelledby="cr-skill-findings">
        <h2 id="cr-skill-findings">Skill &amp; standard findings</h2>
        <p className="cr-note">
          Fixed rules, grade-level work only, at least {rules.minScored} scored questions per standard: strongest ≥ {rules.strongAtOrAbove}% final accuracy;
          needs additional instruction &lt; {rules.instructionBelow}%; persistent errors when ≥ {rules.persistent.minNotCorrect} questions and ≥ {Math.round(rules.persistent.minShare * 100)}% end
          not correct; improvement after retries when ≥ {rules.retry.minCorrected} and ≥ {Math.round(rules.retry.minShare * 100)}% are corrected later. {rules.note}
        </p>
        <div className="cr-grid-2">
          <FindingList title="Comparatively strongest" entries={findings.strongest} empty="No standard meets the rule in this selection." />
          <FindingList title="Needs additional instruction" entries={findings.needsInstruction} empty="No standard meets the rule in this selection." />
          <FindingList title="Persistent errors" entries={findings.persistentError} empty="No standard meets the rule in this selection." />
          <FindingList title="Improvement after retries" entries={findings.improvedAfterRetry} empty="No standard meets the rule in this selection." />
        </div>
        {findings.limitedEvidence.length > 0 && <p className="cr-note">Limited evidence (no finding): {findings.limitedEvidence.map((entry) => `${entry.code} (${entry.attempted})`).join(', ')}.</p>}
      </section>

      {prerequisites.length > 0 && (
        <section className="cr-section" aria-labelledby="cr-prereqs">
          <h2 id="cr-prereqs">Prerequisites of the standards needing attention</h2>
          <p className="cr-note">From MathMaster&apos;s authored prerequisite map (teacher-reviewable; not a TEA claim) and prerequisite standards authored on the questions. Each is described by this student&apos;s own evidence — never as the reason for a result.</p>
          {prerequisites.map((entry) => (
            <div key={entry.code} className="cr-card">
              <h3>{entry.code}</h3>
              {entry.prerequisites.length
                ? <ul className="cr-lines">{entry.prerequisites.map((prereq) => <li key={prereq.code}><strong>{prereq.code}</strong>{prereq.strength ? ` (${prereq.strength})` : ' (question metadata)'} — {PREREQ_STATUS[prereq.status]}{prereq.finalCreditAverage !== null ? `: ${prereq.finalCreditAverage}% over ${prereq.attempted}` : ''}</li>)}</ul>
                : <EmptyNote>MathMaster has no authored prerequisite for this standard.</EmptyNote>}
            </div>
          ))}
        </section>
      )}

      <section className="cr-section" aria-labelledby="cr-skill-table">
        <h2 id="cr-skill-table">Standards encountered ({skills.length})</h2>
        {skills.length ? (
          <div className="cr-scroll-x">
            <table className="cr-table">
              <thead><tr><th>Standard</th><th>Answered</th><th>Final accuracy</th><th>First attempt</th><th>Classwork + Practice</th><th>DOL</th><th>Modified work</th><th>Trend</th></tr></thead>
              <tbody>
                {skills.map((skill) => (
                  <tr key={skill.code}>
                    <td><strong>{skill.code}</strong>{skill.description ? <div className="cr-note">{skill.description}</div> : <div className="cr-note">Not in MathMaster&apos;s TEKS registry</div>}</td>
                    <td className="cr-num">{skill.byCondition.standard.attempted} of {skill.byCondition.standard.questions}</td>
                    <td className="cr-num">{pct(skill.byCondition.standard.finalCreditAverage)}</td>
                    <td className="cr-num">{pct(skill.byCondition.standard.firstAttemptAccuracy)}</td>
                    <td className="cr-num">{skill.instructional.attempted ? pct(skill.instructional.finalCreditAverage) : '—'}</td>
                    <td className="cr-num">{skill.dol.attempted ? pct(skill.dol.finalCreditAverage) : '—'}</td>
                    <td className="cr-num">{skill.byCondition.modified.attempted ? `${pct(skill.byCondition.modified.finalCreditAverage)} over ${skill.byCondition.modified.attempted}` : '—'}</td>
                    <td>{skill.trend.determinable ? `${skill.trend.earlier.finalCreditAverage}% → ${skill.trend.later.finalCreditAverage}%` : <span className="cr-note">not enough dated evidence</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyNote>No question in this selection carries standards metadata.</EmptyNote>}
        {untagged.note && <p className="cr-note">{untagged.note}</p>}
        {platformInferred.note && <p className="cr-note">{platformInferred.note}</p>}
      </section>
    </>
  );
}
