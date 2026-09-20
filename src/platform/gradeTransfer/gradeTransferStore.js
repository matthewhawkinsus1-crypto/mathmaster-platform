import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

const callable = (name) => httpsCallable(functions, name);

export const loadTeacherGradeTransferState = async ({ classIds = [] } = {}) => {
  const response = await callable('listGradeTransferState')({
    classIds: [...new Set((classIds || []).filter(Boolean))],
  });
  const data = response.data || {};
  return {
    snapshots: Array.isArray(data.snapshots) ? data.snapshots : [],
    practicePasses: new Set(Array.isArray(data.practicePassKeys) ? data.practicePassKeys : []),
  };
};

export const persistTransferSnapshot = async (snapshot) => {
  const response = await callable('persistGradeTransferSnapshot')({ snapshot });
  return response.data?.transferId || snapshot.transferId;
};

export const confirmTransferUploaded = async ({ transferId }) => {
  await callable('confirmGradeTransferUploaded')({ transferId });
};

export const setStudentSisId = async ({ studentId, sisStudentId }) => {
  const response = await callable('setStudentSisId')({ studentId, sisStudentId });
  return response.data || { studentId, sisStudentId };
};
