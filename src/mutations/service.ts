import { authorize } from "@/lib/auth/authorization";
import type { Permission } from "@/lib/auth/roles";
import type { AuditSink, MutationAction, MutationRequest, MutationResult, OperationalMutationAdapter } from "./contracts";
import type { MutationGate } from "./gate";
import { createAuditEvent } from "./audit";
import { validateMutationRequest } from "./validation";

const required: Record<MutationAction, Permission> = {
  "kyc.approve": "kyc:review", "kyc.reject": "kyc:review", "kyc.resubmission": "kyc:review", "customer.block": "customers:manage", "customer.unblock": "customers:manage",
  "rider.block": "riders:manage", "rider.unblock": "riders:manage", "booking.intervene": "bookings:manage", "payment.reconcile": "settlements:manage",
  "settlement.adjustment.request": "settlements:manage", "settlement.reconciliation.review": "settlements:manage",
  "support.status.update": "disputes:manage", "support.note.add": "disputes:manage", "pricing.create": "pricing:manage",
  "pricing.update": "pricing:manage", "pricing.activate": "pricing:manage", "pricing.deactivate": "pricing:manage",
  "incentive.create": "incentives:manage", "incentive.update": "incentives:manage", "incentive.activate": "incentives:manage",
  "incentive.deactivate": "incentives:manage", "serviceArea.create": "serviceAreas:manage", "serviceArea.update": "serviceAreas:manage",
  "serviceArea.enable": "serviceAreas:manage", "serviceArea.disable": "serviceAreas:manage", "incident.acknowledge": "bookings:manage",
  "incident.resolve": "bookings:manage", "alert.update": "settings:manage", "admin.role.assign": "admins:manage",
  "admin.role.change": "admins:manage", "admin.disable": "admins:manage", "admin.role.revoke": "admins:manage",
};

export class OperationalMutationService {
  constructor(private gate: MutationGate, private adapter: OperationalMutationAdapter, private audit: AuditSink) {}
  async execute(request: MutationRequest): Promise<MutationResult> {
    this.gate.assertEnabled(request.action);
    validateMutationRequest(request);
    authorize(request.context.principal, required[request.action]);
    const result = await this.adapter.execute(request);
    const event = createAuditEvent(request, result.status, result.safeDiff, result.auditId);
    if (!result.auditPersisted) await this.audit.append(event);
    return { status: result.status, correlationId: request.context.correlationId, auditId: event.auditId, version: result.version };
  }
}
