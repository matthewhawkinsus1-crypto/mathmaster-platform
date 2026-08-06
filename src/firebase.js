// src/firebase.js
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyDRpBiB5X7OIzt5hy5nI_CHE3_BKJ6iRxc",
  authDomain: "mathmaster-aleks.firebaseapp.com",
  projectId: "mathmaster-aleks",
  storageBucket: "mathmaster-aleks.firebasestorage.app",
  messagingSenderId: "769892730653",
  appId: "1:769892730653:web:1d5a8503cf504fcfe243f4",
  measurementId: "G-3Y2XFPJB9Z"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const analytics = getAnalytics(app);

export const db = getFirestore(app);
export const functions = getFunctions(app);