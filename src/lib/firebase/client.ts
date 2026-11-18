import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { getPublicFirebaseEnv } from "@/config/env";

const EMULATOR_PROJECT = "zipzaver_emulator_for_admin";
let connected = false;
export function getFirebaseClient() {
  const env = getPublicFirebaseEnv();
  const app = getApps().length ? getApp() : initializeApp({ apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: env.NEXT_PUBLIC_FIREBASE_APP_ID });
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== EMULATOR_PROJECT) throw new Error("Firebase emulator mode requires the isolated emulator project.");
    if (!connected) { connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true }); connectFirestoreEmulator(firestore, "127.0.0.1", 8088); connected = true; }
  }
  return { app, auth, firestore };
}
