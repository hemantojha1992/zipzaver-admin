/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync } = require("node:fs");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const PROJECT_ID = "zipzaver-dcc73";
const email = process.argv[2]?.trim();
const confirmation = process.argv[3];
const credentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!email || confirmation !== `--confirm-project=${PROJECT_ID}`) {
  console.error(`Usage: node scripts/grant-admin-claim.cjs <email> --confirm-project=${PROJECT_ID}`);
  process.exit(1);
}
if (!credentialPath) throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS to the service-account JSON file first.");

const serviceAccount = JSON.parse(readFileSync(credentialPath, "utf8"));
if (serviceAccount.project_id !== PROJECT_ID) {
  throw new Error(`Service-account project must be ${PROJECT_ID}.`);
}

const app = getApps()[0] ?? initializeApp({
  credential: cert(serviceAccount),
  projectId: PROJECT_ID,
});

async function main() {
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(email);
  if (user.disabled) throw new Error("Cannot grant Admin access to a disabled account.");
  await auth.setCustomUserClaims(user.uid, {
    ...user.customClaims,
    admin: true,
    adminRole: "superAdmin",
  });
  console.log(`Granted superAdmin claim to ${email} in ${PROJECT_ID}. Sign out and sign in again.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
