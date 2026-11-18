/* eslint-disable @typescript-eslint/no-require-imports */
const { PROJECT_ID } = require("./emulator-env.cjs");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);
const auth = getAuth(app);
const now = Timestamp.fromDate(new Date("2026-08-17T05:30:00.000Z"));
const earlier = Timestamp.fromDate(new Date("2026-08-17T04:30:00.000Z"));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const roles = ["superAdmin", "operationsAdmin", "kycAdmin", "financeAdmin", "supportAdmin", "readOnly"];
const records = {
  users: { "customer-test-1": { uid: "customer-test-1", name: "Test Customer", phoneNumber: "+919000000001", email: "customer1@example.test", isBlocked: false, profileCompleted: true, createdAt: earlier, updatedAt: now, lastLoginAt: now } },
  riders: { "rider-test-1": { riderId: "rider-test-1", fullName: "Test Rider Pending", phoneNumber: "+919000000002", email: "rider1@example.test", registrationState: "submitted", vehicleType: "bike", vehicleNumber: "GJ01TEST1", kycStatus: "pendingReview", isKycVerified: false, isBlocked: false, status: "offline", isAvailable: false, currentBookingId: null, agreementAcceptance: { status: "notAccepted" }, kycSubmittedAt: earlier, createdAt: earlier, updatedAt: now }, "rider-test-2": { riderId: "rider-test-2", fullName: "Test Rider Active", phoneNumber: "+919000000003", registrationState: "completed", vehicleType: "scooter", vehicleNumber: "GJ01TEST2", kycStatus: "approved", isKycVerified: true, isBlocked: false, status: "busy", isAvailable: false, currentBookingId: "booking-active-1", agreementAcceptance: { status: "accepted", agreementVersion: "rider-partner-v1-2026-08", agreementLanguage: "en", acceptedAt: earlier }, createdAt: earlier, updatedAt: now }, "rider-test-3": { riderId: "rider-test-3", fullName: "Test Rider Reject", phoneNumber: "+919000000004", registrationState: "submitted", vehicleType: "bike", vehicleNumber: "GJ01TEST3", kycStatus: "pendingReview", isKycVerified: false, isBlocked: false, status: "offline", isAvailable: false, currentBookingId: null, agreementAcceptance: { status: "notAccepted" }, kycSubmittedAt: earlier, createdAt: earlier, updatedAt: now }, "rider-test-4": { riderId: "rider-test-4", fullName: "Test Rider Resubmit", phoneNumber: "+919000000005", registrationState: "submitted", vehicleType: "bike", vehicleNumber: "GJ01TEST4", kycStatus: "pendingReview", isKycVerified: false, isBlocked: false, status: "offline", isAvailable: false, currentBookingId: null, agreementAcceptance: { status: "notAccepted" }, kycSubmittedAt: earlier, createdAt: earlier, updatedAt: now } },
  rider_private: { "rider-test-1": { aadhaarNumber: "299999999999", drivingLicenseNumber: "GJ-TEST-0001", bankAccountNumber: "000000000001", bankIfsc: "TEST0000001", consentAccepted: true, bankVerificationStatus: "pending", createdAt: earlier, updatedAt: now } },
  rider_applicants: {
    "rider-test-1": { applicantId: "rider-test-1", status: "pendingReview", submissionRevision: 1, selectedDocumentIds: ["kyc-profile-1", "kyc-aadhaar-1", "kyc-dl-1"], submittedAt: earlier, updatedAt: now },
    "rider-test-3": { applicantId: "rider-test-3", status: "pendingReview", submissionRevision: 1, selectedDocumentIds: ["kyc-profile-3", "kyc-aadhaar-3", "kyc-dl-3"], submittedAt: earlier, updatedAt: now },
    "rider-test-4": { applicantId: "rider-test-4", status: "pendingReview", submissionRevision: 2, selectedDocumentIds: ["kyc-profile-4-new", "kyc-aadhaar-4-new", "kyc-dl-4-new"], submittedAt: now, updatedAt: now },
  },
  rider_applicant_private: { "rider-test-1": { applicantId: "rider-test-1", aadhaarNumber: "288888888888", bankAccountNumber: "000000000009", consentAccepted: true, updatedAt: now } },
  rider_agreement_acceptances: {
    "rider-test-2_rider-partner-v1-2026-08": { riderId: "rider-test-2", acceptedByUid: "rider-test-2", agreementVersion: "rider-partner-v1-2026-08", contentHash: "legacy-test-hash", agreementLanguage: "en", status: "accepted", acceptedAt: earlier },
    "rider-test-2_rider-partner-v2-2026-08": { riderId: "rider-test-2", acceptedByUid: "rider-test-2", agreementVersion: "rider-partner-v2-2026-08", contentHash: "988fb87852bca05c2e84a99c15636e990c7bcc948d620dfebcc90dad874c6d30", agreementLanguage: "en", status: "accepted", acceptedAt: now },
  },
  bookings: { "booking-active-1": { bookingId: "booking-active-1", userId: "customer-test-1", riderId: "rider-test-2", riderName: "Test Rider Active", customerPhone: "+919000000001", pickup: { address: "Test Pickup", latitude: 23.02, longitude: 72.57 }, drop: { address: "Test Drop", latitude: 23.04, longitude: 72.59 }, status: "inTransit", riderAssigned: true, riderAssignedAt: earlier, pickedUpAt: earlier, createdAt: earlier, updatedAt: earlier, customerAccounting: { totalPaise: 3900 } }, "booking-cancellable-1": { bookingId: "booking-cancellable-1", userId: "customer-test-1", status: "searching", riderAssigned: false, createdAt: earlier, updatedAt: earlier, customerAccounting: { totalPaise: 3900 } }, "booking-complete-1": { bookingId: "booking-complete-1", userId: "customer-test-1", riderId: "rider-test-2", pickup: { address: "Test A" }, drop: { address: "Test B" }, status: "delivered", deliveredAt: now, createdAt: earlier, updatedAt: now, customerAccounting: { totalPaise: 4800 } } },
  rider_offers: { "offer-test-1": { offerId: "offer-test-1", riderId: "rider-test-2", bookingId: "booking-active-1", status: "accepted", offeredAt: earlier, respondedAt: earlier } },
  rider_settlement_entries: { "settlement-test-1": { riderId: "rider-test-2", bookingId: "booking-complete-1", entryType: "delivery", amountPaise: 3900, status: "unsettled", settlementWeekId: "2026-08-17", completedAt: now } },
  support_reports: { "report-test-1": { reportId: "report-test-1", reporterRole: "customer", reporterUid: "customer-test-1", bookingId: "booking-active-1", category: "riderNotMoving", categoryVersion: "customer-v1", description: "Synthetic emulator report", priority: "urgent", status: "open", app: "customer", appVersion: "1.0.0-test", screenContext: "tracking", createdAt: earlier, updatedAt: now } },
  payment_intents: { "booking-payment-1_v1": { paymentIntentId: "booking-payment-1_v1", bookingId: "booking-payment-1", customerId: "customer-test-1", amountPaise: 3900, currency: "INR", method: "upi", payeeConfigVersion: "emulator-v1", status: "reconciliationPending", version: 1, createdAt: earlier, updatedAt: now } },
  rider_kyc: { "rider-test-1": { riderId: "rider-test-1", registrationState: "submitted", kycStatus: "pendingReview", submittedAt: earlier, updatedAt: now }, "rider-test-3": { riderId: "rider-test-3", registrationState: "submitted", kycStatus: "pendingReview", submittedAt: earlier, updatedAt: now }, "rider-test-4": { riderId: "rider-test-4", registrationState: "submitted", kycStatus: "pendingReview", submittedAt: earlier, updatedAt: now } },
  admin_emulator_kyc_blobs: { "kyc-profile-1": { contentType: "image/png", contentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }, "kyc-aadhaar-1": { contentType: "image/png", contentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" }, "kyc-dl-1": { contentType: "image/png", contentBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=" } },
  operational_incidents: { "incident-test-1": { incidentId: "incident-test-1", incidentType: "TRACKING_STALE", severity: "CRITICAL", status: "OPEN", deduplicationKey: "TRACKING_STALE:booking-active-1", bookingId: "booking-active-1", riderId: "rider-test-2", customerId: "customer-test-1", firstDetectedAt: earlier, lastDetectedAt: now, occurrenceCount: 1, currentState: "inTransit" } },
  operational_events: { "event-test-1": { eventId: "event-test-1", eventType: "BOOKING_ATTEMPT", actorType: "customer", actorId: "customer-test-1", app: "customer", appVersion: "1.0.0-test", operation: "createBooking", safeErrorCode: "NONE", safeClassification: "ATTEMPT", createdAt: now } },
  operational_daily_aggregates: { [today]: { date: today, bookingAttempts: 3, bookingsCreated: 3, bookingFailures: 0, offersSent: 1, offersAccepted: 1, offersRejected: 0, offersExpired: 0, offerFailures: 0, deliveriesStarted: 2, deliveriesActive: 1, deliveriesCompleted: 1, deliveriesCancelled: 0, deliveriesReturned: 0, deliveriesStuck: 1, otpSuccess: 1, otpFailures: 0, otpBlocked: 0, kycSubmissions: 1, kycSuccess: 0, kycFailures: 0, trackingStale: 1, updatedAt: now } },
  admin_pricing_configs: { "standard-test-v1": { configId: "standard-test-v1", baseDistanceMeters: 3000, baseFarePaise: 3900, incrementalPerKmPaise: 900, effectiveVersion: "test-v1", enabled: true, createdAt: now } },
  admin_incentive_campaigns: { "campaign-test-1": { campaignId: "campaign-test-1", title: "Synthetic Test Campaign", city: "Ahmedabad", status: "draft", payoutSemantics: "TOTAL_AT_MILESTONE", milestones: [{ eligibleCompletedRides: 10, bonusPaise: 20000 }], startAt: earlier, endAt: now, createdAt: now } },
  admin_service_areas: { "ahmedabad-test": { areaId: "ahmedabad-test", city: "Ahmedabad", zoneName: "Test Zone", serviceType: "parcel", active: true, effectiveStart: "2026-08-17", operationalNotes: "Synthetic emulator fixture", createdAt: now } },
  admin_audit_logs: { "audit-seed-1": { auditId: "audit-seed-1", adminUid: "admin-superadmin", adminRole: "superAdmin", action: "fixture.seed", targetType: "emulator", targetId: PROJECT_ID, reason: "Deterministic synthetic seed", correlationId: "seed-20260817", result: "applied", createdAt: now } },
  admin_alert_settings: { "booking-failure-rate": { ruleId: "booking-failure-rate", type: "BOOKING_FAILURE_RATE", enabled: true, threshold: 5, windowMinutes: 15, minimumSampleSize: 10, severity: "WARNING", cooldownMinutes: 30, adminVersion: 0, createdAt: now }, "incident-reopen": { ruleId: "incident-reopen", type: "INCIDENT_REOPEN", enabled: true, threshold: 1, windowMinutes: 30, minimumSampleSize: 1, severity: "WARNING", cooldownMinutes: 30, adminVersion: 0, createdAt: now } },
  admin_users: { "admin-superadmin": { uid: "admin-superadmin", role: "superAdmin", active: true, claimVersion: 1, sessionVersion: 1, adminVersion: 0 }, "admin-operationsadmin": { uid: "admin-operationsadmin", role: "operationsAdmin", active: true, claimVersion: 1, sessionVersion: 1, adminVersion: 0 } },
};

