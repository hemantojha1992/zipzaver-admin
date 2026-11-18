import type { AuditEvent, AuditSink, MutationRequest } from "./contracts";

const forbidden = /otp|token|aadhaar|bank|ifsc|upi|document|secret/i;
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([key]) => !forbidden.test(key)).map(([key, item]) => [key, sanitize(item)]));
  if (typeof value === "string" && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}
export function safeAuditDiff(diff: Readonly<Record<string, unknown>> | undefined) { return diff ? sanitize(diff) as Record<string, unknown> : undefined; }
export function createAuditEvent(request: MutationRequest, result: AuditEvent["result"], safeDiff?: Readonly<Record<string, unknown>>, auditId = crypto.randomUUID()): AuditEvent {
  return { auditId, adminUid: request.context.principal.uid, adminRole: request.context.principal.roles[0]!, action: request.action, targetType: request.targetType, targetId: request.targetId, reason: request.context.reason, correlationId: request.context.correlationId, timestamp: new Date().toISOString(), result, safeDiff: safeAuditDiff(safeDiff) };
}
export class InMemoryAuditSink implements AuditSink { readonly events: AuditEvent[] = []; async append(event: AuditEvent) { this.events.push(event); } }
