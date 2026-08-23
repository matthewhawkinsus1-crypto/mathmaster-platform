import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { diagnosePathSkill, fetchPathCoverage, fetchPathRuntimeStatus, initializeBundledPathBankStarter, PATH_COVERAGE_COURSE_IDS, rebuildPathCoverage, seedPathQuestionBank } from '../../platform/path/pathCoverageService.js';
import { clearTeacherPathBankSnapshotCache } from '../../platform/path/pathBankSimulationService.js';
import {
  COVERAGE_STATE, COVERAGE_STATE_LABELS, summarizeCoverage,
} from '../../../functions/shared/pathCoverage.mjs';
import {
  CONTENT_STATE, CONTENT_STATE_LABELS,
} from '../../../functions/shared/pathStandardQuality.mjs';
import { getExecutionModeDiagnostics } from '../../config/executionMode.js';
import { COURSES } from '../../../functions/shared/classModel.mjs';
import { PATH_WEB_RELEASE } from '../../platform/path/pathRelease.js';
import { COMPAT, COMPAT_LABEL, buildToolSupportMatrix } from '../../platform/supports/toolSupportMatrix.js';
import { PATH_TOOL_IDS } from '../../../functions/shared/pathToolContracts.mjs';
import { SUPPORT } from '../../../functions/shared/supportEntitlements.mjs';
import { ROOT_ADMIN_EMAIL } from '../../../functions/shared/rolePolicy.mjs';

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

// Coverage and quality are different questions with different answers, so they
// get different colours. A standard can be green on the left (a session will
// run) and amber on the right (what it will run is placeholders).
const CONTENT_STATE_STYLE = {
  [CONTENT_STATE.PRODUCTION_READY]: { background: '#e6f4ea', color: '#137333' },
  [CONTENT_STATE.CANDIDATE]: { background: '#e8f0fe', color: '#174ea6' },
  [CONTENT_STATE.MINIMUM_OPERATIONAL]: { background: '#fef7e0', color: '#7a4f00' },
  [CONTENT_STATE.AUTHORED_UNUSABLE]: { background: '#fce8e6', color: '#a50e0e' },
  [CONTENT_STATE.NONE]: { background: '#f1f3f4', color: '#3c4043' },
};

const contentPill = (state) => ({
  display: 'inline-block', padding: '3px 9px', borderRadius: 999, fontSize: 11,
  fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em',
  ...(CONTENT_STATE_STYLE[state] || CONTENT_STATE_STYLE[CONTENT_STATE.NONE]),
});

const listOrDash = (values) => (values && values.length ? values.join(', ') : '—');

const REJECTION_REASON_HELP = Object.freeze({
  missing_id: 'The document has no stable question ID.',
  no_alignment_keys: 'The document is not aligned to a Path standard.',
  no_gradable_definition: 'The question has no server-gradeable expected answer.',
  no_server_grader_for_this_tool: 'The question names an interaction that the secure server does not know how to grade.',
  tool_has_no_gradable_answer: 'The interaction is supported, but this document is missing the answer data its grader requires.',
  generator_failed: 'The generator could not produce a valid question from this template.',
  constraints_unsatisfiable: 'The generator constraints cannot produce a valid draw.',
  validator_exception: 'The production validator threw while checking this document. Use the diagnostic ID to trace the server error.',
});

const humanizeReason = (reason) => {
  const key = String(reason || 'unknown');
  const base = key.replace(/^generated_/, '');
  const detail = REJECTION_REASON_HELP[key] || REJECTION_REASON_HELP[base];
  return detail || key.replace(/_/g, ' ');
};

