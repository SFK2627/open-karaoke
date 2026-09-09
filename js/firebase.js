import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { firebaseConfig } from "./firebase-config.js";

export function isFirebaseConfigured() {
  const values = Object.values(firebaseConfig || {});
  return values.length > 0 && values.every(value => {
    const text = String(value || "");
    return text && !text.includes("PASTE_YOUR_");
  });
}

let app;
let auth;
let db;
let authReadyPromise;

export async function initFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured yet.");
  }

  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    await setPersistence(auth, browserLocalPersistence);
  }

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve, reject) => {
      const unsubscribe = onAuthStateChanged(auth, async user => {
        if (user) {
          unsubscribe();
          resolve(user);
          return;
        }
        try {
          await signInAnonymously(auth);
        } catch (error) {
          unsubscribe();
          reject(error);
        }
      }, reject);
    });
  }

  const user = await authReadyPromise;
  return { app, auth, db, user };
}

export {
  ref,
  get,
  set,
  update,
  remove,
  onValue,
  onDisconnect,
  serverTimestamp,
  runTransaction
};
