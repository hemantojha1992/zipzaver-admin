
import "server-only";

import {
    cert,
    getApps,
    initializeApp
} from "firebase-admin/app";

import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const EMULATOR_PROJECT = "zipzaver_emulator_for_admin";

function app() {
    if (getApps().length > 0) {
        return getApps()[0]!;
    }

    const projectId =
        process.env.ZIPZAVER_FIREBASE_PROJECT_ID ||
        process.env.GOOGLE_CLOUD_PROJECT;

    if (!projectId) {
        throw new Error(
            "Firebase Admin Project ID is missing."
        );
    }

    const emulator = Boolean(
        process.env.FIRESTORE_EMULATOR_HOST ||
        process.env.FIREBASE_AUTH_EMULATOR_HOST
    );

    if (emulator) {
        if (projectId !== EMULATOR_PROJECT) {
            throw new Error("EMULATOR_PROJECT_REQUIRED");
        }

        return initializeApp({
            projectId
        });
    }

    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
        throw new Error(
            "Firebase Admin credentials missing. Check FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY."
        );
    }

    return initializeApp({
        credential: cert({
            projectId,
            clientEmail,
            privateKey: privateKey.replace(/\\n/g, "\n")
        }),
        projectId
    });
}

export function getFirebaseAdminAuth() {
    return getAuth(app());
}

export function getFirebaseAdminFirestore() {
    return getFirestore(app());
}