async function main() {
  for (const role of roles) {
    const uid = `admin-${role.toLowerCase()}`;
    await auth.createUser({ uid, email: `${role.toLowerCase()}@admin.example.test`, password: `Local-${role}-123!`, displayName: `Local ${role}` });
    await auth.setCustomUserClaims(uid, { admin: true, adminRole: role });
  }
  await auth.createUser({ uid: "customer-test-1", email: "customer1@example.test", password: "Local-Customer-123!" });
  const batch = db.batch();
  for (const [collection, documents] of Object.entries(records)) for (const [id, data] of Object.entries(documents)) batch.set(db.collection(collection).doc(id), data);
  batch.set(db.collection("bookings").doc("booking-payment-1"), { bookingId: "booking-payment-1", userId: "customer-test-1", status: "awaitingPayment", paymentTiming: "prepaid", paymentState: "reconciliationPending", paymentIntentId: "booking-payment-1_v1", customerAccounting: { totalPaise: 3900 }, createdAt: earlier, updatedAt: now });
  const documentTypes = [["profilePhoto", "profile"], ["aadhaarFront", "front"], ["drivingLicenceFront", "front"]];
  for (const riderNumber of ["1", "3"]) for (const [documentType, pageRole] of documentTypes) {
    const short = documentType === "profilePhoto" ? "profile" : documentType === "aadhaarFront" ? "aadhaar" : "dl", documentId = `kyc-${short}-${riderNumber}`, riderId = `rider-test-${riderNumber}`;
    batch.set(db.collection("rider_kyc").doc(riderId).collection("documents").doc(documentId), { documentId, riderId, documentType, storagePath: `rider_kyc/${riderId}/${documentType}/opaque-${short}`, uploadStatus: "uploaded", reviewStatus: "pendingReview", version: "rider-kyc-v1", contentType: "image/png", fileSize: 68, pageRole, createdAt: earlier, updatedAt: now, submittedAt: earlier });
  }
  for (const [documentType, pageRole] of documentTypes) {
    const short = documentType === "profilePhoto" ? "profile" : documentType === "aadhaarFront" ? "aadhaar" : "dl", riderId = "rider-test-4", oldId = `kyc-${short}-4-old`, newId = `kyc-${short}-4-new`;
    batch.set(db.collection("rider_kyc").doc(riderId).collection("documents").doc(oldId), { documentId: oldId, riderId, documentType, storagePath: `rider_kyc/${riderId}/${documentType}/old`, uploadStatus: "uploaded", reviewStatus: "rejected", version: "rider-kyc-v1", contentType: "image/png", fileSize: 68, pageRole, createdAt: earlier, updatedAt: earlier, submittedAt: earlier });
    batch.set(db.collection("rider_kyc").doc(riderId).collection("documents").doc(newId), { documentId: newId, riderId, documentType, storagePath: `rider_kyc/${riderId}/${documentType}/new`, uploadStatus: "uploaded", reviewStatus: "pendingReview", version: "rider-kyc-v1", contentType: "image/png", fileSize: 68, pageRole, createdAt: now, updatedAt: now, submittedAt: now, supersedesDocumentId: oldId });
  }
  batch.set(db.collection("bookings").doc("booking-active-1").collection("tracking").doc("current"), { riderId: "rider-test-2", latitude: 23.03, longitude: 72.58, updatedAt: earlier });
  await batch.commit();
  console.log(`Seeded ${PROJECT_ID} with synthetic fixtures and ${roles.length} Admin roles.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
