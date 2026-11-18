import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";
import { ADMIN_ROLES } from "@/lib/auth/roles";
import { safeAuditDiff } from "./audit";
import type { MutationRequest, OperationalMutationAdapter } from "./contracts";
import { MutationValidationError, validateIncentiveCampaign, validatePricingRule, validateSettlementPaise } from "./validation";

type Db = ReturnType<typeof getFirebaseAdminFirestore>;
const creates = new Set(["pricing.create", "incentive.create", "serviceArea.create", "settlement.adjustment.request", "support.note.add"]);
export class BackendDependencyError extends Error { constructor(message: string) { super(message); this.name = "BackendDependencyError"; } }

export class FirebaseAdminMutationAdapter implements OperationalMutationAdapter {
  async execute(request: MutationRequest) {
    const db = getFirebaseAdminFirestore(), idem = db.collection("admin_mutation_idempotency").doc(request.context.idempotencyKey), auditId = crypto.randomUUID();
    return db.runTransaction(async tx => {
      const prior = await tx.get(idem);
      if (prior.exists) return { status: "idempotent" as const, version: String(prior.data()?.version ?? "1"), auditId: String(prior.data()?.auditId), auditPersisted: true };
      const ref = this.target(db, request), snapshot = ref ? await tx.get(ref) : null, before = snapshot?.data() ?? {};
      if (ref && !snapshot?.exists && !creates.has(request.action) && request.action !== "alert.update" && !request.action.startsWith("admin.")) throw new MutationValidationError("Target record was not found.");
      if (ref && snapshot?.exists && creates.has(request.action)) throw new MutationValidationError("Target record already exists.");
      const current = Number(before.adminVersion ?? 0);
      if (request.expectedVersion !== undefined && request.expectedVersion !== String(current)) throw new MutationValidationError("The record changed. Refresh and retry.");
      const version = String(current + 1), after = await this.apply(tx, db, request, before, current + 1);
      const safeDiff = safeAuditDiff({ before, after });
      tx.create(db.collection("admin_audit_logs").doc(auditId), { auditId, adminUid: request.context.principal.uid, adminRole: request.context.principal.roles[0], action: request.action, targetType: request.targetType, targetId: request.targetId, reason: request.context.reason, correlationId: request.context.correlationId, idempotencyKey: request.context.idempotencyKey, createdAt: FieldValue.serverTimestamp(), result: "applied", safeDiff });
      tx.create(idem, { action: request.action, targetId: request.targetId, version, auditId, createdAt: FieldValue.serverTimestamp() });
      return { status: "applied" as const, version, auditId, auditPersisted: true, safeDiff };
    });
  }

  private target(db: Db, request: MutationRequest) {
    const map: Record<string, string> = { kyc: "riders", rider: "riders", customer: "users", booking: "bookings", payment: "payment_intents", support: request.action === "support.note.add" ? "admin_support_private_notes" : "support_reports", pricing: "admin_pricing_configs", incentive: "admin_incentive_campaigns", serviceArea: "admin_service_areas", incident: "operational_incidents", alert: "admin_alert_settings", admin: "admin_users" };
    const collection = map[request.action.split(".")[0]];
    return collection ? db.collection(collection).doc(request.targetId) : null;
  }

