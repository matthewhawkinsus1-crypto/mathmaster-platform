// Browser calls for the discipline tracker. Every one goes through a callable
// that checks the class's teacher of record (functions/disciplineFunctions.js);
// the discipline collections are server-only (firestore.rules).
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

const call = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data || {};

export const recordDisciplineIncident = ({ classId, studentId, type, detail = '', tapId }) => (
  call('recordDisciplineIncident', { classId, studentId, type, detail, tapId })
);
export const voidDisciplineIncident = ({ incidentId, reason = '' }) => call('voidDisciplineIncident', { incidentId, reason });
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
