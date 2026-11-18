import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdminAuth } from "@/lib/firebase/admin";
import {
    ADMIN_SESSION_COOKIE,
    ADMIN_SESSION_MAX_AGE_MS
} from "@/lib/auth/constants";
import { isAdminRole } from "@/lib/auth/roles";

export async function POST(request: NextRequest) {
    if (request.headers.get("origin") !== request.nextUrl.origin) {
        return NextResponse.json(
            { error: "Invalid request origin." },
            { status: 403 }
        );
    }

    try {
        const body: unknown = await request.json();

        const token =
            typeof body === "object" &&
            body !== null &&
            "idToken" in body
                ? (body as { idToken?: unknown }).idToken
                : null;

        if (typeof token !== "string") {
            return NextResponse.json(
                { error: "ID token required." },
                { status: 400 }
            );
        }

        // Firebase Admin initialize
        const auth = getFirebaseAdminAuth();

        console.log("Firebase Admin initialized successfully.");

        // Verify Firebase ID token
        const decoded = await auth.verifyIdToken(token, true);

        console.log("Firebase token verified:", {
            uid: decoded.uid,
            email: decoded.email,
            admin: decoded.admin,
            adminRole: decoded.adminRole
        });

        // Check admin claims
        if (
            decoded.admin !== true ||
            !isAdminRole(decoded.adminRole)
        ) {
            console.error("Admin claim validation failed:", {
                uid: decoded.uid,
                email: decoded.email,
                admin: decoded.admin,
                adminRole: decoded.adminRole
            });

            return NextResponse.json(
                { error: "Admin access is not assigned." },
                { status: 403 }
            );
        }

        // Check Firebase account status
        const firebaseUser = await auth.getUser(decoded.uid);

        if (firebaseUser.disabled) {
            return NextResponse.json(
                { error: "Account disabled." },
                { status: 403 }
            );
        }

        // Create HTTP-only Firebase session cookie
        const session = await auth.createSessionCookie(
            token,
            {
                expiresIn: ADMIN_SESSION_MAX_AGE_MS
            }
        );

        const response = NextResponse.json({
            ok: true
        });

        response.cookies.set(
            ADMIN_SESSION_COOKIE,
            session,
            {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                path: "/",
                maxAge: ADMIN_SESSION_MAX_AGE_MS / 1000
            }
        );

        console.log(
            "Admin session created successfully:",
            decoded.email
        );

        return response;

    } catch (error) {
        console.error("SESSION AUTH ERROR:", error);

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Authentication failed."
            },
            { status: 401 }
        );
    }
}