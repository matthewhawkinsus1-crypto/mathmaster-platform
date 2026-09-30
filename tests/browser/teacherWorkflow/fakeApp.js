// firebase/app stand-in for the teacher-workflow harness. Nothing connects anywhere.
const app = { name: '[harness]', options: { projectId: 'mathmaster-teacher-harness' } };
export const initializeApp = () => app;
export const getApps = () => [app];
export const getApp = () => app;
