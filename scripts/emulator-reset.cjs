/* eslint-disable @typescript-eslint/no-require-imports */
const { PROJECT_ID } = require("./emulator-env.cjs");
async function remove(url) { const response = await fetch(url, { method: "DELETE" }); if (!response.ok) throw new Error(`Reset failed: ${response.status}`); }
Promise.all([
  remove(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`),
  remove(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/accounts`),
]).then(() => console.log(`Reset complete for ${PROJECT_ID}.`)).catch((error) => { console.error(error.message); process.exitCode = 1; });
