// Browser calls for the discipline tracker. Every one goes through a callable
// that checks the class's teacher of record (functions/disciplineFunctions.js);
// the discipline collections are server-only (firestore.rules).
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

const call = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data || {};

// `source: 'teams'`: a tardy TEAMS shows, recorded by the attendance mirror.
export const recordDisciplineIncident = ({ classId, studentId, type, detail = '', tapId, source = '' }) => (
  call('recordDisciplineIncident', { classId, studentId, type, detail, tapId, ...(source ? { source } : {}) })
);
// `source: 'teams'`: the attendance mirror's undo of a TEAMS tardy that TEAMS took back.
export const voidDisciplineIncident = ({ incidentId, reason = '', source = '' }) => (
  call('voidDisciplineIncident', { incidentId, reason, ...(source ? { source } : {}) })
);
export const setDisciplineIncidentDetail = ({ incidentId, detail }) => call('setDisciplineIncidentDetail', { incidentId, detail });
export const listDisciplineIncidents = ({ fromDateKey, toDateKey, classId = '' }) => (
  call('listDisciplineIncidents', { fromDateKey, toDateKey, ...(classId ? { classId } : {}) })
);
export const getDisciplineSettings = () => call('getDisciplineSettings');
export const saveDisciplineSettings = (settings) => call('saveDisciplineSettings', settings);
export const submitDisciplineFormsNow = ({ classId = '', dateKey = '' } = {}) => (
  call('submitDisciplineFormsNow', { ...(classId ? { classId } : {}), ...(dateKey ? { dateKey } : {}) })
);
export const resolveDisciplineFormState = ({ incidentIds, action }) => call('resolveDisciplineFormState', { incidentIds, action });

// Messages to families through SchoolStatus (functions/lib/familyMessageOutbox.js).
export const queueFamilyMessages = ({ classId, dateKey, studentIds = null }) => (
  call('queueFamilyMessages', { classId, dateKey, ...(Array.isArray(studentIds) ? { studentIds } : {}) })
);
export const resolveFamilyMessage = ({ messageId, action }) => call('resolveFamilyMessage', { messageId, action });
export const familyMessageOutbox = (payload) => call('familyMessageOutbox', payload);
export const setFamilyMessagingMode = ({ mode, testDistrictIds = [] }) => call('setFamilyMessagingMode', { mode, testDistrictIds });
