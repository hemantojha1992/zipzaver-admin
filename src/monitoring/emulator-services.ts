import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/lib/firebase/admin";

const EMULATOR_PROJECT = "zipzaver_emulator_for_admin";
const clientAllowed = new Set(["BOOKING_ATTEMPT", "BOOKING_CREATE_FAILED", "RIDER_REGISTRATION_FAILED", "RIDER_OFFER_FAILED", "OTP_VERIFY_FAILED", "DELIVERY_COMPLETION_FAILED", "KYC_SUBMISSION_FAILED", "TRACKING_STALE"]);
const backendOnly = /(_SUCCEEDED|_CREATED|_ACCEPTED|_COMPLETION_SUCCEEDED)$/;
const forbidden = /otp(value|digits|hash|salt)?|token|authorization|password|aadhaar|bank|ifsc|upi|document|secret|imei|advertising|latitude|longitude/i;
const incidentTypes = new Set(["BOOKING_CREATE_FAILED", "RIDER_OFFER_FAILED", "OTP_VERIFY_FAILED", "DELIVERY_COMPLETION_FAILED", "KYC_SUBMISSION_FAILED", "TRACKING_STALE"]);
const metric: Record<string, string> = { BOOKING_ATTEMPT: "bookingAttempts", BOOKING_CREATED: "bookingsCreated", BOOKING_CREATE_FAILED: "bookingFailures", RIDER_OFFER_SENT: "offersSent", RIDER_OFFER_ACCEPTED: "offersAccepted", RIDER_OFFER_REJECTED: "offersRejected", RIDER_OFFER_EXPIRED: "offersExpired", RIDER_OFFER_FAILED: "offerFailures", OTP_VERIFY_SUCCEEDED: "otpSuccess", OTP_VERIFY_FAILED: "otpFailures", OTP_VERIFY_BLOCKED: "otpBlocked", KYC_SUBMISSION_SUCCEEDED: "kycSubmissions", KYC_SUBMISSION_FAILED: "kycFailures", DELIVERY_COMPLETION_SUCCEEDED: "deliveriesCompleted", DELIVERY_COMPLETION_FAILED: "deliveryFailures" };

export interface LocalOperationalEventInput { eventType: string; source: "client" | "backend"; actorType: "customer" | "rider" | "system"; actorId: string; app: "customer" | "rider" | "backend"; appVersion?: string; operation: string; safeErrorCode: string; safeClassification: string; idempotencyKey: string; bookingId?: string; riderId?: string; customerId?: string; context?: Record<string, unknown> }

function assertEmulator() {
  const project = process.env.ZIPZAVER_FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  if (project !== EMULATOR_PROJECT || !process.env.FIRESTORE_EMULATOR_HOST) throw new Error("EMULATOR_ONLY_OPERATION");
}
function sanitize(context: Record<string, unknown> = {}) { return Object.fromEntries(Object.entries(context).filter(([key]) => !forbidden.test(key))); }

export async function ingestLocalOperationalEvent(input: LocalOperationalEventInput) {
  assertEmulator();
  if (!input.actorId || !input.idempotencyKey || !input.operation) throw new Error("INVALID_EVENT_CONTEXT");
  if (input.source === "client" && (!clientAllowed.has(input.eventType) || backendOnly.test(input.eventType))) throw new Error("BACKEND_AUTHORITATIVE_EVENT_REQUIRED");
  const db = getFirebaseAdminFirestore();
  const eventId = `event-${input.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const eventRef = db.collection("operational_events").doc(eventId);
  const day = new Date().toISOString().slice(0, 10);
  const aggregateRef = db.collection("operational_daily_aggregates").doc(day);
  const incidentKey = `${input.eventType}:${input.bookingId ?? input.actorId}`;
  const incidentRef = db.collection("operational_incidents").doc(incidentKey.replace(/[^a-zA-Z0-9_-]/g, "-"));
  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(eventRef);
    if (existing.exists) return { status: "idempotent" as const, eventId };
    const priorIncident = incidentTypes.has(input.eventType) ? await transaction.get(incidentRef) : null;
    const reopenRule = incidentTypes.has(input.eventType) ? await transaction.get(db.collection("admin_alert_settings").doc("incident-reopen")) : null;
    const createdAt = Timestamp.now();
    transaction.create(eventRef, { ...input, context: sanitize(input.context), eventId, createdAt });
    if (metric[input.eventType]) transaction.set(aggregateRef, { date: day, [metric[input.eventType]]: FieldValue.increment(1), updatedAt: createdAt }, { merge: true });
    if (incidentTypes.has(input.eventType)) {
      if (priorIncident?.exists) { const prior=priorIncident.data()!,cooldown=Math.max(1,Number(reopenRule?.data()?.cooldownMinutes??30)),resolvedAt=prior.resolvedAt instanceof Timestamp?prior.resolvedAt.toMillis():0,within=prior.status==="RESOLVED"&&resolvedAt>0&&createdAt.toMillis()-resolvedAt<cooldown*60000;if(within)transaction.update(incidentRef,{lastDetectedAt:createdAt,occurrenceCount:FieldValue.increment(1),suppressedAfterResolutionCount:FieldValue.increment(1)});else if(prior.status==="RESOLVED")transaction.update(incidentRef,{lastDetectedAt:createdAt,occurrenceCount:FieldValue.increment(1),status:"OPEN",reopenedAt:createdAt,resolvedAt:FieldValue.delete(),resolvedBy:FieldValue.delete(),resolutionSummary:FieldValue.delete()});else transaction.update(incidentRef,{lastDetectedAt:createdAt,occurrenceCount:FieldValue.increment(1)}); }
      else transaction.create(incidentRef, { incidentId: incidentRef.id, incidentType: input.eventType, severity: input.eventType === "TRACKING_STALE" ? "WARNING" : "WARNING", status: "OPEN", deduplicationKey: incidentKey, bookingId: input.bookingId ?? null, customerId: input.customerId ?? null, riderId: input.riderId ?? null, firstDetectedAt: createdAt, lastDetectedAt: createdAt, occurrenceCount: 1, currentState: input.safeClassification });
    }
    return { status: "applied" as const, eventId };
  });
}