  private async apply(tx: FirebaseFirestore.Transaction, db: Db, request: MutationRequest, before: Record<string, unknown>, version: number) {
    const p = request.payload as Record<string, unknown>, ref = this.target(db, request)!;
    const stamp = { adminVersion: version, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.context.principal.uid };
    if (request.action.startsWith("kyc.")) {
      const state = request.action === "kyc.approve" ? "approved" : request.action === "kyc.reject" ? "rejected" : "resubmissionRequired";
      if (before.kycStatus === state) return before;
      if (before.kycStatus !== "pendingReview") throw new MutationValidationError("KYC decision requires pendingReview state.");
      const applicantRef=db.collection("rider_applicants").doc(request.targetId),applicantSnap=await tx.get(applicantRef),applicant=applicantSnap.data(),selectedIds=Array.isArray(applicant?.selectedDocumentIds)?applicant.selectedDocumentIds.filter((id):id is string=>typeof id==="string"):[],revision=Number(applicant?.submissionRevision);
      if(!applicantSnap.exists||applicant?.status!=="pendingReview"||!Number.isInteger(revision)||revision<1||selectedIds.length!==3)throw new MutationValidationError("Current KYC submission revision is unavailable or incomplete.");
      const documents = await tx.get(db.collection("rider_kyc").doc(request.targetId).collection("documents")),selected=new Set(selectedIds);
      const current = documents.docs.filter(d=>selected.has(d.id)&&d.data().riderId===request.targetId&&d.data().uploadStatus==="uploaded"&&d.data().reviewStatus==="pendingReview"), types = new Set(current.map(d=>d.data().documentType));
      if (state === "approved" && !["profilePhoto","aadhaarFront","drivingLicenceFront"].every(type=>types.has(type))) throw new MutationValidationError("All required KYC documents must be uploaded before approval.");
      if(current.length!==3||types.size!==3)throw new MutationValidationError("Exactly one current document of each required KYC type must be reviewed.");
      const riderVisibleReason=state==="approved"?null:request.context.reason,after = { ...stamp, kycStatus: state, isKycVerified: state === "approved", kycRejectionReason:riderVisibleReason,kycReviewerUid: request.context.principal.uid, kycReviewedAt: FieldValue.serverTimestamp(),reviewedSubmissionRevision:revision };
      tx.update(ref, after);tx.update(applicantRef,{status:state,riderVisibleReason,reviewedSubmissionRevision:revision,reviewerUid:request.context.principal.uid,reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});for(const document of current)tx.update(document.ref,{reviewStatus:state,reviewerUid:request.context.principal.uid,reviewedSubmissionRevision:revision,reviewedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return{...after,submissionRevision:revision,selectedDocumentIds:selectedIds};
    }
    if (request.action.startsWith("customer.")) { const after = { ...stamp, isBlocked: request.action === "customer.block" }; tx.update(ref, after); return after; }
    if (request.action === "rider.block") {
      if (before.currentBookingId) throw new MutationValidationError("Rider with an active booking cannot be blocked without canonical intervention.");
      const after = { ...stamp, isBlocked: true, status: "offline", isAvailable: false }; tx.update(ref, after); return after;
    }
    if (request.action === "rider.unblock") { const after = { ...stamp, isBlocked: false }; tx.update(ref, after); return after; }
    if (request.action === "booking.intervene") return this.cancel(tx, db, request, before, version);
    if (request.action === "payment.reconcile") {
      if (process.env.ZIPZAVER_FIREBASE_PROJECT_ID!=="zipzaver_emulator_for_admin"||!process.env.FIRESTORE_EMULATOR_HOST)throw new MutationValidationError("Trusted reconciliation simulator is emulator-only.");
      if (before.status==="paymentConfirmed")return before;if(before.status!=="reconciliationPending")throw new MutationValidationError("Payment must be reconciliationPending.");
      const amount=Number(p.amountPaise),reference=String(p.trustedReference??"").trim();if(!Number.isInteger(amount)||amount!==before.amountPaise||reference.length<4)throw new MutationValidationError("Trusted amount/reference does not match the payment intent.");
      const bookingRef=db.collection("bookings").doc(String(before.bookingId)),booking=await tx.get(bookingRef),bookingData=booking.data(),timing=bookingData?.paymentTiming==="prepaid"?"prepaid":bookingData?.paymentTiming===undefined||bookingData?.paymentTiming==="payAfterDelivery"?"payAfterDelivery":"unknown";
      if(!booking.exists||bookingData?.paymentIntentId!==request.targetId||timing==="unknown")throw new MutationValidationError("Booking/payment intent linkage is invalid.");
      if(timing==="prepaid"&&bookingData?.status!=="awaitingPayment")throw new MutationValidationError("Prepaid booking must be awaiting payment before trusted confirmation.");
      if(timing==="payAfterDelivery"&&(bookingData?.status!=="delivered"||!['awaitingPayment','reconciliationPending'].includes(String(bookingData?.paymentState??bookingData?.paymentStatus))))throw new MutationValidationError("Pay After Delivery payment is actionable only after delivery.");
      const after={...stamp,status:"paymentConfirmed",confirmedAt:FieldValue.serverTimestamp(),reconciliationSource:"emulatorTrustedSimulator",trustedReference:reference};tx.update(ref,after);tx.update(bookingRef,{...(timing==="prepaid"?{status:"pending"}:{}),paymentState:"paymentConfirmed",paymentConfirmedAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});return after;
    }
    if (request.action === "support.status.update") {
      if (p.status && !["open", "inProgress", "resolved", "reopened"].includes(String(p.status))) throw new MutationValidationError("Unsupported support status.");
      if (p.priority && !["low", "normal", "high", "urgent"].includes(String(p.priority))) throw new MutationValidationError("Unsupported support priority.");
      const after = { ...stamp, ...(p.status ? { status: p.status } : {}), ...(p.priority ? { priority: p.priority } : {}), ...(p.assignedAdminUid ? { assignedAdminUid: p.assignedAdminUid } : {}), ...(p.status === "resolved" ? { resolvedAt: FieldValue.serverTimestamp(),resolvedBy:request.context.principal.uid } : {}), ...(p.status === "reopened" ? { reopenedAt: FieldValue.serverTimestamp(),resolvedAt:FieldValue.delete() } : {}) }; tx.update(ref, after); return after;
    }
    if (request.action === "support.note.add") {
      if (!String(p.reportId ?? "").trim() || String(p.note ?? "").trim().length < 2) throw new MutationValidationError("Report and private note are required.");
      const after = { noteId: request.targetId, reportId: p.reportId, note: String(p.note).trim(), createdBy: request.context.principal.uid, createdAt: FieldValue.serverTimestamp(), adminVersion: version }; tx.create(ref, after); return after;
    }
    if (request.action === "settlement.adjustment.request") {
      validateSettlementPaise(p.amountPaise); if (!p.riderId || !p.cycleReference) throw new MutationValidationError("Rider and cycle reference are required.");
      const after = { ...p, adjustmentId: request.targetId, reason: request.context.reason, correlationId: request.context.correlationId, idempotencyKey: request.context.idempotencyKey, createdBy: request.context.principal.uid, status: "requested", createdAt: FieldValue.serverTimestamp(), adminVersion: version }; tx.create(db.collection("admin_settlement_adjustments").doc(request.targetId), after); return after;
    }
    if (request.action.startsWith("pricing.")) return this.pricing(tx, db, request, before, version);
    if (request.action.startsWith("incentive.")) return this.incentive(tx, ref, request, before, version);
    if (request.action.startsWith("serviceArea.")) return this.area(tx, ref, request, before, version);
    if (request.action.startsWith("incident.")) {
      const resolved = request.action === "incident.resolve";
      if (before.status === "RESOLVED" && !resolved) throw new MutationValidationError("Resolved incident cannot be acknowledged.");
      if (resolved && String(p.resolutionSummary ?? "").trim().length < 5) throw new MutationValidationError("Resolution summary is required.");
      const after = { ...stamp, status: resolved ? "RESOLVED" : "ACKNOWLEDGED", ...(resolved ? { resolvedBy: request.context.principal.uid, resolvedAt: FieldValue.serverTimestamp(), resolutionSummary: p.resolutionSummary } : { acknowledgedBy: request.context.principal.uid, acknowledgedAt: FieldValue.serverTimestamp() }) }; tx.update(ref, after); return after;
    }
    if (request.action === "alert.update") {
      for (const field of ["threshold", "windowMinutes", "minimumSampleSize", "cooldownMinutes"]) if (p[field] !== undefined && (!Number.isFinite(p[field]) || Number(p[field]) < 0)) throw new MutationValidationError(`${field} must be non-negative.`);
      if (p.severity && !["INFO", "WARNING", "CRITICAL"].includes(String(p.severity))) throw new MutationValidationError("Unsupported alert severity.");
      const after = { ...before, ...p, ...stamp }; if (Object.keys(before).length) tx.update(ref, after); else tx.create(ref, after); return after;
    }
    if (request.action.startsWith("admin.")) return this.admin(tx, db, ref, request, before, version);
    throw new BackendDependencyError("Canonical backend operation is not implemented.");
  }

  private async pricing(tx: FirebaseFirestore.Transaction, db: Db, r: MutationRequest, before: Record<string, unknown>, version: number) {
    const p = r.payload as Record<string, unknown>; if (p.rule) validatePricingRule(p.rule as never);
    const active = r.action === "pricing.activate" ? true : r.action === "pricing.deactivate" ? false : Boolean(p.active ?? before.active ?? false);
    const after = { ...(r.action === "pricing.create" ? p : { ...before, ...p }), configId: r.targetId, baseDistanceMeters: Number(p.baseDistanceMeters ?? before.baseDistanceMeters ?? 3000), baseFarePaise: Number(p.baseFarePaise ?? before.baseFarePaise ?? 3900), incrementalPerKmPaise: Number(p.incrementalPerKmPaise ?? before.incrementalPerKmPaise ?? 900), active, enabled: active, adminVersion: version, updatedBy: r.context.principal.uid, updatedAt: FieldValue.serverTimestamp() };
    if (after.baseDistanceMeters !== 3000 || after.baseFarePaise !== 3900 || after.incrementalPerKmPaise !== 900) throw new MutationValidationError("Locked Phase-1 standard pricing cannot be changed.");
    if (active && !Boolean(before.active)) { const q = await tx.get(db.collection("admin_pricing_configs").where("active", "==", true)); if (q.docs.some(d => d.id !== r.targetId)) throw new MutationValidationError("Another pricing configuration is active."); }
    const ref = db.collection("admin_pricing_configs").doc(r.targetId); if (r.action === "pricing.create") tx.create(ref, { ...after, createdBy: r.context.principal.uid, createdAt: FieldValue.serverTimestamp() }); else { tx.create(ref.collection("history").doc(String(version)), { ...before, archivedAt: FieldValue.serverTimestamp() }); tx.update(ref, after); } return after;
  }

  private incentive(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, r: MutationRequest, before: Record<string, unknown>, version: number) {
    const p = r.payload as Record<string, unknown>, campaign = (p.campaign ?? p) as Record<string, unknown>;
    if (["incentive.create", "incentive.update"].includes(r.action)) validateIncentiveCampaign(campaign as never);
    if (r.action === "incentive.activate" && !["draft", "inactive"].includes(String(before.status))) throw new MutationValidationError("Invalid campaign transition.");
    const status = r.action === "incentive.activate" ? "active" : r.action === "incentive.deactivate" ? "inactive" : String(campaign.status ?? before.status ?? "draft");
    const after = { ...(r.action === "incentive.create" ? campaign : { ...before, ...campaign }), campaignId: r.targetId, status, adminVersion: version, updatedBy: r.context.principal.uid, updatedAt: FieldValue.serverTimestamp() }; if (r.action === "incentive.create") tx.create(ref, { ...after, createdBy: r.context.principal.uid, createdAt: FieldValue.serverTimestamp() }); else tx.update(ref, after); return after;
  }

  private area(tx: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, r: MutationRequest, before: Record<string, unknown>, version: number) {
    const p = r.payload as Record<string, unknown>; if (!String(p.city ?? before.city ?? "").trim() || !String(p.zoneName ?? before.zoneName ?? "").trim()) throw new MutationValidationError("City and zone are required.");
    const active = r.action === "serviceArea.enable" ? true : r.action === "serviceArea.disable" ? false : Boolean(p.active ?? before.active ?? false), after = { ...(r.action === "serviceArea.create" ? p : { ...before, ...p }), areaId: r.targetId, serviceType: "parcel", active, adminVersion: version, updatedBy: r.context.principal.uid, updatedAt: FieldValue.serverTimestamp() }; if (r.action === "serviceArea.create") tx.create(ref, { ...after, createdBy: r.context.principal.uid, createdAt: FieldValue.serverTimestamp() }); else tx.update(ref, after); return after;
  }

  private async admin(tx: FirebaseFirestore.Transaction, db: Db, ref: FirebaseFirestore.DocumentReference, r: MutationRequest, before: Record<string, unknown>, version: number) {
    const role = String((r.payload as Record<string, unknown>).role ?? ""); if (["admin.role.assign", "admin.role.change"].includes(r.action) && !ADMIN_ROLES.includes(role as never)) throw new MutationValidationError("Unsupported Admin role.");
    if (r.targetId === r.context.principal.uid && role === "superAdmin" && !r.context.principal.roles.includes("superAdmin")) throw new MutationValidationError("An Admin cannot self-escalate.");
    const removes = before.role === "superAdmin" && (r.action === "admin.disable" || r.action === "admin.role.revoke" || role !== "superAdmin"); if (removes) { const q = await tx.get(db.collection("admin_users").where("role", "==", "superAdmin").where("active", "==", true)); if (q.size <= 1) throw new MutationValidationError("The last active superAdmin is protected."); }
    const after = { ...before, uid: r.targetId, role: r.action === "admin.role.revoke" ? null : role || before.role, active: !["admin.disable", "admin.role.revoke"].includes(r.action), claimVersion: Number(before.claimVersion ?? 0) + 1, sessionVersion: Number(before.sessionVersion ?? 0) + 1, adminVersion: version, updatedBy: r.context.principal.uid, updatedAt: FieldValue.serverTimestamp() }; if (Object.keys(before).length) tx.update(ref, after); else tx.create(ref, after); return after;
  }

  private async cancel(tx: FirebaseFirestore.Transaction, db: Db, r: MutationRequest, b: Record<string, unknown>, version: number) {
    if (b.status === "cancelled") return b; if (["pickedUp", "inTransit", "delivered"].includes(String(b.status))) throw new MutationValidationError("Use Return to Sender or Alternate Delivery after pickup.");
    const assignedAt = b.riderAssignedAt instanceof Timestamp ? b.riderAssignedAt.toMillis() : 0, elapsed = assignedAt ? (Date.now() - assignedAt) / 1000 : Infinity, pickup = (b.arrivalState as { pickup?: { verified?: boolean } } | undefined)?.pickup?.verified === true;
    
    const band = !b.riderAssigned ? "FreeRiderCustomerCancellation" : elapsed <= 120 ? "FreeRiderCustomerCancellation" : pickup ? "FreeRiderCustomerCancellation" : "FreeRiderCustomerCancellation";
    const riderRef = typeof b.riderId === "string" && b.riderId ? db.collection("riders").doc(b.riderId) : null;
    const riderSnapshot = riderRef ? await tx.get(riderRef) : null;
    const after = { status: "cancelled", cancelledAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), adminVersion: version, cancellationAccounting: { status: "serverVerified", actor: "zipzaver", band, customerFee: 0, riderEarning: 0, Revenue: 0 }, "customerAccounting.cancellationFee": 0, "customerAccounting.total": Number((b.customerAccounting as { totalPaise?: number } | undefined)?.totalPaise ?? 0), "riderAccounting.cancellationEarning": 0, "Accounting.cancellationRevenue": 0 };
    tx.update(db.collection("bookings").doc(r.targetId), after);
    if (riderRef && riderSnapshot?.data()?.currentBookingId === r.targetId) tx.update(riderRef, { currentBookingId: null, status: "online", isAvailable: true, updatedAt: FieldValue.serverTimestamp() });
    return after;
  }
}
