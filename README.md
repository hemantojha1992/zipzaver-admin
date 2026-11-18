# Zipzaver Admin Web

Phase-1 parcel-delivery operations console built with Next.js App Router, strict TypeScript, Firebase-ready repository boundaries, and server-authoritative authorization contracts.

## Local setup

1. Install with `npm.cmd install`.
2. For a production-shaped configuration, copy `.env.example` to the uncommitted `.env.local` and populate only the documented identifiers. For isolated development, no production credential is required.
3. Start Auth/Firestore with `firebase.cmd emulators:start --only auth,firestore --project zipzaver-admin-emulator`.
4. Run `npm.cmd run emulator:reset`, `npm.cmd run emulator:seed`, then `npm.cmd run dev:emulator` in another terminal.

For deterministic fixtures and fake role accounts, see [docs/ADMIN_LOCAL_EMULATOR_GUIDE.md](docs/ADMIN_LOCAL_EMULATOR_GUIDE.md). Run `npm.cmd run lint`, `npm.cmd run test`, `npm.cmd run build`, `npm.cmd run test:emulator`, and the reset/seed/browser gate `npm.cmd run test:e2e:emulator`.

Protected routes use the Firebase Admin session verifier and fail closed. Navigation is role-filtered for clarity while every route and mutation remains server-authorized.

## First Admin account

Create your user in Firebase Authentication first. To grant that user the `superAdmin` claim for the configured Zipzaver project, run this from a PowerShell opened in the project folder. Keep the service-account JSON outside the project and do not share it.

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\path\to\zipzaver-admin-key.json'
node scripts/grant-admin-claim.cjs your-email@example.com --confirm-project=zipzaver-dcc73
```

The script checks that the service-account JSON belongs to `zipzaver-dcc73`. Sign out and sign in again after it completes so Firebase refreshes the user's claims.

## Architecture

- `src/app`: public login and protected admin routes
- `src/components`: shell, reusable UI, and module presentation
- `src/domain`: backend-independent domain contracts
- `src/lib/auth`: roles, permissions, route policy, and session contracts
- `src/lib/firebase`: environment-backed Firebase client bootstrap
- `src/repositories`: persistence interfaces; Firebase adapters follow canonical schema audit
- `src/canonical`: centralized canonical Agent 1 contract types and defensive normalization
- `src/services`: authorized use-case orchestration and audit context

No production Firebase Rules, Functions, IAM, claims, data, or deployment is changed by this project. Local operational writes require the isolated `zipzaver admin` target plus server-side mutation family gates.
