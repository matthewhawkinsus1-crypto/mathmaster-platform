import { useEffect, useMemo, useRef, useState } from 'react';
import {
  REPEAT_RULE,
  VIOLATION_TYPES,
  disciplineDateKey,
  disciplineLongDay,
  disciplineShortDay,
  disciplineTime,
  outlookComposeUrl,
  principalReport,
  repeatOffenders,
  schoolDaysEndingOn,
  violationLabel,
  violationType,
} from '../../../functions/shared/disciplineTracker.mjs';
import {
  dayIncidentsByStudent,
  daySummary,
  draftsWithFamilyMessages,
  familyMessageWords,
  FORM_REFRESH_MS,
  formStateWords,
  needsFormRefresh,
  newTapId,
  otherDaysNeedingTeacher,
  parentDrafts,
  recentViolationCount,
  undoNotice,
} from '../../platform/teacher/disciplineTrackerModel.js';
import {
  getDisciplineSettings,
  listDisciplineIncidents,
  queueFamilyMessages,
  recordDisciplineIncident,
  recordPrincipalReportSent,
  resolveDisciplineFormState,
  resolveFamilyMessage,
  saveDisciplineSettings,
  setDisciplineIncidentDetail,
  setFamilyMessagingMode,
  submitDisciplineFormsNow,
  voidDisciplineIncident,
} from '../../platform/teacher/disciplineStore.js';
// Through the projection, which a teacher's first page already loads: imported
// directly, gradeTransferScope.js would become a first-load file of its own.
import { authorizedGradeTransferClasses, gradeTransferRoster } from '../../platform/gradeTransfer/gradeTransferProjection.js';
import { authoritativeSisStudentId } from '../../platform/gradeTransfer/gradeTransferModel.js';
import { compareStudentsByName, formatStudentName, studentSearchText } from '../../platform/studentName.js';
import './teacherWorkspace.css';
import './disciplineTracker.css';

/*
 * DISCIPLINE TRACKER.
 *
 * A class roster like attendance: find the student, tap what happened. Each
 * tap is saved at once with the server's time. Nothing else to press:
 *
 *   - after the class period ends, the backend fills in the district's Campus
 *     Violation Tracker form, one response per student, with every category
 *     they had in that class that day (functions/lib/disciplineFormBatch.js);
 *   - "Messages to families" drafts one message per student for the day.
 *     Send to families queues them; the MathMaster extension in the
 *     teacher's Chrome sends each one from their signed-in SchoolStatus
 *     (window.mathmasterFamilyMessages, installed while this screen is open)
 *     and a sent message is logged in Parent Contacts by the server. A
 *     message can still be copied and logged by hand;
 *   - "Principal report" lists repeat offenders with every date and time and
 *     how each family was contacted, ready to open in Outlook.
 *
 * Today opens by default; the date picker shows an earlier day. Taps are
 * recorded only for today. An undo marks a tap; nothing is ever deleted.
 */

const SEND_METHODS = [
  { id: 'text', label: 'Text (SchoolStatus)', notes: 'Sent through SchoolStatus' },
  { id: 'email', label: 'Email', notes: 'Sent by email' },
  { id: 'phone', label: 'Phone call', notes: 'Phone call' },
];

const QUEUE_WORDS = {
  testModeSkipped: 'not a test student',
  noDistrictId: 'no district ID',
  alreadySent: 'already sent',
  inFlight: 'being sent',
  needsTeacher: 'waiting for you to check SchoolStatus',
  notOnRoster: 'not on the roster',
};

const copyText = async (value) => {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
};

