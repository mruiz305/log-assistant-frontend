
import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

if (import.meta.env.DEV) {
  console.log("[FIREBASE] projectId =", firebaseConfig.projectId, "authDomain =", firebaseConfig.authDomain);
}

// Auth
export const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.error("[FIREBASE] setPersistence failed:", e);
});

// Firestore (FIX para CORS/WebChannel issues)
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false,
});

export default app;
