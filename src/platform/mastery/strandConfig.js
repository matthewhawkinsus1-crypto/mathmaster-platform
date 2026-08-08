import { ALGEBRA_I_TEKS } from '../../texasStandards.js';
import { toDisplayCode } from '../../utils/teksUtils.js';

const contentCodes = ALGEBRA_I_TEKS
  .map((standard) => standard.code)
  .filter((code) => /^A\.(?:[2-9]|1[0-2])[A-Z]$/.test(code));

const codesForSections = (...sections) => contentCodes.filter((code) => {
  const section = Number(code.match(/^A\.(\d+)/)?.[1]);
  return sections.includes(section);
});

export const TEKS_STRANDS = Object.freeze({
  LINEAR_FUNCTIONS: Object.freeze({
    id: 'linear_functions',
    title: 'Linear Functions & Representations',
    color: '#137333',
    codes: Object.freeze(codesForSections(2, 3, 4)),
  }),
  EQUATIONS_INEQUALITIES: Object.freeze({
    id: 'equations_inequalities',
    title: 'Linear Equations & Systems',
    color: '#b06000',
    codes: Object.freeze(codesForSections(5)),
  }),
  QUADRATIC_FUNCTIONS: Object.freeze({
    id: 'quadratic_functions',
    title: 'Quadratic Functions & Equations',
    color: '#a142f4',
    codes: Object.freeze(codesForSections(6, 7, 8)),
  }),
  EXPONENTIAL_FUNCTIONS: Object.freeze({
    id: 'exponential_functions',
    title: 'Exponential Functions',
    color: '#c5221f',
    codes: Object.freeze(codesForSections(9)),
  }),
  NUMBER_ALGEBRA: Object.freeze({
    id: 'number_algebra',
    title: 'Number & Algebraic Methods',
    color: '#1a73e8',
    codes: Object.freeze(codesForSections(10, 11, 12)),
  }),
});

export const MASTERY_STATUS_COLORS = Object.freeze({
  Mastered: '#1e8e3e',
  Secure: '#34a853',
  Developing: '#fbbc04',
  'Needs Attention': '#ea4335',
  'Not Enough Evidence': '#dadce0',
});

export const getStrandForTEKS = (teksCode) => {
  const code = toDisplayCode(teksCode);
  return Object.values(TEKS_STRANDS).find((strand) => strand.codes.includes(code))
    || TEKS_STRANDS.NUMBER_ALGEBRA;
};

export const getAllAlgebraOneWheelTeks = () => Object.values(TEKS_STRANDS)
  .flatMap((strand) => strand.codes);
