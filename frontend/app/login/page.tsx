"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { LogIn, Package } from "lucide-react";
import { ButtonLoading, FeedbackMessage } from "@/components/LoadingFeedback";
import { apiFetch, AuthResponse, saveSession } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) {
      return;
    }
    setError("");
    setLoading(true);
    try {
      const response = await apiFetch<AuthResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveSession(response);
      router.push("/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not log in.");
    } finally {
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
            <span className="block text-xs font-medium text-[#b6b6b6]">Welcome back</span>
          </span>
        </Link>

        <h1 className="mt-8 text-3xl font-black text-white">Login</h1>
        <p className="mt-2 text-sm leading-6 text-[#b6b6b6]">Enter your account details to continue.</p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <fieldset className="space-y-4 disabled:opacity-70" disabled={loading}>
            <label className="block">
              <span className="text-sm font-bold text-[#d8d8d8]">Email or username</span>
              <input
                className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                type="text"
                value={email}
              />
            </label>
            <label className="block">
              <span className="text-sm font-bold text-[#d8d8d8]">Password</span>
              <input
                className="focus-ring mt-2 w-full rounded-2xl border border-white/10 bg-[#171214] px-3 py-3 text-sm text-white"
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                type="password"
                value={password}
              />
            </label>
          </fieldset>

          {error ? <FeedbackMessage tone="error">{error}</FeedbackMessage> : null}

          <button
            className="focus-ring btn-primary ripple inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black disabled:opacity-50"
            disabled={loading}
            type="submit"
          >
            <ButtonLoading isLoading={loading} loadingText="Logging in...">
              <LogIn size={16} aria-hidden />
              Login
            </ButtonLoading>
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[#b6b6b6]">
          <Link className="font-bold text-[#ff5252]" href="/forgot-password">
            Forgot password?
          </Link>
        </p>

        <p className="mt-3 text-center text-sm text-[#b6b6b6]">
          Need an account?{" "}
          <Link className="font-bold text-[#ff5252]" href="/register">
            Register
          </Link>
        </p>
      </section>
    </main>
  );
}
