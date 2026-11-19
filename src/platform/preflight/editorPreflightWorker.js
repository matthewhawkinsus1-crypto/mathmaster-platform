/*
 * THE QUESTION EDITOR'S PRE-FLIGHT, RUN BESIDE THE PAGE.
 *
 * One run of the whole assignment's Pre-Flight is one long piece of work: on
 * the 82-question test assignment a few hundred milliseconds at full speed
 * and well over half a second with the CPU slowed 4x. Its largest steps
 * cannot be cut small enough to wait for (the hidden hints' audit alone is
 * about a third of a run), so on the page's own thread a key the teacher
 * pressed while it ran waited for all of it. Here it runs in a worker: the
 * page only hands the questions over (167 KB for 82 questions, about 2 ms at
 * 4x) and takes the findings back. The worker is the model's own code bundled
 * again, about 0.9 MB gzip, fetched only when a teacher opens the editor.
 *
 * Each answer is exactly what the page would have found: the same function
 * on the same questions (answerEditorPreflightRequest in
 * questionPreflightFindings.js), copied in and out by the browser.
 * useQuestionPreflightFindings.js starts the worker, keeps only the newest
 * request, and ends it when the editor closes.
 */
import { answerEditorPreflightRequest } from './questionPreflightFindings.js';

self.addEventListener('message', (event) => {
  self.postMessage(answerEditorPreflightRequest(event.data));
});
