
"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
    signInWithEmailAndPassword,
    signOut
} from "firebase/auth";
import { getFirebaseClient } from "@/lib/firebase/client";

export default function LoginPage() {
    const router = useRouter();

    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    async function submit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault();

        setBusy(true);
        setError(null);

        const form = new FormData(e.currentTarget);

        try {
            const auth = getFirebaseClient().auth;

            const user = await signInWithEmailAndPassword(
                auth,
                String(form.get("email")),
                String(form.get("password"))
            );

            const idToken = await user.user.getIdToken();

            const response = await fetch("/api/auth/session", {
                method: "POST",
                headers: {
                    "content-type": "application/json"
                },
                body: JSON.stringify({ idToken })
            });

            if (!response.ok) {
                const result = await response.json() as {
                    error?: string;
                };

                throw new Error(
                    result.error ?? "Admin session could not be created."
                );
            }

            await signOut(auth);

            router.replace("/dashboard");
            router.refresh();

        } catch (reason) {
            console.log("Login failed:", reason);

            setError(
                reason instanceof Error
                    ? reason.message
                    : "Admin authentication is unavailable."
            );

            setBusy(false);
        }
    }

    return (
        <main className="login-page">

            <section className="login-card-wrap">

                <div className="login-card">

                    <p className="eyebrow">
                        ZIPZAVER ADMIN PANEL
                    </p>

                    <h1>Sign in</h1>

                    <p className="page-description">
                        Only accounts with server-issued Admin claims are accepted.
                    </p>

                    <form onSubmit={submit}>

                        <label htmlFor="email">
                            Admin email
                        </label>

                        <input
                            id="email"
                            name="email"
                            type="email"
                            autoComplete="username"
                            placeholder="Enter your admin email"
                            required
                        />

                        <label htmlFor="password">
                            Password
                        </label>

                        <input
                            id="password"
                            name="password"
                            type="password"
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            required
                        />

                        <button
                            className="primary-button"
                            type="submit"
                            disabled={busy}
                        >
                            {busy ? "Verifying..." : "Sign in securely"}
                        </button>

                    </form>

                    {error && (
                        <p className="security-note" role="alert">
                            {error}
                        </p>
                    )}

                    <p className="security-note">
                        Secure login using Firebase Authentication
                        and server-verified Admin session.
                    </p>

                </div>

            </section>

        </main>
    );
}
