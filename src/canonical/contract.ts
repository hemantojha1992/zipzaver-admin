export const CANONICAL_CONTRACT_VERSION = "phase1-foundation-2026-08-20" as const;
export const RIDER_KYC_STATES = ["draft", "submitted", "pendingReview", "approved", "rejected", "resubmissionRequired"] as const;
export type RiderKycState = typeof RIDER_KYC_STATES[number] | "unknown";
export const KYC_DOCUMENT_TYPES = ["profilePhoto", "aadhaarFront", "drivingLicenceFront"] as const;
export type KycDocumentType = typeof KYC_DOCUMENT_TYPES[number];
export const REQUIRED_RIDER_AGREEMENT_VERSION = "rider-partner-v2-2026-08" as const;
export const REQUIRED_RIDER_AGREEMENT_SHA256 = "988fb87852bca05c2e84a99c15636e990c7bcc948d620dfebcc90dad874c6d30" as const;
export type KycReviewStatus = "pendingReview" | "approved" | "rejected" | "resubmissionRequired" | "superseded" | "unknown";
export const PAYMENT_STATES = ["created", "awaitingPayment", "reconciliationPending", "paymentConfirmed", "paymentFailed", "expired", "cancelled", "refunded"] as const;
export type PaymentState = typeof PAYMENT_STATES[number] | "unknown";
export const SUPPORT_STATUSES = ["open", "inProgress", "resolved", "reopened"] as const;
export type SupportStatus = typeof SUPPORT_STATUSES[number] | "unknown";
export interface CanonicalKycDocument { documentId:string;riderId:string;documentType:KycDocumentType;uploadStatus:string;reviewStatus:KycReviewStatus;version:string;contentType:string;fileSize:number;pageRole:string;createdAt:string|null;updatedAt:string|null;submittedAt:string|null;supersedesDocumentId:string|null }
export interface CanonicalRiderApplicant { applicantId:string;status:RiderKycState;submissionRevision:number;selectedDocumentIds:string[];submittedAt:string|null }
export interface CanonicalKycCase { riderId:string;state:RiderKycState;registrationState:string;submissionRevision:number;submittedAt:string|null;isResubmission:boolean;eligibilityReset:{isKycVerified:boolean;status:string;isAvailable:boolean;currentBookingId:string|null};documents:CanonicalKycDocument[];complete:boolean;missing:KycDocumentType[] }
export interface CanonicalPaymentIntent { paymentIntentId:string;bookingId:string;customerId:string;amountPaise:number;currency:"INR"|"unknown";method:string;status:PaymentState;createdAt:string|null;confirmedAt:string|null;reconciliationSource:string|null;trustedReference:string|null;version:number }
export interface CanonicalSupportReport { reportId:string;reporterUid:string;reporterRole:"customer"|"rider"|"unknown";bookingId:string|null;category:string;categoryVersion:string;description:string;status:SupportStatus;priority:string;assignedAdminUid:string|null;appVersion:string;createdAt:string|null;resolvedAt:string|null }