export default function DisciplineTracker({
  classes = [],
  students = [],
  contacts = [],
  teacherEmail = '',
  teacherName = '',
  isRootAdmin = false,
  initialClassId = null,
  onRecordContact = null,
}) {
  const today = disciplineDateKey(Date.now());
  const myClasses = useMemo(() => authorizedGradeTransferClasses({ classes, teacherEmail, isRootAdmin }), [classes, teacherEmail, isRootAdmin]);
  const [classId, setClassId] = useState(() => (myClasses.some((entry) => entry.classId === initialClassId) ? initialClassId : myClasses[0]?.classId) || '');
  const [dateKey, setDateKey] = useState(today);
  const [incidents, setIncidents] = useState([]);
  const [formStatus, setFormStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState({ principalEmail: '', principalName: '', teacherName: '' });
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [familyMessages, setFamilyMessages] = useState([]);
  const [messaging, setMessaging] = useState({ mode: 'off', testDistrictIds: [] });
  const [switchDraft, setSwitchDraft] = useState(null);

  const isToday = dateKey === today;
  const windowStart = schoolDaysEndingOn(dateKey, REPEAT_RULE.totalSchoolDays)[0] || dateKey;

  const load = async () => {
    try {
      const result = await listDisciplineIncidents({ fromDateKey: windowStart, toDateKey: dateKey });
      const listed = result.incidents || [];
      const listedIds = new Set(listed.map((entry) => entry.id));
      // A tap still saving is kept: a refresh must not drop it mid-save.
      setIncidents((current) => [...listed, ...current.filter((entry) => entry.saving && !listedIds.has(entry.id))]);
      setFormStatus(result.formStatus || null);
      setFamilyMessages(result.familyMessages || []);
      setMessaging(result.familyMessaging || { mode: 'off', testDistrictIds: [] });
      setLoaded(true);
    } catch (error) {
      setMessage({ tone: 'danger', text: `Violations could not load: ${error.message}` });
    }
  };
  useEffect(() => { load(); }, [dateKey]);
  // The backend sends each class's taps to the district form after the
  // period ends. While any of today's waits or is being sent, look again
  // every minute (only while this tab is showing), so "Sent", a failure's
  // recovery buttons, and a changed-form warning appear without leaving.
  const awaitingForm = isToday && needsFormRefresh(incidents, today);
  useEffect(() => {
    if (!awaitingForm) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, FORM_REFRESH_MS);
    return () => clearInterval(timer);
  }, [awaitingForm, dateKey]);
  // The SchoolStatus extension works through this screen while it is open:
  // window.mathmasterFamilyMessages. Each of its calls refreshes the list, so
  // the teacher watches every message go from queued to sent.
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let undo = () => {};
    let closed = false;
    import('../../platform/teacher/familyMessageBridge.js').then(({ createFamilyMessageBridge, installFamilyMessageBridge }) => {
      if (!closed) undo = installFamilyMessageBridge(createFamilyMessageBridge({ onChange: () => loadRef.current() }));
    }).catch(() => {});
    return () => { closed = true; undo(); };
  }, []);
  useEffect(() => {
    getDisciplineSettings().then((value) => setSettings({ principalEmail: '', principalName: '', teacherName: '', ...value })).catch(() => {});
  }, []);

  const activeClass = myClasses.find((entry) => entry.classId === classId) || null;
  const classLabel = activeClass ? (activeClass.name || activeClass.period || activeClass.classId) : '';
  const roster = useMemo(
    () => (classId ? gradeTransferRoster({ students, classes: myClasses, classId }) : []).slice().sort(compareStudentsByName),
    [students, myClasses, classId],
  );
  const studentsById = useMemo(() => new Map((students || []).map((student) => [student.id, student])), [students]);
  const needle = search.trim().toLowerCase();
  const visibleRoster = needle ? roster.filter((student) => studentSearchText(student).includes(needle)) : roster;
  const byStudent = useMemo(() => dayIncidentsByStudent(incidents, { classId, dateKey }), [incidents, classId, dateKey]);
  const classDay = useMemo(() => [...byStudent.values()].flat(), [byStudent]);
  const summary = daySummary(classDay);
  const signature = settings.teacherName || teacherName;

  const replace = (id, next) => setIncidents((current) => current.map((entry) => (entry.id === id ? next : entry)));

  const tap = async (student, type) => {
    const tapId = newTapId();
    const placeholder = {
      id: `tap-${tapId}`, saving: true, classId, studentId: student.id, type, detail: '',
      occurredAtMs: Date.now(), dateKey: today, form: { state: 'pending' },
    };
    setIncidents((current) => [...current, placeholder]);
    try {
      const saved = await recordDisciplineIncident({ classId, studentId: student.id, type, tapId });
      replace(placeholder.id, saved);
    } catch (error) {
      setIncidents((current) => current.filter((entry) => entry.id !== placeholder.id));
      setMessage({ tone: 'danger', text: `${violationType(type)?.label} for ${formatStudentName(student, { lastFirst: false })} was not saved: ${error.message}` });
    }
  };

  const undo = async (incident) => {
    try {
      const result = await voidDisciplineIncident({ incidentId: incident.id });
      replace(incident.id, result);
      setMessage(undoNotice({ label: violationLabel(incident), alreadySubmitted: result.alreadySubmitted, maybeSubmitted: result.maybeSubmitted }));
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  const setDetail = async (incident, detail) => {
    try {
      replace(incident.id, await setDisciplineIncidentDetail({ incidentId: incident.id, detail }));
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  const sendNow = async () => {
    setBusy(true);
    try {
      const result = await submitDisciplineFormsNow({ classId, dateKey });
      await load();
      const problems = result.formProblems || [];
      setMessage(problems.length
        ? { tone: 'danger', text: `Nothing was sent: ${problems.join(' ')}` }
        : { tone: result.unknown?.length || result.failed?.length ? 'warning' : 'success', text: `Sent ${result.submitted?.length || 0} student${result.submitted?.length === 1 ? '' : 's'} to the district form.${result.blocked?.length ? ` ${result.blocked.length} still need a district student ID.` : ''}${result.unknown?.length || result.failed?.length ? ' Some need you: see below.' : ''}` });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (incident, action) => {
    try {
      await resolveDisciplineFormState({ incidentIds: [incident.id], action });
      await load();
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  const drafts = useMemo(() => draftsWithFamilyMessages({
    drafts: parentDrafts({ incidents, classId, dateKey, studentsById, teacherName: signature, classLabel, contacts }),
    messages: familyMessages, messaging, classId, dateKey, teacherName: signature, classLabel,
  }), [incidents, classId, dateKey, studentsById, signature, classLabel, contacts, familyMessages, messaging]);
  const sendable = drafts.filter((draft) => draft.canQueue);
  const isClassTeacher = String(activeClass?.teacherOfRecord || '').trim().toLowerCase() === String(teacherEmail || '').trim().toLowerCase();

  // Send to families: queue the day's messages (all, or one student's). The
  // server builds each one from the stored violations and the switch decides
  // who may get one; the extension sends them from the teacher's SchoolStatus.
  const sendToFamilies = async (studentIds = null) => {
    setBusy(true);
    try {
      const result = await queueFamilyMessages({ classId, dateKey, studentIds });
      await load();
      const queued = (result.results || []).filter((entry) => ['queued', 'updated'].includes(entry.status)).length;
      const skipped = (result.results || []).filter((entry) => QUEUE_WORDS[entry.status]);
      const why = [...new Set(skipped.map((entry) => QUEUE_WORDS[entry.status]))].join(', ');
      setMessage({
        tone: queued ? 'success' : 'warning',
        text: `${queued ? `Queued ${queued} message${queued === 1 ? '' : 's'}${result.mode === 'test' ? ' (test mode)' : ''}. They go out when the MathMaster SchoolStatus extension runs in your Chrome, and each one sent is logged in Parent Contacts.` : 'Nothing was queued.'}${skipped.length ? ` ${skipped.length} not queued: ${why}.` : ''}`,
      });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const resolveMessage = async (familyMessage, action) => {
    try {
      await resolveFamilyMessage({ messageId: familyMessage.id, action });
      await load();
      if (action === 'markSent') setMessage({ tone: 'success', text: 'Recorded as sent and logged in Parent Contacts.' });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  const saveSwitch = async () => {
    if (switchDraft.mode === 'live' && !window.confirm('Live: every family message you queue goes to the real guardians in SchoolStatus. Have you checked the test messages?')) return;
    try {
      const saved = await setFamilyMessagingMode(switchDraft);
      setMessaging(saved);
      setSwitchDraft(null);
      setMessage({ tone: 'success', text: `SchoolStatus sending is ${saved.mode}.` });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  const logSent = async (draft, method) => {
    if (typeof onRecordContact !== 'function') return;
    const choice = SEND_METHODS.find((entry) => entry.id === method) || SEND_METHODS[0];
    try {
      await onRecordContact({
        studentId: draft.studentId,
        studentName: formatStudentName(draft.student, { lastFirst: false }),
        classId,
        classPeriod: activeClass?.period || '',
        occurredAt: new Date().toISOString(),
        method: choice.id,
        category: draft.contactCategory,
        notes: `${choice.notes}. ${draft.shownMessage.subject}`,
        outcome: 'Discipline message sent',
        followUpDate: '',
      });
      setMessage({ tone: 'success', text: `Logged in Parent Contacts: ${choice.label} to ${formatStudentName(draft.student, { lastFirst: false })}'s family.` });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  const report = useMemo(() => {
    const offenders = repeatOffenders({ incidents, asOfDateKey: dateKey });
    const contactsByStudentId = new Map();
    (contacts || []).forEach((contact) => {
      if (!contactsByStudentId.has(contact.studentId)) contactsByStudentId.set(contact.studentId, []);
      contactsByStudentId.get(contact.studentId).push(contact);
    });
    return {
      offenders,
      ...principalReport({
        offenders,
        studentsById,
        classLabelsById: new Map(myClasses.map((entry) => [entry.classId, entry.name || entry.period || entry.classId])),
        contactsByStudentId,
        asOfDateKey: dateKey,
        teacherName: signature,
        principalName: settings.principalName,
      }),
    };
  }, [incidents, dateKey, studentsById, myClasses, contacts, signature, settings.principalName]);

  // Other days (and classes) in the window where a send or a family message
  // waits on the teacher: where the Action Center's rows lead.
  const classLabelOf = (id) => {
    const entry = myClasses.find((item) => item.classId === id);
    return entry ? (entry.name || entry.period || entry.classId) : 'another class';
  };
  const otherDays = useMemo(() => otherDaysNeedingTeacher({ incidents, familyMessages, dateKey, classId })
    .filter((entry) => myClasses.some((item) => item.classId === entry.classId)), [incidents, familyMessages, dateKey, classId, myClasses]);

  // The teacher sends the report from Outlook, then says so here.
  const lastReport = (settings.principalReports || []).at(-1) || null;
  const markReportSent = async () => {
    try {
      const sent = await recordPrincipalReportSent({ studentIds: report.offenders.map((offender) => offender.studentId) });
      setSettings((current) => ({ ...current, principalReports: [...(current.principalReports || []), sent].slice(-20) }));
      setMessage({ tone: 'success', text: `Marked sent: the principal report for ${sent.studentIds.length} student${sent.studentIds.length === 1 ? '' : 's'}.` });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  const saveSettings = async () => {
    try {
      const saved = await saveDisciplineSettings(settingsDraft);
      setSettings((current) => ({ ...current, ...saved }));
      setSettingsDraft(null);
      setMessage({ tone: 'success', text: 'Saved.' });
    } catch (error) {
      setMessage({ tone: 'danger', text: error.message });
    }
  };

  if (!myClasses.length) {
    return <section className="tw-stack"><h2 style={{ margin: 0 }}>Discipline Tracker</h2><div className="tw-card tw-card--muted">You are not the teacher of record for any class yet.</div></section>;
  }

  return <section aria-labelledby="discipline-heading" className="tw-stack" style={{ textAlign: 'left' }} data-discipline-tracker>
    <div>
      <h2 id="discipline-heading" style={{ margin: 0 }}>Discipline Tracker</h2>
      <p className="tw-muted" style={{ margin: '4px 0 0', fontSize: 'calc(14 * var(--mm-px))' }}>
        Tap a violation as it happens. MathMaster saves the time and sends each student&apos;s violations to the district&apos;s
        Campus Violation Tracker form after the class period ends.
      </p>
    </div>

    <div className="tw-card tw-stack" style={{ gap: 10 }}>
      <div className="tw-row" role="group" aria-label="Classes">
        {myClasses.map((entry) => (
          <button key={entry.classId} type="button" className="tw-chip" aria-pressed={entry.classId === classId} onClick={() => setClassId(entry.classId)}>
            {entry.name || entry.period || entry.classId}
          </button>
        ))}
      </div>
      <div className="tw-row">
        <label className="tw-row tw-small tw-strong" style={{ gap: 6 }}>
          Day
          <input className="tw-input" type="date" value={dateKey} max={today} onChange={(event) => event.target.value && setDateKey(event.target.value)} />
        </label>
        {!isToday && <button type="button" className="tw-btn tw-btn--sm" onClick={() => setDateKey(today)}>Today</button>}
        <input className="tw-input" type="search" aria-label="Find a student" placeholder="Find a student…" value={search} onChange={(event) => setSearch(event.target.value)} style={{ flex: '1 1 200px', maxWidth: 320 }} />
      </div>
      <div className="tw-row tw-small" data-discipline-summary>
        <strong>{disciplineLongDay(dateKey)}</strong>
        <span className="tw-muted">
          {summary.total} violation{summary.total === 1 ? '' : 's'} · {summary.sent} sent to the form · {summary.waiting} waiting
          {summary.needsYou > 0 && <> · <strong style={{ color: 'var(--mm-warning-text)' }}>{summary.needsYou} need you</strong></>}
        </span>
        <span className="tw-spacer" />
        <button type="button" className="tw-btn tw-btn--sm" disabled={busy || !summary.waiting} onClick={sendNow}>{busy ? 'Sending…' : 'Send now'}</button>
      </div>
      {otherDays.length > 0 && (
        <div className="tw-row tw-small" data-discipline-other-days>
          <span className="tw-strong">Also needs you:</span>
          {otherDays.slice(0, 6).map((entry) => (
            <button key={`${entry.dateKey}|${entry.classId}`} type="button" className="tw-link" onClick={() => { setClassId(entry.classId); setDateKey(entry.dateKey); }}>
              {disciplineShortDay(entry.dateKey)} · {classLabelOf(entry.classId)} ({entry.count})
            </button>
          ))}
        </div>
      )}
    </div>

    {formStatus && formStatus.ok === false && (
      <div role="status" className="tw-notice" data-tone="danger">
        The district form has changed, so nothing is being sent: {(formStatus.problems || []).join(' ')} Violations keep saving and go out once it is fixed.
      </div>
    )}
    {message && <div role="status" className="tw-notice" data-tone={message.tone}>{message.text}</div>}
    {!loaded && !message && <div role="status" className="tw-notice">Loading…</div>}

    <div className="tw-stack" style={{ gap: 0 }} role="list" aria-label={`${classLabel} roster`}>
      {visibleRoster.map((student) => {
        const taps = byStudent.get(student.id) || [];
        const recent = recentViolationCount(incidents, student.id, dateKey);
        const name = formatStudentName(student);
        const sis = authoritativeSisStudentId(student);
        return (
          <div key={student.id} role="listitem" className="tw-discipline-row" data-discipline-student={student.id}>
            <div className="tw-discipline-row__who">
              <span className="tw-strong">{name}</span>
              <span className="tw-small tw-muted">
                {sis ? `ID ${sis}` : 'No district ID'}
                {recent >= 2 && <> · <span style={{ color: recent >= REPEAT_RULE.totalCount ? 'var(--mm-error-text)' : 'var(--mm-warning-text)', fontWeight: 700 }}>{recent} in {REPEAT_RULE.totalSchoolDays} school days</span></>}
              </span>
            </div>
            {isToday && (
              <div className="tw-discipline-row__buttons" role="group" aria-label={`Record a violation for ${name}`}>
                {VIOLATION_TYPES.map((entry) => {
                  const count = taps.filter((incident) => incident.type === entry.id).length;
                  return (
                    <button key={entry.id} type="button" className="tw-btn tw-btn--sm tw-discipline-tap" aria-label={`${entry.label} for ${name}`} onClick={() => tap(student, entry.id)} data-count={count || undefined}>
                      {entry.label}{count > 0 && <span className="tw-chip__count">{count}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {taps.length > 0 && (
              <ul className="tw-discipline-row__taps">
                {taps.map((incident) => {
                  const state = formStateWords(incident);
                  const details = violationType(incident.type)?.details || [];
                  return (
                    <li key={incident.id} data-discipline-incident={incident.id}>
                      <span className="tw-strong">{violationType(incident.type)?.label}</span>
                      <span className="tw-muted"> {disciplineTime(incident.occurredAtMs)}</span>
                      {details.length > 0 && (
                        <select className="tw-select" aria-label={`Detail for ${violationType(incident.type)?.label} at ${disciplineTime(incident.occurredAtMs)}`} value={incident.detail || ''} disabled={incident.saving} onChange={(event) => setDetail(incident, event.target.value)}>
                          <option value="">No detail</option>
                          {details.map((detail) => <option key={detail.id} value={detail.id}>{detail.label}</option>)}
                        </select>
                      )}
                      <span className="tw-pill" data-tone={state.tone}>{state.label}</span>
                      {['unknown', 'failed'].includes(incident.form?.state) && <>
                        <button type="button" className="tw-link" onClick={() => resolve(incident, 'resubmit')}>Send again</button>
                        <button type="button" className="tw-link" onClick={() => resolve(incident, 'markSubmitted')}>It was recorded</button>
                      </>}
                      {!incident.saving && <button type="button" className="tw-link" onClick={() => undo(incident)}>Undo</button>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      {visibleRoster.length === 0 && <div className="tw-card tw-card--muted">{needle ? `No student in ${classLabel} matches “${search.trim()}”.` : `${classLabel} has no students on its roster.`}</div>}
    </div>

    <details className="tw-disclosure" data-discipline-families>
      <summary>
        Messages to families
        <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{drafts.length} for {classLabel} on {disciplineLongDay(dateKey)}</span>
      </summary>
      <div className="tw-disclosure__body tw-stack" style={{ gap: 12 }}>
        <p className="tw-small tw-muted" style={{ margin: 0 }}>
          One message per student, for the whole day. <strong>Send to families</strong> queues them; the MathMaster SchoolStatus extension sends each one from your SchoolStatus while this screen is open in Chrome, and logs it in Parent Contacts. You can still copy a message and log it yourself.
        </p>
        {messaging.mode === 'off' && <div role="status" className="tw-notice">Sending through SchoolStatus is not turned on yet. Copy the message, send it yourself, then log it here.</div>}
        {messaging.mode === 'test' && (
          <div role="status" className="tw-notice" data-tone="warning" data-family-test-mode>
            Test mode: only the test student{messaging.testDistrictIds.length === 1 ? '' : 's'} ({messaging.testDistrictIds.map((id) => `ID ${id}`).join(', ')}) can be sent to. Every other message stays a draft.
          </div>
        )}
        {messaging.mode !== 'off' && isClassTeacher && (
          <div className="tw-row">
            <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" disabled={busy || !sendable.length} onClick={() => sendToFamilies()} data-send-to-families>
              {busy ? 'Queueing…' : `Send to families${sendable.length ? ` (${sendable.length})` : ''}`}
            </button>
          </div>
        )}
        {isRootAdmin && (
          <div className="tw-card tw-card--muted tw-stack" style={{ gap: 6 }} data-family-switch>
            {switchDraft ? (
              <div className="tw-row" style={{ alignItems: 'flex-end' }}>
                <label className="tw-small tw-strong" style={{ display: 'grid', gap: 4 }}>
                  SchoolStatus sending
                  <select className="tw-select" value={switchDraft.mode} onChange={(event) => setSwitchDraft((current) => ({ ...current, mode: event.target.value }))}>
                    <option value="off">Off</option>
                    <option value="test">Test (test students only)</option>
                    <option value="live">Live (every family)</option>
                  </select>
                </label>
                <label className="tw-small tw-strong" style={{ display: 'grid', gap: 4, flex: '1 1 200px' }}>
                  Test students&apos; district IDs
                  <input className="tw-input" value={switchDraft.testDistrictIds} onChange={(event) => setSwitchDraft((current) => ({ ...current, testDistrictIds: event.target.value }))} />
                </label>
                <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" onClick={saveSwitch}>Save</button>
                <button type="button" className="tw-btn tw-btn--sm" onClick={() => setSwitchDraft(null)}>Cancel</button>
                <p className="tw-small tw-muted" style={{ margin: 0, flexBasis: '100%' }}>
                  In test mode, messages go only to the test students&apos; families in SchoolStatus, so choose a student whose guardian contact is your own phone. A test student&apos;s violations are never sent to the district form while test mode is on.
                </p>
              </div>
            ) : (
              <div className="tw-row tw-small">
                <span>SchoolStatus sending (administrator): <strong>{messaging.mode}</strong>{messaging.mode === 'test' ? `, test IDs ${messaging.testDistrictIds.join(', ')}` : ''}</span>
                <button type="button" className="tw-link" onClick={() => setSwitchDraft({ mode: messaging.mode, testDistrictIds: messaging.testDistrictIds.join(', ') })}>Change</button>
              </div>
            )}
          </div>
        )}
        {drafts.map((draft) => {
          const state = familyMessageWords(draft.latestMessage);
          const who = formatStudentName(draft.student, { lastFirst: false });
          return (
            <div key={draft.studentId} className="tw-card tw-stack" style={{ gap: 6 }} data-discipline-draft={draft.studentId}>
              <div className="tw-row">
                <strong>{formatStudentName(draft.student)}</strong>
                {draft.contacted
                  ? <span className="tw-pill" data-tone="success">Family contacted {disciplineTime(draft.contacted.atMs)} ({draft.contacted.method})</span>
                  : <span className="tw-pill" data-tone="neutral">Not contacted yet</span>}
                <span className="tw-pill" data-tone={state.tone} data-family-message-state={draft.latestMessage?.state || 'draft'}>{state.label}</span>
              </div>
              {draft.followUp && <div className="tw-small tw-muted">A follow-up for the violations after the last message sent.</div>}
              <div className="tw-small tw-strong">{draft.shownMessage.subject}</div>
              <textarea className="tw-input" readOnly rows={6} value={draft.shownMessage.body} aria-label={`Message to ${who}'s family`} style={{ width: '100%', fontFamily: 'inherit' }} />
              {draft.blockedReason && messaging.mode !== 'off' && <div className="tw-small tw-muted">{draft.blockedReason}</div>}
              <div className="tw-row">
                {messaging.mode !== 'off' && isClassTeacher && draft.canQueue && (
                  <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" disabled={busy} onClick={() => sendToFamilies([draft.studentId])}>Send to family</button>
                )}
                {draft.cancellable.map((familyMessage) => (
                  <button key={familyMessage.id} type="button" className="tw-btn tw-btn--sm" onClick={() => resolveMessage(familyMessage, 'cancel')}>Cancel sending</button>
                ))}
                {draft.needsDecision.map((familyMessage) => (
                  <span key={familyMessage.id} className="tw-row" style={{ gap: 6 }}>
                    <button type="button" className="tw-btn tw-btn--sm" onClick={() => resolveMessage(familyMessage, 'requeue')}>Send again</button>
                    <button type="button" className="tw-btn tw-btn--sm" onClick={() => resolveMessage(familyMessage, 'markSent')}>It was sent</button>
                  </span>
                ))}
                <button type="button" className="tw-btn tw-btn--sm" onClick={async () => setMessage((await copyText(draft.shownMessage.body)) ? { tone: 'success', text: 'Message copied.' } : { tone: 'warning', text: 'Copy was blocked: select the message and copy it.' })}>Copy message</button>
                {onRecordContact && SEND_METHODS.map((method) => (
                  <button key={method.id} type="button" className="tw-btn tw-btn--sm tw-btn--quiet" onClick={() => logSent(draft, method.id)}>Log as sent: {method.label}</button>
                ))}
              </div>
            </div>
          );
        })}
        {drafts.length === 0 && <div className="tw-small tw-muted">No violations for {classLabel} on this day.</div>}
      </div>
    </details>

    <details className="tw-disclosure" data-discipline-principal>
      <summary>
        Principal report
        <span className="tw-small tw-muted" style={{ fontWeight: 600 }}>{report.offenders.length} repeat offender{report.offenders.length === 1 ? '' : 's'} (all your classes, last {REPEAT_RULE.totalSchoolDays} school days)</span>
      </summary>
      <div className="tw-disclosure__body tw-stack" style={{ gap: 10 }}>
        <p className="tw-small tw-muted" style={{ margin: 0 }}>
          A repeat offender has {REPEAT_RULE.totalCount} or more violations in {REPEAT_RULE.totalSchoolDays} school days, or the same violation {REPEAT_RULE.sameTypeCount} times in {REPEAT_RULE.sameTypeSchoolDays}.
          The report lists every date and time and how each family was contacted.
        </p>
        {settingsDraft ? (
          <div className="tw-row" style={{ alignItems: 'flex-end' }}>
            {[['principalEmail', "Principal's email"], ['principalName', 'Greeting (e.g. Dr. Smith)'], ['teacherName', 'Your name for messages']].map(([key, label]) => (
              <label key={key} className="tw-small tw-strong" style={{ display: 'grid', gap: 4, flex: '1 1 200px' }}>
                {label}
                <input className="tw-input" value={settingsDraft[key]} onChange={(event) => setSettingsDraft((current) => ({ ...current, [key]: event.target.value }))} />
              </label>
            ))}
            <button type="button" className="tw-btn tw-btn--sm tw-btn--primary" onClick={saveSettings}>Save</button>
            <button type="button" className="tw-btn tw-btn--sm" onClick={() => setSettingsDraft(null)}>Cancel</button>
          </div>
        ) : (
          <div className="tw-row tw-small">
            <span>To: {settings.principalEmail || <em>no principal email yet</em>}</span>
            <button type="button" className="tw-link" onClick={() => setSettingsDraft({ ...settings, teacherName: settings.teacherName || teacherName })}>Edit</button>
          </div>
        )}
        <pre className="tw-small" style={{ whiteSpace: 'pre-wrap', margin: 0, padding: 10, background: 'var(--mm-surface-muted)', borderRadius: 8 }} data-discipline-report>{report.subject}{'\n\n'}{report.body}</pre>
        <div className="tw-row">
          <a className="tw-btn tw-btn--sm tw-btn--primary" href={outlookComposeUrl({ to: settings.principalEmail, subject: report.subject, body: report.body })} target="_blank" rel="noopener noreferrer">Open in Outlook</a>
          <button type="button" className="tw-btn tw-btn--sm" onClick={async () => setMessage((await copyText(`${report.subject}\n\n${report.body}`)) ? { tone: 'success', text: 'Report copied.' } : { tone: 'warning', text: 'Copy was blocked: select the report and copy it.' })}>Copy report</button>
          {report.offenders.length > 0 && <button type="button" className="tw-btn tw-btn--sm" onClick={markReportSent}>Mark as sent</button>}
        </div>
        {lastReport && (
          <p className="tw-small tw-muted" style={{ margin: 0 }} data-discipline-report-sent>
            Last marked sent {disciplineShortDay(disciplineDateKey(lastReport.sentAtMs))} at {disciplineTime(lastReport.sentAtMs)}, for {lastReport.studentIds.length} student{lastReport.studentIds.length === 1 ? '' : 's'}. The Action Center asks again about a student only after a new violation.
          </p>
        )}
      </div>
    </details>
  </section>;
}
