"use client";
import { useRef, useState } from "react";
import type { MutationAction, TargetType } from "@/mutations/contracts";

type State = { kind: "idle" | "loading" | "success" | "error"; message?: string };
export function ControlledAction({ title, description, actionLabel, reasonRequired = true, enabled = false, disabledReason = "Available only with the isolated Admin emulator mutation gates enabled.", action, targetType, targetId, payload = {}, expectedVersion }: { title: string; description: string; actionLabel: string; reasonRequired?: boolean; enabled?: boolean; disabledReason?: string; action?: MutationAction; targetType?: TargetType; targetId?: string; payload?: Record<string, unknown>; expectedVersion?: string }) {
  const dialog = useRef<HTMLDialogElement>(null), opener = useRef<HTMLButtonElement>(null), [reason, setReason] = useState(""), [state, setState] = useState<State>({ kind: "idle" });
  const functional = enabled && Boolean(action && targetType && targetId);
  async function submit() {
    if (!functional || !action || !targetType || !targetId) return;
    setState({ kind: "loading" }); const operationId = crypto.randomUUID();
    try {
      const response = await fetch("/api/admin/mutations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, targetType, targetId, payload, expectedVersion, reason, correlationId: operationId, idempotencyKey: operationId }) });
      const body = await response.json() as { status?: string; auditId?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message || "The operation could not be completed safely.");
      setState({ kind: "success", message: `${body.status === "idempotent" ? "Already applied" : "Applied"}. Audit ${body.auditId}.` });
    } catch (error) { setState({ kind: "error", message: error instanceof Error ? error.message : "The operation could not be completed safely." }); }
  }
  const slug = actionLabel.toLowerCase().replaceAll(" ", "-");
  return <section className="action-card"><div><h3>{title}</h3><p>{description}</p></div><button ref={opener} type="button" disabled={!functional} aria-describedby={!functional ? `${slug}-disabled` : undefined} onClick={() => { setState({ kind: "idle" }); dialog.current?.showModal(); }}>{actionLabel}</button>{!functional && <span id={`${slug}-disabled`} className="security-note">{disabledReason}</span>}<dialog ref={dialog} className="action-dialog" onClose={() => opener.current?.focus()}><form method="dialog"><h2>Confirm {actionLabel}</h2><p>{description}</p>{reasonRequired && <label htmlFor={`${slug}-reason`}>Reason<textarea id={`${slug}-reason`} value={reason} onChange={e => setReason(e.target.value)} required minLength={5} aria-describedby={`${slug}-reason-help`}/><small id={`${slug}-reason-help`}>At least five characters; stored in the safe audit record.</small></label>}<div className="dialog-actions"><button value="cancel" disabled={state.kind === "loading"}>Cancel</button><button type="button" onClick={submit} disabled={!functional || state.kind === "loading" || reasonRequired && reason.trim().length < 5}>{state.kind === "loading" ? "Applying…" : "Confirm"}</button></div>{state.message && <p className={state.kind === "error" ? "state-error" : "security-note"} role="status">{state.message}</p>}</form></dialog></section>;
}
export function MutationDisabledBanner({ emulator = false }: { emulator?: boolean }) { return <div className="placeholder-callout"><strong>{emulator ? "Isolated emulator operations" : "Production mutations disabled"}</strong><br/>{emulator ? "Writes are restricted server-side to the non-production emulator project and are audited." : "Start with npm run dev:emulator to exercise local operations. Production remains fail-closed."}</div>; }
