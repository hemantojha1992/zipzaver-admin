import { NextRequest, NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/auth/session";
import { ADMIN_SESSION_COOKIE } from "@/lib/auth/constants";
import { productionMutationGate } from "@/mutations/gate";
import { FirebaseAdminMutationAdapter } from "@/mutations/firebase-admin-adapter";
import { InMemoryAuditSink } from "@/mutations/audit";
import { OperationalMutationService } from "@/mutations/service";
import type { MutationAction, TargetType } from "@/mutations/contracts";
import { structuredMutationLogger } from "@/mutations/observability";

const actions = new Set<MutationAction>([
  "kyc.approve", "kyc.reject", "kyc.resubmission", "customer.block", "customer.unblock", "rider.block", "rider.unblock", "booking.intervene", "payment.reconcile",
  "settlement.adjustment.request", "settlement.reconciliation.review", "support.status.update", "support.note.add",
  "pricing.create", "pricing.update", "pricing.activate", "pricing.deactivate", "incentive.create", "incentive.update",
  "incentive.activate", "incentive.deactivate", "serviceArea.create", "serviceArea.update", "serviceArea.enable",
  "serviceArea.disable", "incident.acknowledge", "incident.resolve", "alert.update", "admin.role.assign",
  "admin.role.change", "admin.disable", "admin.role.revoke",
]);

export async function POST(request: NextRequest) {
  const started = Date.now(), origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin) return NextResponse.json({ error: { code: "CSRF_ORIGIN_REJECTED", message: "Request origin was rejected." } }, { status: 403 });
  let log = { action: "unknown", correlationId: "unknown", targetType: "unknown", targetId: "unknown", adminUid: "unknown" };
  try {
    const cookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    if (!cookie) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Admin session required." } }, { status: 401 });
    const principal = await verifyAdminSession(cookie), body = await request.json() as Record<string, unknown>, action = String(body.action) as MutationAction;
    if (!actions.has(action)) return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Unsupported operation." } }, { status: 400 });
    log = { action, correlationId: String(body.correlationId ?? ""), targetType: String(body.targetType ?? ""), targetId: String(body.targetId ?? ""), adminUid: principal.uid };
    const result = await new OperationalMutationService(productionMutationGate, new FirebaseAdminMutationAdapter(), new InMemoryAuditSink()).execute({
      action, targetType: String(body.targetType) as TargetType, targetId: String(body.targetId ?? ""),
      payload: typeof body.payload === "object" && body.payload ? body.payload as Record<string, unknown> : {},
      expectedVersion: typeof body.expectedVersion === "string" ? body.expectedVersion : undefined,
      context: { principal, permission: "dashboard:read", reason: String(body.reason ?? ""), correlationId: String(body.correlationId ?? ""), idempotencyKey: String(body.idempotencyKey ?? ""), requestedAt: new Date().toISOString() },
    });
    structuredMutationLogger.write({ ...log, result: result.status, durationMs: Date.now() - started });
    return NextResponse.json(result);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : error instanceof Error ? error.name : "INTERNAL";
    structuredMutationLogger.write({ ...log, result: "rejected", errorCode: code, durationMs: Date.now() - started });
    const status = code === "ADMIN_MUTATIONS_DISABLED" ? 503 : code === "AuthorizationError" ? 403 : code === "MutationValidationError" ? 409 : 400;
    return NextResponse.json({ error: { code, message: code === "ADMIN_MUTATIONS_DISABLED" ? "Admin operations are currently disabled." : code === "MutationValidationError" ? (error as Error).message : "The operation could not be completed." } }, { status });
  }
}
