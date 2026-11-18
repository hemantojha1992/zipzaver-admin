import type { AdminPrincipal } from "@/lib/auth/authorization";
import type { Permission, AdminRole } from "@/lib/auth/roles";

export type MutationAction = "kyc.approve" | "kyc.reject" | "kyc.resubmission" | "customer.block" | "customer.unblock" | "rider.block" | "rider.unblock" | "booking.intervene" | "payment.reconcile" | "settlement.adjustment.request" | "settlement.reconciliation.review" | "support.status.update" | "support.note.add" | "pricing.create" | "pricing.update" | "pricing.activate" | "pricing.deactivate" | "incentive.create" | "incentive.update" | "incentive.activate" | "incentive.deactivate" | "serviceArea.create" | "serviceArea.update" | "serviceArea.enable" | "serviceArea.disable" | "incident.acknowledge" | "incident.resolve" | "alert.update" | "admin.role.assign" | "admin.role.change" | "admin.disable" | "admin.role.revoke";
export type TargetType = "rider" | "customer" | "booking" | "paymentIntent" | "settlement" | "supportTicket" | "pricingConfig" | "incentiveCampaign" | "serviceArea" | "incident" | "alertRule" | "adminUser";
export interface MutationContext { principal: AdminPrincipal; permission: Permission; reason: string; correlationId: string; requestedAt: string; idempotencyKey: string }
export interface MutationRequest<TPayload = Record<string, unknown>> { action: MutationAction; targetType: TargetType; targetId: string; context: MutationContext; payload: TPayload; expectedVersion?: string }
export interface MutationResult { status: "applied" | "idempotent"; correlationId: string; auditId: string; version: string }
export interface AuditEvent { auditId: string; adminUid: string; adminRole: AdminRole; action: MutationAction; targetType: TargetType; targetId: string; reason: string; correlationId: string; timestamp: string; result: "applied" | "idempotent" | "rejected"; safeDiff?: Readonly<Record<string, unknown>> }
export interface AdapterMutationResult { status: "applied" | "idempotent"; version: string; auditId?: string; auditPersisted?: boolean; safeDiff?: Readonly<Record<string, unknown>> }
export interface OperationalMutationAdapter { execute(request: MutationRequest): Promise<AdapterMutationResult> }
export interface AuditSink { append(event: AuditEvent): Promise<void> }

export interface PricingConfig { configId: string; baseDistanceMeters: 3000; baseFarePaise: 3900; incrementalPerKmPaise: 900; effectiveVersion: string; active: boolean }
export type PricingTrigger = "peak" | "rain" | "weather/extremeSummer" | "festival" | "event/manual";
export interface DynamicPricingRule { ruleId: string; name: string; city: string; zone?: string; triggerType: PricingTrigger; startAt: string; endAt: string; timeWindow?: { start: string; end: string }; adjustmentType: "flatPaise" | "percentage"; adjustmentValue: number; maxUpliftPaise: number; priority: number; enabled: boolean }
export type PayoutSemantics = "TOTAL_AT_MILESTONE" | "CUMULATIVE";
export interface IncentiveMilestone { eligibleCompletedRides: number; bonusPaise: number }
export interface IncentiveCampaign { campaignId: string; title: string; description: string; city: string; zone?: string; startAt: string; endAt: string; status: "draft" | "active" | "inactive" | "ended"; eligibilityRules: string[]; milestones: IncentiveMilestone[]; payoutSemantics: PayoutSemantics; terms: string; createdBy: string; updatedBy: string }
export interface ServiceArea { areaId: string; city: string; zoneName: string; active: boolean; polygonReference?: string; serviceType: "parcel"; effectiveStart: string; effectiveEnd?: string; operationalNotes: string }
