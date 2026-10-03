// The support-evidence rules repeat, as literals, lists the shared modules own:
// field allow-lists, service types, provider roles, event types, the supports
// inclusion status implies. Firestore rules cannot import JavaScript, so the
// duplication is unavoidable — and a drift is silent in production: a builder
// that gains a field produces writes the rules refuse, and the evidence is
// simply never recorded.
//
// This suite reads firestore.rules as text and checks every such list against
// the module that owns it, so the drift fails CI instead. The behaviour of the
// rules themselves is proven in tests/rules/supportEvidenceRules.test.mjs.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { region } from './helpers/sourceContract.mjs';
import { INCLUSION_IMPLIED_SUPPORT_IDS, serviceTypes } from '../../functions/shared/supportCatalog.mjs';
import {
  ACTIVITY_ROLES, EVIDENCE_COVERAGE, EVIDENCE_DELIVERY_MODES, EVIDENCE_DETAIL_FIELDS, EVIDENCE_DETAIL_KEYS,
  NEGATIVE_EVIDENCE_EVENT_TYPES, PLATFORM_EVALUATED_SUPPORT_IDS,
  EVIDENCE_SURFACES, PROVIDER_ROLES, STAFF_EVIDENCE_EVENT_TYPES, STUDENT_EVIDENCE_EVENT_TYPES,
  buildServiceLogEntry, buildStaffEvidenceEvent, buildStudentEvidenceEvent,
} from '../../functions/shared/supportEvidenceModel.mjs';
import { buildRevisionDocument, normalizeSupportRevisionInput } from '../../functions/shared/supportProfileModel.mjs';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

const fn = (name) => region(rules, `function ${name}(`, '\n    function ', `rules function ${name}`);

/** The string literals of the first `[...]` list after `needle` in `source`. */
const listAfter = (source, needle) => {
  const at = source.indexOf(needle);
  assert.notEqual(at, -1, `could not find "${needle}"`);
  const open = source.indexOf('[', at + needle.length);
  const close = source.indexOf(']', open);
  return [...source.slice(open, close).matchAll(/'([^']+)'/g)].map((match) => match[1]);
};

const sorted = (values) => [...new Set(values)].sort();

test('the revision allow-list is exactly the document the store writes, plus server time', () => {
  const { revision } = normalizeSupportRevisionInput({ effectiveStart: '2026-08-17', sourceLabel: 'IEP' });
  const document = buildRevisionDocument({ revision, studentId: 'S1', classId: 'c', revisionNumber: 1, createdByEmail: 't@x.test' });
  assert.deepEqual(sorted(listAfter(fn('supportRevisionValid'), 'keys().hasOnly(')), sorted([...Object.keys(document), 'createdAt']));
});

test('the evidence allow-list covers both builders, plus server time', () => {
  const staff = buildStaffEvidenceEvent({ studentId: 'S1', supportId: 'check-for-understanding', actorEmail: 't@x.test' }).payload;
  const student = buildStudentEvidenceEvent({ studentId: 'S1', supportId: 'text-to-speech', assignedTeacherEmail: 't@x.test' }).payload;
  const allowed = sorted(listAfter(fn('supportEvidenceCommonValid'), 'keys().hasOnly('));
  assert.deepEqual(allowed, sorted([...Object.keys(staff), 'occurredAt']));
  assert.deepEqual(allowed, sorted([...Object.keys(student), 'occurredAt']));
});

test('the service-log allow-list is exactly the entry the store writes, plus server time', () => {
  const entry = buildServiceLogEntry({ studentId: 'S1', dateKey: '2026-09-28', minutes: 30, serviceType: 'inclusion-support', providerRole: 'other', createdByEmail: 't@x.test' }).payload;
  assert.deepEqual(sorted(listAfter(fn('serviceLogEntryValid'), 'keys().hasOnly(')), sorted([...Object.keys(entry), 'createdAt']));
});

