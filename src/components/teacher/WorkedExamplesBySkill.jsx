import { useMemo } from 'react';
import { buildWorkedExampleView } from '../../platform/teacher/workedExampleView.js';

/*
 * WORKED EXAMPLES, BY SKILL, in an assignment's results
 * (docs/platform/WORKED_EXAMPLES.md, section 9, slice G).
 *
 * For the class: per skill, which students opened a worked example and how
 * their next question on that skill was marked. For one student (the
 * gradebook's student view): the same, beside each question's "worth a
 * conversation" notes. Counts of what was recorded; it changes nothing and
 * says nothing about why (platform/teacher/workedExampleView.js).
 *
 * `students` is `[{ id, name, tracker }]`: the records the gradebook already
 * holds for this assignment. Nothing is read from the server here.
 */
const small = { fontSize: 'calc(12 * var(--mm-px))', color: 'var(--mm-text-muted)', lineHeight: 1.45 };
const cell = { padding: '7px 9px', borderTop: '1px solid var(--mm-border)', verticalAlign: 'top', fontSize: 'calc(12.5 * var(--mm-px))', textAlign: 'left' };
const head = { ...cell, borderTop: 'none', fontSize: 'calc(11 * var(--mm-px))', fontWeight: 900, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--mm-text-muted)' };

const questionWords = (questionIndex, roleLabel) => `Question ${questionIndex + 1}${roleLabel ? ` (${roleLabel})` : ''}`;

export default function WorkedExamplesBySkill({ assignment = null, students = [], single = false, onOpenStudent = null }) {
  const view = useMemo(() => buildWorkedExampleView({ assignment, students }), [assignment, students]);
  if (!assignment || !view.skills.length) return null;
  const who = single ? 'This student' : 'The class';
  return (
    <section data-worked-examples-by-skill={single ? 'student' : 'class'} aria-labelledby={`worked-examples-${single ? 'student' : 'class'}`} style={{ margin: '16px 0', padding: '12px 14px', borderRadius: 9, border: '1px solid var(--mm-border)', background: 'var(--mm-surface)', textAlign: 'left' }}>
      <h3 id={`worked-examples-${single ? 'student' : 'class'}`} style={{ margin: 0, fontSize: 'calc(15 * var(--mm-px))' }}>{view.title}</h3>
      <p style={{ ...small, margin: '4px 0 0' }}>{view.note}</p>
      {view.notLoaded.length > 0 && (
        <p role="status" data-worked-examples-not-loaded="" style={{ ...small, margin: '6px 0 0' }}>
          The support record has not loaded yet for {view.notLoaded.length === 1 ? view.notLoaded[0].name : `${view.notLoaded.length} students`}. What they opened is not known yet; that is not the same as opening none.
        </p>
      )}
      {view.unknown ? null : view.none ? (
        <p data-worked-examples-none="" style={{ margin: '8px 0 0', fontSize: 'calc(13 * var(--mm-px))' }}>{view.none}</p>
      ) : (
        <>
          <p data-worked-examples-summary="" style={{ margin: '8px 0 0', fontSize: 'calc(13 * var(--mm-px))' }}>
            {single
              ? `${who} opened ${view.examplesOpened === 1 ? 'a worked example once' : `a worked example ${view.examplesOpened} times`}, on ${view.where}.`
              : `${view.studentsOpened} of ${view.studentsLooked} ${view.studentsLooked === 1 ? 'student' : 'students'} opened a worked example, on ${view.where}.`}
          </p>
          {view.opened.map((skill) => (
            <div key={skill.key} data-example-skill={skill.key} style={{ marginTop: 12 }}>
              <h4 style={{ margin: 0, fontSize: 'calc(13.5 * var(--mm-px))' }}>{skill.label}{skill.named && <span style={{ ...small, fontWeight: 400 }}> · {skill.questionNumbers.length === 1 ? 'Question' : 'Questions'} {skill.questionNumbers.join(', ')}</span>}</h4>
              {!single && <p data-example-skill-line="" style={{ ...small, margin: '2px 0 0', color: 'var(--mm-text)' }}>{skill.line}</p>}
              <div role="region" aria-label={`${skill.label}: examples opened, scrollable`} tabIndex={0} style={{ overflowX: 'auto', marginTop: 4 }}>
                <table aria-label={`${skill.label}: who opened an example and what followed`} style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {!single && <th scope="col" style={head}>Student</th>}
                      <th scope="col" style={head}>Example opened on</th>
                      <th scope="col" style={head}>How</th>
                      <th scope="col" style={head}>That question</th>
                      <th scope="col" style={head}>Next question on the skill</th>
                    </tr>
                  </thead>
                  <tbody>
                    {skill.students.flatMap((student) => student.opened.map((entry, position) => (
                      <tr key={`${student.studentId}-${entry.questionIndex}`} data-example-opened={entry.how} data-example-next={entry.next.outcome}>
                        {!single && (
                          <td style={cell}>
                            {onOpenStudent && position === 0
                              ? <button type="button" onClick={() => onOpenStudent(student.studentId)} style={{ padding: 0, border: 'none', background: 'none', color: 'var(--mm-primary-text)', fontWeight: 800, fontSize: 'inherit', textAlign: 'left', cursor: 'pointer', textDecoration: 'underline' }} aria-label={`${student.name}: open this student's results, with any worth-a-conversation notes`}>{student.name}</button>
                              : <strong>{student.name}</strong>}
                          </td>
                        )}
                        <td style={cell}>{questionWords(entry.questionIndex, entry.roleLabel)}</td>
                        <td style={cell}>{entry.howLabel}</td>
                        <td style={cell}>{entry.outcomeLabel}</td>
                        <td style={cell}>{entry.next.questionIndex === null ? entry.next.outcomeLabel : `${questionWords(entry.next.questionIndex, entry.next.roleLabel)}: ${entry.next.outcomeLabel}`}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {view.untouched.length > 0 && <p data-example-skills-untouched="" style={{ ...small, margin: '10px 0 0' }}>No example opened on: {view.untouched.join('; ')}.</p>}
        </>
      )}
      <details style={{ marginTop: 8 }}>
        <summary style={{ ...small, cursor: 'pointer' }}>What this can and cannot say</summary>
        <ul style={{ ...small, margin: '4px 0 0', paddingLeft: 18 }}>{view.limitations.map((line) => <li key={line}>{line}</li>)}</ul>
      </details>
    </section>
  );
}
