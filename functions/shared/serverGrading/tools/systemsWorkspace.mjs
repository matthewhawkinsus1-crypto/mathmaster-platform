/*
 * Shared grader for the `systemsWorkspace` registry tool — run by the browser
 * tool for feedback, by QuestionEngine for the recorded verdict, and by the
 * server as the authority. Mode graders live in ./systemsWorkspace/.
 */
import declaration from '../declarations/systemsWorkspace.mjs';
import { bindToolGrader } from '../toolGraderDefinition.mjs';
import algebraicGraders from './systemsWorkspace/algebraic.mjs';
import graphicalGraders from './systemsWorkspace/graphical.mjs';

export default bindToolGrader(declaration, 'systemsWorkspace', {
  ...graphicalGraders,
  ...algebraicGraders,
});