test('service types, provider roles and event types match their owning modules', () => {
  const serviceRule = fn('serviceLogEntryValid');
  assert.deepEqual(sorted(listAfter(serviceRule, 'd.serviceType in')), sorted(serviceTypes().map((entry) => entry.id)));
  assert.deepEqual(sorted(listAfter(serviceRule, 'd.providerRole in')), sorted(PROVIDER_ROLES));
  const staffRule = fn('staffSupportEvidenceValid');
  assert.deepEqual(sorted(listAfter(staffRule, 'd.eventType in')), sorted(STAFF_EVIDENCE_EVENT_TYPES));
  assert.deepEqual(sorted(listAfter(staffRule, "d.get('providerRole', null) in")), sorted(PROVIDER_ROLES));
  const studentRule = fn('studentSupportEvidenceValid');
  assert.deepEqual(sorted(listAfter(studentRule, 'd.eventType in')), sorted(STUDENT_EVIDENCE_EVENT_TYPES));
  // A client's negative facts: only the types and supports the model allows.
  assert.deepEqual(sorted(listAfter(studentRule, '!(d.eventType in')), sorted(NEGATIVE_EVIDENCE_EVENT_TYPES));
  assert.deepEqual(sorted(listAfter(studentRule, "'unavailable']) || d.supportId in")), sorted(PLATFORM_EVALUATED_SUPPORT_IDS));
  assert.deepEqual(sorted(listAfter(studentRule, "profile.get('inclusionStatus', false) == true && d.supportId in")), sorted(INCLUSION_IMPLIED_SUPPORT_IDS));
  assert.deepEqual(sorted(listAfter(fn('supportEvidenceCommonValid'), "d.get('activityRole', null) in")), sorted(ACTIVITY_ROLES));
});

test('the student roster row pins the profile, and attempt evidence has no client writer', () => {
  const grades = region(rules, 'match /grades/{studentId} {', 'match /supportProfileRevisions/', 'grades rules');
  assert.match(grades, /allow update: if \(rootAdmin\(\) \|\| teachesStudent\(\) \|\| \(ownsStudent\(studentId\) && supportProfileUnchanged\(\)\)\)/);
  assert.match(grades, /ownsStudent\(studentId\) && supportProfileAbsentOnStudentCreate\(\)/);
  const evidence = region(rules, 'match /evidenceEvents/{eventId} {', '}', 'evidenceEvents rules');
  assert.match(evidence, /allow create, update, delete: if false;/);
  const source = readFileSync(new URL('../../src/platform/history/evidencePersistence.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bsetDoc\b|\baddDoc\b/, 'the client module only reads attempt evidence');
});

test('the evidence details allow-list, bounds and enums match the model that builds them', () => {
  const rule = fn('evidenceDetailsValid');
  assert.deepEqual(sorted(listAfter(rule, 'details.keys().hasOnly(')), sorted(EVIDENCE_DETAIL_KEYS));
  assert.deepEqual(sorted(listAfter(rule, "optionalStringIn(details, 'coverage',")), sorted(EVIDENCE_COVERAGE));
  assert.deepEqual(sorted(listAfter(rule, "optionalStringIn(details, 'deliveryMode',")), sorted(EVIDENCE_DELIVERY_MODES));
  assert.deepEqual(sorted(listAfter(rule, "optionalStringIn(details, 'surface',")), sorted(EVIDENCE_SURFACES));
  // Every bounded int and string in the model has the same bound in the rule.
  Object.entries(EVIDENCE_DETAIL_FIELDS).forEach(([key, field]) => {
    if (field.type === 'int') assert.ok(rule.includes(`optionalIntIn(details, '${key}', ${field.min}, ${field.max})`), key);
    if (field.type === 'string') assert.ok(rule.includes(`optionalString(details, '${key}', ${field.maxLength})`), key);
    if (field.type === 'list' || field.type === 'codeList') assert.ok(rule.includes(`details.get('${key}', []).size() <= ${field.maxItems}`), key);
    if (field.type === 'codeList') assert.deepEqual(sorted(listAfter(rule, `details.get('${key}', []).hasOnly(`)), sorted(field.values), key);
    if (field.type === 'indexString') {
      assert.ok(rule.includes(`details.get('${key}', '').matches('^[0-9]{1,3}(,[0-9]{1,3}){0,${field.maxItems - 1}}$')`), key);
      assert.equal(String(field.max).length, 3, 'three digits per index');
    }
  });
  // The common rule calls it, and a staff record may not carry details.
  assert.match(fn('supportEvidenceCommonValid'), /&& evidenceDetailsValid\(d\)/);
  assert.match(fn('staffSupportEvidenceValid'), /d\.get\('details', null\) == null/);
  // The builders: a student record carries only validated details; staff none.
  const student = buildStudentEvidenceEvent({
    studentId: 'S1', supportId: 'reduced-item-count-same-rigor', eventType: 'provided', assignedTeacherEmail: 't@x.test',
    details: { targetPercent: 25, originalCount: 20, assignedCount: 15, prompt: 'never stored' },
  }).payload;
  assert.deepEqual(student.details, { targetPercent: 25, originalCount: 20, assignedCount: 15 });
  assert.equal(buildStaffEvidenceEvent({ studentId: 'S1', supportId: 'check-for-understanding', actorEmail: 't@x.test' }).payload.details, null);
});
