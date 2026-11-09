// src/firebase.js
//
// Firestore, on the app firebaseApp.js made, and the app's other services
// beside it, under the names every caller imports: db, auth, functions, app.
// The sign-in screen imports Auth and Functions from firebaseApp.js instead,
// so this module, and the Firestore SDK with it, loads with App
// (firebaseApp.js says why).
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { app, auth, functions } from './firebaseApp.js';

// IndexedDB-backed cache makes already-opened assignments and queued writes
// available through short school-Wi-Fi interruptions. Multi-tab coordination
// prevents each MathMaster tab from maintaining a competing persistence owner.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export { app, auth, functions };
