import "server-only";
import type { MutationAction } from "./contracts";

export const PRODUCTION_PROJECT_ID = "hemantacro";
export type MutationFamily = "kyc" | "customer" | "rider" | "booking" | "payment" | "settlement" | "support" | "pricing" | "incentive" | "serviceArea" | "incident" | "alert" | "admin";

const familyEnvironment: Record<MutationFamily, string> = {
  kyc: "ADMIN_KYC_MUTATIONS_ENABLED",
  customer: "ADMIN_CUSTOMER_MUTATIONS_ENABLED",
  rider: "ADMIN_RIDER_MUTATIONS_ENABLED",
  booking: "ADMIN_BOOKING_MUTATIONS_ENABLED",
  payment: "ADMIN_PAYMENT_MUTATIONS_ENABLED",
  settlement: "ADMIN_SETTLEMENT_MUTATIONS_ENABLED",
  support: "ADMIN_SUPPORT_MUTATIONS_ENABLED",
  pricing: "ADMIN_PRICING_MUTATIONS_ENABLED",
  incentive: "ADMIN_INCENTIVE_MUTATIONS_ENABLED",
  serviceArea: "ADMIN_SERVICE_AREA_MUTATIONS_ENABLED",
  incident: "ADMIN_INCIDENT_MUTATIONS_ENABLED",
  alert: "ADMIN_ALERT_MUTATIONS_ENABLED",
  admin: "ADMIN_USER_MUTATIONS_ENABLED",
};

export const mutationFamily = (action: MutationAction): MutationFamily => action.split(".")[0] as MutationFamily;

export class MutationsDisabledError extends Error {
  readonly code = "ADMIN_MUTATIONS_DISABLED";
  constructor(readonly family?: MutationFamily) {
    super(family ? `Admin ${family} mutations are disabled by server policy.` : "Admin business mutations are disabled by server policy.");
    this.name = "MutationsDisabledError";
  }
}

export function assertSafeMutationTarget(projectId: string | undefined, emulatorHost: string | undefined) {
  if (!projectId) throw new Error("MUTATION_PROJECT_REQUIRED");
  if (projectId === PRODUCTION_PROJECT_ID) throw new Error("PRODUCTION_MUTATION_TARGET_FORBIDDEN");
  if (!emulatorHost) throw new Error("FIRESTORE_EMULATOR_REQUIRED");
}

export interface MutationGate { assertEnabled(action?: MutationAction): void; readonly enabled: boolean }

export class EnvironmentMutationGate implements MutationGate {
  readonly enabled = process.env.ADMIN_MUTATIONS_ENABLED === "true";
  assertEnabled(action?: MutationAction) {
    if (!this.enabled) throw new MutationsDisabledError();
    if (action) {
      const family = mutationFamily(action);
      if (process.env[familyEnvironment[family]] !== "true") throw new MutationsDisabledError(family);
    }
    assertSafeMutationTarget(process.env.ZIPZAVER_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT, process.env.FIRESTORE_EMULATOR_HOST);
  }
}

export class TestMutationGate implements MutationGate {
  constructor(readonly enabled: boolean, private families?: ReadonlySet<MutationFamily>) {}
  assertEnabled(action?: MutationAction) {
    if (!this.enabled) throw new MutationsDisabledError();
    if (action && this.families && !this.families.has(mutationFamily(action))) throw new MutationsDisabledError(mutationFamily(action));
  }
}

export const productionMutationGate: MutationGate = new EnvironmentMutationGate();
