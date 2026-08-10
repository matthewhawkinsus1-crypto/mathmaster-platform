import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPathCoverage, rebuildPathCoverage, seedPathQuestionBank } from '../../platform/path/pathCoverageService.js';
import {
  COVERAGE_STATE, COVERAGE_STATE_LABELS, summarizeCoverage,
} from '../../../functions/shared/pathCoverage.mjs';
import { COURSES } from '../../../functions/shared/classModel.mjs';

// Which standards My Math Path can actually teach.
//
// Before this existed, the only way to discover that a standard had no practice
// content was for a student to click it and be shown a server error. This is
// the same question asked in advance, by the people who can fix it.
//
// The counts come from the stored index, which the server computes with the
// same issuability check the runtime uses — so a number here is a promise the
// Path can keep, not an inventory of files.

const card = { border: '1px solid #d8dde6', borderRadius: 12, padding: '20px 22px', marginBottom: 20, textAlign: 'left', background: '#fff' };
const primary = { minHeight: 42, padding: '0 16px', border: 0, borderRadius: 9, background: '#1a73e8', color: '#fff', fontWeight: 800, cursor: 'pointer' };
const quiet = { minHeight: 38, padding: '0 13px', border: '1px solid #c7cdd6', borderRadius: 8, background: '#fff', color: '#3c4043', fontWeight: 700, cursor: 'pointer' };

const STATE_STYLE = {
  [COVERAGE_STATE.ADEQUATE]: { background: '#e6f4ea', color: '#137333' },
  [COVERAGE_STATE.MINIMAL]: { background: '#fef7e0', color: '#7a4f00' },
  [COVERAGE_STATE.AUTHORED_UNUSABLE]: { background: '#fce8e6', color: '#a50e0e' },
  [COVERAGE_STATE.NONE]: { background: '#f1f3f4', color: '#3c4043' },
};

const pill = (state) => ({
  display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11,
  fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em',
  ...(STATE_STYLE[state] || STATE_STYLE[COVERAGE_STATE.NONE]),
});

