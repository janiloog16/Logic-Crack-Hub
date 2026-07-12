"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Package, UserPlus } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { apiFetch } from "@/lib/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [accountExists, setAccountExists] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Creating Account...");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }
    setError("");
    setAccountExists(false);
    setLoadingText("Checking account...");
    setLoading(true);
    const phaseTimer = window.setTimeout(() => {
      setLoadingText("Sending verification code...");
    }, 450);
    try {
      await apiFetch<{ status: string; email: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      router.push(`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Could not create account.";
      if (message === "This email is already registered.") {
        setAccountExists(true);
        setError("This email is already registered.");
      } else {
        setError(message);
      }
    } finally {
      window.clearTimeout(phaseTimer);
      setLoading(false);
    }
  }

  return (
    <main className="site-page game-shell flex items-center justify-center px-4 py-10">
      <section className="glass-panel w-full max-w-md rounded-3xl p-6">
        <Link className="inline-flex items-center gap-3" href="/">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff5252] to-[#8f1014] text-white shadow-[0_12px_34px_rgba(229,57,53,0.32)]">
            <Package size={20} aria-hidden />
          </span>
          <span>
            <span className="block text-base font-black text-white">Logic Crack Hub</span>
            <span className="block text-xs font-medium text-[#b6b6b6]">Start earning credits</span>
          </span>
        </Link>

        <h1 className="mt-8 text-3xl font-black text-white">Register</h1>
        <p className="mt-2 text-sm leading-6 text-[#b6b6b6]">
          Create a user account to download assets, claim daily rewards, vote, review, and favorite packs.
        </p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <fieldset className="space-y-4 disabled:opacity-70" disabled={loading}>
            <label className="block">
              <span className="text-sm font-bold text-[#d8d8d8]">Name</span>
              <input
                className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                onChange={(event) => setName(event.target.value)}
                value={name}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-[#d8d8d8]">Email</span>
              <input
                className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-[#d8d8d8]">Password</span>
              <input
                className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
          </fieldset>

          {error ? (
            <FeedbackMessage tone="error">
              {accountExists ? (
                <>
                  This email is already registered.
                  <br />
                  Please sign in or reset your password.
                </>
              ) : (
                error
              )}
            </FeedbackMessage>
          ) : null}

          {accountExists ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                className="focus-ring inline-flex items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white"
                href="/login"
              >
                Go to Login
              </Link>
              <Link
                className="focus-ring inline-flex items-center justify-center rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100"
                href={`/forgot-password?email=${encodeURIComponent(email.trim().toLowerCase())}`}
              >
                Forgot Password
              </Link>
            </div>
          ) : null}

          <button
            className="focus-ring btn-primary ripple inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            <ButtonLoading isLoading={loading} loadingText={loadingText}>
              <UserPlus size={16} aria-hidden />
              Create account
            </ButtonLoading>
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[#b6b6b6]">
          Already registered?{" "}
          <Link className="font-bold text-[#ff5252]" href="/login">
            Login
          </Link>
        </p>
      </section>
    </main>
  );
}
