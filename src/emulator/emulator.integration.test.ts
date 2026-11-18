import { beforeAll, describe, expect, it } from "vitest";

process.env.ZIPZAVER_FIREBASE_PROJECT_ID = "zipzaver_emulator_for_admin";
process.env.GOOGLE_CLOUD_PROJECT = "zipzaver_emulator_for_admin";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8088";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";

describe("isolated Admin emulator", () => {
  let db: FirebaseFirestore.Firestore;
  beforeAll(async () => { db = (await import("@/lib/firebase/admin")).getFirebaseAdminFirestore(); });

  it("loads deterministic fixtures across operational modules", async () => {
    for (const collection of ["users", "riders", "rider_private", "rider_applicants", "rider_applicant_private", "rider_kyc", "payment_intents", "rider_agreement_acceptances", "bookings", "rider_offers", "rider_settlement_entries", "support_reports", "operational_incidents", "operational_events", "admin_pricing_configs", "admin_incentive_campaigns", "admin_service_areas", "admin_audit_logs"]) expect((await db.collection(collection).limit(1).get()).empty).toBe(false);
  });

  it("uses one persisted audit ID and returns it on idempotent retry", async () => {
    const { FirebaseAdminMutationAdapter } = await import("@/mutations/firebase-admin-adapter");
    const { OperationalMutationService } = await import("@/mutations/service");
    const { TestMutationGate } = await import("@/mutations/gate");
    const { InMemoryAuditSink } = await import("@/mutations/audit");
    const sink = new InMemoryAuditSink();
    const service = new OperationalMutationService(new TestMutationGate(true), new FirebaseAdminMutationAdapter(), sink);
    const request = { action: "customer.block" as const, targetType: "customer" as const, targetId: "customer-test-1", payload: {}, context: { principal: { uid: "admin-operationsadmin", email: "operationsadmin@admin.example.test", roles: ["operationsAdmin" as const], disabled: false }, permission: "customers:manage" as const, reason: "Synthetic emulator regression", correlationId: "corr-audit-unified", idempotencyKey: "idem-audit-unified", requestedAt: new Date().toISOString() } };
    const first = await service.execute(request); const retry = await service.execute(request);
    expect(retry.auditId).toBe(first.auditId);
    expect((await db.collection("admin_audit_logs").where("auditId", "==", first.auditId).get()).size).toBe(1);
    expect(sink.events).toHaveLength(0);
  });

  it("blocks an idle Rider without changing KYC or Agreement", async () => {
    const before = (await db.collection("riders").doc("rider-test-1").get()).data()!;
    const { FirebaseAdminMutationAdapter } = await import("@/mutations/firebase-admin-adapter");
    const result = await new FirebaseAdminMutationAdapter().execute({ action: "rider.block", targetType: "rider", targetId: "rider-test-1", payload: {}, context: { principal: { uid: "admin-operationsadmin", email: "operationsadmin@admin.example.test", roles: ["operationsAdmin"], disabled: false }, permission: "riders:manage", reason: "Synthetic safety test", correlationId: "corr-rider-block", idempotencyKey: "idem-rider-block", requestedAt: new Date().toISOString() } });
    const after = (await db.collection("riders").doc("rider-test-1").get()).data()!;
    expect(result.auditId).toBeTruthy(); expect(after).toMatchObject({ isBlocked: true, status: "offline", isAvailable: false, kycStatus: before.kycStatus, agreementAcceptance: before.agreementAcceptance });
  });

  it("persists safe events, aggregates once, and deduplicates incidents", async () => {
    const { ingestLocalOperationalEvent } = await import("@/monitoring/emulator-services");
    const input = { eventType: "BOOKING_CREATE_FAILED", source: "client" as const, actorType: "customer" as const, actorId: "customer-test-1", app: "customer" as const, appVersion: "1.0.0-test", operation: "createBooking", safeErrorCode: "permission-denied", safeClassification: "RULES_DENIED", idempotencyKey: "booking-failure-1", customerId: "customer-test-1", context: { screen: "confirm", otpValue: "123456", token: "secret" } };
    expect((await ingestLocalOperationalEvent(input)).status).toBe("applied"); expect((await ingestLocalOperationalEvent(input)).status).toBe("idempotent");
    const event = (await db.collection("operational_events").doc("event-booking-failure-1").get()).data()!;
    expect(JSON.stringify(event)).not.toMatch(/123456|secret|otpValue|token/);
    const incidents = await db.collection("operational_incidents").where("incidentType", "==", "BOOKING_CREATE_FAILED").get(); expect(incidents.size).toBe(1);
  });

  it("rejects client claims of backend-authoritative success", async () => {
    const { ingestLocalOperationalEvent } = await import("@/monitoring/emulator-services");
    await expect(ingestLocalOperationalEvent({ eventType: "BOOKING_CREATED", source: "client", actorType: "customer", actorId: "customer-test-1", app: "customer", operation: "createBooking", safeErrorCode: "NONE", safeClassification: "SUCCESS", idempotencyKey: "forbidden-success" })).rejects.toThrow("BACKEND_AUTHORITATIVE");
  });

  it("deduplicates, suppresses resolved incidents inside cooldown, and reopens after cooldown", async () => {
    const { ingestLocalOperationalEvent } = await import("@/monitoring/emulator-services"); const { Timestamp } = await import("firebase-admin/firestore");
    const base = { eventType: "TRACKING_STALE", source: "client" as const, actorType: "rider" as const, actorId: "rider-test-2", app: "rider" as const, operation: "tracking", safeErrorCode: "STALE", safeClassification: "STALE", bookingId: "cooldown-booking", riderId: "rider-test-2" };
    await ingestLocalOperationalEvent({ ...base, idempotencyKey: "cooldown-1" }); await ingestLocalOperationalEvent({ ...base, idempotencyKey: "cooldown-2" });
    const ref = db.collection("operational_incidents").doc("TRACKING_STALE-cooldown-booking"); expect((await ref.get()).data()).toMatchObject({ status: "OPEN", occurrenceCount: 2 });
    await ref.update({ status: "RESOLVED", resolvedAt: Timestamp.now(), resolvedBy: "admin-operationsadmin" }); await ingestLocalOperationalEvent({ ...base, idempotencyKey: "cooldown-3" });
    expect((await ref.get()).data()).toMatchObject({ status: "RESOLVED", occurrenceCount: 3, suppressedAfterResolutionCount: 1 });
    await ref.update({ resolvedAt: Timestamp.fromMillis(Date.now() - 31 * 60000) }); await ingestLocalOperationalEvent({ ...base, idempotencyKey: "cooldown-4" }); const reopened = (await ref.get()).data()!;
    expect(reopened).toMatchObject({ status: "OPEN", occurrenceCount: 4 }); expect(reopened.reopenedAt).toBeTruthy(); expect(reopened.resolvedAt).toBeUndefined();
  });

  it("lets an actor read its public ticket but never private Admin notes", async () => {
    const { initializeApp, deleteApp } = await import("firebase/app");
    const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = await import("firebase/auth");
    const { getFirestore, connectFirestoreEmulator, doc, getDoc } = await import("firebase/firestore");
    const app = initializeApp({ projectId: "zipzaver_emulator_for_admin", apiKey: "emulator-only", authDomain: "localhost", appId: "privacy-test" }, "privacy-test");
    const auth = getAuth(app); connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    const clientDb = getFirestore(app); connectFirestoreEmulator(clientDb, "127.0.0.1", 8088);
    await signInWithEmailAndPassword(auth, "customer1@example.test", "Local-Customer-123!");
    expect((await getDoc(doc(clientDb, "support_reports", "report-test-1"))).exists()).toBe(true);
    await expect(getDoc(doc(clientDb, "admin_support_private_notes", "private-test"))).rejects.toBeDefined();
    await deleteApp(app);
  }, 15_000);

  it("runs canonical Admin cancellation locally and blocks post-pickup cancellation", async () => {
    const { FirebaseAdminMutationAdapter } = await import("@/mutations/firebase-admin-adapter");
    const adapter = new FirebaseAdminMutationAdapter(), context = { principal: { uid: "admin-operationsadmin", email: "operationsadmin@admin.example.test", roles: ["operationsAdmin" as const], disabled: false }, permission: "bookings:manage" as const, reason: "Synthetic canonical cancellation", correlationId: "corr-cancel", idempotencyKey: "idem-cancel", requestedAt: new Date().toISOString() };
    const result = await adapter.execute({ action: "booking.intervene", targetType: "booking", targetId: "booking-cancellable-1", payload: {}, context });
    const booking = (await db.collection("bookings").doc("booking-cancellable-1").get()).data()!;
    expect(booking.status).toBe("cancelled"); expect(booking.cancellationAccounting).toMatchObject({ actor: "zipzaver", customerFeePaise: 0, riderEarningPaise: 0, zipzaverRevenuePaise: 0 });
    expect((await adapter.execute({ action: "booking.intervene", targetType: "booking", targetId: "booking-cancellable-1", payload: {}, context })).auditId).toBe(result.auditId);
    await expect(adapter.execute({ action: "booking.intervene", targetType: "booking", targetId: "booking-active-1", payload: {}, context: { ...context, idempotencyKey: "idem-cancel-blocked" } })).rejects.toThrow("Return to Sender");
  });

  it("persists versioned alert settings and protects the last superAdmin", async () => {
    const { FirebaseAdminMutationAdapter } = await import("@/mutations/firebase-admin-adapter"); const adapter = new FirebaseAdminMutationAdapter();
    const principal = { uid: "admin-superadmin", email: "superadmin@admin.example.test", roles: ["superAdmin" as const], disabled: false };
    await adapter.execute({ action: "alert.update", targetType: "alertRule", targetId: "booking-failure-rate", expectedVersion: "0", payload: { threshold: 7, windowMinutes: 20, minimumSampleSize: 12, cooldownMinutes: 30, severity: "CRITICAL" }, context: { principal, permission: "settings:manage", reason: "Synthetic alert update", correlationId: "corr-alert", idempotencyKey: "idem-alert", requestedAt: new Date().toISOString() } });
    expect((await db.collection("admin_alert_settings").doc("booking-failure-rate").get()).data()).toMatchObject({ threshold: 7, adminVersion: 1 });
    await expect(adapter.execute({ action: "admin.disable", targetType: "adminUser", targetId: "admin-superadmin", payload: {}, context: { principal, permission: "admins:manage", reason: "Synthetic last admin protection", correlationId: "corr-admin", idempotencyKey: "idem-admin", requestedAt: new Date().toISOString() } })).rejects.toThrow("last active superAdmin");
  });

  it("approves only a complete canonical KYC case with exactly one audit", async () => {
    const { FirebaseAdminMutationAdapter } = await import("@/mutations/firebase-admin-adapter"), adapter = new FirebaseAdminMutationAdapter();
    const request = { action: "kyc.approve" as const, targetType: "rider" as const, targetId: "rider-test-1", payload: {}, context: { principal: { uid: "admin-kycadmin", email: "kycadmin@admin.example.test", roles: ["kycAdmin" as const], disabled: false }, permission: "kyc:review" as const, reason: "All required emulator documents reviewed", correlationId: "corr-kyc-canonical", idempotencyKey: "idem-kyc-canonical", requestedAt: new Date().toISOString() } };
    const first = await adapter.execute(request), retry = await adapter.execute(request); expect(retry.auditId).toBe(first.auditId);
    expect((await db.collection("riders").doc("rider-test-1").get()).data()).toMatchObject({ kycStatus: "approved", isKycVerified: true, kycReviewerUid: "admin-kycadmin", reviewedSubmissionRevision: 1 });
    expect((await db.collection("rider_applicants").doc("rider-test-1").get()).data()).toMatchObject({ status: "approved", reviewedSubmissionRevision: 1, riderVisibleReason: null });
    expect((await db.collection("admin_audit_logs").where("auditId", "==", first.auditId).get()).size).toBe(1);
    const documents = await db.collection("rider_kyc").doc("rider-test-1").collection("documents").get(); expect(documents.docs.every(document => document.data().reviewStatus === "approved" && document.data().reviewedSubmissionRevision === 1)).toBe(true);
  });

  it("reviews only a resubmitted Rider's selected revision and preserves earlier evidence", async () => {
    const { getKycCase } = await import("@/repositories/firebase/kyc");
    const before = await getKycCase("rider-test-4");
    expect(before).toMatchObject({ state: "pendingReview", submissionRevision: 2, isResubmission: true, complete: true, eligibilityReset: { isKycVerified: false, status: "offline", isAvailable: false, currentBookingId: null } });
    expect(before?.documents.map(document => document.documentId).sort()).toEqual(["kyc-aadhaar-4-new", "kyc-dl-4-new", "kyc-profile-4-new"]);
    const { FirebaseAdminMutationAdapter } = await import("@/mutations/firebase-admin-adapter");
    await new FirebaseAdminMutationAdapter().execute({ action: "kyc.reject", targetType: "rider", targetId: "rider-test-4", payload: { internalNote: "must never propagate" }, context: { principal: { uid: "admin-kycadmin", email: "kycadmin@admin.example.test", roles: ["kycAdmin"], disabled: false }, permission: "kyc:review", reason: "Fresh revision evidence is unclear", correlationId: "corr-kyc-revision", idempotencyKey: "idem-kyc-revision", requestedAt: new Date().toISOString() } });
    const old = await db.collection("rider_kyc").doc("rider-test-4").collection("documents").doc("kyc-aadhaar-4-old").get(), fresh = await db.collection("rider_kyc").doc("rider-test-4").collection("documents").doc("kyc-aadhaar-4-new").get(), applicant = await db.collection("rider_applicants").doc("rider-test-4").get();
    expect(old.data()?.reviewStatus).toBe("rejected"); expect(old.data()?.reviewedSubmissionRevision).toBeUndefined();
    expect(fresh.data()).toMatchObject({ reviewStatus: "rejected", reviewedSubmissionRevision: 2 });
    expect(applicant.data()).toMatchObject({ status: "rejected", riderVisibleReason: "Fresh revision evidence is unclear", reviewedSubmissionRevision: 2 });
    expect(JSON.stringify(applicant.data())).not.toContain("must never propagate");
  });

  it("confirms payment only through the emulator trusted reconciliation transition", async () => {
    const { FirebaseAdminMutationAdapter } = await import("@/mutations/firebase-admin-adapter"), adapter = new FirebaseAdminMutationAdapter();
    const context = { principal: { uid: "admin-financeadmin", email: "financeadmin@admin.example.test", roles: ["financeAdmin" as const], disabled: false }, permission: "settlements:manage" as const, reason: "Synthetic trusted reconciliation", correlationId: "corr-payment", idempotencyKey: "idem-payment", requestedAt: new Date().toISOString() };
    await expect(adapter.execute({ action: "payment.reconcile", targetType: "paymentIntent", targetId: "booking-payment-1_v1", payload: { amountPaise: 3901, trustedReference: "BAD-REF" }, context: { ...context, idempotencyKey: "idem-payment-bad" } })).rejects.toThrow("does not match");
    const result = await adapter.execute({ action: "payment.reconcile", targetType: "paymentIntent", targetId: "booking-payment-1_v1", payload: { amountPaise: 3900, trustedReference: "EMULATOR-TRUSTED-001" }, context });
    expect((await db.collection("payment_intents").doc("booking-payment-1_v1").get()).data()).toMatchObject({ status: "paymentConfirmed", reconciliationSource: "emulatorTrustedSimulator" });
    expect((await db.collection("bookings").doc("booking-payment-1").get()).data()).toMatchObject({ status: "pending", paymentTiming: "prepaid", paymentState: "paymentConfirmed" });
    expect((await db.collection("admin_audit_logs").where("auditId", "==", result.auditId).get()).size).toBe(1);
    await db.collection("bookings").doc("booking-pay-after-test").set({ bookingId:"booking-pay-after-test",userId:"customer-test-1",status:"delivered",paymentTiming:"payAfterDelivery",paymentState:"reconciliationPending",paymentIntentId:"booking-pay-after-test_v1",customerAccounting:{totalPaise:3900} });
    await db.collection("payment_intents").doc("booking-pay-after-test_v1").set({ paymentIntentId:"booking-pay-after-test_v1",bookingId:"booking-pay-after-test",customerId:"customer-test-1",amountPaise:3900,status:"reconciliationPending" });
    await adapter.execute({ action:"payment.reconcile",targetType:"paymentIntent",targetId:"booking-pay-after-test_v1",payload:{amountPaise:3900,trustedReference:"EMULATOR-TRUSTED-POST-001"},context:{...context,correlationId:"corr-payment-post",idempotencyKey:"idem-payment-post"} });
    expect((await db.collection("bookings").doc("booking-pay-after-test").get()).data()).toMatchObject({status:"delivered",paymentTiming:"payAfterDelivery",paymentState:"paymentConfirmed"});
  });
});
