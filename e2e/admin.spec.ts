import { expect, test, type Page } from "@playwright/test";

type Role = "superAdmin" | "operationsAdmin" | "kycAdmin" | "financeAdmin" | "supportAdmin" | "readOnly";
const password = (role: Role) => `Local-${role}-123!`;
async function login(page: Page, role: Role) {
  await page.goto("/login");
  await page.getByLabel("Admin email").fill(`${role.toLowerCase()}@admin.example.test`);
  await page.getByLabel("Password").fill(password(role));
  await page.getByRole("button", { name: /Sign in securely/ }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
async function mutate(page: Page, audits: string[], action: string, targetType: string, targetId: string, payload: Record<string, unknown> = {}, expectedVersion?: string) {
  const id = crypto.randomUUID();
  const response = await page.request.post("/api/admin/mutations", { headers: { origin: "http://localhost:3000" }, data: { action, targetType, targetId, payload, expectedVersion, reason: "Browser emulator verification", correlationId: id, idempotencyKey: id } });
  expect(response.ok(), `${action}: ${await response.text()}`).toBeTruthy();
  const body = await response.json() as { auditId: string };
  audits.push(body.auditId);
  return body.auditId;
}

test("responsive shell, typed forms, filters, semantics, and drill-downs", async ({ page }) => {
  await login(page, "superAdmin");
  for (const size of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 768, height: 1024 }]) {
    await page.setViewportSize(size);
    await page.goto("/pricing");
    await expect(page.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("button", { name: "Create pricing version" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2)).toBeTruthy();
  }
  await page.goto("/dashboard");
  await page.getByRole("article").filter({ hasText: "Pending / old KYC" }).getByRole("link").click();
  await expect(page).toHaveURL(/\/kyc\?status=pendingReview/);
  await expect(page.getByRole("table").getByText("pendingReview", { exact: true })).toHaveCount(3);
  await page.goto("/bookings/booking-active-1");
  await expect(page.getByText("Payment timing: Pay After Delivery", { exact: true })).toBeVisible();
  await expect(page.getByText("Payment status: Unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Assignment payment readiness: No payment hold on assignment", { exact: true })).toBeVisible();
  await page.goto("/kyc/rider-test-4");
  await expect(page.getByText("Submission revision: 2 (resubmission)")).toBeVisible();
  await expect(page.getByRole("table", { name: "Current submission's required KYC document metadata" }).getByRole("row")).toHaveCount(4);
  await page.goto("/agreements");
  await expect(page.getByText("rider-partner-v2-2026-08", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("988fb87852bca05c2e84a99c15636e990c7bcc948d620dfebcc90dad874c6d30", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("table").locator("tbody").getByText("Current", { exact: true })).toHaveCount(1);
  await expect(page.getByRole("table").locator("tbody").getByText("Reaccept required", { exact: true })).toHaveCount(1);
  await page.goto("/dashboard");
  await page.getByRole("article").filter({ hasText: "Critical incidents" }).getByRole("link").click();
  await expect(page).toHaveURL(/severity=CRITICAL/);
  await expect(page.getByRole("table").getByText("CRITICAL", { exact: true })).toBeVisible();
  await page.goto("/dashboard");
  await page.getByRole("article").filter({ hasText: "Urgent support" }).getByRole("link").click();
  await expect(page).toHaveURL(/priority=urgent/);
  await expect(page.getByRole("table").getByText("urgent", { exact: true })).toBeVisible();
});

const cases: Array<{ role: Role; visible: string; forbiddenRoute: string; deniedAction: [string, string, string] }> = [
  { role: "readOnly", visible: "Bookings", forbiddenRoute: "/admin-users", deniedAction: ["customer.block", "customer", "customer-test-1"] },
  { role: "supportAdmin", visible: "Support Queue", forbiddenRoute: "/kyc", deniedAction: ["kyc.approve", "rider", "rider-test-1"] },
  { role: "kycAdmin", visible: "KYC Review", forbiddenRoute: "/adjustments", deniedAction: ["settlement.adjustment.request", "settlement", "denied-adjustment"] },
  { role: "financeAdmin", visible: "Adjustments", forbiddenRoute: "/admin-users", deniedAction: ["admin.role.change", "adminUser", "admin-operationsadmin"] },
  { role: "operationsAdmin", visible: "Customers", forbiddenRoute: "/admin-users", deniedAction: ["admin.role.change", "adminUser", "admin-operationsadmin"] },
  { role: "superAdmin", visible: "Admin Users", forbiddenRoute: "", deniedAction: ["", "", ""] },
];
for (const item of cases) test(`${item.role} browser role boundary`, async ({ page }) => {
  await login(page, item.role);
  await expect(page.getByRole("link", { name: new RegExp(item.visible) })).toBeVisible();
  if (item.forbiddenRoute) {
    await page.goto(item.forbiddenRoute);
    await expect(page).toHaveURL(/\/dashboard\?error=forbidden$/);
    const [action, targetType, targetId] = item.deniedAction;
    const id = crypto.randomUUID();
    const response = await page.request.post("/api/admin/mutations", { headers: { origin: "http://localhost:3000" }, data: { action, targetType, targetId, payload: {}, reason: "Expected role denial", correlationId: id, idempotencyKey: id } });
    expect(response.status()).toBe(403);
  } else {
    await page.goto("/admin-users");
    await expect(page.getByRole("heading", { name: "Admin Users" })).toBeVisible();
  }
  const documentResponse = await page.request.get("/api/admin/kyc-documents/rider-test-1/kyc-profile-1");
  expect(documentResponse.status()).toBe(["superAdmin", "kycAdmin"].includes(item.role) ? 200 : 403);
});

test("secure KYC documents and CSRF stay server enforced", async ({ page }) => {
  await login(page, "superAdmin");
  const audits: string[] = [];
  for (const id of ["kyc-profile-1", "kyc-aadhaar-1", "kyc-dl-1"]) {
    const response = await page.request.get(`/api/admin/kyc-documents/rider-test-1/${id}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  expect((await page.request.get("/api/admin/kyc-documents/rider-test-4/kyc-aadhaar-4-old")).status()).toBe(404);
  const csrf = await page.request.post("/api/admin/mutations", { headers: { origin: "http://127.0.0.1:3000" }, data: {} });
  expect(csrf.status()).toBe(403);
  await mutate(page, audits, "kyc.reject", "rider", "rider-test-3");
  await mutate(page, audits, "kyc.resubmission", "rider", "rider-test-4");
  await page.goto("/audit-log");
  for (const audit of audits) await expect(page.getByText(audit, { exact: true })).toHaveCount(1);
});

test("full canonical emulator workflow persists exactly one audit per mutation", async ({ page }) => {
  await login(page, "superAdmin");
  const audits: string[] = [];
  await page.goto("/kyc/rider-test-1");
  await expect(page.getByRole("button", { name: "Approve KYC" })).toBeVisible();
  await mutate(page, audits, "kyc.approve", "rider", "rider-test-1");
  await page.goto("/customers/customer-test-1");
  await mutate(page, audits, "customer.block", "customer", "customer-test-1");
  await mutate(page, audits, "customer.unblock", "customer", "customer-test-1");
  await page.goto("/riders/rider-test-1");
  await mutate(page, audits, "rider.block", "rider", "rider-test-1");
  await mutate(page, audits, "rider.unblock", "rider", "rider-test-1");
  await page.goto("/bookings/booking-cancellable-1");
  await mutate(page, audits, "booking.intervene", "booking", "booking-cancellable-1");
  await page.goto("/disputes/report-test-1");
  await mutate(page, audits, "support.status.update", "supportTicket", "report-test-1", { assignedAdminUid: "admin-supportadmin", priority: "high", status: "inProgress" });
  await mutate(page, audits, "support.note.add", "supportTicket", "browser-note-1", { reportId: "report-test-1", note: "Browser private note" });
  await mutate(page, audits, "support.status.update", "supportTicket", "report-test-1", { status: "resolved" }, "1");
  await page.goto("/adjustments");
  await mutate(page, audits, "settlement.adjustment.request", "settlement", "browser-adjustment-1", { riderId: "rider-test-2", amountPaise: 100, cycleReference: "2026-08-17" });
  await page.goto("/payments");
  await mutate(page, audits, "payment.reconcile", "paymentIntent", "booking-payment-1_v1", { amountPaise: 3900, trustedReference: "BROWSER-TRUSTED-001" });
  const pricing = { baseDistanceMeters: 3000, baseFarePaise: 3900, incrementalPerKmPaise: 900, effectiveVersion: "browser-v1" };
  await page.goto("/pricing");
  await mutate(page, audits, "pricing.create", "pricingConfig", "browser-price-1", pricing);
  await mutate(page, audits, "pricing.update", "pricingConfig", "browser-price-1", { ...pricing, effectiveVersion: "browser-v2" }, "1");
  await mutate(page, audits, "pricing.activate", "pricingConfig", "browser-price-1", {}, "2");
  await mutate(page, audits, "pricing.deactivate", "pricingConfig", "browser-price-1", {}, "3");
  const campaign = { title: "Browser campaign", description: "Synthetic", city: "Ahmedabad", startAt: "2026-08-21T00:00:00.000Z", endAt: "2026-08-25T00:00:00.000Z", status: "draft", eligibilityRules: ["completed"], milestones: [{ eligibleCompletedRides: 10, bonusPaise: 20000 }, { eligibleCompletedRides: 20, bonusPaise: 50000 }], payoutSemantics: "TOTAL_AT_MILESTONE", terms: "Local" };
  await page.goto("/incentives");
  await mutate(page, audits, "incentive.create", "incentiveCampaign", "browser-campaign-1", campaign);
  await mutate(page, audits, "incentive.update", "incentiveCampaign", "browser-campaign-1", { ...campaign, description: "Synthetic edited" }, "1");
  await mutate(page, audits, "incentive.activate", "incentiveCampaign", "browser-campaign-1", {}, "2");
  await page.goto("/service-areas");
  const area = { city: "Ahmedabad", zoneName: "Browser Zone", effectiveStart: "2026-08-20", operationalNotes: "Local", geometryReference: "none" };
  await mutate(page, audits, "serviceArea.create", "serviceArea", "browser-area-1", area);
  await mutate(page, audits, "serviceArea.update", "serviceArea", "browser-area-1", { ...area, operationalNotes: "Edited" }, "1");
  await mutate(page, audits, "serviceArea.enable", "serviceArea", "browser-area-1", {}, "2");
  await mutate(page, audits, "serviceArea.disable", "serviceArea", "browser-area-1", {}, "3");
  await page.goto("/incidents");
  await mutate(page, audits, "incident.acknowledge", "incident", "incident-test-1");
  await mutate(page, audits, "incident.resolve", "incident", "incident-test-1", { resolutionSummary: "Browser verification resolved" }, "1");
  await page.goto("/alert-settings");
  await mutate(page, audits, "alert.update", "alertRule", "booking-failure-rate", { enabled: true, threshold: 6, windowMinutes: 15, minimumSampleSize: 10, severity: "WARNING", cooldownMinutes: 30 }, "0");
  await page.goto("/admin-users");
  await mutate(page, audits, "admin.role.assign", "adminUser", "admin-readonly", { role: "supportAdmin" });
  await mutate(page, audits, "admin.role.change", "adminUser", "admin-readonly", { role: "readOnly" }, "1");
  await mutate(page, audits, "admin.disable", "adminUser", "admin-readonly", {}, "2");
  await mutate(page, audits, "admin.role.revoke", "adminUser", "admin-readonly", {}, "3");
  expect(new Set(audits).size).toBe(audits.length);
  await page.goto("/audit-log");
  await expect(page.getByRole("table", { name: "Administrative audit events" })).toBeVisible();
  for (const audit of audits) await expect(page.getByText(audit, { exact: true })).toHaveCount(1);
});
