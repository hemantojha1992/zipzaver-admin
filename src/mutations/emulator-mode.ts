import "server-only";
export function emulatorMutationsEnabled(family: string) { return process.env.ZIPZAVER_FIREBASE_PROJECT_ID === "zipzaver_emulator_for_admin" && Boolean(process.env.FIRESTORE_EMULATOR_HOST) && process.env.ADMIN_MUTATIONS_ENABLED === "true" && process.env[`ADMIN_${family}_MUTATIONS_ENABLED`] === "true"; }
