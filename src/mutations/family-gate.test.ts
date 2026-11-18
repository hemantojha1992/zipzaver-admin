import { describe, expect, it } from "vitest";
import { MutationsDisabledError, TestMutationGate, mutationFamily } from "./gate";

describe("per-family mutation activation", () => {
  it("maps every operation to its isolated family", () => {
    expect(mutationFamily("support.status.update")).toBe("support");
    expect(mutationFamily("kyc.approve")).toBe("kyc");
    expect(mutationFamily("admin.role.assign")).toBe("admin");
  });

  it("keeps unapproved families disabled under an enabled global gate", () => {
    const gate = new TestMutationGate(true, new Set(["support"]));
    expect(() => gate.assertEnabled("support.note.add")).not.toThrow();
    expect(() => gate.assertEnabled("kyc.approve")).toThrow(MutationsDisabledError);
  });
});
