// The TEAMS Import file: one line per student, district ID then grade, no
// header (DeSoto's Import dialog defaults: Comma, no qualifier, ID column 1,
// grade column 2, no header row; observed 2026-11-26).
//
// Its own small module so Grade Transfer's ZIP (gradeTransferModel.teamsCsv)
// and the sync engine (teamsSyncEngine.mjs) share one definition, and the
// teacher's first load carries this file, not the engine.

import { isValidDistrictStudentId } from './studentDistrictId.mjs';

export const teamsImportCsv = (rows) => (rows || []).map((row) => {
  if (!isValidDistrictStudentId(row.sisStudentId) || !Number.isInteger(row.grade) || row.grade < 0 || row.grade > 100) throw new Error('Invalid TEAMS export row.');
  return `${row.sisStudentId},${row.grade}`;
}).join('\r\n') + ((rows || []).length ? '\r\n' : '');