const sortedGroups = (value = {}) => Object.entries(value || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const diagnosticSuffix = (caught) => {
  const details = caught?.details || caught?.customData?.details || {};
  const id = details?.diagnosticId || caught?.diagnosticId;
  return id ? ` Diagnostic ID: ${id}.` : '';
};

const friendlyPathError = (caught, fallback) => {
  const code = String(caught?.code || '').replace(/^functions\//, '');
  const detail = String(caught?.message || '').replace(/^Firebase:\s*/i, '').trim();
  const suffix = diagnosticSuffix(caught);
  if (code === 'internal') {
    return `${fallback} The secure Firebase Path service hit an unexpected server error.${suffix} Use the skill diagnostic below or check the matching diagnostic ID in Cloud Functions logs.`;
  }
  if (code === 'not-found') {
    return `${fallback} The required Path Cloud Function is not deployed from the current GitHub main release.`;
  }
  if (code === 'unauthenticated') {
    return `${fallback} Your session expired. Sign out and back in, then try again.`;
  }
  if (code === 'permission-denied') {
    if (detail && detail.includes('@')) return `${fallback} ${detail}`;
    return `${fallback} This action is restricted to the MathMaster root administrator (${ROOT_ADMIN_EMAIL}).`;
  }
  return `${detail || fallback}${suffix}`;
};
export default function PathCoverageAudit({ courseIds = PATH_COVERAGE_COURSE_IDS }) {
  const [indexes, setIndexes] = useState({});
  const [courseId, setCourseId] = useState(courseIds[0]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [seed, setSeed] = useState(null);
  const [seedPhase, setSeedPhase] = useState(null);
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [runtimeError, setRuntimeError] = useState(null);
  const [diagnosticTarget, setDiagnosticTarget] = useState('');
  const [diagnosticFramework, setDiagnosticFramework] = useState('');
  const [diagnostic, setDiagnostic] = useState(null);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);


  const loadRuntimeStatus = useCallback(async () => {
    setRuntimeError(null);
    try {
      setRuntimeStatus(await fetchPathRuntimeStatus());
    } catch (caught) {
      setRuntimeStatus(null);
      setRuntimeError(friendlyPathError(caught, 'Could not verify the deployed My Math Path backend.'));
    }
  }, []);

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

  useEffect(() => { load(); loadRuntimeStatus(); }, [load, loadRuntimeStatus]);

  const rebuild = async () => {
    if (runtimeStatus?.bankCount === 0) {
      setError('The secure Path bank is empty. Recompute does not create questions; initialize the built-in starter bank first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await rebuildPathCoverage(courseIds);
      setIndexes(result.indexes || {});
      await loadRuntimeStatus();
    } catch (caught) {
      setError(friendlyPathError(caught, 'Could not rebuild coverage.'));
    } finally {
      setBusy(false);
    }
  };

  const initializeStarter = async () => {
    setBusy(true);
    setError(null);
    setSeed(null);
    setSeedPhase('Loading the built-in secure bank on the server…');
    try {
      const result = await initializeBundledPathBankStarter({
        onProgress: ({ phase, chunk, chunks }) => {
          if (phase === 'initializing') setSeedPhase('Loading and validating all built-in Path templates on the server…');
          else if (phase === 'coverage' || phase === 'coverage-complete') setSeedPhase('Rebuilding canonical course coverage from the installed bank…');
          else setSeedPhase(`${phase === 'validating' ? 'Validating' : 'Importing'} ${chunk} of ${chunks}…`);
        },
      });
      setSeed(result.seed);
      if (!result.initialized) {
        const rejected = result.seed?.rejected?.length || 0;
        const topReason = sortedGroups(result.seed?.rejectionSummary?.byReason)[0];
        setError(
          rejected
            ? `The starter bank was NOT changed. ${rejected} document${rejected === 1 ? '' : 's'} failed production validation${topReason ? `; the largest group is “${humanizeReason(topReason[0])}” (${topReason[1]})` : ''}. The report below identifies the exact types, tools, documents, and diagnostic IDs.`
            : 'The starter bank was not changed. The server rejected the initialization before writing; review the report below.',
        );
        return;
      }
      clearTeacherPathBankSnapshotCache();
      if (result.coverage?.indexes) setIndexes(result.coverage.indexes);
      else await load();
      await loadRuntimeStatus();
      setSeedPhase(null);
    } catch (caught) {
      setError(friendlyPathError(caught, 'Could not initialize the starter Path bank.'));
      setSeedPhase(null);
    } finally {
      setBusy(false);
    }
  };

  const runDiagnostic = async (requestedTarget = diagnosticTarget, requestedFramework = diagnosticFramework) => {
    const target = String(requestedTarget || '').trim();
    if (!target) {
      setError('Enter or choose a standard to diagnose.');
      return;
    }
    setDiagnosticBusy(true);
    setError(null);
    setDiagnostic(null);
    try {
      const result = await diagnosePathSkill({
        targetAlignmentKey: target,
        assessmentFramework: requestedFramework || null,
      });
      setDiagnostic(result);
      setDiagnosticTarget(result.displayCode || target);
    } catch (caught) {
      setError(friendlyPathError(caught, `Could not diagnose ${target}.`));
    } finally {
      setDiagnosticBusy(false);
    }
  };

  const executionMode = getExecutionModeDiagnostics();
  // Which authorized supports each issuable tool can actually deliver. Derived
  // from the contracts and the review builder rather than from the per-tool
  // capability booleans, because those were declarations nobody enforced — and
  // they had drifted.
  const supportMatrix = useMemo(() => buildToolSupportMatrix(PATH_TOOL_IDS), []);
  const index = indexes[courseId] || null;
  // "Gaps" now means "not finished", not merely "cannot run". A standard whose
  // five items are all placeholders is exactly the row a content lead needs to
  // see, and the old filter hid it because a session would technically start.
  const rows = useMemo(() => {
    if (!index) return [];
    const all = summarizeCoverage(index);
    return onlyGaps
      ? all.filter((row) => !row.studentReady || row.contentState !== CONTENT_STATE.PRODUCTION_READY)
      : all;
  }, [index, onlyGaps]);
  const summary = index?.summary || null;

  return (
    <div>
      {error && <div role="alert" style={{ ...card, background: '#fce8e6', borderColor: '#f0b4b2', color: '#a50e0e' }}>{error}</div>}

      <section style={{ ...card, background: runtimeError || (runtimeStatus?.release && runtimeStatus.release !== PATH_WEB_RELEASE) ? '#fef7e0' : '#f8fbff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0 }}>Path deployment status</h3>
            <p style={{ margin: '6px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.5 }}>
              Web release: <strong>{PATH_WEB_RELEASE}</strong> · Server release: <strong>{runtimeStatus?.release || 'not verified'}</strong>
            </p>
            {runtimeStatus && (
              <p style={{ margin: '4px 0 0', color: '#5f6368', fontSize: 13 }}>
                Secure bank: <strong>{runtimeStatus.bankCount ?? 0}</strong> questions · Built-in starter: <strong>{runtimeStatus.starterAvailable ? `${runtimeStatus.starterCount} available` : 'unavailable'}</strong>
              </p>
            )}
          </div>
          <button type="button" style={quiet} onClick={loadRuntimeStatus} disabled={busy}>Check deployment</button>
        </div>
        {/* Which runtime THIS build will use. A deployment that lost its
            execution-mode variable used to serve students a sandbox question
            silently; now it refuses, and this is where an administrator sees
            why before a class does. */}
        <p style={{ margin: '10px 0 0', color: executionMode.mode === 'misconfigured' ? '#a50e0e' : '#5f6368', fontSize: 13, lineHeight: 1.5, fontWeight: executionMode.mode === 'misconfigured' ? 800 : 400 }}>
          This web build runs My Math Path in <strong>{executionMode.mode}</strong> mode ({String(executionMode.reason).replace(/_/g, ' ')}).
          {executionMode.message ? ` ${executionMode.message}` : ''}
        </p>
        {runtimeError && <p role="alert" style={{ margin: '12px 0 0', color: '#a50e0e', fontWeight: 800, lineHeight: 1.5 }}>{runtimeError}</p>}
        {runtimeStatus?.release && runtimeStatus.release !== PATH_WEB_RELEASE && (
          <p role="alert" style={{ margin: '12px 0 0', color: '#a50e0e', fontWeight: 800, lineHeight: 1.5 }}>
            Firebase Hosting and Cloud Functions are on different Path releases. Do not troubleshoot question content yet. Deploy both from the same GitHub main commit.
          </p>
        )}
      </section>

      <section style={card}>
        <h3 style={{ margin: 0 }}>Accommodation delivery by tool</h3>
        <p style={{ margin: '6px 0 12px', color: '#5f6368', fontSize: 13, lineHeight: 1.55, maxWidth: 760 }}>
          Which authorized supports each Path interaction can actually deliver. This is worked out from the tool
          contracts and the solution-review builder, not from a per-tool setting — a support a tool cannot honour
          should be findable here, before a student meets the question.
        </p>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          {[
            ['Issuable tools', supportMatrix.summary.tools, '#174ea6'],
            ['Keyboard operable', `${supportMatrix.summary.keyboardOperable} of ${supportMatrix.summary.tools}`,
              supportMatrix.blockers.length ? '#a50e0e' : '#137333'],
            ['Support gaps', supportMatrix.gaps.length, supportMatrix.gaps.length ? '#7a4f00' : '#137333'],
          ].map(([label, value, tone]) => (
            <div key={label} style={{ flex: '1 1 150px', padding: '11px 13px', border: '1px solid #dadce0', borderRadius: 9, background: '#fff' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#5f6368', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ marginTop: 3, fontSize: 20, fontWeight: 900, color: tone }}>{value}</div>
            </div>
          ))}
        </div>

        {supportMatrix.blockers.length > 0 && (
          <p role="alert" style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 8, background: '#fce8e6', color: '#a50e0e', fontSize: 13, lineHeight: 1.5 }}>
            <strong>These interactions need a mouse.</strong>{' '}
            {supportMatrix.blockers.map((row) => row.toolId).join(', ')} — a student who cannot use a trackpad
            accurately cannot answer these questions at all.
          </p>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 640 }}>
            <thead>
              <tr>
                {['Interaction', 'Keyboard', 'Read aloud', 'Contrast / large text', 'Calculator', 'Solution review'].map((heading) => (
                  <th key={heading} style={{ textAlign: 'left', padding: '7px 8px', borderBottom: '2px solid #dadce0', color: '#5f6368', fontSize: 11, textTransform: 'uppercase' }}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {supportMatrix.rows.map((row) => {
                const cell = (state) => {
                  const tone = state === COMPAT.NEEDS_WORK ? '#a50e0e'
                    : state === COMPAT.UNSAFE ? '#7a4f00'
                      : state === COMPAT.NOT_APPLICABLE ? '#5f6368' : '#137333';
                  return <td style={{ padding: '7px 8px', borderBottom: '1px solid #f1f3f4', color: tone, fontWeight: state === COMPAT.NEEDS_WORK ? 800 : 600 }}>{COMPAT_LABEL[state]}</td>;
                };
                return (
                  <tr key={row.toolId}>
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid #f1f3f4', fontWeight: 800 }}>{row.toolId}</td>
                    {cell(row.keyboard)}
                    {cell(row.supports[SUPPORT.TEXT_TO_SPEECH])}
                    {cell(row.supports[SUPPORT.HIGH_CONTRAST])}
                    {cell(row.supports[SUPPORT.CALCULATOR])}
                    <td style={{ padding: '7px 8px', borderBottom: '1px solid #f1f3f4', color: row.hasSolutionReview ? '#137333' : '#7a4f00', fontWeight: 600 }}>
                      {row.hasSolutionReview ? 'Tool-generated' : 'From authored content'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#5f6368', lineHeight: 1.55 }}>
          <strong>Unsafe here</strong> is not a defect. A calculator on the balance workspace would perform the
          operation the question exists to assess — that is a construct decision, not a missing feature.
        </p>
      </section>

      <section style={{ ...card, background: '#f8fbff' }}>
        <h3 style={{ margin: 0 }}>What coverage means now</h3>
        <p style={{ margin: '7px 0 0', color: '#3c4043', fontSize: 13, lineHeight: 1.6, maxWidth: 820 }}>
          <strong>Teacher assignments do not create, remove, or map My Math Path coverage.</strong> The source of truth is:
          the canonical Texas standards registry → the secure <code>pathQuestionBank</code> → the same server issuer/grader that prepares a student question.
          This page only reports that server-owned result.
        </p>
        <p style={{ margin: '8px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.55, maxWidth: 820 }}>
          “Recompute” rebuilds the report from those three sources. It does not inspect class assignments, and it does not publish assignment questions into the Path bank.
          Grade 6, 7, 8, Algebra I, and Algebra II are mapped from the canonical standards registry on the server, not from a browser wheel.
        </p>
      </section>

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

        <p style={{ margin: '12px 0 0', color: '#5f6368', fontSize: 12, lineHeight: 1.5 }}>
          <strong>Recompute from bank does not create questions.</strong> It only rebuilds the coverage index from content already stored in the secure Path bank. If the bank count above is 0, initialize the starter bank first.
        </p>

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
          The built-in bank is the server-owned starting content for course Path and CCMR practice. Refreshing it validates
          every bundled template with the production issuer, replaces each built-in Firestore document authoritatively, removes
          superseded built-in documents, and then rebuilds Grade 6, Grade 7, Grade 8, Algebra I, and Algebra II coverage from
          the canonical Texas registry. Teacher assignments are not consulted. The answer key never enters the browser.
        </p>
        <button type="button" style={{ ...primary, marginBottom: 16 }} onClick={initializeStarter} disabled={busy}>
          {busy ? 'Working…' : 'Initialize / refresh built-in starter bank'}
        </button>
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#3c4043' }}>Import a different seed package instead</summary>
          <p style={{ margin: '8px 0 12px', color: '#5f6368', fontSize: 13, lineHeight: 1.55, maxWidth: 720 }}>
            Select one or more JSON files. A package split across course files must be selected together. An array, or an object
            with <code>documents</code>, <code>items</code> or <code>questions</code>, is accepted.
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
              const imported = await seedPathQuestionBank(items, {
                onProgress: ({ phase, chunk, chunks }) => setSeedPhase(`${phase === 'validating' ? 'Validating' : 'Importing'} ${chunk} of ${chunks}…`),
              });
              setSeed(imported);
              if (imported.imported) {
                clearTeacherPathBankSnapshotCache();
                setSeedPhase('Recomputing Path coverage…');
                const coverage = await rebuildPathCoverage(courseIds);
                setIndexes(coverage.indexes || {});
              }
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
        </details>
        {seedPhase && <p style={{ marginTop: 12, color: '#174ea6', fontWeight: 700 }}>{seedPhase}</p>}
        {seed && (
          <div style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7 }}>
            <div>Documents supplied: <strong>{seed.documentCount ?? seed.received ?? 0}</strong></div>
            <div>Validated / stored: <strong style={{ color: seed.imported ? '#137333' : '#a50e0e' }}>{seed.imported ? seed.accepted : `${seed.wouldAccept ?? 0} would pass`}</strong></div>
            <div>Standards represented: <strong>{seed.standards?.length || 0}</strong></div>
            {seed.removedSuperseded !== undefined && <div>Superseded built-in documents removed: <strong>{seed.removedSuperseded}</strong></div>}
            {!seed.imported && (
              <p style={{ margin: '10px 0 0', fontWeight: 900, color: '#a50e0e' }}>
                Nothing was written. Validation failed before the write phase, so the existing secure bank was left intact.
              </p>
            )}

            {(seed.rejectionSummary?.total || 0) > 0 && (
              <div style={{ marginTop: 12, padding: 12, border: '1px solid #f0b4b2', borderRadius: 9, background: '#fff8f7' }}>
                <strong style={{ color: '#a50e0e' }}>Why the package was rejected</strong>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginTop: 10 }}>
                  {[
                    ['By reason', seed.rejectionSummary.byReason, true],
                    ['By question type', seed.rejectionSummary.byQuestionType, false],
                    ['By interaction / tool', seed.rejectionSummary.byTool, false],
                    ['By course', seed.rejectionSummary.byCourse, false],
                  ].map(([label, groups, explain]) => (
                    <div key={label}>
                      <div style={{ fontWeight: 900, fontSize: 12, color: '#3c4043' }}>{label}</div>
                      {sortedGroups(groups).slice(0, 12).map(([key, count]) => (
                        <div key={key} style={{ marginTop: 4, fontSize: 12, color: '#5f6368' }}>
                          <strong>{count}</strong> · {explain ? humanizeReason(key) : key}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(seed.rejected?.length || 0) > 0 && (
              <details style={{ marginTop: 10 }} open>
                <summary style={{ cursor: 'pointer', fontWeight: 800, color: '#a50e0e' }}>{seed.rejected.length} rejected document{seed.rejected.length === 1 ? '' : 's'}</summary>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ marginTop: 8, borderCollapse: 'collapse', fontSize: 12, minWidth: 920, width: '100%' }}>
                    <thead><tr style={{ textAlign: 'left', background: '#f1f3f4' }}>
                      <th style={{ padding: 6 }}>Question ID</th><th style={{ padding: 6 }}>Family</th>
                      <th style={{ padding: 6 }}>Standard</th><th style={{ padding: 6 }}>Type</th>
                      <th style={{ padding: 6 }}>Tool</th><th style={{ padding: 6 }}>Reason</th><th style={{ padding: 6 }}>Diagnostic</th>
                    </tr></thead>
                    <tbody>
                      {seed.rejected.slice(0, 100).map((entry, position) => (
                        <tr key={`${entry.id}-${position}`} style={{ borderBottom: '1px solid #e8eaed' }}>
                          <td style={{ padding: 6 }}>{entry.id || '(no id)'}</td>
                          <td style={{ padding: 6 }}>{entry.familyId || '—'}</td>
                          <td style={{ padding: 6 }}>{(entry.standards || []).join(', ') || '—'}</td>
                          <td style={{ padding: 6 }}>{entry.questionType || '—'}</td>
                          <td style={{ padding: 6 }}>{entry.pathToolId || 'field-graded'}</td>
                          <td style={{ padding: 6, color: '#a50e0e' }} title={entry.detail || ''}>{humanizeReason(entry.reason)}</td>
                          <td style={{ padding: 6, fontFamily: 'monospace', fontSize: 11 }}>{entry.diagnosticId || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
            {seed.imported && <p style={{ margin: '10px 0 0', color: '#137333', fontWeight: 800 }}>Import complete. Built-in documents were replaced cleanly, superseded built-ins were retired, and canonical course coverage was rebuilt on the server.</p>}
          </div>
        )}
      </section>

      <section style={card}>
        <h3 style={{ margin: 0 }}>Why won’t this skill start?</h3>
        <p style={{ margin: '6px 0 12px', color: '#5f6368', fontSize: 13, lineHeight: 1.55, maxWidth: 820 }}>
          Diagnose one standard against the live secure bank. This shows how many documents match, how many the production
          issuer can grade, which question types/tools are being rejected, and whether the stored coverage report is stale.
          It never returns prompts, answers, generator parameters, or private grading data.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 800 }}>
            Standard
            <input value={diagnosticTarget} onChange={(event) => setDiagnosticTarget(event.target.value)} placeholder="A.5A or 8.5I" style={{ minHeight: 38, minWidth: 180, border: '1px solid #bdc1c6', borderRadius: 8, padding: '0 10px' }} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 12, fontWeight: 800 }}>
            Practice format
            <select value={diagnosticFramework} onChange={(event) => setDiagnosticFramework(event.target.value)} style={{ minHeight: 38, border: '1px solid #bdc1c6', borderRadius: 8, padding: '0 9px', background: '#fff' }}>
              <option value="">Course practice</option>
              <option value="digitalSAT">Digital SAT</option>
              <option value="act">ACT</option>
              <option value="tsia2">TSIA2</option>
              <option value="asvab">ASVAB</option>
            </select>
          </label>
          <button type="button" style={primary} onClick={() => runDiagnostic()} disabled={diagnosticBusy}>{diagnosticBusy ? 'Diagnosing…' : 'Diagnose skill'}</button>
        </div>

        {diagnostic && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 10, border: `1px solid ${diagnostic.launchable ? '#81c995' : '#f0b4b2'}`, background: diagnostic.launchable ? '#f4fbf5' : '#fff8f7' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <strong>{diagnostic.displayCode} · {diagnostic.assessmentFramework || 'Course practice'}</strong>
              <strong style={{ color: diagnostic.launchable ? '#137333' : '#a50e0e' }}>{diagnostic.launchable ? 'LIVE BANK CAN LAUNCH' : 'LIVE BANK CANNOT LAUNCH'}</strong>
            </div>
            <p style={{ margin: '8px 0 0', fontSize: 13, color: '#3c4043' }}>
              Bank matches <strong>{diagnostic.totalBankMatches}</strong> · active <strong>{diagnostic.activeMatches}</strong> · format matches <strong>{diagnostic.frameworkMatches}</strong> · issuable documents <strong>{diagnostic.issuableDocuments}</strong> · issuable families <strong>{diagnostic.issuableFamilies}</strong>.
            </p>
            {diagnostic.storedCoverage && diagnostic.liveCoverage && diagnostic.storedCoverage.studentReady !== diagnostic.liveCoverage.studentReady && (
              <p style={{ margin: '8px 0 0', color: '#a50e0e', fontWeight: 900 }}>Stored coverage is stale: the live bank and the saved coverage document disagree. Press Recompute from bank.</p>
            )}
            {(diagnostic.rejectionSummary?.total || 0) > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong style={{ fontSize: 12 }}>Rejected documents:</strong>
                {sortedGroups(diagnostic.rejectionSummary.byReason).map(([reason, count]) => (
                  <div key={reason} style={{ marginTop: 4, color: '#a50e0e', fontSize: 12 }}><strong>{count}</strong> · {humanizeReason(reason)}</div>
                ))}
              </div>
            )}
            {(diagnostic.rejected?.length || 0) > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 800 }}>Show rejected IDs / types / tools</summary>
                {diagnostic.rejected.slice(0, 40).map((entry) => (
                  <div key={entry.id} style={{ marginTop: 5, fontSize: 12, color: '#5f6368' }}>
                    <code>{entry.id}</code> · {entry.questionType || 'response'} · {entry.pathToolId || 'field-graded'} · <span style={{ color: '#a50e0e' }}>{humanizeReason(entry.reason)}</span>{entry.diagnosticId ? ` · diagnostic ${entry.diagnosticId}` : ''}
                  </div>
                ))}
              </details>
            )}
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
              // The higher bar, reported beside the launch bar rather than
              // instead of it: "a session can run" and "a session is worth
              // running" are different facts and both matter.
              ['Production quality', summary.productionReady ?? 0],
            ].map(([label, value]) => (
              <div key={label}>
                <div style={{ fontSize: 26, fontWeight: 900, color: '#202124' }}>{value}</div>
                <div style={{ fontSize: 12, color: '#5f6368', fontWeight: 700 }}>{label}</div>
              </div>
            ))}
          </div>
          <p style={{ margin: '14px 0 0', fontWeight: 900, color: summary.fullyCovered ? '#137333' : '#a50e0e', lineHeight: 1.5 }}>
            {summary.fullyCovered
              ? 'Every canonical course standard has launchable practice content.'
              : `${summary.wheelSkills - summary.studentReady} standard${summary.wheelSkills - summary.studentReady === 1 ? '' : 's'} cannot be practised yet, and ${summary.wheelSkills - summary.studentReady === 1 ? 'is' : 'are'} hidden from students until content exists.`}
          </p>
          {summary.quality && (
            <p style={{ margin: '10px 0 0', color: '#5f6368', fontSize: 13, lineHeight: 1.6 }}>
              Content quality across this course: <strong>{summary.quality.productionReady}</strong> production ·{' '}
              <strong>{summary.quality.candidate}</strong> candidate ·{' '}
              <strong>{summary.quality.minimumOperational}</strong> operational placeholders ·{' '}
              <strong>{summary.quality.authoredUnusable}</strong> unusable ·{' '}
              <strong>{summary.quality.none}</strong> empty.
              {' '}A standard is not finished because five text boxes exist for it.
            </p>
          )}
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
              Show only unfinished standards
            </label>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f1f3f4', textAlign: 'left' }}>
                  <th style={{ padding: 9 }}>Standard</th>
                  <th style={{ padding: 9 }}>Issuable</th>
                  <th style={{ padding: 9 }}>Production</th>
                  <th style={{ padding: 9 }}>Representations</th>
                  <th style={{ padding: 9 }}>Thinking</th>
                  <th style={{ padding: 9 }}>Bands / DOK</th>
                  <th style={{ padding: 9 }}>Reviews · Tools</th>
                  <th style={{ padding: 9 }}>Can run</th>
                  <th style={{ padding: 9 }}>Content quality</th><th style={{ padding: 9 }}>Diagnose</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const quality = row.quality || null;
                  return (
                    <React.Fragment key={row.displayCode}>
                      <tr style={{ borderBottom: quality?.warnings?.length || quality?.blockers?.length ? 0 : '1px solid #e8eaed' }}>
                        <td style={{ padding: 9, fontWeight: 900 }}>{row.displayCode}</td>
                        <td style={{ padding: 9, fontWeight: 900, color: row.issuableCount ? '#137333' : '#a50e0e' }}>{row.issuableCount}</td>
                        <td style={{ padding: 9, fontWeight: 900, color: (quality?.productionCount || 0) >= 5 ? '#137333' : '#7a4f00' }}>{quality?.productionCount ?? 0}</td>
                        <td style={{ padding: 9, color: '#5f6368', fontSize: 12 }}>{listOrDash(quality?.representations)}</td>
                        <td style={{ padding: 9, color: '#5f6368', fontSize: 12 }}>{listOrDash(quality?.taskTypes)}</td>
                        <td style={{ padding: 9, color: '#5f6368', fontSize: 12 }}>
                          {Object.keys(row.byBand).length
                            ? Object.entries(row.byBand).sort().map(([band, count]) => `B${band}×${count}`).join(' · ')
                            : '—'}
                          {quality?.dokLevels?.length ? ` / DOK ${quality.dokLevels.join(',')}` : ''}
                        </td>
                        <td style={{ padding: 9, color: '#5f6368', fontSize: 12 }}>
                          {quality ? `${quality.solutionReviewCount}/${quality.issuableCount}` : '—'}
                          {quality ? ` · ${quality.toolBackedCount} tool` : ''}
                        </td>
                        <td style={{ padding: 9 }}><span style={pill(row.state)}>{COVERAGE_STATE_LABELS[row.state]}</span></td>
                        <td style={{ padding: 9 }}><span style={contentPill(row.contentState)}>{CONTENT_STATE_LABELS[row.contentState] || '—'}</span></td>
                        <td style={{ padding: 9 }}><button type="button" style={{ ...quiet, minHeight: 32, padding: '0 9px', fontSize: 11 }} onClick={() => { setDiagnosticTarget(row.displayCode); setDiagnosticFramework(''); runDiagnostic(row.displayCode, ''); }} disabled={diagnosticBusy}>Check</button></td>
                      </tr>
                      {(quality?.blockers?.length || quality?.warnings?.length) ? (
                        <tr style={{ borderBottom: '1px solid #e8eaed' }}>
                          <td colSpan={10} style={{ padding: '0 9px 10px 9px' }}>
                            {quality.blockers.map((line, position) => (
                              <div key={`b-${position}`} style={{ color: '#a50e0e', fontSize: 12, lineHeight: 1.55 }}>■ {line}</div>
                            ))}
                            {quality.warnings.slice(0, 6).map((line, position) => (
                              <div key={`w-${position}`} style={{ color: '#7a4f00', fontSize: 12, lineHeight: 1.55 }}>▲ {line}</div>
                            ))}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: 14, color: '#137333', fontWeight: 700 }}>No gaps — every canonical course standard has launchable practice content.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
