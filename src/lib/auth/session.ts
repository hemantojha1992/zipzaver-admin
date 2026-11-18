import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import { ADMIN_SESSION_COOKIE } from "./constants";
import { can, isAdminRole, type Permission } from "./roles";
import type { AdminPrincipal } from "./authorization";

export async function verifyAdminSession(cookie: string): Promise<AdminPrincipal> {
  const auth = getFirebaseAdminAuth(), decoded = await auth.verifySessionCookie(cookie, true);
  if (decoded.admin !== true || !isAdminRole(decoded.adminRole)) throw new Error("Required Admin claims are missing.");
  const user = await auth.getUser(decoded.uid);
  if (user.disabled) throw new Error("Admin account is disabled.");
  return { uid: decoded.uid, email: user.email ?? "", roles: [decoded.adminRole], disabled: false };
}

export async function requireAdminPrincipal(permission?: Permission): Promise<AdminPrincipal> {
  const value = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;
  if (!value) redirect("/login");
  let principal: AdminPrincipal;
  try { principal = await verifyAdminSession(value); }
  catch { redirect("/login?error=session"); }
  if (permission && !principal.roles.some(role => can(role, permission))) redirect("/dashboard?error=forbidden");
  return principal;
}