export default function PathCoverageAudit({ courseIds = COURSES.map((course) => course.id) }) {
  const [indexes, setIndexes] = useState({});
  const [courseId, setCourseId] = useState(courseIds[0]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [seed, setSeed] = useState(null);
  const [seedPhase, setSeedPhase] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await Promise.all(courseIds.map(async (id) => [id, await fetchPathCoverage(id)]));
      setIndexes(Object.fromEntries(loaded));
    } catch (caught) {
      setError(caught.message || 'Could not load coverage.');
    } finally {
      setLoading(false);
    }
  }, [courseIds.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  const rebuild = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await rebuildPathCoverage(courseIds);
      setIndexes(result.indexes || {});
    } catch (caught) {
      setError(caught.message || 'Could not rebuild coverage.');
    } finally {
      setBusy(false);
    }
  };

  const index = indexes[courseId] || null;
  const rows = useMemo(() => (index ? summarizeCoverage(index, { onlyGaps }) : []), [index, onlyGaps]);
  const summary = index?.summary || null;

  return (
    <div>
      {error && <div role="alert" style={{ ...card, background: '#fce8e6', borderColor: '#f0b4b2', color: '#a50e0e' }}>{error}</div>}

      <section style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ margin: 0 }}>My Math Path content coverage</h3>
            <p style={{ margin: '6px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.55, maxWidth: 720 }}>
              A standard counts as covered only when the secure question bank holds a question the server can both issue
              and grade. Matching the TEKS is not enough — a question whose tool has no server grader cannot teach anyone,
              and students are never routed to a standard that has none.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" style={quiet} onClick={load} disabled={loading || busy}>{loading ? 'Loading…' : 'Refresh'}</button>
            <button type="button" style={primary} onClick={rebuild} disabled={busy}>{busy ? 'Recomputing…' : 'Recompute from bank'}</button>
          </div>
        </div>

        <div role="group" aria-label="Course" style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          {courseIds.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={courseId === id}
              onClick={() => setCourseId(id)}
              style={{
                minHeight: 38, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontWeight: 800, fontSize: 13,
                border: `1px solid ${courseId === id ? '#1a73e8' : '#c5d5ef'}`,
                background: courseId === id ? '#e8f0fe' : '#fff',
                color: courseId === id ? '#174ea6' : '#3c4043',
              }}
            >
              {COURSES.find((course) => course.id === id)?.label || id}
            </button>
          ))}
        </div>
      </section>

      {/* Bootstrapping the bank. It starts empty by design and is filled
          deliberately; every item is validated server-side before it is stored,
          so a seed file cannot put content in front of a student that the
          runtime would refuse to issue. */}
      <section style={card}>
        <h3 style={{ margin: 0 }}>Import a Path bank seed package</h3>
        <p style={{ margin: '6px 0 14px', color: '#5f6368', fontSize: 13, lineHeight: 1.55, maxWidth: 720 }}>
          Select the seed JSON files — one or several at once, and a package split across course files must be selected
          together so it is validated and imported as a single unit. An array, or an object with <code>documents</code>,
          <code>items</code> or <code>questions</code>, are all accepted. Each
          one is checked with the same validation production uses to issue a question; anything that fails is reported and
          not stored. Re-importing the same file updates rather than duplicates.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          multiple
          onChange={async (event) => {
            const files = [...(event.target.files || [])];
            if (!files.length) return;
            setError(null);
            setBusy(true);
            try {
              const parsedFiles = await Promise.all(files.map(async (file) => JSON.parse(await file.text())));
              // The seed package wraps its payload in `documents`; other
              // exports use `items` or `questions`. Accept all three rather
              // than making a human reshape a file to import it.
              const items = parsedFiles.flatMap((parsed) => (Array.isArray(parsed)
                ? parsed
                : (parsed.documents || parsed.items || parsed.questions || [])));
              if (!items.length) throw new Error('Those files contain no question documents.');
              // One package split across course files is still one package, and
              // has to be validated and imported as one — a per-file import
              // could leave the bank half-filled.
              const ids = new Set(items.map((entry) => entry?.id));
              if (ids.size !== items.length) throw new Error('Those files contain duplicate question IDs.');
              setSeed(await seedPathQuestionBank(items, {
                onProgress: ({ phase, chunk, chunks }) => setSeedPhase(`${phase === 'validating' ? 'Validating' : 'Importing'} ${chunk} of ${chunks}…`),
              }));
              setSeedPhase(null);
            } catch (caught) {
              setError(caught.message || 'Could not import that seed file.');
            } finally {
              setBusy(false);
              event.target.value = '';
            }
          }}
          disabled={busy}
          style={{ fontSize: 14 }}
        />
        {seedPhase && <p style={{ marginTop: 12, color: '#174ea6', fontWeight: 700 }}>{seedPhase}</p>}
        {seed && (
          <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
            <div>Documents in the file: <strong>{seed.received / (seed.imported ? 2 : 1)}</strong></div>
            <div>Stored: <strong style={{ color: seed.imported ? '#137333' : '#a50e0e' }}>{seed.imported ? seed.accepted : 0}</strong></div>
            <div>Standards supplied: <strong>{seed.standards.length}</strong></div>
            {!seed.imported && (
              <p style={{ margin: '10px 0 0', fontWeight: 900, color: '#a50e0e' }}>
                Nothing was written. {seed.rejected.length} document{seed.rejected.length === 1 ? '' : 's'} would not have been
                issuable in production, and a partly-imported bank is worse than an empty one. Fix these and import again.
              </p>
            )}
            {seed.rejected.length > 0 && (
              <details style={{ marginTop: 8 }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#a50e0e' }}>{seed.rejected.length} rejected</summary>
                <table style={{ marginTop: 8, borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr style={{ textAlign: 'left', background: '#f1f3f4' }}>
                    <th style={{ padding: 6 }}>Question ID</th><th style={{ padding: 6 }}>Family</th>
                    <th style={{ padding: 6 }}>Standard</th><th style={{ padding: 6 }}>Reason</th>
                  </tr></thead>
                  <tbody>
                    {seed.rejected.slice(0, 60).map((entry, position) => (
                      <tr key={`${entry.id}-${position}`} style={{ borderBottom: '1px solid #e8eaed' }}>
                        <td style={{ padding: 6 }}>{entry.id || '(no id)'}</td>
                        <td style={{ padding: 6 }}>{entry.familyId || '—'}</td>
                        <td style={{ padding: 6 }}>{(entry.standards || []).join(', ') || '—'}</td>
                        <td style={{ padding: 6, color: '#a50e0e' }}>{String(entry.reason).replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
            {seed.imported && <p style={{ margin: '10px 0 0', color: '#5f6368' }}>Now recompute coverage above — it rereads the bank from Firestore rather than trusting this import.</p>}
          </div>
        )}
      </section>

      {!loading && !index && (
        <section style={{ ...card, background: '#fef7e0', borderColor: '#f9ab00' }}>
          <h3 style={{ margin: 0, color: '#7a4f00' }}>Coverage has never been computed for this course</h3>
          <p style={{ margin: '8px 0 0', color: '#7a4f00', lineHeight: 1.55 }}>
            Until it is, My Math Path treats every standard as unavailable rather than guessing. Press
            <strong> Recompute from bank</strong> above.
          </p>
        </section>
      )}

      {summary && (
        <section style={{ ...card, background: summary.fullyCovered ? '#e6f4ea' : '#fff' }}>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            {[
              ['Wheel standards', summary.wheelSkills],
              ['Students can practise', summary.studentReady],
              ['Ready', summary.adequate],
              ['Usable but thin', summary.minimal],
              ['Authored but unusable', summary.authoredUnusable],
              ['No content', summary.none],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#202124' }}>{value}</div>
                <div style={{ fontSize: 12, color: '#5f6368', fontWeight: 700 }}>{label}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontWeight: 900, color: summary.fullyCovered ? '#137333' : '#a50e0e', lineHeight: 1.5 }}>
            {summary.fullyCovered
              ? 'Every standard on this wheel has practice content. No student can reach a dead end.'
              : `${summary.wheelSkills - summary.studentReady} standard${summary.wheelSkills - summary.studentReady === 1 ? '' : 's'} cannot be practised yet, and ${summary.wheelSkills - summary.studentReady === 1 ? 'is' : 'are'} hidden from students until content exists.`}
          </p>
          {index?.generatedAt && (
            <p style={{ margin: '6px 0 0', color: '#5f6368', fontSize: 12 }}>
              Last computed {new Date(index.generatedAt).toLocaleString()}.
            </p>
          )}
        </section>
      )}

      {index && (
        <section style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0 }}>By standard</h3>
            <label style={{ fontSize: 13, color: '#3c4043', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={onlyGaps} onChange={(event) => setOnlyGaps(event.target.checked)} />
              Show only gaps
            </label>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f1f3f4', textAlign: 'left' }}>
                  <th style={{ padding: 9 }}>Standard</th>
                  <th style={{ padding: 9 }}>Usable question families</th>
                  <th style={{ padding: 9 }}>Authored (active)</th>
                  <th style={{ padding: 9 }}>Difficulty bands</th>
                  <th style={{ padding: 9 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.displayCode} style={{ borderBottom: '1px solid #e8eaed' }}>
                    <td style={{ padding: 9, fontWeight: 900 }}>{row.displayCode}</td>
                    <td style={{ padding: 9, fontWeight: 900, color: row.issuableCount ? '#137333' : '#a50e0e' }}>{row.issuableCount}</td>
                    <td style={{ padding: 9, color: '#5f6368' }}>{row.activeCount}</td>
                    <td style={{ padding: 9, color: '#5f6368' }}>
                      {Object.keys(row.byBand).length
                        ? Object.entries(row.byBand).sort().map(([band, count]) => `B${band}×${count}`).join(' · ')
                        : '—'}
                    </td>
                    <td style={{ padding: 9 }}><span style={pill(row.state)}>{COVERAGE_STATE_LABELS[row.state]}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 14, color: '#137333', fontWeight: 700 }}>No gaps — every standard on this wheel has practice content.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
